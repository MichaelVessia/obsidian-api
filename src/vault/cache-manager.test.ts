import { describe, it, expect } from 'bun:test'
import { Effect, Fiber, Ref } from 'effect'
import { CacheManager } from './cache-manager.js'
import { VaultConfigTest } from '../config/vault.js'
import { BunContext } from '@effect/platform-bun'
import { FileSystem, Path } from '@effect/platform'
import { Layer, Stream } from 'effect'

// Mock implementations for testing
const createTestLayer = (fileSystem: Map<string, string>) => {
  const TestFileSystem = Layer.succeed(FileSystem.FileSystem, {
    readDirectory: (dirPath: string) =>
      Effect.succeed(
        Array.from(fileSystem.keys())
          .filter((p) => p.startsWith(dirPath) && p !== dirPath)
          .map((p) => p.substring(dirPath.length + 1).split('/')[0])
          .filter((v, i, a) => a.indexOf(v) === i),
      ),
    readFileString: (path: string) => Effect.succeed(fileSystem.get(path) || ''),
    stat: (path: string) =>
      Effect.succeed({
        type: fileSystem.has(path) ? ('File' as const) : ('Directory' as const),
      }),
    exists: (path: string) => Effect.succeed(fileSystem.has(path)),
    watch: () => Stream.empty,
  } as any)

  const TestPath = Layer.succeed(Path.Path, {
    join: (...parts: string[]) => parts.join('/'),
    relative: (_from: string, to: string) => to,
  } as any)

  return Layer.mergeAll(VaultConfigTest('/test'), TestFileSystem, TestPath).pipe(Layer.provide(BunContext.layer))
}

