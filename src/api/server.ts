import { HttpApi, HttpApiBuilder, HttpApiSwagger, HttpMiddleware, HttpServer } from "@effect/platform"
import { BunHttpServer } from "@effect/platform-bun"
import { Layer } from "effect"
import { VaultConfigLive } from "../config/vault.js"
import { searchGroup, SearchLive } from "../search/api.js"
import { vaultFilesGroup, VaultFilesLive } from "../vault-files/api.js"

export const api = HttpApi.make("Obsidian API")
  .add(searchGroup)
  .add(vaultFilesGroup)

export const ObsidianApiLive = HttpApiBuilder.api(api).pipe(
  Layer.provide(SearchLive),
  Layer.provide(VaultFilesLive),
  Layer.provide(VaultConfigLive)
)

const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(
    HttpApiSwagger.layer({
      path: "/docs"
    })
  ),
  Layer.provide(HttpApiBuilder.middlewareCors()),
  Layer.provide(ObsidianApiLive),
  HttpServer.withLogAddress
)

const port = 3000

const Server = BunHttpServer.layer({ port })

export const ApiServer = Layer.provide(HttpLive, Server)
