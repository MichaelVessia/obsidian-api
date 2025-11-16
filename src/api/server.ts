import { HttpApi, HttpApiBuilder, HttpApiSwagger, HttpMiddleware, HttpServer } from '@effect/platform'
import { BunHttpServer } from '@effect/platform-bun'
import { Effect, Layer, Metric } from 'effect'
import { VaultConfigLive } from '../config/vault.js'
import { vaultGroup } from '../vault/api.js'
import { VaultService } from '../vault/service.js'
import { withOtelSpan } from '../config/tracing.js'

const _httpRequestDuration = Metric.timer('http_request_duration_seconds')
const _httpRequestTotal = Metric.counter('http_requests_total')

export const api = HttpApi.make('Obsidian API').add(vaultGroup)

const vaultHandlers = HttpApiBuilder.group(api, 'Vault', (handlers) =>
  handlers
    .handle('getFile', ({ path: { filename } }) =>
      withOtelSpan(
        'vault.getFile',
        Effect.flatMap(VaultService, (service) => service.getFileContent(filename)),
      ),
    )
    .handle('listFiles', () =>
      withOtelSpan(
        'vault.listFiles',
        Effect.gen(function* () {
          const vault = yield* VaultService
          const files = yield* vault.getAllFiles()
          return Object.fromEntries(files)
        }),
      ),
    )
    .handle('reload', () =>
      withOtelSpan(
        'vault.reload',
        Effect.gen(function* () {
          const vault = yield* VaultService
          yield* vault.reload()
          const files = yield* vault.getAllFiles()
          return {
            message: 'Vault reloaded successfully',
            filesLoaded: files.size,
          }
        }),
      ),
    )
    .handle('metrics', () =>
      withOtelSpan(
        'vault.metrics',
        Effect.flatMap(VaultService, (service) => service.getMetrics()),
      ),
    )
    .handle('search', ({ path: { query } }) =>
      withOtelSpan(
        'vault.search',
        Effect.flatMap(VaultService, (service) => service.searchInFiles(query)),
      ),
    ),
)

export const ObsidianApiLive = HttpApiBuilder.api(api).pipe(
  Layer.provide(vaultHandlers),
  Layer.provide(VaultService.Default),
  Layer.provide(VaultConfigLive),
)

const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(HttpApiBuilder.middlewareCors()),
  Layer.provide(
    HttpApiSwagger.layer({
      path: '/docs',
    }),
  ),
  Layer.provide(ObsidianApiLive),
  HttpServer.withLogAddress,
)

const port = 3000

const Server = BunHttpServer.layer({ port })

export const ApiServer = Layer.provide(HttpLive, Server)
