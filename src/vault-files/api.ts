import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Effect, Layer, Schema } from "effect"
import { VaultFilesService } from "./service.js"

const filenameParam = HttpApiSchema.param("filename", Schema.String)

export const vaultFilesGroup = HttpApiGroup.make("Vault Files").add(
  HttpApiEndpoint.get("getFile")`/vault-files/${filenameParam}`
    .addSuccess(
      Schema.String.pipe(
        HttpApiSchema.withEncoding({
          kind: "Text",
          contentType: "text/markdown"
        })
      )
    )
    .addError(HttpApiError.NotFound)
    .addError(HttpApiError.BadRequest)
)

const api = HttpApi.make("Vault").add(vaultFilesGroup)

export const vaultFilesHandlers = HttpApiBuilder.group(
  api,
  "Vault Files",
  (handlers) =>
    handlers.handle(
      "getFile",
      ({ path: { filename } }) => Effect.flatMap(VaultFilesService, (service) => service.getFile(filename))
    )
)

export const VaultFilesLive = Layer.provide(vaultFilesHandlers, VaultFilesService.Live)
