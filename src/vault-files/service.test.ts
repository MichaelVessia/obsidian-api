import { HttpApiError } from "@effect/platform"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { VaultConfig } from "../config/vault.js"
import { withTestVault } from "../test-helpers.js"
import { VaultCache } from "../vault-cache/service.js"
import { VaultFilesService } from "./service.js"

describe("VaultFilesService", () => {
  it("should read file content successfully", () =>
    withTestVault((vaultPath) =>
      Effect.gen(function*() {
        const service = yield* VaultFilesService
        const content = yield* service.getFile("test-note")
        expect(content).toContain("# Test Note")
        expect(content).toContain("This is a test note with some content.")
      }).pipe(
        Effect.provide(VaultFilesService.Default),
        Effect.provide(VaultCache.Default),
        Effect.provide(Layer.succeed(VaultConfig, { vaultPath }))
      )
    ))

  it("should read file with .md extension already included", () =>
    withTestVault((vaultPath) =>
      Effect.gen(function*() {
        const service = yield* VaultFilesService
        const content = yield* service.getFile("another.md")
        expect(content).toContain("# Another Note")
      }).pipe(
        Effect.provide(VaultFilesService.Default),
        Effect.provide(VaultCache.Default),
        Effect.provide(Layer.succeed(VaultConfig, { vaultPath }))
      )
    ))

  it("should read file from subdirectory", () =>
    withTestVault((vaultPath) =>
      Effect.gen(function*() {
        const service = yield* VaultFilesService
        const content = yield* service.getFile("subfolder/nested-note")
        expect(content).toContain("# Nested Note")
        expect(content).toContain("nested in a subfolder")
      }).pipe(
        Effect.provide(VaultFilesService.Default),
        Effect.provide(VaultCache.Default),
        Effect.provide(Layer.succeed(VaultConfig, { vaultPath }))
      )
    ))

  it("should return NotFound error for non-existent file", () =>
    withTestVault((vaultPath) =>
      Effect.gen(function*() {
        const service = yield* VaultFilesService
        const result = yield* Effect.flip(service.getFile("non-existent-file"))
        expect(result).toBeInstanceOf(HttpApiError.NotFound)
      }).pipe(
        Effect.provide(VaultFilesService.Default),
        Effect.provide(VaultCache.Default),
        Effect.provide(Layer.succeed(VaultConfig, { vaultPath }))
      )
    ))

  it("should return BadRequest error for empty filename", () =>
    withTestVault((vaultPath) =>
      Effect.gen(function*() {
        const service = yield* VaultFilesService
        const result = yield* Effect.flip(service.getFile(""))
        expect(result).toBeInstanceOf(HttpApiError.BadRequest)
      }).pipe(
        Effect.provide(VaultFilesService.Default),
        Effect.provide(VaultCache.Default),
        Effect.provide(Layer.succeed(VaultConfig, { vaultPath }))
      )
    ))
})
