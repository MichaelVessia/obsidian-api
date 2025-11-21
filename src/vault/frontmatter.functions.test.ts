import { Effect } from 'effect'
import { describe, expect, it } from 'bun:test'
import { parseFrontmatter } from './frontmatter.functions.js'

describe('frontmatter.functions', () => {
  describe('parseFrontmatter', () => {
    it('should handle content without frontmatter', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const content = '# Just a regular markdown file\n\nSome content here.'
          const result = yield* parseFrontmatter(content)

          expect(result.frontmatter).toEqual({})
          expect(result.content).toBe(content)
        }),
      ))

    it('should parse simple string frontmatter', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const content = `---
title: "My Document"
---
# Content

Some content here.`
          const result = yield* parseFrontmatter(content)

          expect(result.frontmatter).toEqual({ title: 'My Document' })
          expect(result.content).toBe('# Content\n\nSome content here.')
        }),
      ))

    it('should parse multiple frontmatter fields', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const content = `---
title: "My Document"
author: John Doe
published: true
wordCount: 1500
tags: ["markdown", "test", "example"]
---
# Content

Some content here.`
          const result = yield* parseFrontmatter(content)

          expect(result.frontmatter).toEqual({
            title: 'My Document',
            author: 'John Doe',
            published: true,
            wordCount: 1500,
            tags: ['markdown', 'test', 'example'],
          })
          expect(result.content).toBe('# Content\n\nSome content here.')
        }),
      ))

    it('should handle empty frontmatter', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const content = `---
---
# Content

Some content here.`
          const result = yield* parseFrontmatter(content)

          expect(result.frontmatter).toEqual({})
          expect(result.content).toBe('---\n---\n# Content\n\nSome content here.')
        }),
      ))

    it('should handle frontmatter with comments', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const content = `---
# This is a comment
title: "My Document"
# Another comment
author: John Doe
---
# Content

Some content here.`
          const result = yield* parseFrontmatter(content)

          expect(result.frontmatter).toEqual({
            title: 'My Document',
            author: 'John Doe',
          })
          expect(result.content).toBe('# Content\n\nSome content here.')
        }),
      ))

    it('should handle malformed frontmatter gracefully', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const content = `---
title: "Unclosed quote
author: John Doe
---
# Content

Some content here.`
          const result = yield* parseFrontmatter(content)

          // Should still parse what it can
          expect(result.frontmatter).toEqual({
            title: '"Unclosed quote',
            author: 'John Doe',
          })
          expect(result.content).toBe('# Content\n\nSome content here.')
        }),
      ))

    it('should handle boolean values', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const content = `---
published: true
draft: false
---
# Content`
          const result = yield* parseFrontmatter(content)

          expect(result.frontmatter).toEqual({
            published: true,
            draft: false,
          })
        }),
      ))

    it('should handle numeric values', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const content = `---
wordCount: 1500
rating: 4.5
year: 2023
---
# Content`
          const result = yield* parseFrontmatter(content)

          expect(result.frontmatter).toEqual({
            wordCount: 1500,
            rating: 4.5,
            year: 2023,
          })
        }),
      ))

    it('should handle array values', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const content = `---
tags: ["markdown", "test", "example"]
categories: ["tech", "writing"]
emptyArray: []
---
# Content`
          const result = yield* parseFrontmatter(content)

          expect(result.frontmatter).toEqual({
            tags: ['markdown', 'test', 'example'],
            categories: ['tech', 'writing'],
            emptyArray: [],
          })
        }),
      ))

    it('should handle empty values', () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const content = `---
title: ""
description: 
author: John Doe
---
# Content`
          const result = yield* parseFrontmatter(content)

          expect(result.frontmatter).toEqual({
            title: '',
            description: '',
            author: 'John Doe',
          })
        }),
      ))
  })
})
