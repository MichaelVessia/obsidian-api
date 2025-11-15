import { FileSystem, Path } from "@effect/platform"
import { BunContext } from "@effect/platform-bun"
import { Effect, Fiber, Layer, Ref, Stream } from "effect"
import { VaultConfig } from "../config/vault.js"
import type { SearchResult } from "../search/schema.js"

const DEBOUNCE_MS = 100

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

const loadFileContent = (fs: FileSystem.FileSystem, filePath: string): Effect.Effect<string> =>
	fs.readFileString(filePath).pipe(Effect.catchAll(() => Effect.succeed("")))

const loadAllFiles = (
	fs: FileSystem.FileSystem,
	path: Path.Path,
	vaultPath: string
): Effect.Effect<Map<string, string>> =>
	Effect.gen(function* () {
		const files = yield* walkDirectory(fs, path, vaultPath)

		const fileContents = yield* Effect.forEach(
			files,
			(filePath) =>
				Effect.gen(function* () {
					const relativePath = path.relative(vaultPath, filePath)
					const content = yield* loadFileContent(fs, filePath)
					return [relativePath, content] as const
				}),
			{ concurrency: 10 }
		)

		return new Map(fileContents)
	})

const searchInContent = (content: string, query: string, filePath: string): Array<SearchResult> => {
	const lines = content.split("\n")
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
				filePath,
				lineNumber: i + 1,
				context
			})
		}
	}

	return results
}

export class VaultCache extends Effect.Service<VaultCache>()("VaultCache", {
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
						const content = yield* loadFileContent(fs, filePath)
						const relativePath = path.relative(config.vaultPath, filePath)
						yield* Ref.update(cacheRef, (cache) => {
							const newCache = new Map(cache)
							newCache.set(relativePath, content)
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
			}, DEBOUNCE_MS)

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
					return cache.get(relativePath)
				}),

			getAllFiles: () =>
				Effect.gen(function* () {
					const cache = yield* Ref.get(cacheRef)
					return new Map(cache)
				}),

			searchInFiles: (query: string) =>
				Effect.gen(function* () {
					if (!query || query.trim() === "") {
						return []
					}

					const cache = yield* Ref.get(cacheRef)
					const results: Array<SearchResult> = []
					const lowerQuery = query.toLowerCase()

					// Optimized sequential search with pre-lowercased query
					for (const [filePath, content] of cache.entries()) {
						const lines = content.split("\n")

						for (let i = 0; i < lines.length; i++) {
							const line = lines[i]
							const lowerLine = line.toLowerCase()

							if (lowerLine.includes(lowerQuery)) {
								const matchIndex = lowerLine.indexOf(lowerQuery)
								const start = Math.max(0, matchIndex - 100)
								const end = Math.min(line.length, matchIndex + query.length + 100)
								const context = line.slice(start, end)

								results.push({
									filePath,
									lineNumber: i + 1,
									context
								})
							}
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
				})
		}
	}),
	dependencies: [BunContext.layer]
}) {}

export const VaultCacheTest = (cache: Map<string, string>) =>
	Layer.succeed(
		VaultCache,
		VaultCache.make({
			getFile: (relativePath: string) => Effect.succeed(cache.get(relativePath)),
			getAllFiles: () => Effect.succeed(new Map(cache)),
			searchInFiles: (query: string) => {
				if (!query || query.trim() === "") {
					return Effect.succeed([])
				}
				const results: Array<SearchResult> = []
				for (const [filePath, content] of cache.entries()) {
					const fileResults = searchInContent(content, query, filePath)
					for (const result of fileResults) {
						results.push(result)
					}
				}
				return Effect.succeed(results)
			},
			reload: () => Effect.void
		})
	)
