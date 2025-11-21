import { describe, it, expect } from 'bun:test'
import { Effect } from 'effect'
import { FileLoader } from './file-loader.js'
import { VaultConfigTest } from '../config/vault.js'
import { BunContext } from '@effect/platform-bun'
import { FileSystem, Path } from '@effect/platform'
import { Layer } from 'effect'
import { Stream } from 'effect'

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

describe('FileLoader', () => {
  describe('loadFile', () => {
    it('should load a single file successfully', () =>
      Effect.gen(function* () {
        const fileLoader = yield* FileLoader
        const [relativePath, vaultFile] = yield* fileLoader.loadFile('/test/example.md')

        expect(relativePath).toBe('example.md')
        expect(vaultFile.path).toBe('/test/example.md')
        expect(vaultFile.bytes).toBeGreaterThanOrEqual(0)
        expect(vaultFile.lines).toBeGreaterThanOrEqual(1)
      }).pipe(
        Effect.provide(
          createTestLayer(
            new Map([
              ['/test/example.md', 'Line 1\nLine 2\nLine 3'],
              ['/test/.gitignore', 'ignored'],
            ]),
          ),
        ),
      ))

    it('should calculate file metrics correctly', () =>
      Effect.gen(function* () {
        const fileLoader = yield* FileLoader
        const [_relativePath, vaultFile] = yield* fileLoader.loadFile('/test/content.md')

        expect(vaultFile.bytes).toBe(new TextEncoder().encode('Hello').length)
        expect(vaultFile.lines).toBe(1)
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/content.md', 'Hello']])))))

    it('should handle files with multiple lines', () =>
      Effect.gen(function* () {
        const fileLoader = yield* FileLoader
        const [_relativePath, vaultFile] = yield* fileLoader.loadFile('/test/multiline.md')

        expect(vaultFile.lines).toBe(4)
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/multiline.md', 'Line 1\nLine 2\nLine 3\nLine 4']])))))

    it('should handle UTF-8 encoded content', () =>
      Effect.gen(function* () {
        const fileLoader = yield* FileLoader
        const [_relativePath, vaultFile] = yield* fileLoader.loadFile('/test/unicode.md')

        const expectedBytes = new TextEncoder().encode('Hello 世界 🌍').length
        expect(vaultFile.bytes).toBe(expectedBytes)
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/unicode.md', 'Hello 世界 🌍']])))))

    it('should extract relative path correctly', () =>
      Effect.gen(function* () {
        const fileLoader = yield* FileLoader
        const [relativePath, _vaultFile] = yield* fileLoader.loadFile('/test/nested/subdir/file.md')

        expect(relativePath).toBe('nested/subdir/file.md')
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/nested/subdir/file.md', 'content']])))))
  })

  describe('loadAllFiles', () => {
    it('should load all markdown files from vault', () =>
      Effect.gen(function* () {
        const fileLoader = yield* FileLoader
        const filesMap = yield* fileLoader.loadAllFiles

        expect(filesMap.size).toBe(3)
        expect(filesMap.has('file1.md')).toBe(true)
        expect(filesMap.has('subdir/file2.md')).toBe(true)
        expect(filesMap.has('nested/deep/file3.md')).toBe(true)
      }).pipe(
        Effect.provide(
          createTestLayer(
            new Map([
              ['/test/file1.md', 'Content 1'],
              ['/test/subdir/file2.md', 'Content 2'],
              ['/test/nested/deep/file3.md', 'Content 3'],
              ['/test/.gitignore', 'ignored'],
              ['/test/notes.txt', 'ignored'],
            ]),
          ),
        ),
      ))

    it('should skip hidden directories', () =>
      Effect.gen(function* () {
        const fileLoader = yield* FileLoader
        const filesMap = yield* fileLoader.loadAllFiles

        expect(filesMap.size).toBe(1)
        expect(filesMap.has('visible.md')).toBe(true)
        expect(filesMap.has('.hidden/file.md')).toBe(false)
      }).pipe(
        Effect.provide(
          createTestLayer(
            new Map([
              ['/test/visible.md', 'content'],
              ['/test/.hidden/file.md', 'hidden content'],
            ]),
          ),
        ),
      ))

    it('should handle empty vault', () =>
      Effect.gen(function* () {
        const fileLoader = yield* FileLoader
        const filesMap = yield* fileLoader.loadAllFiles

        expect(filesMap.size).toBe(0)
      }).pipe(Effect.provide(createTestLayer(new Map()))))

    it('should only load .md files', () =>
      Effect.gen(function* () {
        const fileLoader = yield* FileLoader
        const filesMap = yield* fileLoader.loadAllFiles

        expect(filesMap.size).toBe(1)
        expect(filesMap.has('readme.md')).toBe(true)
        expect(filesMap.has('config.json')).toBe(false)
        expect(filesMap.has('script.ts')).toBe(false)
      }).pipe(
        Effect.provide(
          createTestLayer(
            new Map([
              ['/test/readme.md', 'markdown'],
              ['/test/config.json', 'json'],
              ['/test/script.ts', 'typescript'],
            ]),
          ),
        ),
      ))

    it('should preserve nested directory structure in relative paths', () =>
      Effect.gen(function* () {
        const fileLoader = yield* FileLoader
        const filesMap = yield* fileLoader.loadAllFiles

        expect(filesMap.has('a/b/c/deep.md')).toBe(true)
        expect(filesMap.get('a/b/c/deep.md')).toBeDefined()
      }).pipe(Effect.provide(createTestLayer(new Map([['/test/a/b/c/deep.md', 'deep content']])))))
  })
})
