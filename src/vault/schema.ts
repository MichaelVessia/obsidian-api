import { Schema } from "effect"

export const SearchResult = Schema.Struct({
	filePath: Schema.String,
	lineNumber: Schema.Number,
	context: Schema.String
})

export const SearchResults = Schema.Array(SearchResult)

export type SearchResult = Schema.Schema.Type<typeof SearchResult>
export type SearchResults = Schema.Schema.Type<typeof SearchResults>
