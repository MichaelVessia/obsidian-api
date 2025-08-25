import { HttpApi, HttpApiBuilder, HttpApiSwagger, HttpMiddleware, HttpServer } from "@effect/platform"
import { BunHttpServer } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { VaultConfigLive } from "../config/vault.js"
import { searchGroup } from "../search/api.js"
import { SearchService } from "../search/service.js"
import { vaultFilesGroup } from "../vault-files/api.js" 
import { VaultFilesService } from "../vault-files/service.js"

export const api = HttpApi.make("Obsidian API")
  .add(searchGroup)
  .add(vaultFilesGroup)

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

export const ObsidianApiLive = HttpApiBuilder.api(api).pipe(
  Layer.provide(searchHandlers),
  Layer.provide(vaultFilesHandlers),
  Layer.provide(SearchService.Live),
  Layer.provide(VaultFilesService.Live),
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
