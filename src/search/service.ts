import { Effect, Layer } from "effect"
import { VaultCache } from "../vault-cache/service.js"
import type { SearchResult } from "./schema.js"

export class SearchService extends Effect.Service<SearchService>()(
  "SearchService",
  {
    effect: Effect.gen(function*() {
      const cache = yield* VaultCache

      return {
        simpleSearch: (query: string) => cache.searchInFiles(query)
      }
    })
  }
) {}

export const SearchServiceTest = (
  simpleSearch: (query: string) => Effect.Effect<Array<SearchResult>>
) => Layer.succeed(SearchService, SearchService.make({ simpleSearch }))
