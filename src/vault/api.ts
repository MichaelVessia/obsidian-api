import { HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

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
    HttpApiEndpoint.get('listFiles', '/vault/files').addSuccess(
      Schema.Record({ key: Schema.String, value: Schema.String }),
    ),
  )
  .add(
    HttpApiEndpoint.post('reload', '/vault/reload').addSuccess(
      Schema.Struct({
        message: Schema.String,
        filesLoaded: Schema.Number,
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get('metrics', '/vault/metrics').addSuccess(
      Schema.String.pipe(
        HttpApiSchema.withEncoding({
          kind: 'Text',
          contentType: 'text/plain; version=0.0.4; charset=utf-8',
        }),
      ),
    ),
  )
  .add(HttpApiEndpoint.get('search')`/vault/search/simple/${queryParam}`.addSuccess(SearchResults))
