import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
  HttpApiSwagger,
  HttpMiddleware,
  HttpServer,
  HttpServerResponse
} from "@effect/platform"
import { BunHttpServer } from "@effect/platform-bun"
import { Effect, Layer, Schema } from "effect"

const searchGroup = HttpApiGroup.make("Search").add(
  HttpApiEndpoint.get("simple")`/search/simple`.addSuccess(Schema.String)
)

const filenameParam = HttpApiSchema.param("filename", Schema.String)

const vaultFilesGroup = HttpApiGroup.make("Vault Files").add(
  HttpApiEndpoint.get("getFile")`/vault/${filenameParam}`.addSuccess(Schema.String)
)

const api = HttpApi.make("Obsidian API").add(searchGroup).add(vaultFilesGroup)

const searchGroupLive = HttpApiBuilder.group(api, "Search", (handlers) =>
  handlers.handle("simple", () => Effect.succeed("Hello World"))
)

const vaultFilesGroupLive = HttpApiBuilder.group(api, "Vault Files", (handlers) =>
  handlers.handle("getFile", ({ path: { filename } }) =>
    Effect.succeed(
      HttpServerResponse.text(
        `# Hello World\n\nThis is markdown content for file: ${filename}`,
        { contentType: "text/markdown" }
      )
    )
  )
)

const ObsidianApiLive = HttpApiBuilder.api(api).pipe(
  Layer.provide(searchGroupLive),
  Layer.provide(vaultFilesGroupLive)
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

const Server = BunHttpServer.layer({ port });

export const ApiServer = Layer.provide(HttpLive, Server);
