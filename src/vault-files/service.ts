import { HttpServerResponse } from "@effect/platform"
import { Effect, Context, Layer } from "effect"

export class VaultService extends Context.Tag("VaultService")<
  VaultService,
  {
    readonly getFile: (filename: string) => Effect.Effect<HttpServerResponse.HttpServerResponse>
  }
>() {}

export const VaultServiceLive = Layer.succeed(VaultService, {
  getFile: (filename: string) =>
    Effect.succeed(
      HttpServerResponse.text(
        `# Hello World\n\nThis is markdown content for file: ${filename}`,
        { contentType: "text/markdown" }
      )
    )
})