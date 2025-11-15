import { BunContext } from "@effect/platform-bun";
import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import { VaultCache, VaultCacheTest } from "./service.js";

// Create a large test dataset
const createLargeCache = (fileCount: number): Map<string, string> => {
	const cache = new Map<string, string>();
	for (let i = 0; i < fileCount; i++) {
		const content = `
# File ${i}

This is test file number ${i}.
It contains multiple lines of text.
Some lines contain the word "performance".
Other lines contain different content.

## Section ${i}

Here's some more content with the performance term.
The performance functionality should find this line.
Another line with performance term.

## Conclusion

File ${i} ends here.
    `.trim();
		cache.set(`file-${i}.md`, content);
	}
	return cache;
};

// Sequential implementation for comparison
const sequentialSearch = (
	cache: Map<string, string>,
	query: string,
): Array<any> => {
	const results: Array<any> = [];

	for (const [filePath, content] of cache.entries()) {
		const lines = content.split("\n");
		const lowerQuery = query.toLowerCase();

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lowerLine = line.toLowerCase();

			if (lowerLine.includes(lowerQuery)) {
				const matchIndex = lowerLine.indexOf(lowerQuery);
				const start = Math.max(0, matchIndex - 100);
				const end = Math.min(line.length, matchIndex + query.length + 100);
				const context = line.slice(start, end);

				results.push({
					filePath,
					lineNumber: i + 1,
					context,
				});
			}
		}
	}

	return results;
};

describe("Performance Comparison", () => {
	const testCache = createLargeCache(2000); // 2000 files for more dramatic difference
	const testLayer = Layer.mergeAll(VaultCacheTest(testCache), BunContext.layer);

	it("compares sequential vs concurrent performance", async () => {
		// Test sequential implementation
		const seqStart = performance.now();
		const seqResults = sequentialSearch(testCache, "performance");
		const seqEnd = performance.now();
		const seqDuration = seqEnd - seqStart;

		// Test concurrent implementation
		const concStart = performance.now();
		const concResults = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* VaultCache;
				return yield* cache.searchInFiles("performance");
			}).pipe(Effect.provide(testLayer)),
		);
		const concEnd = performance.now();
		const concDuration = concEnd - concStart;

		console.log(
			`Sequential: ${seqDuration.toFixed(2)}ms for ${testCache.size} files`,
		);
		console.log(
			`Concurrent: ${concDuration.toFixed(2)}ms for ${testCache.size} files`,
		);
		const speedup =
			seqDuration > concDuration
				? seqDuration / concDuration
				: concDuration / seqDuration;
		const winner = seqDuration < concDuration ? "Sequential" : "Concurrent";
		console.log(`${winner} is ${speedup.toFixed(2)}x faster`);
		console.log(`Results match: ${seqResults.length === concResults.length}`);

		expect(seqResults.length).toBe(concResults.length);
		// For this workload size, sequential is often faster due to lower overhead
	}, 60000); // 60 second timeout
});
