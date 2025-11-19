import { HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'
import { VaultMetrics } from './domain.js'

export const SearchResult = Schema.Struct({
  filePath: Schema.String,
  lineNumber: Schema.Number,
  context: Schema.String,
})

export const SearchResults = Schema.Array(SearchResult)

export type SearchResult = Schema.Schema.Type<typeof SearchResult>
export type SearchResults = Schema.Schema.Type<typeof SearchResults>

const filenameParam = HttpApiSchema.param('filename', Schema.String)
const queryParam = HttpApiSchema.param('query', Schema.String)

export const PaginatedFilesResponse = Schema.Struct({
  files: Schema.Array(Schema.String),
  total: Schema.Number,
  offset: Schema.Number,
  limit: Schema.Number,
})

export type PaginatedFilesResponse = Schema.Schema.Type<typeof PaginatedFilesResponse>

export const vaultGroup = HttpApiGroup.make('Vault')
  .add(
    HttpApiEndpoint.get('getFile')`/vault-files/${filenameParam}`
      .addSuccess(
        Schema.String.pipe(
          HttpApiSchema.withEncoding({
            kind: 'Text',
            contentType: 'text/markdown',
          }),
        ),
      )
      .addError(HttpApiError.NotFound)
      .addError(HttpApiError.BadRequest),
  )
  .add(
    HttpApiEndpoint.get('listFiles', '/vault/files')
      .setUrlParams(
        Schema.Struct({
          limit: Schema.NumberFromString.pipe(
            Schema.int(),
            Schema.positive(),
            Schema.optionalWith({ default: () => 50 }),
          ),
          offset: Schema.NumberFromString.pipe(
            Schema.int(),
            Schema.nonNegative(),
            Schema.optionalWith({ default: () => 0 }),
          ),
        }),
      )
      .addSuccess(PaginatedFilesResponse),
  )
  .add(
    HttpApiEndpoint.post('reload', '/vault/reload').addSuccess(
      Schema.Struct({
        message: Schema.String,
        filesLoaded: Schema.Number,
      }),
    ),
  )
  .add(HttpApiEndpoint.get('metrics', '/vault/metrics').addSuccess(VaultMetrics))
  .add(HttpApiEndpoint.get('search')`/vault/search/simple/${queryParam}`.addSuccess(SearchResults))
