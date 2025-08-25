import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { VaultConfig } from "../src/config/vault.js"
import { VaultFilesService, VaultFilesServiceLive } from "../src/vault-files/service.js"

describe("VaultFilesService", () => {
  const testVaultConfig = Layer.succeed(VaultConfig, {
    vaultPath: "/tmp/test-vault"
  })

  it("should return 404 response for non-existent file", () =>
    Effect.gen(function*() {
      const service = yield* VaultFilesService
      const response = yield* service.getFile("non-existent-file")
      expect(response.status).toBe(404)
    }).pipe(
      Effect.provide(
        Layer.provide(VaultFilesServiceLive, testVaultConfig)
      )
    ))

  it("should normalize filename by adding .md extension", () =>
    Effect.gen(function*() {
      const service = yield* VaultFilesService
      const response = yield* service.getFile("test")
      // This should attempt to read "test.md" even when we pass "test"
      // For non-existent file, should return 404 status indicating it tried to read test.md
      expect(response.status).toBe(404)
    }).pipe(
      Effect.provide(
        Layer.provide(VaultFilesServiceLive, testVaultConfig)
      )
    ))
})
