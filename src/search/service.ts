import { Effect, Layer } from "effect"
import { VaultService } from "../vault/service.js"
import type { SearchResult } from "./schema.js"

export class SearchService extends Effect.Service<SearchService>()("SearchService", {
	effect: Effect.gen(function* () {
		const vault = yield* VaultService

		return {
			simpleSearch: (query: string) => vault.searchInFiles(query)
		}
	})
}) {}

export const SearchServiceTest = (simpleSearch: (query: string) => Effect.Effect<Array<SearchResult>>) =>
	Layer.succeed(SearchService, SearchService.make({ simpleSearch }))
