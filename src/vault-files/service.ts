import { HttpApiError } from "@effect/platform"
import { Context, Effect, Layer } from "effect"
import * as path from "node:path"
import { VaultConfig } from "../config/vault.js"

export class VaultFilesService extends Context.Tag("VaultFilesService")<
  VaultFilesService,
  {
    readonly getFile: (filename: string) => Effect.Effect<string, HttpApiError.BadRequest | HttpApiError.NotFound>
  }
>() {}

export const VaultFilesServiceLive = Layer.effect(
  VaultFilesService,
  Effect.gen(function*() {
    const config = yield* VaultConfig

    return {
      getFile: (filename: string) =>
        Effect.gen(function*() {
          // Validate filename
          if (!filename || filename.trim() === "") {
            return yield* Effect.fail(new HttpApiError.BadRequest())
          }

          // Ensure filename ends with .md
          const normalizedFilename = filename.endsWith(".md") ? filename : `${filename}.md`
          const filePath = path.join(config.vaultPath, normalizedFilename)

          const file = Bun.file(filePath)
          const exists = yield* Effect.promise(() => file.exists())

          if (!exists) {
            return yield* Effect.fail(new HttpApiError.NotFound())
          }

          const content = yield* Effect.promise(() => file.text())
          return content
        })
    }
  })
)
