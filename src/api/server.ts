import { HttpApi, HttpApiBuilder, HttpApiSwagger, HttpMiddleware, HttpServer } from '@effect/platform'
import { BunHttpServer } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { VaultConfigLive } from '../config/vault.js'
import { vaultGroup } from '../vault/api.js'
import { CacheManager } from '../vault/cache-manager.js'
import { FileLoader } from '../vault/file-loader.js'
import { VaultService } from '../vault/service.js'
import { TracerLayer } from '../tracing/index.js'

export const api = HttpApi.make('Obsidian API').add(vaultGroup)

const getFileHandler = Effect.fn('vault.getFile', { attributes: { filename: (filename: string) => filename } })(
  function* (filename: string) {
    const service = yield* VaultService
    return yield* service.getFileContent(filename)
  },
)

const listFilesHandler = Effect.fn('vault.listFiles', {
  attributes: {
    limit: (args: [number, number]) => args[0],
    offset: (args: [number, number]) => args[1],
    returned: (_: [number, number], result: { files: string[]; total: number; offset: number; limit: number }) =>
      result.files.length,
    total: (_: [number, number], result: { files: string[]; total: number; offset: number; limit: number }) =>
      result.total,
  },
})(function* (limit: number, offset: number) {
  const vault = yield* VaultService
  const result = yield* vault.getFilePaths(limit, offset)
  return {
    files: result.files,
    total: result.total,
    offset,
    limit,
  }
})

const reloadHandler = Effect.fn('vault.reload', {
  attributes: {
    filesLoaded: (_: undefined, result: { message: string; filesLoaded: number }) => result.filesLoaded,
  },
})(function* () {
  const vault = yield* VaultService
  yield* vault.reload()
  const files = yield* vault.getAllFiles()
  return {
    message: 'Vault reloaded successfully',
    filesLoaded: files.size,
  }
})

const metricsHandler = Effect.fn('vault.metrics')(function* () {
  const service = yield* VaultService
  return yield* service.getMetrics()
})

const searchHandler = Effect.fn('vault.search', {
  attributes: {
    query: (query: string) => query,
    resultCount: (_query: string, results: unknown[]) => results.length,
  },
})(function* (query: string) {
  const service = yield* VaultService
  return yield* service.searchInFiles(query)
})

const searchByFolderHandler = Effect.fn('vault.searchByFolder', {
  attributes: { folderPath: (folderPath: string) => folderPath },
})(function* (folderPath: string) {
  const service = yield* VaultService
  return yield* service.searchByFolder(folderPath)
})

const vaultHandlers = HttpApiBuilder.group(api, 'Vault', (handlers) =>
  handlers
    .handle('getFile', ({ path: { filename } }) => getFileHandler(filename))
    .handle('listFiles', () => listFilesHandler(50, 0))
    .handle('reload', () => reloadHandler())
    .handle('metrics', () => metricsHandler())
    .handle('search', ({ path: { query } }) => searchHandler(query))
    .handle('searchByFolder', ({ path: { folderPath } }) => searchByFolderHandler(folderPath)),
)

export const ObsidianApiLive = HttpApiBuilder.api(api).pipe(
  Layer.provide(vaultHandlers),
  Layer.provide(VaultService.Default),
  Layer.provide(CacheManager.Default),
  Layer.provide(FileLoader.Default),
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

export const ApiServer = Layer.provide(HttpLive, Server).pipe(Layer.provide(TracerLayer))
