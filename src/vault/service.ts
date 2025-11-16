import { FileSystem, HttpApiError, Path } from "@effect/platform"
import { BunContext } from "@effect/platform-bun"
import { Effect, Fiber, Layer, Ref, Stream } from "effect"
import { VaultConfig } from "../config/vault.js"
import type { SearchResult } from "./api.js"
import { parseFrontmatter, type VaultFile } from "./domain.js"

export interface VaultMetrics {
	totalFiles: number
	totalBytes: number
	totalLines: number
	averageFileSize: number
	largestFile: { path: string; bytes: number }
	smallestFile: { path: string; bytes: number }
}

const walkDirectory = (
	fs: FileSystem.FileSystem,
	path: Path.Path,
	dirPath: string,
	ignorePatterns: Array<string> = [".obsidian"]
): Effect.Effect<Array<string>> =>
	Effect.gen(function* () {
		const entries = yield* fs.readDirectory(dirPath)
		const files: Array<string> = []

		for (const entry of entries) {
			// Skip ignored directories
			if (ignorePatterns.some((pattern) => entry.includes(pattern))) {
				continue
			}

			const fullPath = path.join(dirPath, entry)
			const stat = yield* fs.stat(fullPath)

			if (stat.type === "Directory") {
				const subFiles = yield* walkDirectory(fs, path, fullPath, ignorePatterns)
				for (const file of subFiles) {
					files.push(file)
				}
			} else if (stat.type === "File" && entry.endsWith(".md")) {
				files.push(fullPath)
			}
		}

		return files
	}).pipe(Effect.catchAll(() => Effect.succeed([])))

const loadFileContent = (fs: FileSystem.FileSystem, filePath: string): Effect.Effect<VaultFile> =>
	Effect.gen(function* () {
		const content = yield* fs.readFileString(filePath).pipe(Effect.catchAll(() => Effect.succeed("")))
		const { frontmatter, content: mainContent } = yield* parseFrontmatter(content).pipe(
			Effect.catchAll(() => Effect.succeed({ frontmatter: {}, content }))
		)

		const bytes = new TextEncoder().encode(mainContent).length
		const lines = mainContent.split("\n").length

		return {
			path: filePath,
			content: mainContent,
			frontmatter,
			bytes,
			lines
		}
	}).pipe(
		Effect.catchAll(() =>
			Effect.succeed({
				path: filePath,
				content: "",
				frontmatter: {},
				bytes: 0,
				lines: 0
			})
		)
	)

const loadAllFiles = (
	fs: FileSystem.FileSystem,
	path: Path.Path,
	vaultPath: string
): Effect.Effect<Map<string, VaultFile>> =>
	Effect.gen(function* () {
		const files = yield* walkDirectory(fs, path, vaultPath)

		const fileContents = yield* Effect.forEach(
			files,
			(filePath) =>
				Effect.gen(function* () {
					const relativePath = path.relative(vaultPath, filePath)
					const vaultFile = yield* loadFileContent(fs, filePath)
					return [relativePath, vaultFile] as const
				}),
			{ concurrency: 10 }
		)

		return new Map(fileContents)
	})

const searchInContent = (vaultFile: VaultFile, query: string): Array<SearchResult> => {
	const lines = vaultFile.content.split("\n")
	const results: Array<SearchResult> = []
	const lowerQuery = query.toLowerCase()

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		const lowerLine = line.toLowerCase()

		if (lowerLine.includes(lowerQuery)) {
			const matchIndex = lowerLine.indexOf(lowerQuery)
			const start = Math.max(0, matchIndex - 100)
			const end = Math.min(line.length, matchIndex + query.length + 100)
			const context = line.slice(start, end)

			results.push({
				filePath: vaultFile.path,
				lineNumber: i + 1,
				context
			})
		}
	}

	return results
}