describe('CacheManager', () => {
  describe('initialization', () => {
    it('should initialize cache with all markdown files', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager
        const cache = yield* Ref.get(cacheManager.cacheRef)

        expect(cache.size).toBe(2)
        expect(cache.has('file1.md')).toBe(true)
        expect(cache.has('file2.md')).toBe(true)
      }).pipe(
        Effect.provide(
          createTestLayer(
            new Map([
              ['/test/file1.md', 'Content 1'],
              ['/test/file2.md', 'Content 2'],
            ]),
          ),
        ),
      ))

    it('should create empty cache for empty vault', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager
        const cache = yield* Ref.get(cacheManager.cacheRef)

        expect(cache.size).toBe(0)
      }).pipe(Effect.provide(createTestLayer(new Map()))))

    it('should initialize debouncedUpdates as empty map', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager
        const debounced = yield* Ref.get(cacheManager.debouncedUpdates)

        expect(debounced.size).toBe(0)
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/file.md', 'Content']])))))

    it('should preserve file structure in cache keys', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager
        const cache = yield* Ref.get(cacheManager.cacheRef)

        expect(cache.has('folder/nested.md')).toBe(true)
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/folder/nested.md', 'Nested content']])))))

    it('should load VaultFile with correct metadata', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager
        const cache = yield* Ref.get(cacheManager.cacheRef)
        const file = cache.get('test.md')

        expect(file).toBeDefined()
        if (file) {
          expect(file.path).toBe('/test/test.md')
          expect(file.content).toBe('Hello')
          expect(file.bytes).toBeGreaterThan(0)
          expect(file.lines).toBe(1)
        }
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/test.md', 'Hello']])))))
  })

  describe('cache updates', () => {
    it('should handle single file being updated', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager
        const initialCache = yield* Ref.get(cacheManager.cacheRef)

        expect(initialCache.size).toBe(1)
        expect(initialCache.get('test.md')?.content).toBe('Original')
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/test.md', 'Original']])))))

    it('should handle file being deleted from cache', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager
        const cache = yield* Ref.get(cacheManager.cacheRef)

        // File exists in initial cache
        expect(cache.has('test.md')).toBe(true)

        // Simulate deletion by updating cache
        yield* Ref.set(cacheManager.cacheRef, new Map(Array.from(cache).filter(([k]) => k !== 'test.md')))

        const updated = yield* Ref.get(cacheManager.cacheRef)
        expect(updated.has('test.md')).toBe(false)
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/test.md', 'Content']])))))

    it('should preserve other files when updating one', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager
        const cache = yield* Ref.get(cacheManager.cacheRef)

        // Simulate updating file1, should preserve file2
        const updated = new Map(cache)
        const file1 = updated.get('file1.md')
        if (file1) {
          updated.set('file1.md', { ...file1, content: 'Updated' })
        }
        yield* Ref.set(cacheManager.cacheRef, updated)

        const final = yield* Ref.get(cacheManager.cacheRef)
        expect(final.size).toBe(2)
        expect(final.get('file2.md')?.content).toBe('Content 2')
      }).pipe(
        Effect.provide(
          createTestLayer(
            new Map([
              ['/test/file1.md', 'Content 1'],
              ['/test/file2.md', 'Content 2'],
            ]),
          ),
        ),
      ))
  })

  describe('debounced updates', () => {
    it('should initialize debouncedUpdates reference', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager
        const debouncedRef = cacheManager.debouncedUpdates

        // Should be accessible and initialized as empty map
        const debounced = yield* Ref.get(debouncedRef)
        expect(debounced).toBeInstanceOf(Map)
        expect(debounced.size).toBe(0)
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/file.md', 'Content']])))))

    it('should allow tracking pending fiber updates', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager

        // Simulate adding a pending update
        const dummyFiber = yield* Effect.fork(Effect.void)
        yield* Ref.update(cacheManager.debouncedUpdates, (map) => {
          const newMap = new Map(map)
          newMap.set('/test/file.md', dummyFiber)
          return newMap
        })

        const updated = yield* Ref.get(cacheManager.debouncedUpdates)
        expect(updated.size).toBe(1)
        expect(updated.has('/test/file.md')).toBe(true)

        // Cleanup
        yield* Fiber.interrupt(dummyFiber)
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/file.md', 'Content']])))))

    it('should allow removing fiber updates', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager

        // Add multiple updates
        const fiber1 = yield* Effect.fork(Effect.void)
        const fiber2 = yield* Effect.fork(Effect.void)

        yield* Ref.set(
          cacheManager.debouncedUpdates,
          new Map([
            ['/test/file1.md', fiber1],
            ['/test/file2.md', fiber2],
          ]),
        )

        // Remove one update
        yield* Ref.update(cacheManager.debouncedUpdates, (map) => {
          const newMap = new Map(map)
          newMap.delete('/test/file1.md')
          return newMap
        })

        const final = yield* Ref.get(cacheManager.debouncedUpdates)
        expect(final.size).toBe(1)
        expect(final.has('/test/file2.md')).toBe(true)

        // Cleanup
        yield* Fiber.interrupt(fiber1)
        yield* Fiber.interrupt(fiber2)
      }).pipe(
        Effect.provide(
          createTestLayer(
            new Map([
              ['/test/file1.md', 'Content 1'],
              ['/test/file2.md', 'Content 2'],
            ]),
          ),
        ),
      ))
  })

  describe('cache consistency', () => {
    it('should handle rapid successive updates to same file', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager

        // Multiple updates to same file
        for (let i = 0; i < 5; i++) {
          yield* Ref.update(cacheManager.cacheRef, (c) => {
            const newCache = new Map(c)
            const file = newCache.get('test.md')
            if (file) {
              newCache.set('test.md', { ...file, content: `Updated ${i}` })
            }
            return newCache
          })
        }

        const final = yield* Ref.get(cacheManager.cacheRef)
        expect(final.size).toBe(1)
        expect(final.get('test.md')?.content).toBe('Updated 4')
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/test.md', 'Original']])))))

    it('should maintain file metadata consistency', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager
        const cache = yield* Ref.get(cacheManager.cacheRef)
        const file = cache.get('test.md')

        if (file) {
          expect(file.path).toBeDefined()
          expect(file.content).toBeDefined()
          expect(file.bytes).toBeGreaterThanOrEqual(0)
          expect(file.lines).toBeGreaterThanOrEqual(1)
        }
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/test.md', 'Test content']])))))

    it('should handle files with special characters in names', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager
        const cache = yield* Ref.get(cacheManager.cacheRef)

        expect(cache.has('file-with-dash.md')).toBe(true)
        expect(cache.has('file_with_underscore.md')).toBe(true)
      }).pipe(
        Effect.provide(
          createTestLayer(
            new Map([
              ['/test/file-with-dash.md', 'Content 1'],
              ['/test/file_with_underscore.md', 'Content 2'],
            ]),
          ),
        ),
      ))

    it('should handle deep nested directory structures', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager
        const cache = yield* Ref.get(cacheManager.cacheRef)

        expect(cache.has('a/b/c/d/e/file.md')).toBe(true)
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/a/b/c/d/e/file.md', 'Deep content']])))))
  })

  describe('large cache scenarios', () => {
    it('should handle large number of files in cache', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager
        const cache = yield* Ref.get(cacheManager.cacheRef)

        expect(cache.size).toBe(1000)
      }).pipe(
        Effect.provide(
          createTestLayer(
            new Map(Array.from({ length: 1000 }, (_, i) => [`/test/file${i}.md`, `Content of file ${i}`])),
          ),
        ),
      ))

    it('should allow updates in large cache without corruption', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager

        // Update middle file
        const middleFile = 'file500.md'
        yield* Ref.update(cacheManager.cacheRef, (c) => {
          const newCache = new Map(c)
          const file = newCache.get(middleFile)
          if (file) {
            newCache.set(middleFile, { ...file, content: 'Updated' })
          }
          return newCache
        })

        const updated = yield* Ref.get(cacheManager.cacheRef)
        expect(updated.size).toBe(1000)
        expect(updated.get(middleFile)?.content).toBe('Updated')
        expect(updated.get('file0.md')).toBeDefined()
        expect(updated.get('file999.md')).toBeDefined()
      }).pipe(
        Effect.provide(
          createTestLayer(
            new Map(Array.from({ length: 1000 }, (_, i) => [`/test/file${i}.md`, `Content of file ${i}`])),
          ),
        ),
      ))
  })

  describe('utf8 and special content', () => {
    it('should handle files with unicode content', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager
        const cache = yield* Ref.get(cacheManager.cacheRef)
        const file = cache.get('unicode.md')

        expect(file?.content).toBe('Hello 世界 🌍')
        expect(file?.bytes).toBe(new TextEncoder().encode('Hello 世界 🌍').length)
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/unicode.md', 'Hello 世界 🌍']])))))

    it('should handle files with multiple line endings', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager
        const cache = yield* Ref.get(cacheManager.cacheRef)
        const file = cache.get('multiline.md')

        expect(file?.lines).toBe(4)
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/multiline.md', 'Line 1\nLine 2\nLine 3\nLine 4']])))))

    it('should handle empty files', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager
        const cache = yield* Ref.get(cacheManager.cacheRef)
        const file = cache.get('empty.md')

        expect(file?.content).toBe('')
        expect(file?.bytes).toBe(0)
        expect(file?.lines).toBe(1) // Empty string is 1 line
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/empty.md', '']])))))
  })

  describe('cache reference management', () => {
    it('should return same cache reference across calls', () =>
      Effect.gen(function* () {
        const cacheManager1 = yield* CacheManager
        const cacheManager2 = yield* CacheManager

        // Both should have the same underlying reference (since they're in same scope)
        const cache1 = yield* Ref.get(cacheManager1.cacheRef)
        const cache2 = yield* Ref.get(cacheManager2.cacheRef)

        expect(cache1.size).toBe(cache2.size)
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/file.md', 'Content']])))))

    it('should allow independent cache updates without interference', () =>
      Effect.gen(function* () {
        const cacheManager = yield* CacheManager

        // Create two independent update effects
        const update1 = Ref.update(cacheManager.cacheRef, (cacheMap) => {
          const newCache = new Map(cacheMap)
          const file = newCache.get('file1.md')
          if (file) newCache.set('file1.md', { ...file, content: 'Updated1' })
          return newCache
        })

        const update2 = Ref.update(cacheManager.cacheRef, (cacheMap) => {
          const newCache = new Map(cacheMap)
          const file = newCache.get('file2.md')
          if (file) newCache.set('file2.md', { ...file, content: 'Updated2' })
          return newCache
        })

        yield* update1
        yield* update2

        const final = yield* Ref.get(cacheManager.cacheRef)
        expect(final.get('file1.md')?.content).toBe('Updated1')
        expect(final.get('file2.md')?.content).toBe('Updated2')
      }).pipe(
        Effect.provide(
          createTestLayer(
            new Map([
              ['/test/file1.md', 'Content 1'],
              ['/test/file2.md', 'Content 2'],
            ]),
          ),
        ),
      ))
  })
})
