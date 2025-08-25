import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, HttpApi, HttpApiBuilder } from "@effect/platform"
import { Schema, Effect, Layer } from "effect"
import { VaultService, VaultServiceLive } from "./service.js"

const filenameParam = HttpApiSchema.param("filename", Schema.String)

export const vaultFilesGroup = HttpApiGroup.make("Vault Files").add(
  HttpApiEndpoint.get("getFile")`/vault-files/${filenameParam}`.addSuccess(Schema.String)
)

const api = HttpApi.make("Vault").add(vaultFilesGroup)

export const vaultHandlers = HttpApiBuilder.group(api, "Vault Files", (handlers) =>
  handlers.handle("getFile", ({ path: { filename } }) =>
    Effect.flatMap(VaultService, (service) => service.getFile(filename))
  )
)

export const VaultFilesLive = Layer.provide(vaultHandlers, VaultServiceLive)
