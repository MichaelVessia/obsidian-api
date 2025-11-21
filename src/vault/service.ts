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
      getFileContent: Effect.fn('vault.getFileContent')(function* (filename: string) {
        // Early return with BadRequest error for invalid input
        if (!filename || filename.trim() === '') {
          return yield* Effect.fail(new HttpApiError.BadRequest())
        }

        // Normalize filename to always end with .md
        const normalizedFilename = filename.endsWith('.md') ? filename : `${filename}.md`
        yield* Effect.annotateCurrentSpan('filename', normalizedFilename)

        // Get content from cache with error handling
        const cache = yield* getCacheWithFallback(cacheRef, `getFileContent(${normalizedFilename})`)
        const vaultFile = cache.get(normalizedFilename)

        // Convert undefined to NotFound error for API consistency
        if (vaultFile === undefined) {
          yield* Effect.annotateCurrentSpan('found', false)
          return yield* Effect.fail(new HttpApiError.NotFound())
        }

        yield* Effect.annotateCurrentSpan('found', true)
        yield* Effect.annotateCurrentSpan('contentSize', new TextEncoder().encode(vaultFile.content).length)
        return vaultFile.content
      }),

      getAllFiles: Effect.fn('vault.getAllFiles')(function* () {
        const cache = yield* getCacheWithFallback(cacheRef, 'getAllFiles')
        yield* Effect.annotateCurrentSpan('totalFiles', cache.size)
        const stringMap = new Map<string, string>()
        for (const [path, vaultFile] of cache.entries()) {
          stringMap.set(path, vaultFile.content)
        }
        return stringMap
      }),

      searchInFiles: Effect.fn('vault.searchInFiles')(function* (query: string) {
        if (!query || query.trim() === '') {
          return []
        }

        yield* Effect.annotateCurrentSpan('query', query)

        const cache = yield* getCacheWithFallback(cacheRef, `searchInFiles(${query})`)
        const results: Array<SearchResult> = []

        // Optimized sequential search with pre-lowercased query
        for (const [, vaultFile] of cache.entries()) {
          const fileResults = searchInContent(vaultFile, query)
          for (const result of fileResults) {
            results.push(result)
          }
        }

        yield* Effect.annotateCurrentSpan('resultCount', results.length)
        return results
      }),

      reload: Effect.fn('vault.reload')(function* () {
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

          // Return early with default metrics for empty vault
          if (files.size === 0) {
            return {
              totalFiles: 0,
              totalBytes: 0,
              totalLines: 0,
              averageFileSize: 0,
              largestFile: { path: 'none', bytes: 0 },
              smallestFile: { path: 'none', bytes: 0 },
            }
          }

          let totalBytes = 0
          let totalLines = 0
          let largest = { path: '', bytes: 0 }
          let smallest = { path: '', bytes: Number.POSITIVE_INFINITY }

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
            averageFileSize: Math.round(totalBytes / files.size),
            largestFile: largest,
            smallestFile: smallest,
          }
        }),

      getFilePaths: Effect.fn('vault.getFilePaths')(function* (limit: number, offset: number) {
        yield* Effect.annotateCurrentSpan('limit', limit)
        yield* Effect.annotateCurrentSpan('offset', offset)

        const cache = yield* getCacheWithFallback(cacheRef, 'getFilePaths')
        const allPaths = Array.from(cache.keys())
        const total = allPaths.length

        const files = yield* Stream.fromIterable(allPaths).pipe(
          Stream.drop(offset),
          Stream.take(limit),
          Stream.runCollect,
        )

        const returned = files.length
        yield* Effect.annotateCurrentSpan('returned', returned)
        yield* Effect.annotateCurrentSpan('total', total)
        return { files: Array.from(files), total }
      }),

      searchByFolder: Effect.fn('vault.searchByFolder')(function* (folderPath: string) {
        if (!folderPath || folderPath.trim() === '') {
          return []
        }

        yield* Effect.annotateCurrentSpan('folderPath', folderPath)

        const cache = yield* getCacheWithFallback(cacheRef, `searchByFolder(${folderPath})`)
        const normalizedFolderPath = folderPath.startsWith('/') ? folderPath.slice(1) : folderPath

        const matchingFiles: string[] = []

        for (const [filePath] of cache.entries()) {
          if (filePath.startsWith(normalizedFolderPath)) {
            matchingFiles.push(filePath)
          }
        }

        yield* Effect.annotateCurrentSpan('matchCount', matchingFiles.length)
        return matchingFiles
      }),
    }
  }),
  dependencies: [BunContext.layer],
}) {}

// Test helper - create mock dependencies for testing
export const VaultServiceTest = (testCache: Map<string, string>) => {
  const createTestCacheManager = () => {
    const initialCache = new Map(
      Array.from(testCache.entries()).map(([path, content]) => [
        path,
        {
          path,
          content,
          bytes: new TextEncoder().encode(content).length,
          lines: content.split('\n').length,
        } as any,
      ]),
    )
    return { cacheRef: Ref.unsafeMake(initialCache), debouncedUpdates: Ref.unsafeMake(new Map()) }
  }

  return Layer.mergeAll(
    TestVaultConfig,
    Layer.succeed(CacheManager, createTestCacheManager() as any),
    TestFileSystem(testCache),
    TestPath,
  ).pipe(Layer.provide(BunContext.layer))
}

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
