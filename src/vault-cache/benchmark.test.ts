import { BunContext } from "@effect/platform-bun"
import { describe, expect, it } from "bun:test"
import { Effect, Layer } from "effect"
import { VaultCache, VaultCacheTest } from "./service.js"

// Create a large test dataset
const createLargeCache = (fileCount: number): Map<string, string> => {
  const cache = new Map<string, string>()
  for (let i = 0; i < fileCount; i++) {
    const content = `
# File ${i}

This is test file number ${i}.
It contains multiple lines of text.
Some lines contain the word "search".
Other lines contain different content.

## Section ${i}

Here's some more content with the search term.
The search functionality should find this line.
Another line with search term.

## Conclusion

File ${i} ends here.
    `.trim()
    cache.set(`file-${i}.md`, content)
  }
  return cache
}

describe("VaultCache Benchmark", () => {
  const testCache = createLargeCache(1000) // 1000 files
  const testLayer = Layer.mergeAll(
    VaultCacheTest(testCache),
    BunContext.layer
  )

  it("benchmarks sequential search", async () => {
    const startTime = performance.now()

    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const cache = yield* VaultCache
        return yield* cache.searchInFiles("search")
      }).pipe(Effect.provide(testLayer))
    )

    const endTime = performance.now()
    const duration = endTime - startTime

    console.log(`Sequential search: ${duration.toFixed(2)}ms for ${testCache.size} files`)
    console.log(`Found ${result.length} results`)

    expect(result.length).toBeGreaterThan(0)
  }, 30000) // 30 second timeout

  it("benchmarks concurrent search", async () => {
    const startTime = performance.now()

    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const cache = yield* VaultCache
        const allFiles = yield* cache.getAllFiles()

        // Concurrent search using Effect.forEach with concurrency
        const results = yield* Effect.forEach(
          Array.from(allFiles.entries()),
          ([filePath, content]) =>
            Effect.sync(() => {
              const lines = content.split("\n")
              const fileResults: Array<any> = []
              const lowerQuery = "search"

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i]
                const lowerLine = line.toLowerCase()

                if (lowerLine.includes(lowerQuery)) {
                  const matchIndex = lowerLine.indexOf(lowerQuery)
                  const start = Math.max(0, matchIndex - 100)
                  const end = Math.min(line.length, matchIndex + 6 + 100)
                  const context = line.slice(start, end)

                  fileResults.push({
                    filePath,
                    lineNumber: i + 1,
                    context
                  })
                }
              }

              return fileResults
            }),
          { concurrency: 10 } // Process 10 files concurrently
        )

        return results.flat()
      }).pipe(Effect.provide(testLayer))
    )

    const endTime = performance.now()
    const duration = endTime - startTime

    console.log(`Concurrent search: ${duration.toFixed(2)}ms for ${testCache.size} files`)
    console.log(`Found ${result.length} results`)

    expect(result.length).toBeGreaterThan(0)
  }, 30000) // 30 second timeout
})
