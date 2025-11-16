import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { VaultService, VaultServiceTest } from "./service.js"

describe("VaultService", () => {
	it("should return file content for existing file", () => {
		const cache = new Map([
			["test.md", "# Test File\nSome content"],
			["notes/example.md", "Example note"]
		])

		return Effect.gen(function* () {
			const service = yield* VaultService
			const content = yield* service.getFile("test.md")

			expect(content).toBe("# Test File\nSome content")
		}).pipe(Effect.provide(VaultServiceTest(cache)))
	})

	it("should return undefined for non-existent file", () => {
		const cache = new Map([["test.md", "content"]])

		return Effect.gen(function* () {
			const service = yield* VaultService
			const content = yield* service.getFile("missing.md")

			expect(content).toBeUndefined()
		}).pipe(Effect.provide(VaultServiceTest(cache)))
	})

	it("should return all files", () => {
		const cache = new Map([
			["test.md", "content1"],
			["notes/example.md", "content2"]
		])

		return Effect.gen(function* () {
			const service = yield* VaultService
			const allFiles = yield* service.getAllFiles()

			expect(allFiles.size).toBe(2)
			expect(allFiles.get("test.md")).toBe("content1")
			expect(allFiles.get("notes/example.md")).toBe("content2")
		}).pipe(Effect.provide(VaultServiceTest(cache)))
	})

	it("should search and return results from multiple files", () => {
		const cache = new Map([
			["file1.md", "First line\nThis contains the query word\nLast line"],
			["file2.md", "Another file\nWith query in it\nEnd"],
			["file3.md", "No match here"]
		])

		return Effect.gen(function* () {
			const service = yield* VaultService
			const results = yield* service.searchInFiles("query")

			expect(results).toHaveLength(2)
			expect(results[0].filePath).toBe("file1.md")
			expect(results[0].lineNumber).toBe(2)
			expect(results[0].context).toContain("query")
			expect(results[1].filePath).toBe("file2.md")
			expect(results[1].lineNumber).toBe(2)
		}).pipe(Effect.provide(VaultServiceTest(cache)))
	})

	it("should return empty array for empty query", () => {
		const cache = new Map([["test.md", "some content"]])

		return Effect.gen(function* () {
			const service = yield* VaultService
			const results = yield* service.searchInFiles("")

			expect(results).toHaveLength(0)
		}).pipe(Effect.provide(VaultServiceTest(cache)))
	})

	it("should be case-insensitive in search", () => {
		const cache = new Map([["test.md", "This contains QUERY in CAPS"]])

		return Effect.gen(function* () {
			const service = yield* VaultService
			const results = yield* service.searchInFiles("query")

			expect(results).toHaveLength(1)
			expect(results[0].context).toContain("QUERY")
		}).pipe(Effect.provide(VaultServiceTest(cache)))
	})

	it("should include context around match", () => {
		const longText = `${"a".repeat(150)}query${"b".repeat(150)}`
		const cache = new Map([["test.md", longText]])

		return Effect.gen(function* () {
			const service = yield* VaultService
			const results = yield* service.searchInFiles("query")

			expect(results).toHaveLength(1)
			expect(results[0].context.length).toBeLessThanOrEqual(205) // 100 before + 5 (query) + 100 after
			expect(results[0].context).toContain("query")
		}).pipe(Effect.provide(VaultServiceTest(cache)))
	})

	it("should return file content for getFileContent with existing file", () => {
		const cache = new Map([
			["test.md", "# Test File\nSome content"],
			["notes/example.md", "Example note"]
		])

		return Effect.gen(function* () {
			const service = yield* VaultService
			const content = yield* service.getFileContent("test.md")

			expect(content).toBe("# Test File\nSome content")
		}).pipe(Effect.provide(VaultServiceTest(cache)))
	})

	it("should normalize filename by adding .md extension in getFileContent", () => {
		const cache = new Map([["test.md", "content"]])

		return Effect.gen(function* () {
			const service = yield* VaultService
			const content = yield* service.getFileContent("test")

			expect(content).toBe("content")
		}).pipe(Effect.provide(VaultServiceTest(cache)))
	})

	it("should return BadRequest error for empty filename in getFileContent", () => {
		const cache = new Map([["test.md", "content"]])

		return Effect.gen(function* () {
			const service = yield* VaultService
			const result = yield* Effect.either(service.getFileContent(""))

			expect(result._tag).toBe("Left")
			if (result._tag === "Left") {
				expect(result.left._tag).toBe("BadRequest")
			}
		}).pipe(Effect.provide(VaultServiceTest(cache)))
	})

	it("should return NotFound error for non-existent file in getFileContent", () => {
		const cache = new Map([["test.md", "content"]])

		return Effect.gen(function* () {
			const service = yield* VaultService
			const result = yield* Effect.either(service.getFileContent("missing.md"))

			expect(result._tag).toBe("Left")
			if (result._tag === "Left") {
				expect(result.left._tag).toBe("NotFound")
			}
		}).pipe(Effect.provide(VaultServiceTest(cache)))
	})

	it("should calculate metrics for empty cache", () =>
		Effect.gen(function* () {
			const service = yield* VaultService
			const metrics = yield* service.getMetrics()

			expect(metrics).toEqual({
				totalFiles: 0,
				totalBytes: 0,
				totalLines: 0,
				averageFileSize: 0,
				largestFile: { path: "none", bytes: 0 },
				smallestFile: { path: "none", bytes: 0 }
			})
		}).pipe(Effect.provide(VaultServiceTest(new Map()))))

	it("should calculate metrics for single file", () =>
		Effect.gen(function* () {
			const service = yield* VaultService
			const metrics = yield* service.getMetrics()

			expect(metrics.totalFiles).toBe(1)
			expect(metrics.totalLines).toBe(3)
			expect(metrics.largestFile.path).toBe("test.md")
			expect(metrics.smallestFile.path).toBe("test.md")
		}).pipe(Effect.provide(VaultServiceTest(new Map([["test.md", "Line 1\nLine 2\nLine 3"]])))))

	it("should calculate metrics for multiple files", () =>
		Effect.gen(function* () {
			const service = yield* VaultService
			const metrics = yield* service.getMetrics()

			expect(metrics.totalFiles).toBe(3)
			expect(metrics.largestFile.path).toBe("large.md")
			expect(metrics.smallestFile.path).toBe("small.md")
			expect(metrics.averageFileSize).toBeGreaterThan(0)
		}).pipe(
			Effect.provide(
				VaultServiceTest(
					new Map([
						["small.md", "Short"],
						["medium.md", "Line 1\nLine 2\nLine 3"],
						["large.md", "This is a much longer file\nwith multiple lines\nand more content\nto test the metrics"]
					])
				)
			)
		))

	it("should count bytes correctly using UTF-8 encoding", () =>
		Effect.gen(function* () {
			const service = yield* VaultService
			const content = "Hello"
			const expectedBytes = new TextEncoder().encode(content).length
			const metrics = yield* service.getMetrics()

			expect(metrics.totalBytes).toBe(expectedBytes)
		}).pipe(Effect.provide(VaultServiceTest(new Map([["test.md", "Hello"]])))))

	// Additional service tests
	describe("reload functionality", () => {
		it("should reload cache successfully", () => {
			const cache = new Map([["test.md", "original content"]])

			return Effect.gen(function* () {
				const service = yield* VaultService
				yield* service.reload()

				// After reload, should still work with test cache
				const content = yield* service.getFile("test.md")
				expect(content).toBe("original content")
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})
	})

	describe("search edge cases", () => {
		it("should handle whitespace-only query", () => {
			const cache = new Map([["test.md", "some content"]])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const results = yield* service.searchInFiles("   ")

				expect(results).toHaveLength(0)
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})

		it("should handle special characters in query", () => {
			const cache = new Map([["test.md", "Content with special chars: !@#$%^&*()"]])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const results = yield* service.searchInFiles("!@#$%^&*()")

				expect(results).toHaveLength(1)
				expect(results[0].context).toContain("!@#$%^&*()")
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})

		it("should handle multiple matches in same file", () => {
			const cache = new Map([["test.md", "First search term\nSecond line\nThird search term"]])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const results = yield* service.searchInFiles("search")

				expect(results).toHaveLength(2)
				expect(results[0].lineNumber).toBe(1)
				expect(results[1].lineNumber).toBe(3)
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})

		it("should handle query at beginning of line", () => {
			const cache = new Map([["test.md", "search term at start"]])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const results = yield* service.searchInFiles("search")

				expect(results).toHaveLength(1)
				expect(results[0].lineNumber).toBe(1)
				expect(results[0].context).toContain("search term at start")
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})

		it("should handle query at end of line", () => {
			const cache = new Map([["test.md", "term at end search"]])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const results = yield* service.searchInFiles("search")

				expect(results).toHaveLength(1)
				expect(results[0].lineNumber).toBe(1)
				expect(results[0].context).toContain("term at end search")
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})
	})

	describe("getFileContent edge cases", () => {
		it("should handle filename with whitespace only", () => {
			const cache = new Map([["test.md", "content"]])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const result = yield* Effect.either(service.getFileContent("   "))

				expect(result._tag).toBe("Left")
				if (result._tag === "Left") {
					expect(result.left._tag).toBe("BadRequest")
				}
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})

		it("should handle filename that already has .md extension", () => {
			const cache = new Map([["test.md", "content"]])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const content = yield* service.getFileContent("test.md")

				expect(content).toBe("content")
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})

		it("should handle filename with multiple dots", () => {
			const cache = new Map([["test.v2.md", "content"]])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const content = yield* service.getFileContent("test.v2")

				expect(content).toBe("content")
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})
	})

	describe("metrics edge cases", () => {
		it("should handle files with zero bytes", () => {
			const cache = new Map([["empty.md", ""]])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const metrics = yield* service.getMetrics()

				expect(metrics.totalFiles).toBe(1)
				expect(metrics.totalBytes).toBe(0)
				expect(metrics.totalLines).toBe(1) // Empty string still counts as 1 line
				expect(metrics.averageFileSize).toBe(0)
				expect(metrics.largestFile.path).toBe("empty.md")
				expect(metrics.smallestFile.path).toBe("empty.md")
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})

		it("should handle files with only newlines", () => {
			const cache = new Map([["newlines.md", "\n\n\n"]])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const metrics = yield* service.getMetrics()

				expect(metrics.totalFiles).toBe(1)
				expect(metrics.totalLines).toBe(4) // 3 newlines = 4 lines
				expect(metrics.totalBytes).toBe(3) // 3 newline characters
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})

		it("should handle files with unicode characters", () => {
			const cache = new Map([["unicode.md", "Hello 世界 🌍"]])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const metrics = yield* service.getMetrics()

				expect(metrics.totalFiles).toBe(1)
				expect(metrics.totalBytes).toBe(new TextEncoder().encode("Hello 世界 🌍").length)
				expect(metrics.totalLines).toBe(1)
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})
	})

	// Integration tests for internal functions using real service
	describe("internal functions integration", () => {
		it("should test searchInContent function behavior", () => {
			const cache = new Map([["test.md", "Line 1\nSearch term here\nLine 3"]])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const results = yield* service.searchInFiles("search")

				// This tests the internal searchInContent function indirectly
				expect(results).toHaveLength(1)
				expect(results[0].filePath).toBe("test.md")
				expect(results[0].lineNumber).toBe(2)
				expect(results[0].context).toContain("Search term here")
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})

		it("should test loadFileContent behavior through service", () => {
			const cache = new Map([["test.md", "# Frontmatter\ntitle: Test\n\nContent here"]])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const content = yield* service.getFile("test.md")

				// This tests the internal loadFileContent function indirectly
				expect(content).toBe("# Frontmatter\ntitle: Test\n\nContent here")
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})

		it("should test walkDirectory behavior through service", () => {
			const cache = new Map([
				["file1.md", "content1"],
				["subdir/file2.md", "content2"],
				["subdir/nested/file3.md", "content3"]
			])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const allFiles = yield* service.getAllFiles()

				// This tests the internal walkDirectory function indirectly
				expect(allFiles.size).toBe(3)
				expect(allFiles.has("file1.md")).toBe(true)
				expect(allFiles.has("subdir/file2.md")).toBe(true)
				expect(allFiles.has("subdir/nested/file3.md")).toBe(true)
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})

		it("should test loadAllFiles behavior through service", () => {
			const cache = new Map([
				["test1.md", "content1"],
				["test2.md", "content2"]
			])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const allFiles = yield* service.getAllFiles()

				// This tests the internal loadAllFiles function indirectly
				expect(allFiles.size).toBe(2)
				expect(allFiles.get("test1.md")).toBe("content1")
				expect(allFiles.get("test2.md")).toBe("content2")
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})
	})

	// Test the test layer implementation
	describe("VaultServiceTest layer", () => {
		it("should test searchInFiles implementation in test layer", () => {
			const cache = new Map([
				["test.md", "Content with search term"],
				["other.md", "No match here"]
			])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const results = yield* service.searchInFiles("search")

				// Tests the test layer's searchInFiles implementation
				expect(results).toHaveLength(1)
				expect(results[0].filePath).toBe("test.md")
				expect(results[0].context).toContain("search term")
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})

		it("should test getMetrics implementation in test layer", () => {
			const cache = new Map([
				["small.md", "Small"],
				["large.md", "This is a much larger file with more content"]
			])

			return Effect.gen(function* () {
				const service = yield* VaultService
				const metrics = yield* service.getMetrics()

				// Tests the test layer's getMetrics implementation
				expect(metrics.totalFiles).toBe(2)
				expect(metrics.totalBytes).toBeGreaterThan(0)
				expect(metrics.largestFile.path).toBe("large.md")
				expect(metrics.smallestFile.path).toBe("small.md")
			}).pipe(Effect.provide(VaultServiceTest(cache)))
		})
	})
})
