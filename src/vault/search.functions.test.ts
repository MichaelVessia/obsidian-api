import { describe, expect, it } from 'bun:test'
import { searchInContent } from './search.functions.js'
import type { VaultFile } from './domain.js'

describe('search.functions', () => {
  describe('searchInContent', () => {
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

    it('should return correct filePath', () => {
      const vaultFile: VaultFile = {
        path: '/vault/docs/example.md',
        content: 'This contains the search term',
        frontmatter: {},
        bytes: 0,
        lines: 1,
      }

      const results = searchInContent(vaultFile, 'search')

      expect(results).toHaveLength(1)
      expect(results[0]?.filePath).toBe('/vault/docs/example.md')
    })

    it('should return correct lineNumber', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'Line 1\nLine 2 with search\nLine 3',
        frontmatter: {},
        bytes: 0,
        lines: 3,
      }

      const results = searchInContent(vaultFile, 'search')

      expect(results).toHaveLength(1)
      expect(results[0]?.lineNumber).toBe(2)
    })

    it('should skip empty lines', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'Line 1\n\n\nLine with search term\n',
        frontmatter: {},
        bytes: 0,
        lines: 5,
      }

      const results = searchInContent(vaultFile, 'search')

      expect(results).toHaveLength(1)
      expect(results[0]?.lineNumber).toBe(4)
    })

    it('should handle overlapping matches', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'testtest test',
        frontmatter: {},
        bytes: 0,
        lines: 1,
      }

      const results = searchInContent(vaultFile, 'test')

      expect(results).toHaveLength(1) // Should find line once, not multiple times for overlapping matches
      expect(results[0]?.context).toContain('testtest test')
    })

    it('should handle context with boundary conditions at start', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'query at the beginning',
        frontmatter: {},
        bytes: 0,
        lines: 1,
      }

      const results = searchInContent(vaultFile, 'query')

      expect(results).toHaveLength(1)
      expect(results[0]?.context).toBe('query at the beginning')
    })

    it('should handle context with boundary conditions at end', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'at the end query',
        frontmatter: {},
        bytes: 0,
        lines: 1,
      }

      const results = searchInContent(vaultFile, 'query')

      expect(results).toHaveLength(1)
      expect(results[0]?.context).toBe('at the end query')
    })

    it('should handle numbers in query', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'Version 2.5.1 released\nBuild 123 complete',
        frontmatter: {},
        bytes: 0,
        lines: 2,
      }

      const results = searchInContent(vaultFile, '123')

      expect(results).toHaveLength(1)
      expect(results[0]?.lineNumber).toBe(2)
      expect(results[0]?.context).toContain('123')
    })

    it('should handle tabs and special whitespace', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'line\twith\ttabs\nline with search',
        frontmatter: {},
        bytes: 0,
        lines: 2,
      }

      const results = searchInContent(vaultFile, 'search')

      expect(results).toHaveLength(1)
      expect(results[0]?.lineNumber).toBe(2)
    })

    it('should handle multiple lines with same query', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'query\nno match\nquery\nno match\nquery',
        frontmatter: {},
        bytes: 0,
        lines: 5,
      }

      const results = searchInContent(vaultFile, 'query')

      expect(results).toHaveLength(3)
      expect(results[0]?.lineNumber).toBe(1)
      expect(results[1]?.lineNumber).toBe(3)
      expect(results[2]?.lineNumber).toBe(5)
    })

    it('should preserve case in context even with case-insensitive search', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'Found QUERY in UPPERCASE',
        frontmatter: {},
        bytes: 0,
        lines: 1,
      }

      const results = searchInContent(vaultFile, 'query')

      expect(results).toHaveLength(1)
      expect(results[0]?.context).toBe('Found QUERY in UPPERCASE')
    })

    it('should handle very short lines', () => {
      const vaultFile: VaultFile = {
        path: '/test/file.md',
        content: 'q\nno\nqueryline',
        frontmatter: {},
        bytes: 0,
        lines: 3,
      }

      const results = searchInContent(vaultFile, 'query')

      expect(results).toHaveLength(1)
      expect(results[0]?.lineNumber).toBe(3)
      expect(results[0]?.context).toBe('queryline')
    })
  })
})