export class VaultService extends Effect.Service<VaultService>()("VaultService", {
	scoped: Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const config = yield* VaultConfig

		// Initialize cache
		const initialCache = yield* loadAllFiles(fs, path, config.vaultPath)
		const cacheRef = yield* Ref.make(initialCache)
		yield* Effect.logInfo(`Cache initialized with ${initialCache.size} files from ${config.vaultPath}`).pipe(
			Effect.annotateLogs({
				vaultPath: config.vaultPath,
				fileCount: initialCache.size
			}),
			Effect.ignore
		)

		// Track pending updates to debounce rapid changes
		const pendingUpdates = new Map<string, NodeJS.Timeout>()

		const updateFile = (filePath: string): Effect.Effect<void> =>
			Effect.gen(function* () {
				const exists = yield* fs.exists(filePath)

				if (exists) {
					const stat = yield* fs.stat(filePath)
					if (stat.type === "File" && filePath.endsWith(".md")) {
						const vaultFile = yield* loadFileContent(fs, filePath)
						const relativePath = path.relative(config.vaultPath, filePath)
						yield* Ref.update(cacheRef, (cache) => {
							const newCache = new Map(cache)
							newCache.set(relativePath, vaultFile)
							return newCache
						})
						yield* Effect.logDebug(`File updated: ${relativePath}`).pipe(
							Effect.annotateLogs({ filePath: relativePath }),
							Effect.ignore
						)
					}
				} else {
					// File deleted
					const relativePath = path.relative(config.vaultPath, filePath)
					yield* Ref.update(cacheRef, (cache) => {
						const newCache = new Map(cache)
						newCache.delete(relativePath)
						return newCache
					})
					yield* Effect.logDebug(`File deleted: ${relativePath}`).pipe(
						Effect.annotateLogs({ filePath: relativePath }),
						Effect.ignore
					)
				}
			}).pipe(Effect.catchAll(() => Effect.void))

		const scheduleUpdate = (filePath: string): void => {
			// Clear existing timeout for this file
			const existing = pendingUpdates.get(filePath)
			if (existing) {
				clearTimeout(existing)
			}

			// Schedule debounced update
			const timeout = setTimeout(() => {
				pendingUpdates.delete(filePath)
				Effect.runPromise(updateFile(filePath))
			}, config.debounceMs)

			pendingUpdates.set(filePath, timeout)
		}

		// Set up file watcher using Effect's FileSystem API
		const watchFiber = yield* Effect.fork(
			fs.watch(config.vaultPath, { recursive: true }).pipe(
				Stream.runForEach((event) =>
					Effect.sync(() => {
						if (event.path.endsWith(".md")) {
							scheduleUpdate(event.path)
						}
					})
				)
			)
		)
		yield* Effect.logInfo(`File watcher started on ${config.vaultPath}`).pipe(
			Effect.annotateLogs({ vaultPath: config.vaultPath }),
			Effect.ignore
		)

		// Cleanup watcher on scope release
		yield* Effect.addFinalizer(() =>
			Effect.gen(function* () {
				yield* Fiber.interrupt(watchFiber)
				// Clear any pending timeouts
				for (const timeout of pendingUpdates.values()) {
					clearTimeout(timeout)
				}
				pendingUpdates.clear()
			})
		)

		return {
			getFile: (relativePath: string) =>
				Effect.gen(function* () {
					const cache = yield* Ref.get(cacheRef)
					const vaultFile = cache.get(relativePath)
					return vaultFile?.content
				}),

			// HTTP-friendly getFile with error handling and filename normalization
			getFileContent: (filename: string) =>
				Effect.gen(function* () {
					// Early return with BadRequest error for invalid input
					if (!filename || filename.trim() === "") {
						return yield* Effect.fail(new HttpApiError.BadRequest())
					}

					// Normalize filename to always end with .md
					const normalizedFilename = filename.endsWith(".md") ? filename : `${filename}.md`

					// Get content from cache
					const cache = yield* Ref.get(cacheRef)
					const vaultFile = cache.get(normalizedFilename)

					// Convert undefined to NotFound error for API consistency
					if (vaultFile === undefined) {
						return yield* Effect.fail(new HttpApiError.NotFound())
					}

					return vaultFile.content
				}),

			getAllFiles: () =>
				Effect.gen(function* () {
					const cache = yield* Ref.get(cacheRef)
					const stringMap = new Map<string, string>()
					for (const [path, vaultFile] of cache.entries()) {
						stringMap.set(path, vaultFile.content)
					}
					return stringMap
				}),

			searchInFiles: (query: string) =>
				Effect.gen(function* () {
					if (!query || query.trim() === "") {
						return []
					}

					const cache = yield* Ref.get(cacheRef)
					const results: Array<SearchResult> = []

					// Optimized sequential search with pre-lowercased query
					for (const [, vaultFile] of cache.entries()) {
						const fileResults = searchInContent(vaultFile, query)
						for (const result of fileResults) {
							results.push(result)
						}
					}

					return results
				}),

			reload: () =>
				Effect.gen(function* () {
					const newCache = yield* loadAllFiles(fs, path, config.vaultPath)
					yield* Ref.set(cacheRef, newCache)
					yield* Effect.logInfo(`Cache manually reloaded with ${newCache.size} files`).pipe(
						Effect.annotateLogs({
							vaultPath: config.vaultPath,
							fileCount: newCache.size
						}),
						Effect.ignore
					)
				}),

			getMetrics: (): Effect.Effect<VaultMetrics> =>
				Effect.gen(function* () {
					const files = yield* Ref.get(cacheRef)

					let totalBytes = 0
					let totalLines = 0
					let largest = { path: "", bytes: 0 }
					let smallest = { path: "", bytes: Number.MAX_SAFE_INTEGER }

					for (const [path, vaultFile] of files.entries()) {
						totalBytes += vaultFile.bytes
						totalLines += vaultFile.lines

						if (vaultFile.bytes > largest.bytes) {
							largest = { path, bytes: vaultFile.bytes }
						}
						if (vaultFile.bytes < smallest.bytes) {
							smallest = { path, bytes: vaultFile.bytes }
						}
					}

					return {
						totalFiles: files.size,
						totalBytes,
						totalLines,
						averageFileSize: files.size > 0 ? Math.round(totalBytes / files.size) : 0,
						largestFile: largest.path ? largest : { path: "none", bytes: 0 },
						smallestFile: smallest.path ? smallest : { path: "none", bytes: 0 }
					}
				})
		}
	}),
	dependencies: [BunContext.layer]
}) {}

