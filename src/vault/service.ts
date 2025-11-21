import { FileSystem, HttpApiError, Path } from '@effect/platform'
import { BunContext } from '@effect/platform-bun'
import { Effect, Layer, Option, Ref, Stream } from 'effect'
import { VaultConfig } from '../config/vault.js'
import type { SearchResult } from './api.js'
import type { VaultFile, VaultMetrics } from './domain.js'
import { CacheManager } from './cache-manager.js'
import { searchInContent } from './search.functions.js'

// Helper to safely access cache, returning empty map on error with logging
const getCacheWithFallback = (cacheRef: Ref.Ref<Map<string, VaultFile>>, context: string) =>
  Ref.get(cacheRef).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Effect.logWarning(`Cache access error in ${context}`, error)
        return new Map<string, VaultFile>()
      }),
    ),
  )

export class VaultService extends Effect.Service<VaultService>()('VaultService', {
  scoped: Effect.gen(function* () {
    const config = yield* VaultConfig
    const cacheManager = yield* CacheManager
    const { cacheRef } = cacheManager

    return {
      getFile: (relativePath: string) =>
        Effect.gen(function* () {
          const cache = yield* getCacheWithFallback(cacheRef, `getFile(${relativePath})`)
          return Option.fromNullable(cache.get(relativePath)).pipe(Option.map((vaultFile) => vaultFile.content))
        }),

      // HTTP-friendly getFile with error handling and filename normalization
      getFileContent: Effect.fn('vault.getFileContent', {
        attributes: {
          filename: (filename: string) => filename,
          found: (_filename: string, result: string) => result !== null,
          contentSize: (_filename: string, result: string) => new TextEncoder().encode(result).length,
        },
      })(function* (filename: string) {
        // Early return with BadRequest error for invalid input
        if (!filename || filename.trim() === '') {
          return yield* Effect.fail(new HttpApiError.BadRequest())
        }

        // Normalize filename to always end with .md
        const normalizedFilename = filename.endsWith('.md') ? filename : `${filename}.md`

        // Get content from cache with error handling
        const cache = yield* getCacheWithFallback(cacheRef, `getFileContent(${normalizedFilename})`)
        const vaultFile = cache.get(normalizedFilename)

        // Convert undefined to NotFound error for API consistency
        if (vaultFile === undefined) {
          return yield* Effect.fail(new HttpApiError.NotFound())
        }

        return vaultFile.content
      }),

      getAllFiles: Effect.fn('vault.getAllFiles', {
        attributes: {
          totalFiles: (_: undefined, result: Map<string, string>) => result.size,
        },
      })(function* () {
        const cache = yield* getCacheWithFallback(cacheRef, 'getAllFiles')
        const stringMap = new Map<string, string>()
        for (const [path, vaultFile] of cache.entries()) {
          stringMap.set(path, vaultFile.content)
        }
        return stringMap
      }),

      searchInFiles: Effect.fn('vault.searchInFiles', {
        attributes: {
          query: (query: string) => query,
          resultCount: (_query: string, results: Array<SearchResult>) => results.length,
        },
      })(function* (query: string) {
        if (!query || query.trim() === '') {
          return []
        }

        const cache = yield* getCacheWithFallback(cacheRef, `searchInFiles(${query})`)
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

      reload: Effect.fn('vault.reload', {
        attributes: {
          filesLoaded: (_: undefined, _result: undefined) => {
            // This will be updated via side effect during execution
            return 0
          },
        },
      })(function* () {
        const cacheManager = yield* CacheManager
        const newCache = yield* getCacheWithFallback(cacheManager.cacheRef, 'reload')
        yield* Effect.logInfo(`Cache manually reloaded with ${newCache.size} files`).pipe(
          Effect.annotateLogs({
            vaultPath: config.vaultPath,
            fileCount: newCache.size,
          }),
        )
      }),

      getMetrics: (): Effect.Effect<VaultMetrics> =>
        Effect.gen(function* () {
          const files = yield* getCacheWithFallback(cacheRef, 'getMetrics')

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

      getFilePaths: Effect.fn('vault.getFilePaths', {
        attributes: {
          limit: (args: [number, number]) => args[0],
          offset: (args: [number, number]) => args[1],
          returned: (_: [number, number], result: { files: string[]; total: number }) => result.files.length,
          total: (_: [number, number], result: { files: string[]; total: number }) => result.total,
        },
      })(function* (limit: number, offset: number) {
        const cache = yield* getCacheWithFallback(cacheRef, 'getFilePaths')
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
        attributes: {
          folderPath: (folderPath: string) => folderPath,
          matchCount: (_folderPath: string, result: string[]) => result.length,
        },
      })(function* (folderPath: string) {
        if (!folderPath || folderPath.trim() === '') {
          return []
        }

        const cache = yield* getCacheWithFallback(cacheRef, `searchByFolder(${folderPath})`)
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
