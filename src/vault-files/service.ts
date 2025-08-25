import { HttpServerResponse } from "@effect/platform"
import { Effect, Context, Layer } from "effect"

export class VaultFilesService extends Context.Tag("VaultFilesService")<
  VaultFilesService,
  {
    readonly getFile: (filename: string) => Effect.Effect<HttpServerResponse.HttpServerResponse>
  }
>() { }

export const VaultFilesServiceLive = Layer.succeed(VaultFilesService, {
  getFile: (filename: string) =>
    Effect.succeed(
      HttpServerResponse.text(
        `# Hello World\n\nThis is markdown content for file: ${filename}`,
        { contentType: "text/markdown" }
      )
    )
})
