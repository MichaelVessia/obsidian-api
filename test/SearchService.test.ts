import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { VaultConfig } from "../src/config/vault.js"
import { SearchService, SearchServiceLive } from "../src/search/service.js"

describe("SearchService", () => {
  const createTestVault = Effect.gen(function*() {
    const tempDir = yield* Effect.promise(() => fs.promises.mkdtemp(path.join(os.tmpdir(), "vault-test-")))

    yield* Effect.promise(() =>
      fs.promises.writeFile(
        path.join(tempDir, "test1.md"),
        "This is a test file with some content.\nIt contains multiple lines.\nAnother line with test keyword."
      )
    )

    yield* Effect.promise(() =>
      fs.promises.writeFile(
        path.join(tempDir, "test2.md"),
        "Different content here.\nNo matching words in this file."
      )
    )

    const subDir = path.join(tempDir, "subfolder")
    yield* Effect.promise(() => fs.promises.mkdir(subDir))
    yield* Effect.promise(() =>
      fs.promises.writeFile(
        path.join(subDir, "nested.md"),
        "Nested file with test content and some longer text to check context extraction works properly."
      )
    )

    return tempDir
  })

  const cleanupTestVault = (vaultPath: string) =>
    Effect.promise(() => fs.promises.rm(vaultPath, { recursive: true, force: true }))

  it("should return empty array for empty query", () =>
    Effect.gen(function*() {
      const vaultPath = yield* createTestVault

      try {
        const service = yield* SearchService
        const result = yield* service.simpleSearch("")
        expect(result).toEqual([])
      } finally {
        yield* cleanupTestVault(vaultPath)
      }
    }).pipe(
      Effect.provide(SearchServiceLive),
      Effect.provide(Layer.succeed(VaultConfig, { vaultPath: "/tmp/empty-vault" }))
    ))

  it("should find matches and return results with context", () =>
    Effect.gen(function*() {
      const vaultPath = yield* createTestVault

      const testEffect = Effect.gen(function*() {
        const service = yield* SearchService
        const result = yield* service.simpleSearch("test")

        expect(result.length).toBeGreaterThan(0)
        expect(result[0]).toHaveProperty("filePath")
        expect(result[0]).toHaveProperty("lineNumber")
        expect(result[0]).toHaveProperty("context")
        expect(result[0].context.toLowerCase()).toContain("test")
      }).pipe(
        Effect.provide(SearchServiceLive),
        Effect.provide(Layer.succeed(VaultConfig, { vaultPath }))
      )

      try {
        yield* testEffect
      } finally {
        yield* cleanupTestVault(vaultPath)
      }
    }))

  it("should return no results for non-existent query", () =>
    Effect.gen(function*() {
      const vaultPath = yield* createTestVault

      const testEffect = Effect.gen(function*() {
        const service = yield* SearchService
        const result = yield* service.simpleSearch("nonexistentquery")
        expect(result).toEqual([])
      }).pipe(
        Effect.provide(SearchServiceLive),
        Effect.provide(Layer.succeed(VaultConfig, { vaultPath }))
      )

      try {
        yield* testEffect
      } finally {
        yield* cleanupTestVault(vaultPath)
      }
    }))

  it("should search recursively in subdirectories", () =>
    Effect.gen(function*() {
      const vaultPath = yield* createTestVault

      const testEffect = Effect.gen(function*() {
        const service = yield* SearchService
        const result = yield* service.simpleSearch("nested")

        expect(result.length).toBeGreaterThan(0)
        expect(result[0].filePath).toContain("subfolder")
        expect(result[0].context.toLowerCase()).toContain("nested")
      }).pipe(
        Effect.provide(SearchServiceLive),
        Effect.provide(Layer.succeed(VaultConfig, { vaultPath }))
      )

      try {
        yield* testEffect
      } finally {
        yield* cleanupTestVault(vaultPath)
      }
    }))
})