export const VaultServiceTest = (cache: Map<string, string>) =>
	Layer.succeed(
		VaultService,
		VaultService.make({
			getFile: (relativePath: string) => Effect.succeed(cache.get(relativePath)),
			getFileContent: (filename: string) => {
				if (!filename || filename.trim() === "") {
					return Effect.fail(new HttpApiError.BadRequest())
				}
				const normalizedFilename = filename.endsWith(".md") ? filename : `${filename}.md`
				const content = cache.get(normalizedFilename)
				if (content === undefined) {
					return Effect.fail(new HttpApiError.NotFound())
				}
				return Effect.succeed(content)
			},
			getAllFiles: () => Effect.succeed(new Map(cache)),
			searchInFiles: (query: string) => {
				if (!query || query.trim() === "") {
					return Effect.succeed([])
				}
				const results: Array<SearchResult> = []
				for (const [filePath, content] of cache.entries()) {
					const bytes = new TextEncoder().encode(content).length
					const lines = content.split("\n").length
					const vaultFile = { path: filePath, content, frontmatter: {}, bytes, lines }
					const fileResults = searchInContent(vaultFile, query)
					for (const result of fileResults) {
						results.push(result)
					}
				}
				return Effect.succeed(results)
			},
			reload: () => Effect.void,
			getMetrics: (): Effect.Effect<VaultMetrics> => {
				let totalBytes = 0
				let totalLines = 0
				let largest = { path: "", bytes: 0 }
				let smallest = { path: "", bytes: Number.MAX_SAFE_INTEGER }

				for (const [path, content] of cache.entries()) {
					const bytes = new TextEncoder().encode(content).length
					const lines = content.split("\n").length

					totalBytes += bytes
					totalLines += lines

					if (bytes > largest.bytes) {
						largest = { path, bytes }
					}
					if (bytes < smallest.bytes) {
						smallest = { path, bytes }
					}
				}

				return Effect.succeed({
					totalFiles: cache.size,
					totalBytes,
					totalLines,
					averageFileSize: cache.size > 0 ? Math.round(totalBytes / cache.size) : 0,
					largestFile: largest.path ? largest : { path: "none", bytes: 0 },
					smallestFile: smallest.path ? smallest : { path: "none", bytes: 0 }
				})
			}
		})
	)
