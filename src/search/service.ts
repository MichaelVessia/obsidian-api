import { Context, Effect, Layer } from "effect"
import * as fs from "node:fs"
import * as path from "node:path"
import { VaultConfig } from "../config/vault.js"
import type { SearchResult, SearchResults } from "./schema.js"

export class SearchService extends Context.Tag("SearchService")<
  SearchService,
  {
    readonly simpleSearch: (query: string) => Effect.Effect<SearchResults>
  }
>() {}

export const SearchServiceLive = Layer.effect(
  SearchService,
  Effect.gen(function*() {
    const config = yield* VaultConfig

    const searchInFile = (filePath: string, query: string, relativePath: string): Effect.Effect<Array<SearchResult>> =>
      Effect.gen(function*() {
        const file = Bun.file(filePath)
        const content = yield* Effect.promise(() => file.text())
        const lines = content.split("\n")
        const results: Array<SearchResult> = []

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          const lowerLine = line.toLowerCase()
          const lowerQuery = query.toLowerCase()

          if (lowerLine.includes(lowerQuery)) {
            const matchIndex = lowerLine.indexOf(lowerQuery)
            const start = Math.max(0, matchIndex - 100)
            const end = Math.min(line.length, matchIndex + query.length + 100)
            const context = line.slice(start, end)

            results.push({
              filePath: relativePath,
              lineNumber: i + 1,
              context
            })
          }
        }

        return results
      })

    const walkDirectory = (dirPath: string): Effect.Effect<Array<string>> =>
      Effect.gen(function*() {
        const entries = yield* Effect.promise(() => fs.promises.readdir(dirPath, { withFileTypes: true }))
        const files: Array<string> = []

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name)

          if (entry.isDirectory()) {
            const subFiles = yield* walkDirectory(fullPath)
            for (const subFile of subFiles) {
              files.push(subFile)
            }
          } else if (entry.isFile() && entry.name.endsWith(".md")) {
            files.push(fullPath)
          }
        }

        return files
      })

    return {
      simpleSearch: (query: string) =>
        Effect.gen(function*() {
          if (!query || query.trim() === "") {
            return []
          }

          const files = yield* walkDirectory(config.vaultPath)
          const allResults: Array<SearchResult> = []

          for (const filePath of files) {
            const relativePath = path.relative(config.vaultPath, filePath)
            const fileResults = yield* searchInFile(filePath, query, relativePath)
            for (const result of fileResults) {
              allResults.push(result)
            }
          }

          return allResults
        })
    }
  })
)
