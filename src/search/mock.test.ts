import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { SearchService, SearchServiceTest } from "./service.js";

describe("SearchService with mocks", () => {
	it("should return search results from mock", () =>
		Effect.gen(function* () {
			const service = yield* SearchService;
			const results = yield* service.simpleSearch("test");

			expect(results).toHaveLength(1);
			expect(results[0].filePath).toBe("test.md");
		}).pipe(
			Effect.provide(
				SearchServiceTest(() =>
					Effect.succeed([
						{
							filePath: "test.md",
							lineNumber: 1,
							context: "test content",
						},
					]),
				),
			),
		));

	it("should handle empty results from mock", () =>
		Effect.gen(function* () {
			const service = yield* SearchService;
			const results = yield* service.simpleSearch("query");

			expect(results).toHaveLength(0);
		}).pipe(Effect.provide(SearchServiceTest(() => Effect.succeed([])))));
});
