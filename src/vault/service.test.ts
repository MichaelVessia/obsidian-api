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
})
