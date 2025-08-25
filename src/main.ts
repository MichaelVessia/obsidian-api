import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
  HttpApiSwagger,
  HttpMiddleware,
  HttpServer
} from "@effect/platform"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { Effect, Layer, Schema } from "effect"

const searchGroup = HttpApiGroup.make("search").add(
  HttpApiEndpoint.get("simple")`/search/simple`.addSuccess(Schema.String)
)

const filenameParam = HttpApiSchema.param("filename", Schema.String)

const vaultFilesGroup = HttpApiGroup.make("vaultFiles").add(
  HttpApiEndpoint.get("getFile")`/vault/${filenameParam}`.addSuccess(Schema.String)
)

const api = HttpApi.make("myApi").add(searchGroup).add(vaultFilesGroup)

const searchGroupLive = HttpApiBuilder.group(api, "search", (handlers) =>
  handlers.handle("simple", () => Effect.succeed("Hello World"))
)

const vaultFilesGroupLive = HttpApiBuilder.group(api, "vaultFiles", (handlers) =>
  handlers.handle("getFile", ({ params }) => Effect.succeed(`File content for: ${params.filename}`))
)

const MyApiLive = HttpApiBuilder.api(api).pipe(
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
  Layer.provide(MyApiLive),
  HttpServer.withLogAddress
)

const port = 3000

BunRuntime.runMain(
  HttpLive.pipe(Layer.provide(BunHttpServer.layer({ port })), Layer.launch)
)
