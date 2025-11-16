import { HttpApi, HttpApiBuilder, HttpApiSwagger, HttpMiddleware, HttpServer } from '@effect/platform'
import { BunHttpServer } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { VaultConfigLive } from '../config/vault.js'
import { vaultGroup } from '../vault/api.js'
import { VaultService } from '../vault/service.js'
import { TracerLayer } from '../tracing/index.js'

export const api = HttpApi.make('Obsidian API').add(vaultGroup)

const vaultHandlers = HttpApiBuilder.group(api, 'Vault', (handlers) =>
  handlers
    .handle('getFile', ({ path: { filename } }) =>
      Effect.flatMap(VaultService, (service) => service.getFileContent(filename)).pipe(
        Effect.withSpan('vault.getFile', { attributes: { filename } }),
      ),
    )
    .handle('listFiles', () =>
      Effect.gen(function* () {
        const vault = yield* VaultService
        const files = yield* vault.getAllFiles()
        return Object.fromEntries(files)
      }).pipe(Effect.withSpan('vault.listFiles')),
    )
    .handle('reload', () =>
      Effect.gen(function* () {
        const vault = yield* VaultService
        yield* vault.reload()
        const files = yield* vault.getAllFiles()
        return {
          message: 'Vault reloaded successfully',
          filesLoaded: files.size,
        }
      }).pipe(Effect.withSpan('vault.reload')),
    )
    .handle('metrics', () =>
      Effect.flatMap(VaultService, (service) => service.getMetrics()).pipe(Effect.withSpan('vault.metrics')),
    )
    .handle('search', ({ path: { query } }) =>
      Effect.flatMap(VaultService, (service) => service.searchInFiles(query)).pipe(
        Effect.withSpan('vault.search', { attributes: { query } }),
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

const port = 3001

const Server = BunHttpServer.layer({ port })

export const ApiServer = Layer.provide(HttpLive, Server).pipe(Layer.provide(TracerLayer))
