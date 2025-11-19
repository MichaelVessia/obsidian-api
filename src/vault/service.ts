import { FileSystem, HttpApiError, Path } from '@effect/platform'
import { BunContext } from '@effect/platform-bun'
import { Effect, Fiber, Layer, Option, Ref, Stream } from 'effect'
import { VaultConfig } from '../config/vault.js'
import type { SearchResult } from './api.js'
import type { VaultMetrics } from './domain.js'
import { parseFrontmatter } from './domain.js'
import { searchInContent } from './functions.js'

export class VaultService extends Effect.Service<VaultService>()('VaultService', {
  scoped: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const config = yield* VaultConfig

    // Helper function to load all files
    const loadAllFiles = Effect.gen(function* () {
      const walkDirectory = Effect.fn('vault.walkDirectory', {
        attributes: { dirPath: (dirPath: string) => dirPath },
      })(
        (dirPath: string): Effect.Effect<Array<string>> =>
          Effect.gen(function* () {
            const entries = yield* fs.readDirectory(dirPath)
            const results = yield* Effect.forEach(
              entries,
              (entry) =>
                Effect.gen(function* () {
                  // Skip hidden directories (starting with .) before stat call
                  if (entry.startsWith('.')) {
                    return [] as string[]
                  }

                  const fullPath = path.join(dirPath, entry)
                  const stat = yield* fs.stat(fullPath)

                  if (stat.type === 'Directory') {
                    return yield* walkDirectory(fullPath)
                  } else if (stat.type === 'File' && entry.endsWith('.md')) {
                    return [fullPath]
                  }
                  return [] as string[]
                }),
              { concurrency: 4 },
            )

            return results.flat()
          }).pipe(
            Effect.matchEffect({
              onFailure: (error) =>
                Effect.logWarning(`Failed to walk directory: ${dirPath}`, error).pipe(Effect.as([])),
              onSuccess: Effect.succeed,
            }),
          ),
      )

      const files = yield* walkDirectory(config.vaultPath)

      const fileContents = yield* Effect.forEach(
        files,
        (filePath) =>
          Effect.gen(function* () {
            const relativePath = path.relative(config.vaultPath, filePath)
            const vaultFile = yield* Effect.gen(function* () {
              const content = yield* fs
                .readFileString(filePath)
                .pipe(
                  Effect.catchAll((error) =>
                    Effect.logWarning(`Failed to read file: ${filePath}`, error).pipe(Effect.as('')),
                  ),
                )
              const { frontmatter, content: mainContent } = yield* parseFrontmatter(content).pipe(
                Effect.matchEffect({
                  onFailure: (error) =>
                    Effect.logWarning(`Failed to parse frontmatter: ${filePath}`, error).pipe(
                      Effect.as({ frontmatter: {}, content }),
                    ),
                  onSuccess: Effect.succeed,
                }),
              )

              const bytes = new TextEncoder().encode(mainContent).length
              const lines = mainContent.split('\n').length

              return {
                path: filePath,
                content: mainContent,
                frontmatter,
                bytes,
                lines,
              }
            }).pipe(
              Effect.matchEffect({
                onFailure: (error) =>
                  Effect.logWarning(`Failed to load file: ${filePath}`, error).pipe(
                    Effect.as({
                      path: filePath,
                      content: '',
                      frontmatter: {},
                      bytes: 0,
                      lines: 0,
                    }),
                  ),
                onSuccess: Effect.succeed,
              }),
            )
            return [relativePath, vaultFile] as const
          }),
        { concurrency: 8 },
      )

      return new Map(fileContents)
    })

    // Initialize cache
    const initialCache = yield* loadAllFiles
    const cacheRef = yield* Ref.make(initialCache)
    yield* Effect.logInfo(`Cache initialized with ${initialCache.size} files from ${config.vaultPath}`).pipe(
      Effect.annotateLogs({
        vaultPath: config.vaultPath,
        fileCount: initialCache.size,
      }),
      Effect.ignore,
    )

    // Track pending updates to debounce rapid changes
    const pendingUpdates = new Map<string, NodeJS.Timeout>()

    const updateFile = (filePath: string) =>
      Effect.gen(function* () {
        const exists = yield* fs.exists(filePath)

        if (exists) {
          const stat = yield* fs.stat(filePath)
          if (stat.type === 'File' && filePath.endsWith('.md')) {
            const vaultFile = yield* Effect.gen(function* () {
              const content = yield* fs
                .readFileString(filePath)
                .pipe(
                  Effect.catchAll((error) =>
                    Effect.logWarning(`Failed to read file: ${filePath}`, error).pipe(Effect.as('')),
                  ),
                )
              const { frontmatter, content: mainContent } = yield* parseFrontmatter(content).pipe(
                Effect.matchEffect({
                  onFailure: (error) =>
                    Effect.logWarning(`Failed to parse frontmatter: ${filePath}`, error).pipe(
                      Effect.as({ frontmatter: {}, content }),
                    ),
                  onSuccess: Effect.succeed,
                }),
              )

              const bytes = new TextEncoder().encode(mainContent).length
              const lines = mainContent.split('\n').length

              return {
                path: filePath,
                content: mainContent,
                frontmatter,
                bytes,
                lines,
              }
            }).pipe(
              Effect.matchEffect({
                onFailure: (error) =>
                  Effect.logWarning(`Failed to update file: ${filePath}`, error).pipe(
                    Effect.as({
                      path: filePath,
                      content: '',
                      frontmatter: {},
                      bytes: 0,
                      lines: 0,
                    }),
                  ),
                onSuccess: Effect.succeed,
              }),
            )
            const relativePath = path.relative(config.vaultPath, filePath)
            yield* Ref.update(cacheRef, (cache) => {
              const newCache = new Map(cache)
              newCache.set(relativePath, vaultFile)
              return newCache
            })
            yield* Effect.logDebug(`File updated: ${relativePath}`).pipe(
              Effect.annotateLogs({ filePath: relativePath }),
              Effect.ignore,
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
            Effect.ignore,
          )
        }
      }).pipe(
        Effect.matchEffect({
          onFailure: (error) => Effect.logWarning(`File watcher error`, error).pipe(Effect.as(void 0)),
          onSuccess: () => Effect.void,
        }),
      )

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
            if (event.path.endsWith('.md')) {
              scheduleUpdate(event.path)
            }
          }),
        ),
      ),
    )
    yield* Effect.logInfo(`File watcher started on ${config.vaultPath}`).pipe(
      Effect.annotateLogs({ vaultPath: config.vaultPath }),
      Effect.ignore,
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
      }),
    )

    return {
      getFile: (relativePath: string) =>
        Effect.gen(function* () {
          const cache = yield* Ref.get(cacheRef)
          return Option.fromNullable(cache.get(relativePath)).pipe(Option.map((vaultFile) => vaultFile.content))
        }),

      // HTTP-friendly getFile with error handling and filename normalization
      getFileContent: Effect.fn('vault.getFileContent', {
        attributes: { filename: (filename: string) => filename },
      })(function* (filename: string) {
        // Early return with BadRequest error for invalid input
        if (!filename || filename.trim() === '') {
          return yield* Effect.fail(new HttpApiError.BadRequest())
        }

        // Normalize filename to always end with .md
        const normalizedFilename = filename.endsWith('.md') ? filename : `${filename}.md`

        // Get content from cache
        const cache = yield* Ref.get(cacheRef)
        const vaultFile = cache.get(normalizedFilename)

        // Convert undefined to NotFound error for API consistency
        if (vaultFile === undefined) {
          return yield* Effect.fail(new HttpApiError.NotFound())
        }

        return vaultFile.content
      }),

      getAllFiles: Effect.fn('vault.getAllFiles')(function* () {
        const cache = yield* Ref.get(cacheRef)
        const stringMap = new Map<string, string>()
        for (const [path, vaultFile] of cache.entries()) {
          stringMap.set(path, vaultFile.content)
        }
        return stringMap
      }),

      searchInFiles: Effect.fn('vault.searchInFiles', {
        attributes: { query: (query: string) => query },
      })(function* (query: string) {
        if (!query || query.trim() === '') {
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

      reload: Effect.fn('vault.reload')(function* () {
        const newCache = yield* loadAllFiles
        yield* Ref.set(cacheRef, newCache)
        yield* Effect.logInfo(`Cache manually reloaded with ${newCache.size} files`).pipe(
          Effect.annotateLogs({
            vaultPath: config.vaultPath,
            fileCount: newCache.size,
          }),
          Effect.ignore,
        )
      }),

      getMetrics: (): Effect.Effect<VaultMetrics> =>
        Effect.gen(function* () {
          const files = yield* Ref.get(cacheRef)

          let totalBytes = 0
          let totalLines = 0
          let largest = { path: '', bytes: 0 }
          let smallest = { path: '', bytes: Number.MAX_SAFE_INTEGER }

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
            largestFile: largest.path ? largest : { path: 'none', bytes: 0 },
            smallestFile: smallest.path ? smallest : { path: 'none', bytes: 0 },
          }
        }),

      getFilePaths: Effect.fn('vault.getFilePaths')(function* (limit: number, offset: number) {
        const cache = yield* Ref.get(cacheRef)
        const allPaths = Array.from(cache.keys())
        const total = allPaths.length

        const files = yield* Stream.fromIterable(allPaths).pipe(
          Stream.drop(offset),
          Stream.take(limit),
          Stream.runCollect,
        )

        return { files: Array.from(files), total }
      }),
    }
  }),
  dependencies: [BunContext.layer],
}) {}

