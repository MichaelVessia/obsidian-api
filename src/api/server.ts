import { HttpApi, HttpApiBuilder, HttpApiError, HttpApiSwagger, HttpMiddleware, HttpServer } from '@effect/platform'
import { BunHttpServer } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { VaultConfigLive } from '../config/vault.js'
import { vaultGroup } from '../vault/api.js'
import { CacheManager } from '../vault/cache-manager.js'
import { FileLoader } from '../vault/file-loader.js'
import { VaultService } from '../vault/service.js'
import { TracerLayer } from '../tracing/index.js'

export const api = HttpApi.make('Obsidian API').add(vaultGroup)

const getFileHandler = Effect.fn('vault.getFile')(function* (filename: string) {
  yield* Effect.annotateCurrentSpan('filename', filename)

  const service = yield* VaultService
  return yield* service.getFileContent(filename)
})

const listFilesHandler = Effect.fn('vault.listFiles')(function* (limit: number, offset: number) {
  yield* Effect.annotateCurrentSpan('limit', limit)
  yield* Effect.annotateCurrentSpan('offset', offset)

  const vault = yield* VaultService
  const result = yield* vault.getFilePaths(limit, offset)

  yield* Effect.annotateCurrentSpan('returned', result.files.length)
  yield* Effect.annotateCurrentSpan('total', result.total)

  return {
    files: result.files,
    total: result.total,
    offset,
    limit,
  }
})

const reloadHandler = Effect.fn('vault.reload')(function* () {
  const vault = yield* VaultService
  yield* vault.reload()
  const files = yield* vault.getAllFiles()

  yield* Effect.annotateCurrentSpan('filesLoaded', files.size)

  return {
    message: 'Vault reloaded successfully',
    filesLoaded: files.size,
  }
})

const metricsHandler = Effect.fn('vault.metrics')(function* () {
  const service = yield* VaultService
  const metrics = yield* service.getMetrics()

  yield* Effect.annotateCurrentSpan('totalFiles', metrics.totalFiles)
  yield* Effect.annotateCurrentSpan('totalBytes', metrics.totalBytes)
  yield* Effect.annotateCurrentSpan('totalLines', metrics.totalLines)
  yield* Effect.annotateCurrentSpan('averageFileSize', metrics.averageFileSize)

  return metrics
})

const searchHandler = Effect.fn('vault.search')(function* (query: string) {
  if (!query || query.trim() === '') {
    return yield* Effect.fail(new HttpApiError.BadRequest())
  }

  yield* Effect.annotateCurrentSpan('query', query)

  const service = yield* VaultService
  const results = yield* service.searchInFiles(query)

  yield* Effect.annotateCurrentSpan('resultCount', results.length)
  return results
})

const searchByFolderHandler = Effect.fn('vault.searchByFolder')(function* (folderPath: string) {
  if (!folderPath || folderPath.trim() === '') {
    return yield* Effect.fail(new HttpApiError.BadRequest())
  }

  yield* Effect.annotateCurrentSpan('folderPath', folderPath)

  const service = yield* VaultService
  const results = yield* service.searchByFolder(folderPath)

  yield* Effect.annotateCurrentSpan('matchCount', results.length)
  return results
})

const vaultHandlers = HttpApiBuilder.group(api, 'Vault', (handlers) =>
  handlers
    .handle('getFile', ({ path: { filename } }) => getFileHandler(filename))
    .handle('listFiles', ({ urlParams: { limit, offset } }) => listFilesHandler(limit, offset))
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
