import { HttpApi, HttpApiBuilder, HttpApiSwagger, HttpMiddleware, HttpServer } from "@effect/platform"
import { BunHttpServer } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { cacheGroup } from "../cache/api.js"
import { VaultConfigLive } from "../config/vault.js"
import { searchGroup } from "../search/api.js"
import { SearchService } from "../search/service.js"
import { VaultCache } from "../vault-cache/service.js"
import { vaultFilesGroup } from "../vault-files/api.js"
import { VaultFilesService } from "../vault-files/service.js"
import { VaultStatsService } from "../vault-stats/service.js"

export const api = HttpApi.make("Obsidian API")
  .add(searchGroup)
  .add(vaultFilesGroup)
  .add(cacheGroup)

const searchHandlers = HttpApiBuilder.group(
  api,
  "Search",
  (handlers) =>
    handlers.handle(
      "simple",
      ({ path: { query } }) => Effect.flatMap(SearchService, (service) => service.simpleSearch(query))
    )
)

const vaultFilesHandlers = HttpApiBuilder.group(
  api,
  "Vault Files",
  (handlers) =>
    handlers.handle(
      "getFile",
      ({ path: { filename } }) => Effect.flatMap(VaultFilesService, (service) => service.getFile(filename))
    )
)

const cacheHandlers = HttpApiBuilder.group(api, "Cache", (handlers) =>
  handlers
    .handle("listFiles", () =>
      Effect.gen(function*() {
        const cache = yield* VaultCache
        const files = yield* cache.getAllFiles()
        return Object.fromEntries(files)
      }))
    .handle("reload", () =>
      Effect.gen(function*() {
        const cache = yield* VaultCache
        yield* cache.reload()
        const files = yield* cache.getAllFiles()
        return {
          message: "Cache reloaded successfully",
          filesLoaded: files.size
        }
      }))
    .handle("metrics", () => Effect.flatMap(VaultStatsService, (service) => service.getMetrics())))

export const ObsidianApiLive = HttpApiBuilder.api(api).pipe(
  Layer.provide(searchHandlers),
  Layer.provide(vaultFilesHandlers),
  Layer.provide(cacheHandlers),
  Layer.provide(SearchService.Default),
  Layer.provide(VaultFilesService.Default),
  Layer.provide(VaultStatsService.Default),
  Layer.provide(VaultCache.Default),
  Layer.provide(VaultConfigLive)
)

const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(HttpApiBuilder.middlewareCors()),
  Layer.provide(
    HttpApiSwagger.layer({
      path: "/docs"
    })
  ),
  Layer.provide(ObsidianApiLive),
  HttpServer.withLogAddress
)

const port = 3000

const Server = BunHttpServer.layer({ port })

export const ApiServer = Layer.provide(HttpLive, Server)
