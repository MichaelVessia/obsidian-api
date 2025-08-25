import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { VaultConfig } from "../src/config/vault.js"
import { SearchService, SearchServiceLive } from "../src/search/service.js"

describe("SearchService", () => {
  const testVaultConfig = Layer.succeed(VaultConfig, {
    vaultPath: "/test-vault-path"
  })

  it("should return configured vault path in simple search", () =>
    Effect.gen(function*() {
      const service = yield* SearchService
      const result = yield* service.simpleSearch()
      expect(result).toBe("Vault path configured: /test-vault-path")
    }).pipe(
      Effect.provide(
        Layer.provide(SearchServiceLive, testVaultConfig)
      )
    ))
})
