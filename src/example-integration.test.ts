import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { VaultConfigTest } from "./config/vault.js";
import { SearchService, SearchServiceTest } from "./search/service.js";
import {
  VaultFilesService,
  VaultFilesServiceTest,
} from "./vault-files/service.js";

describe("Example integration tests with mocks", () => {
  it("should combine multiple mock layers", () =>
    Effect.gen(function* () {
      const searchService = yield* SearchService;
      const vaultFilesService = yield* VaultFilesService;

      const searchResults = yield* searchService.simpleSearch("example");
      const fileContent = yield* vaultFilesService.getFile("note.md");

      expect(searchResults).toHaveLength(1);
      expect(fileContent).toBe("# Example Note");
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          SearchServiceTest(() =>
            Effect.succeed([
              {
                filePath: "note.md",
                lineNumber: 1,
                context: "example text",
              },
            ]),
          ),
          VaultFilesServiceTest(() => Effect.succeed("# Example Note")),
        ),
      ),
    ));

  it("should use VaultConfigTest for unit tests", () =>
    Effect.gen(function* () {
      // This example shows you can use VaultConfigTest with test vault path
      const service = yield* SearchService;
      const results = yield* service.simpleSearch("test");

      expect(results).toHaveLength(0);
    }).pipe(
      Effect.provide(SearchService.Default),
      Effect.provide(VaultConfigTest("/tmp/test-vault")),
    ));
});
