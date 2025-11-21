import { FileSystem, HttpApiError, Path } from '@effect/platform'
import { BunContext } from '@effect/platform-bun'
import { Effect, Fiber, Layer, Option, Ref, Stream } from 'effect'
import { VaultConfig } from '../config/vault.js'
import type { SearchResult } from './api.js'
import type { VaultFile, VaultMetrics } from './domain.js'
import { DirectoryReadError, FileReadError, FrontmatterParseError } from './domain.js'
import { parseFrontmatter } from './frontmatter.functions.js'
import { searchInContent } from './search.functions.js'

export class VaultService extends Effect.Service<VaultService>()('VaultService', {
  scoped: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const config = yield* VaultConfig

    // Helper function to load a single file with proper error handling
    const loadFile = (
      filePath: string,
    ): Effect.Effect<readonly [string, VaultFile], FileReadError | FrontmatterParseError> =>
      Effect.gen(function* () {
        const relativePath = path.relative(config.vaultPath, filePath)

        // Read file content
        const content = yield* fs.readFileString(filePath).pipe(
          Effect.mapError(
            (error) =>
              new FileReadError({
                filePath,
                cause: error,
              }),
          ),
        )

        // Parse frontmatter with fallback to empty on error
        const parsed = yield* parseFrontmatter(content).pipe(
          Effect.mapError(
            (error) =>
              new FrontmatterParseError({
                filePath,
                cause: error,
              }),
          ),
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(`Failed to parse frontmatter: ${filePath}`, error)
              return { frontmatter: {}, content }
            }),
          ),
        )

        // Calculate metrics
        const bytes = new TextEncoder().encode(parsed.content).length
        const lines = parsed.content.split('\n').length

        const vaultFile = {
          path: filePath,
          content: parsed.content,
          frontmatter: parsed.frontmatter,
          bytes,
          lines,
        }

        return [relativePath, vaultFile] as const
      })

    // Helper function to load all files
    const loadAllFiles = Effect.gen(function* () {
      const walkDirectory = Effect.fn('vault.walkDirectory', {
        attributes: { dirPath: (dirPath: string) => dirPath },
      })(
        (dirPath: string): Effect.Effect<Array<string>, DirectoryReadError> =>
          Effect.gen(function* () {
            const entries = yield* fs.readDirectory(dirPath).pipe(
              Effect.mapError(
                (error) =>
                  new DirectoryReadError({
                    dirPath,
                    cause: error,
                  }),
              ),
            )
            const results = yield* Effect.forEach(
              entries,
              (entry) =>
                Effect.gen(function* () {
                  // Skip hidden directories (starting with .) before stat call
                  if (entry.startsWith('.')) {
                    return [] as string[]
                  }

                  const fullPath = path.join(dirPath, entry)
                  const stat = yield* fs.stat(fullPath).pipe(
                    Effect.mapError(
                      (error) =>
                        new DirectoryReadError({
                          dirPath: fullPath,
                          cause: error,
                        }),
                    ),
                  )

                  if (stat.type === 'Directory') {
                    return yield* walkDirectory(fullPath).pipe(
                      Effect.catchAll((error) =>
                        Effect.gen(function* () {
                          yield* Effect.logWarning(`Failed to walk subdirectory: ${fullPath}`, error)
                          return [] as string[]
                        }),
                      ),
                    )
                  } else if (stat.type === 'File' && entry.endsWith('.md')) {
                    return [fullPath]
                  }
                  return [] as string[]
                }),
              { concurrency: 'unbounded' },
            )

            return results.flat()
          }),
      )

      const files = yield* walkDirectory(config.vaultPath).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(`Failed to walk vault directory: ${config.vaultPath}`, error)
            return [] as string[]
          }),
        ),
      )

      const fileContents = yield* Effect.forEach(
        files,
        (filePath) =>
          loadFile(filePath).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* Effect.logWarning(`Failed to load file: ${filePath}`, error)
                return [
                  path.relative(config.vaultPath, filePath),
                  {
                    path: filePath,
                    content: '',
                    frontmatter: {},
                    bytes: 0,
                    lines: 0,
                  },
                ] as const
              }),
            ),
          ),
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
    )

    // Effect-managed debounced file updates
    const debouncedUpdates = yield* Ref.make(new Map<string, Fiber.RuntimeFiber<void>>())

    const updateFile = (filePath: string) =>
      Effect.gen(function* () {
        const exists = yield* fs.exists(filePath)

        if (exists) {
          const stat = yield* fs.stat(filePath).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* Effect.logWarning(`Failed to stat file: ${filePath}`, error)
                return null
              }),
            ),
          )

          if (stat?.type === 'File' && filePath.endsWith('.md')) {
            yield* loadFile(filePath).pipe(
              Effect.andThen(([relativePath, vaultFile]) =>
                Effect.gen(function* () {
                  yield* Ref.update(cacheRef, (cache) => {
                    const newCache = new Map(cache)
                    newCache.set(relativePath, vaultFile)
                    return newCache
                  })
                  yield* Effect.logDebug(`File updated: ${relativePath}`).pipe(
                    Effect.annotateLogs({ filePath: relativePath }),
                  )
                }),
              ),
              Effect.catchAll((error) =>
                Effect.gen(function* () {
                  yield* Effect.logWarning(`Failed to update file: ${filePath}`, error)
                }),
              ),
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
          yield* Effect.logDebug(`File deleted: ${relativePath}`).pipe(Effect.annotateLogs({ filePath: relativePath }))
        }
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(`File watcher error`, error)
          }),
        ),
      )

    const scheduleUpdate = (filePath: string) =>
      Effect.gen(function* () {
        // Cancel existing update for this file
        const existing = yield* Ref.get(debouncedUpdates)
        const existingFiber = existing.get(filePath)
        if (existingFiber) {
          yield* Fiber.interrupt(existingFiber)
        }

        // Schedule new debounced update
        const fiber = yield* Effect.fork(
          Effect.sleep(config.debounceMs).pipe(
            Effect.andThen(() => updateFile(filePath)),
            Effect.ensuring(
              Ref.update(debouncedUpdates, (updates) => {
                const newUpdates = new Map(updates)
                newUpdates.delete(filePath)
                return newUpdates
              }),
            ),
          ),
        )

        yield* Ref.update(debouncedUpdates, (updates) => {
          const newUpdates = new Map(updates)
          newUpdates.set(filePath, fiber)
          return newUpdates
        })
      })

    // Set up file watcher using Effect's FileSystem API with acquireRelease
    yield* Effect.acquireRelease(
      Effect.gen(function* () {
        const fiber = yield* Effect.fork(
          fs.watch(config.vaultPath, { recursive: true }).pipe(
            Stream.runForEach((event) =>
              Effect.gen(function* () {
                if (event.path.endsWith('.md')) {
                  yield* scheduleUpdate(event.path)
                }
              }),
            ),
          ),
        )
        yield* Effect.logInfo(`File watcher started on ${config.vaultPath}`).pipe(
          Effect.annotateLogs({ vaultPath: config.vaultPath }),
        )
        return fiber
      }),
      (fiber) =>
        Effect.gen(function* () {
          yield* Fiber.interrupt(fiber)
          // Cancel all pending debounced updates
          const pending = yield* Ref.get(debouncedUpdates)
          yield* Effect.forEach(Array.from(pending.values()), (pendingFiber) => Fiber.interrupt(pendingFiber), {
            concurrency: 'unbounded',
          })
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

      searchByFolder: Effect.fn('vault.searchByFolder', {
        attributes: { folderPath: (folderPath: string) => folderPath },
      })(function* (folderPath: string) {
        if (!folderPath || folderPath.trim() === '') {
          return []
        }

        const cache = yield* Ref.get(cacheRef)
        const normalizedFolderPath = folderPath.startsWith('/') ? folderPath.slice(1) : folderPath

        const matchingFiles: string[] = []

        for (const [filePath] of cache.entries()) {
          if (filePath.startsWith(normalizedFolderPath)) {
            matchingFiles.push(filePath)
          }
        }

        return matchingFiles
      }),
    }
  }),
  dependencies: [BunContext.layer],
}) {}

// Test helper - create mock dependencies for testing
export const VaultServiceTest = (cache: Map<string, string>) =>
  Layer.mergeAll(TestVaultConfig, TestFileSystem(cache), TestPath).pipe(Layer.provide(BunContext.layer))

const TestVaultConfig = Layer.succeed(VaultConfig, { vaultPath: '/test', debounceMs: 100 })

const TestFileSystem = (cache: Map<string, string>) =>
  Layer.succeed(FileSystem.FileSystem, {
    readDirectory: () => Effect.succeed([]),
    readFileString: (path: string) => Effect.succeed(cache.get(path) || ''),
    stat: () => Effect.succeed({ type: 'File' as const }),
    exists: (path: string) => Effect.succeed(cache.has(path)),
    watch: () => Stream.empty,
  } as any)

const TestPath = Layer.succeed(Path.Path, {
  join: (...parts: string[]) => parts.join('/'),
  relative: (_from: string, to: string) => to,
} as any)
