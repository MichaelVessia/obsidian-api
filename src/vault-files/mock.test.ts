import { HttpApiError } from "@effect/platform"
import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { VaultFilesService, VaultFilesServiceTest } from "./service.js"

describe("VaultFilesService with mocks", () => {
  it("should return file content from mock", () =>
    Effect.gen(function*() {
      const service = yield* VaultFilesService
      const content = yield* service.getFile("test.md")

      expect(content).toBe("# Test Content")
    }).pipe(
      Effect.provide(
        VaultFilesServiceTest(() => Effect.succeed("# Test Content"))
      )
    ))

  it("should handle not found error from mock", () =>
    Effect.gen(function*() {
      const service = yield* VaultFilesService
      const result = yield* Effect.flip(service.getFile("missing.md"))

      expect(result).toBeInstanceOf(HttpApiError.NotFound)
      expect(result._tag).toBe("NotFound")
    }).pipe(
      Effect.provide(
        VaultFilesServiceTest(() => Effect.fail(new HttpApiError.NotFound()))
      )
    ))
})
