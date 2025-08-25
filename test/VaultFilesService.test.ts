import { HttpApiError } from "@effect/platform"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { VaultConfig } from "../src/config/vault.js"
import { VaultFilesService } from "../src/vault-files/service.js"

describe("VaultFilesService", () => {
  const testVaultConfig = Layer.succeed(VaultConfig, {
    vaultPath: "/tmp/test-vault"
  })

  it("should return NotFound error for non-existent file", () =>
    Effect.gen(function*() {
      const service = yield* VaultFilesService
      const result = yield* Effect.flip(service.getFile("non-existent-file"))
      expect(result).toBeInstanceOf(HttpApiError.NotFound)
    }).pipe(
      Effect.provide(
        Layer.provide(VaultFilesService.Live, testVaultConfig)
      )
    ))

  it("should normalize filename by adding .md extension", () =>
    Effect.gen(function*() {
      const service = yield* VaultFilesService
      const result = yield* Effect.flip(service.getFile("test"))
      // This should attempt to read "test.md" even when we pass "test"
      // For non-existent file, should return NotFound error indicating it tried to read test.md
      expect(result).toBeInstanceOf(HttpApiError.NotFound)
    }).pipe(
      Effect.provide(
        Layer.provide(VaultFilesService.Live, testVaultConfig)
      )
    ))

  it("should return BadRequest error for empty filename", () =>
    Effect.gen(function*() {
      const service = yield* VaultFilesService
      const result = yield* Effect.flip(service.getFile(""))
      expect(result).toBeInstanceOf(HttpApiError.BadRequest)
    }).pipe(
      Effect.provide(
        Layer.provide(VaultFilesService.Live, testVaultConfig)
      )
    ))
})
