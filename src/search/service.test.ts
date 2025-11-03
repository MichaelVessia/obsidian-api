import { describe, expect, it } from "bun:test"
import { Effect, Layer } from "effect"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { VaultConfig } from "../config/vault.js"
import { VaultCache } from "../vault-cache/service.js"
import { SearchService } from "./service.js"

describe("SearchService", () => {
  const createSearchTestVault = Effect.gen(function*() {
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

  const cleanupSearchTestVault = (vaultPath: string) =>
    Effect.promise(() => fs.promises.rm(vaultPath, { recursive: true, force: true }))

  const withSearchTestVault = <A, E, R>(
    use: (vaultPath: string) => Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R> =>
    Effect.acquireUseRelease(
      createSearchTestVault,
      use,
      cleanupSearchTestVault
    )

  it("should return empty array for empty query", () =>
    withSearchTestVault((vaultPath) =>
      Effect.gen(function*() {
        const service = yield* SearchService
        const result = yield* service.simpleSearch("")
        expect(result).toEqual([])
      }).pipe(
        Effect.provide(Layer.mergeAll(
          SearchService.Default,
          VaultCache.Default,
          Layer.succeed(VaultConfig, { vaultPath })
        ))
      )
    ))

  it("should find matches and return results with context", () =>
    withSearchTestVault((vaultPath) =>
      Effect.gen(function*() {
        const service = yield* SearchService
        const result = yield* service.simpleSearch("test")

        expect(result.length).toBeGreaterThan(0)
        expect(result[0]).toHaveProperty("filePath")
        expect(result[0]).toHaveProperty("lineNumber")
        expect(result[0]).toHaveProperty("context")
        expect(result[0].context.toLowerCase()).toContain("test")
      }).pipe(
        Effect.provide(Layer.mergeAll(
          SearchService.Default,
          VaultCache.Default,
          Layer.succeed(VaultConfig, { vaultPath })
        ))
      )
    ))

  it("should return no results for non-existent query", () =>
    withSearchTestVault((vaultPath) =>
      Effect.gen(function*() {
        const service = yield* SearchService
        const result = yield* service.simpleSearch("nonexistentquery")
        expect(result).toEqual([])
      }).pipe(
        Effect.provide(Layer.mergeAll(
          SearchService.Default,
          VaultCache.Default,
          Layer.succeed(VaultConfig, { vaultPath })
        ))
      )
    ))

  it("should search recursively in subdirectories", () =>
    withSearchTestVault((vaultPath) =>
      Effect.gen(function*() {
        const service = yield* SearchService
        const result = yield* service.simpleSearch("nested")

        expect(result.length).toBeGreaterThan(0)
        expect(result[0].filePath).toContain("subfolder")
        expect(result[0].context.toLowerCase()).toContain("nested")
      }).pipe(
        Effect.provide(Layer.mergeAll(
          SearchService.Default,
          VaultCache.Default,
          Layer.succeed(VaultConfig, { vaultPath })
        ))
      )
    ))
})
