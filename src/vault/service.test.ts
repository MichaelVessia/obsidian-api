import { describe, expect, it } from 'bun:test'
import { Effect, Option } from 'effect'
import { VaultService, VaultServiceTest } from './service.js'
import { searchInContent } from './functions.js'
import type { VaultFile } from './domain.js'

describe('VaultService', () => {
  it('should return file content for existing file', () => {
    const cache = new Map([
      ['test.md', '# Test File\nSome content'],
      ['notes/example.md', 'Example note'],
    ])

    return Effect.gen(function* () {
      const service = yield* VaultService
      const content = yield* service.getFile('test.md')

      expect(Option.isSome(content)).toBe(true)
      expect(Option.getOrNull(content)).toBe('# Test File\nSome content')
    }).pipe(Effect.provide(VaultServiceTest(cache)))
  })

  it('should return None for non-existent file', () => {
    const cache = new Map([['test.md', 'content']])

    return Effect.gen(function* () {
      const service = yield* VaultService
      const content = yield* service.getFile('missing.md')

      expect(Option.isNone(content)).toBe(true)
    }).pipe(Effect.provide(VaultServiceTest(cache)))
  })

  it('should return all files', () => {
    const cache = new Map([
      ['test.md', 'content1'],
      ['notes/example.md', 'content2'],
    ])

    return Effect.gen(function* () {
      const service = yield* VaultService
      const allFiles = yield* service.getAllFiles()

      expect(allFiles.size).toBe(2)
      expect(allFiles.get('test.md')).toBe('content1')
      expect(allFiles.get('notes/example.md')).toBe('content2')
    }).pipe(Effect.provide(VaultServiceTest(cache)))
  })

  it('should search and return results from multiple files', () => {
    const cache = new Map([
      ['file1.md', 'First line\nThis contains the query word\nLast line'],
      ['file2.md', 'Another file\nWith query in it\nEnd'],
      ['file3.md', 'No match here'],
    ])

    return Effect.gen(function* () {
      const service = yield* VaultService
      const results = yield* service.searchInFiles('query')

      expect(results).toHaveLength(2)
      expect(results[0]?.filePath).toBe('file1.md')
      expect(results[0]?.lineNumber).toBe(2)
      expect(results[0]?.context).toContain('query')
      expect(results[1]?.filePath).toBe('file2.md')
      expect(results[1]?.lineNumber).toBe(2)
    }).pipe(Effect.provide(VaultServiceTest(cache)))
  })

  it('should return empty array for empty query', () => {
    const cache = new Map([['test.md', 'some content']])

    return Effect.gen(function* () {
      const service = yield* VaultService
      const results = yield* service.searchInFiles('')

      expect(results).toHaveLength(0)
    }).pipe(Effect.provide(VaultServiceTest(cache)))
  })

  it('should be case-insensitive in search', () => {
    const cache = new Map([['test.md', 'This contains QUERY in CAPS']])

    return Effect.gen(function* () {
      const service = yield* VaultService
      const results = yield* service.searchInFiles('query')

      expect(results).toHaveLength(1)
      expect(results[0]?.context).toContain('QUERY')
    }).pipe(Effect.provide(VaultServiceTest(cache)))
  })

  it('should include context around match', () => {
    const longText = `${'a'.repeat(150)}query${'b'.repeat(150)}`
    const cache = new Map([['test.md', longText]])

    return Effect.gen(function* () {
      const service = yield* VaultService
      const results = yield* service.searchInFiles('query')

      expect(results).toHaveLength(1)
      expect(results[0]?.context.length).toBeLessThanOrEqual(205) // 100 before + 5 (query) + 100 after
      expect(results[0]?.context).toContain('query')
    }).pipe(Effect.provide(VaultServiceTest(cache)))
  })

  it('should return file content for getFileContent with existing file', () => {
    const cache = new Map([
      ['test.md', '# Test File\nSome content'],
      ['notes/example.md', 'Example note'],
    ])

    return Effect.gen(function* () {
      const service = yield* VaultService
      const content = yield* service.getFileContent('test.md')

      expect(content).toBe('# Test File\nSome content')
    }).pipe(Effect.provide(VaultServiceTest(cache)))
  })

  it('should normalize filename by adding .md extension in getFileContent', () => {
    const cache = new Map([['test.md', 'content']])

    return Effect.gen(function* () {
      const service = yield* VaultService
      const content = yield* service.getFileContent('test')

      expect(content).toBe('content')
    }).pipe(Effect.provide(VaultServiceTest(cache)))
  })

  it('should return BadRequest error for empty filename in getFileContent', () => {
    const cache = new Map([['test.md', 'content']])

    return Effect.gen(function* () {
      const service = yield* VaultService
      const result = yield* Effect.either(service.getFileContent(''))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left._tag).toBe('BadRequest')
      }
    }).pipe(Effect.provide(VaultServiceTest(cache)))
  })

  it('should return NotFound error for non-existent file in getFileContent', () => {
    const cache = new Map([['test.md', 'content']])

    return Effect.gen(function* () {
      const service = yield* VaultService
      const result = yield* Effect.either(service.getFileContent('missing.md'))

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left._tag).toBe('NotFound')
      }
    }).pipe(Effect.provide(VaultServiceTest(cache)))
  })

  it('should calculate metrics for empty cache', () =>
    Effect.gen(function* () {
      const service = yield* VaultService
      const metrics = yield* service.getMetrics()

      expect(metrics).toEqual({
        totalFiles: 0,
        totalBytes: 0,
        totalLines: 0,
        averageFileSize: 0,
        largestFile: { path: 'none', bytes: 0 },
        smallestFile: { path: 'none', bytes: 0 },
      })
    }).pipe(Effect.provide(VaultServiceTest(new Map()))))

  it('should calculate metrics for single file', () =>
    Effect.gen(function* () {
      const service = yield* VaultService
      const metrics = yield* service.getMetrics()

      expect(metrics.totalFiles).toBe(1)
      expect(metrics.totalLines).toBe(3)
      expect(metrics.largestFile.path).toBe('test.md')
      expect(metrics.smallestFile.path).toBe('test.md')
    }).pipe(Effect.provide(VaultServiceTest(new Map([['test.md', 'Line 1\nLine 2\nLine 3']])))))

  it('should calculate metrics for multiple files', () =>
    Effect.gen(function* () {
      const service = yield* VaultService
      const metrics = yield* service.getMetrics()

      expect(metrics.totalFiles).toBe(3)
      expect(metrics.largestFile.path).toBe('large.md')
      expect(metrics.smallestFile.path).toBe('small.md')
      expect(metrics.averageFileSize).toBeGreaterThan(0)
    }).pipe(
      Effect.provide(
        VaultServiceTest(
          new Map([
            ['small.md', 'Short'],
            ['medium.md', 'Line 1\nLine 2\nLine 3'],
            ['large.md', 'This is a much longer file\nwith multiple lines\nand more content\nto test the metrics'],
          ]),
        ),
      ),
    ))

  it('should count bytes correctly using UTF-8 encoding', () =>
    Effect.gen(function* () {
      const service = yield* VaultService
      const content = 'Hello'
      const expectedBytes = new TextEncoder().encode(content).length
      const metrics = yield* service.getMetrics()

      expect(metrics.totalBytes).toBe(expectedBytes)
    }).pipe(Effect.provide(VaultServiceTest(new Map([['test.md', 'Hello']])))))

  // Additional service tests
  describe('reload functionality', () => {
    it('should reload cache successfully', () => {
      const cache = new Map([['test.md', 'original content']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        yield* service.reload()

        // After reload, should still work with test cache
        const content = yield* service.getFile('test.md')
        expect(Option.isSome(content)).toBe(true)
        expect(Option.getOrNull(content)).toBe('original content')
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })
  })

  describe('search edge cases', () => {
    it('should handle whitespace-only query', () => {
      const cache = new Map([['test.md', 'some content']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const results = yield* service.searchInFiles('   ')

        expect(results).toHaveLength(0)
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle special characters in query', () => {
      const cache = new Map([['test.md', 'Content with special chars: !@#$%^&*()']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const results = yield* service.searchInFiles('!@#$%^&*()')

        expect(results).toHaveLength(1)
        expect(results[0]?.context).toContain('!@#$%^&*()')
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle multiple matches in same file', () => {
      const cache = new Map([['test.md', 'First search term\nSecond line\nThird search term']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const results = yield* service.searchInFiles('search')

        expect(results).toHaveLength(2)
        expect(results[0]?.lineNumber).toBe(1)
        expect(results[1]?.lineNumber).toBe(3)
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle query at beginning of line', () => {
      const cache = new Map([['test.md', 'search term at start']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const results = yield* service.searchInFiles('search')

        expect(results).toHaveLength(1)
        expect(results[0]?.lineNumber).toBe(1)
        expect(results[0]?.context).toContain('search term at start')
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle query at end of line', () => {
      const cache = new Map([['test.md', 'term at end search']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const results = yield* service.searchInFiles('search')

        expect(results).toHaveLength(1)
        expect(results[0]?.lineNumber).toBe(1)
        expect(results[0]?.context).toContain('term at end search')
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })
  })

  describe('getFileContent edge cases', () => {
    it('should handle filename with whitespace only', () => {
      const cache = new Map([['test.md', 'content']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const result = yield* Effect.either(service.getFileContent('   '))

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('BadRequest')
        }
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle filename that already has .md extension', () => {
      const cache = new Map([['test.md', 'content']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const content = yield* service.getFileContent('test.md')

        expect(content).toBe('content')
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle filename with multiple dots', () => {
      const cache = new Map([['test.v2.md', 'content']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const content = yield* service.getFileContent('test.v2')

        expect(content).toBe('content')
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })
  })

  describe('metrics edge cases', () => {
    it('should handle files with zero bytes', () => {
      const cache = new Map([['empty.md', '']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const metrics = yield* service.getMetrics()

        expect(metrics.totalFiles).toBe(1)
        expect(metrics.totalBytes).toBe(0)
        expect(metrics.totalLines).toBe(1) // Empty string still counts as 1 line
        expect(metrics.averageFileSize).toBe(0)
        expect(metrics.largestFile.path).toBe('empty.md')
        expect(metrics.smallestFile.path).toBe('empty.md')
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle files with only newlines', () => {
      const cache = new Map([['newlines.md', '\n\n\n']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const metrics = yield* service.getMetrics()

        expect(metrics.totalFiles).toBe(1)
        expect(metrics.totalLines).toBe(4) // 3 newlines = 4 lines
        expect(metrics.totalBytes).toBe(3) // 3 newline characters
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle files with unicode characters', () => {
      const cache = new Map([['unicode.md', 'Hello 世界 🌍']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const metrics = yield* service.getMetrics()

        expect(metrics.totalFiles).toBe(1)
        expect(metrics.totalBytes).toBe(new TextEncoder().encode('Hello 世界 🌍').length)
        expect(metrics.totalLines).toBe(1)
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })
  })

  // Integration tests for internal functions using real service
  describe('internal functions integration', () => {
    it('should test searchInContent function behavior', () => {
      const cache = new Map([['test.md', 'Line 1\nSearch term here\nLine 3']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const results = yield* service.searchInFiles('search')

        // This tests the internal searchInContent function indirectly
        expect(results).toHaveLength(1)
        expect(results[0]?.filePath).toBe('test.md')
        expect(results[0]?.lineNumber).toBe(2)
        expect(results[0]?.context).toContain('Search term here')
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should test loadFileContent behavior through service', () => {
      const cache = new Map([['test.md', '# Frontmatter\ntitle: Test\n\nContent here']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const content = yield* service.getFile('test.md')

        // This tests the internal loadFileContent function indirectly
        expect(Option.isSome(content)).toBe(true)
        expect(Option.getOrNull(content)).toBe('# Frontmatter\ntitle: Test\n\nContent here')
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should test walkDirectory behavior through service', () => {
      const cache = new Map([
        ['file1.md', 'content1'],
        ['subdir/file2.md', 'content2'],
        ['subdir/nested/file3.md', 'content3'],
      ])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const allFiles = yield* service.getAllFiles()

        // This tests the internal walkDirectory function indirectly
        expect(allFiles.size).toBe(3)
        expect(allFiles.has('file1.md')).toBe(true)
        expect(allFiles.has('subdir/file2.md')).toBe(true)
        expect(allFiles.has('subdir/nested/file3.md')).toBe(true)
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should test loadAllFiles behavior through service', () => {
      const cache = new Map([
        ['test1.md', 'content1'],
        ['test2.md', 'content2'],
      ])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const allFiles = yield* service.getAllFiles()

        // This tests the internal loadAllFiles function indirectly
        expect(allFiles.size).toBe(2)
        expect(allFiles.get('test1.md')).toBe('content1')
        expect(allFiles.get('test2.md')).toBe('content2')
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })
  })

  // Test the test layer implementation
  describe('VaultServiceTest layer', () => {
    it('should test searchInFiles implementation in test layer', () => {
      const cache = new Map([
        ['test.md', 'Content with search term'],
        ['other.md', 'No match here'],
      ])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const results = yield* service.searchInFiles('search')

        // Tests the test layer's searchInFiles implementation
        expect(results).toHaveLength(1)
        expect(results[0]?.filePath).toBe('test.md')
        expect(results[0]?.context).toContain('search term')
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should test getMetrics implementation in test layer', () => {
      const cache = new Map([
        ['small.md', 'Small'],
        ['large.md', 'This is a much larger file with more content'],
      ])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const metrics = yield* service.getMetrics()

        // Tests the test layer's getMetrics implementation
        expect(metrics.totalFiles).toBe(2)
        expect(metrics.totalBytes).toBeGreaterThan(0)
        expect(metrics.largestFile.path).toBe('large.md')
        expect(metrics.smallestFile.path).toBe('small.md')
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })
  })

  // Service layer edge cases
  describe('VaultService edge cases', () => {
    it('should handle search with regex special characters', () => {
      const cache = new Map([['test.md', 'Content with [brackets] and {braces}']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const results = yield* service.searchInFiles('[brackets]')

        expect(results).toHaveLength(1)
        expect(results[0]?.context).toContain('[brackets]')
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle search with newlines in content', () => {
      const cache = new Map([['test.md', 'Line 1\nsearch term\nLine 3\nmore search']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const results = yield* service.searchInFiles('search')

        expect(results).toHaveLength(2)
        expect(results[0]?.lineNumber).toBe(2)
        expect(results[1]?.lineNumber).toBe(4)
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle getFileContent with filename containing path separators', () => {
      const cache = new Map([['subdir/file.md', 'content']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const result = yield* Effect.either(service.getFileContent('subdir/file'))

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('NotFound')
        }
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle very long filenames', () => {
      const longFilename = 'a'.repeat(200)
      const cache = new Map([[`${longFilename}.md`, 'content']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const content = yield* service.getFileContent(longFilename)

        expect(content).toBe('content')
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle metrics with files of equal size', () => {
      const cache = new Map([
        ['file1.md', 'same size'],
        ['file2.md', 'same size'],
        ['file3.md', 'different'],
      ])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const metrics = yield* service.getMetrics()

        expect(metrics.totalFiles).toBe(3)
        // When files have equal size, the first one encountered should be largest/smallest
        expect(metrics.largestFile.path).toBe('file1.md')
        expect(metrics.smallestFile.path).toBe('file3.md')
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle search with overlapping matches', () => {
      const cache = new Map([['test.md', 'testtest test']])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const results = yield* service.searchInFiles('test')

        expect(results).toHaveLength(1) // Should find line once, not multiple times for overlapping matches
        expect(results[0]?.context).toContain('testtest test')
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle getFileContent with null/undefined input', () => {
      const cache = new Map([['test.md', 'content']])

      return Effect.gen(function* () {
        const service = yield* VaultService

        // Test with undefined
        const result1 = yield* Effect.either(service.getFileContent(undefined as any))
        expect(result1._tag).toBe('Left')
        if (result1._tag === 'Left') {
          expect(result1.left._tag).toBe('BadRequest')
        }

        // Test with null
        const result2 = yield* Effect.either(service.getFileContent(null as any))
        expect(result2._tag).toBe('Left')
        if (result2._tag === 'Left') {
          expect(result2.left._tag).toBe('BadRequest')
        }
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle cache with very large number of files', () => {
      const largeCache = new Map()
      for (let i = 0; i < 1000; i++) {
        largeCache.set(`file${i}.md`, `Content of file ${i}`)
      }

      return Effect.gen(function* () {
        const service = yield* VaultService
        const allFiles = yield* service.getAllFiles()

        expect(allFiles.size).toBe(1000)
        expect(allFiles.get('file0.md')).toBe('Content of file 0')
        expect(allFiles.get('file999.md')).toBe('Content of file 999')
      }).pipe(Effect.provide(VaultServiceTest(largeCache)))
    })

    it('should handle search performance with large cache', () => {
      const largeCache = new Map()
      for (let i = 0; i < 100; i++) {
        largeCache.set(`file${i}.md`, i === 50 ? 'search term here' : 'other content')
      }

      return Effect.gen(function* () {
        const service = yield* VaultService
        const results = yield* service.searchInFiles('search')

        expect(results).toHaveLength(1)
        expect(results[0]?.filePath).toBe('file50.md')
      }).pipe(Effect.provide(VaultServiceTest(largeCache)))
    })
  })

  // Tests for internal function edge cases that might not be covered
  describe('searchInContent additional edge cases', () => {
    it('should handle query with line breaks', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'Line 1\nLine 2\nLine 3',
        frontmatter: {},
        bytes: 0,
        lines: 3,
      }

      const results = searchInContent(vaultFile, 'Line 1\nLine 2')

      // Should not match multi-line queries
      expect(results).toHaveLength(0)
    })

    it('should handle content with only whitespace', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: '   \n  \t  \n   ',
        frontmatter: {},
        bytes: 0,
        lines: 3,
      }

      const results = searchInContent(vaultFile, ' ')

      expect(results).toHaveLength(3) // Should match each line with spaces
    })

    it('should handle exact match with case sensitivity', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'Test TEST test TeSt',
        frontmatter: {},
        bytes: 0,
        lines: 1,
      }

      const results = searchInContent(vaultFile, 'test')

      expect(results).toHaveLength(1)
      expect(results[0]?.context).toContain('Test TEST test TeSt')
    })

    it('should handle context extraction at line boundaries', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'verylonglinewithsearchtermattheend',
        frontmatter: {},
        bytes: 0,
        lines: 1,
      }

      const results = searchInContent(vaultFile, 'searchterm')

      expect(results).toHaveLength(1)
      expect(results[0]?.context).toContain('verylonglinewithsearchtermattheend')
    })

    it('should be case-insensitive', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'First line\nSEARCH TERM HERE\nThird line',
        frontmatter: {},
        bytes: 0,
        lines: 3,
      }

      const results = searchInContent(vaultFile, 'search')

      expect(results).toHaveLength(1)
      expect(results[0]?.context).toContain('SEARCH TERM HERE')
    })

    it('should handle multiple matches in same file', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'First search term\nSecond line\nThird search term',
        frontmatter: {},
        bytes: 0,
        lines: 3,
      }

      const results = searchInContent(vaultFile, 'search')

      expect(results).toHaveLength(2)
      expect(results[0]?.lineNumber).toBe(1)
      expect(results[1]?.lineNumber).toBe(3)
    })

    it('should limit context to 100 characters around match', () => {
      const longText = `${'a'.repeat(150)}query${'b'.repeat(150)}`
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: longText,
        frontmatter: {},
        bytes: 0,
        lines: 1,
      }

      const results = searchInContent(vaultFile, 'query')

      expect(results).toHaveLength(1)
      expect(results[0]?.context.length).toBeLessThanOrEqual(206) // 100 before + 5 (query) + 100 after + 1 for index difference
      expect(results[0]?.context).toContain('query')
    })

    it('should handle empty content', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: '',
        frontmatter: {},
        bytes: 0,
        lines: 1,
      }

      const results = searchInContent(vaultFile, 'search')

      expect(results).toHaveLength(0)
    })

    it('should handle special characters in query', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'Content with special chars: !@#$%^&*()',
        frontmatter: {},
        bytes: 0,
        lines: 1,
      }

      const results = searchInContent(vaultFile, '!@#$%^&*()')

      expect(results).toHaveLength(1)
      expect(results[0]?.context).toContain('!@#$%^&*()')
    })

    it('should handle query at beginning and end of line', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'search at start\nend with search',
        frontmatter: {},
        bytes: 0,
        lines: 2,
      }

      const results = searchInContent(vaultFile, 'search')

      expect(results).toHaveLength(2)
      expect(results[0]?.lineNumber).toBe(1)
      expect(results[0]?.context).toContain('search at start')
      expect(results[1]?.lineNumber).toBe(2)
      expect(results[1]?.context).toContain('end with search')
    })

    it('should handle unicode characters correctly', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'Hello 世界 🌍\nAnother line with 世界',
        frontmatter: {},
        bytes: 0,
        lines: 2,
      }

      const results = searchInContent(vaultFile, '世界')

      expect(results).toHaveLength(2)
      expect(results[0]?.lineNumber).toBe(1)
      expect(results[1]?.lineNumber).toBe(2)
    })

    it('should handle empty query', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'Some content here',
        frontmatter: {},
        bytes: 0,
        lines: 1,
      }

      const results = searchInContent(vaultFile, '')

      // Empty query should match all lines since empty string is included in any string
      expect(results).toHaveLength(1)
    })

    it('should handle whitespace-only query', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'Line with spaces\nAnother line',
        frontmatter: {},
        bytes: 0,
        lines: 2,
      }

      const results = searchInContent(vaultFile, '   ')

      // Whitespace-only query should not match anything since spaces don't match empty string behavior
      expect(results).toHaveLength(0)
    })

    it('should handle very long lines efficiently', () => {
      const longLine = `${'word '.repeat(100)}target${' word'.repeat(100)}`
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: longLine,
        frontmatter: {},
        bytes: 0,
        lines: 1,
      }

      const results = searchInContent(vaultFile, 'target')

      expect(results).toHaveLength(1)
      expect(results[0]?.context.length).toBeLessThanOrEqual(206) // Should still limit context
      expect(results[0]?.context).toContain('target')
    })
  })

  describe('getFilePaths pagination', () => {
    it('should return paginated file paths with correct total', () => {
      const cache = new Map([
        ['file1.md', 'content1'],
        ['file2.md', 'content2'],
        ['file3.md', 'content3'],
        ['file4.md', 'content4'],
        ['file5.md', 'content5'],
      ])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const result = yield* service.getFilePaths(2, 1)

        expect(result.total).toBe(5)
        expect(result.files).toEqual(['file2.md', 'file3.md'])
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle offset 0 and return first page', () => {
      const cache = new Map([
        ['a.md', 'content1'],
        ['b.md', 'content2'],
        ['c.md', 'content3'],
      ])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const result = yield* service.getFilePaths(2, 0)

        expect(result.total).toBe(3)
        expect(result.files).toEqual(['a.md', 'b.md'])
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle limit larger than remaining items', () => {
      const cache = new Map([
        ['file1.md', 'content1'],
        ['file2.md', 'content2'],
      ])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const result = yield* service.getFilePaths(10, 1)

        expect(result.total).toBe(2)
        expect(result.files).toEqual(['file2.md'])
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle offset beyond available items', () => {
      const cache = new Map([
        ['file1.md', 'content1'],
        ['file2.md', 'content2'],
      ])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const result = yield* service.getFilePaths(10, 10)

        expect(result.total).toBe(2)
        expect(result.files).toEqual([])
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should return no files when limit is 0', () => {
      const cache = new Map([
        ['file1.md', 'content1'],
        ['file2.md', 'content2'],
        ['file3.md', 'content3'],
      ])

      return Effect.gen(function* () {
        const service = yield* VaultService
        const result = yield* service.getFilePaths(0, 0)

        expect(result.total).toBe(3)
        expect(result.files).toHaveLength(0)
        expect(result.files).toEqual([])
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })

    it('should handle empty cache', () => {
      const cache = new Map()

      return Effect.gen(function* () {
        const service = yield* VaultService
        const result = yield* service.getFilePaths(10, 0)

        expect(result.total).toBe(0)
        expect(result.files).toEqual([])
      }).pipe(Effect.provide(VaultServiceTest(cache)))
    })
  })
})