export const VaultServiceTest = (cache: Map<string, string>) =>
  Layer.succeed(
    VaultService,
    VaultService.make({
      getFile: (relativePath: string) => Effect.succeed(Option.fromNullable(cache.get(relativePath))),
      getFileContent: (filename: string) => {
        if (!filename || filename.trim() === '') {
          return Effect.fail(new HttpApiError.BadRequest())
        }
        const normalizedFilename = filename.endsWith('.md') ? filename : `${filename}.md`
        const content = cache.get(normalizedFilename)
        if (content === undefined) {
          return Effect.fail(new HttpApiError.NotFound())
        }
        return Effect.succeed(content)
      },
      getAllFiles: () => Effect.succeed(new Map(cache)),
      searchInFiles: (query: string) => {
        if (!query || query.trim() === '') {
          return Effect.succeed([])
        }
        const results: Array<SearchResult> = []
        for (const [filePath, content] of cache.entries()) {
          const bytes = new TextEncoder().encode(content).length
          const lines = content.split('\n').length
          const vaultFile = {
            path: filePath,
            content,
            frontmatter: {},
            bytes,
            lines,
          }
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
        let largest = { path: '', bytes: 0 }
        let smallest = { path: '', bytes: Number.MAX_SAFE_INTEGER }

        for (const [path, content] of cache.entries()) {
          const bytes = new TextEncoder().encode(content).length
          const lines = content.split('\n').length

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
          largestFile: largest.path ? largest : { path: 'none', bytes: 0 },
          smallestFile: smallest.path ? smallest : { path: 'none', bytes: 0 },
        })
      },
      getFilePaths: (limit: number, offset: number) =>
        Effect.gen(function* () {
          const allPaths = Array.from(cache.keys())
          const total = allPaths.length

          const files = yield* Stream.fromIterable(allPaths).pipe(
            Stream.drop(offset),
            Stream.take(limit),
            Stream.runCollect,
          )

          return { files: Array.from(files), total }
        }),
    }),
  )
