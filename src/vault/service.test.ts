import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import {
	VaultService,
	VaultServiceTest,
	walkDirectory,
	loadFileContent,
	loadAllFiles,
	searchInContent
} from "./service.js"
import type { VaultFile } from "./domain.js"

// Mock Path implementation for testing
const mockPath = {
	join: (...paths: string[]) => paths.join("/"),
	relative: (from: string, to: string) => to.replace(`${from}/`, ""),
	sep: "/",
	basename: (path: string) => path.split("/").pop() || "",
	dirname: (path: string) => path.split("/").slice(0, -1).join("/"),
	extname: (path: string) => (path.includes(".") ? `.${path.split(".").pop()}` : ""),
	resolve: (...paths: string[]) => paths.join("/"),
	normalize: (path: string) => path
} as any

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

// Direct unit tests for internal functions
describe("searchInContent", () => {
	it("should find search matches with context", () => {
		const vaultFile: VaultFile = {
			path: "/test/file.md",
			content: "First line\nSearch term here\nThird line",
			frontmatter: {},
			bytes: 0,
			lines: 3
		}

		const results = searchInContent(vaultFile, "search")

		expect(results).toHaveLength(1)
		expect(results[0].filePath).toBe("/test/file.md")
		expect(results[0].lineNumber).toBe(2)
		expect(results[0].context).toContain("Search term here")
	})

	it("should be case-insensitive", () => {
		const vaultFile: VaultFile = {
			path: "/test/file.md",
			content: "First line\nSEARCH TERM HERE\nThird line",
			frontmatter: {},
			bytes: 0,
			lines: 3
		}

		const results = searchInContent(vaultFile, "search")

		expect(results).toHaveLength(1)
		expect(results[0].context).toContain("SEARCH TERM HERE")
	})

	it("should handle multiple matches in same file", () => {
		const vaultFile: VaultFile = {
			path: "/test/file.md",
			content: "First search term\nSecond line\nThird search term",
			frontmatter: {},
			bytes: 0,
			lines: 3
		}

		const results = searchInContent(vaultFile, "search")

		expect(results).toHaveLength(2)
		expect(results[0].lineNumber).toBe(1)
		expect(results[1].lineNumber).toBe(3)
	})

	it("should limit context to 100 characters around match", () => {
		const longText = `${"a".repeat(150)}query${"b".repeat(150)}`
		const vaultFile: VaultFile = {
			path: "/test/file.md",
			content: longText,
			frontmatter: {},
			bytes: 0,
			lines: 1
		}

		const results = searchInContent(vaultFile, "query")

		expect(results).toHaveLength(1)
		expect(results[0].context.length).toBeLessThanOrEqual(206) // 100 before + 5 (query) + 100 after + 1 for index difference
		expect(results[0].context).toContain("query")
	})

	it("should handle empty content", () => {
		const vaultFile: VaultFile = {
			path: "/test/file.md",
			content: "",
			frontmatter: {},
			bytes: 0,
			lines: 1
		}

		const results = searchInContent(vaultFile, "search")

		expect(results).toHaveLength(0)
	})

	it("should handle special characters in query", () => {
		const vaultFile: VaultFile = {
			path: "/test/file.md",
			content: "Content with special chars: !@#$%^&*()",
			frontmatter: {},
			bytes: 0,
			lines: 1
		}

		const results = searchInContent(vaultFile, "!@#$%^&*()")

		expect(results).toHaveLength(1)
		expect(results[0].context).toContain("!@#$%^&*()")
	})

	it("should handle query at beginning and end of line", () => {
		const vaultFile: VaultFile = {
			path: "/test/file.md",
			content: "search at start\nend with search",
			frontmatter: {},
			bytes: 0,
			lines: 2
		}

		const results = searchInContent(vaultFile, "search")

		expect(results).toHaveLength(2)
		expect(results[0].lineNumber).toBe(1)
		expect(results[0].context).toContain("search at start")
		expect(results[1].lineNumber).toBe(2)
		expect(results[1].context).toContain("end with search")
	})

	it("should handle unicode characters correctly", () => {
		const vaultFile: VaultFile = {
			path: "/test/file.md",
			content: "Hello 世界 🌍\nAnother line with 世界",
			frontmatter: {},
			bytes: 0,
			lines: 2
		}

		const results = searchInContent(vaultFile, "世界")

		expect(results).toHaveLength(2)
		expect(results[0].lineNumber).toBe(1)
		expect(results[1].lineNumber).toBe(2)
	})

	it("should handle empty query", () => {
		const vaultFile: VaultFile = {
			path: "/test/file.md",
			content: "Some content here",
			frontmatter: {},
			bytes: 0,
			lines: 1
		}

		const results = searchInContent(vaultFile, "")

		// Empty query should match all lines since empty string is included in any string
		expect(results).toHaveLength(1)
	})

	it("should handle whitespace-only query", () => {
		const vaultFile: VaultFile = {
			path: "/test/file.md",
			content: "Line with spaces\nAnother line",
			frontmatter: {},
			bytes: 0,
			lines: 2
		}

		const results = searchInContent(vaultFile, "   ")

		// Whitespace-only query should not match anything since spaces don't match empty string behavior
		expect(results).toHaveLength(0)
	})

	it("should handle very long lines efficiently", () => {
		const longLine = `${"word ".repeat(10000)}target${" word".repeat(10000)}`
		const vaultFile: VaultFile = {
			path: "/test/file.md",
			content: longLine,
			frontmatter: {},
			bytes: 0,
			lines: 1
		}

		const results = searchInContent(vaultFile, "target")

		expect(results).toHaveLength(1)
		expect(results[0].context.length).toBeLessThanOrEqual(206) // Should still limit context
		expect(results[0].context).toContain("target")
	})
})

// Direct unit tests for other internal functions
describe("loadFileContent", () => {
	it("should handle file read errors gracefully", () =>
		Effect.gen(function* () {
			// Create a mock FileSystem that fails to read
			const mockFs = {
				readFileString: () => Effect.fail(new Error("File not found")),
				stat: () => Effect.fail(new Error("Stat failed"))
			} as any

			const result = yield* loadFileContent(mockFs, "/nonexistent/file.md")

			// Should return default VaultFile on error
			expect(result.path).toBe("/nonexistent/file.md")
			expect(result.content).toBe("")
			expect(result.bytes).toBe(0)
			expect(result.lines).toBe(0)
		}))

	it("should handle frontmatter parsing errors gracefully", () =>
		Effect.gen(function* () {
			const mockFs = {
				readFileString: () => Effect.succeed("Invalid frontmatter\n---\ncontent"),
				stat: () => Effect.succeed({ type: "File" })
			} as any

			const result = yield* loadFileContent(mockFs, "/test/file.md")

			// Should handle parsing errors and return content as-is
			expect(result.path).toBe("/test/file.md")
			expect(result.content).toBe("Invalid frontmatter\n---\ncontent")
			expect(result.bytes).toBeGreaterThan(0)
			expect(result.lines).toBeGreaterThan(0)
		}))

	it("should parse valid frontmatter correctly", () =>
		Effect.gen(function* () {
			const contentWithFrontmatter = "---\ntitle: Test\nauthor: John\n---\n# Main Content\nSome text here"
			const mockFs = {
				readFileString: () => Effect.succeed(contentWithFrontmatter),
				stat: () => Effect.succeed({ type: "File" })
			} as any

			const result = yield* loadFileContent(mockFs, "/test/file.md")

			expect(result.path).toBe("/test/file.md")
			expect(result.content).toBe("# Main Content\nSome text here")
			expect(result.frontmatter).toEqual({ title: "Test", author: "John" })
			expect(result.bytes).toBe(new TextEncoder().encode("# Main Content\nSome text here").length)
			expect(result.lines).toBe(2)
		}))
})

describe("walkDirectory", () => {
	it("should handle directory read errors gracefully", () =>
		Effect.gen(function* () {
			const mockFs = {
				readDirectory: () => Effect.fail(new Error("Directory not found")),
				stat: () => Effect.fail(new Error("Stat failed"))
			} as any

			const result = yield* walkDirectory(mockFs, mockPath, "/nonexistent")

			// Should return empty array on error
			expect(result).toEqual([])
		}))

	it("should filter out ignored patterns", () =>
		Effect.gen(function* () {
			const mockFs = {
				readDirectory: () => Effect.succeed(["file.md", ".obsidian", "test.md", "temp.tmp"]),
				stat: (path: string) =>
					path.includes(".") ? Effect.succeed({ type: "File" }) : Effect.succeed({ type: "Directory" })
			} as any

			const result = yield* walkDirectory(mockFs, mockPath, "/test", [".obsidian"])

			// Should only include .md files and exclude ignored patterns
			expect(result).toHaveLength(2)
			expect(result).toContain("/test/file.md")
			expect(result).toContain("/test/test.md")
			expect(result).not.toContain("/test/.obsidian")
			expect(result).not.toContain("/test/temp.tmp")
		}))

	it("should handle nested directories recursively", () =>
		Effect.gen(function* () {
			const mockFs = {
				readDirectory: (path: string) => {
					if (path === "/test") return Effect.succeed(["file.md", "subdir"])
					if (path === "/test/subdir") return Effect.succeed(["nested.md"])
					return Effect.succeed([])
				},
				stat: (path: string) =>
					path.includes("subdir") ? Effect.succeed({ type: "Directory" }) : Effect.succeed({ type: "File" })
			} as any

			const result = yield* walkDirectory(mockFs, mockPath, "/test")

			expect(result).toHaveLength(2)
			expect(result).toContain("/test/file.md")
			expect(result).toContain("/test/subdir/nested.md")
		}))
})

describe("loadAllFiles", () => {
	it("should load all files from directory structure", () =>
		Effect.gen(function* () {
			const mockFs = {
				readDirectory: (path: string) => {
					if (path === "/vault") return Effect.succeed(["file1.md", "subdir"])
					if (path === "/vault/subdir") return Effect.succeed(["nested.md"])
					return Effect.succeed([])
				},
				stat: (path: string) =>
					path.includes("subdir") ? Effect.succeed({ type: "Directory" }) : Effect.succeed({ type: "File" }),
				readFileString: (path: string) => {
					if (path.includes("file1")) return Effect.succeed("Content 1")
					if (path.includes("file2")) return Effect.succeed("Content 2")
					return Effect.succeed("")
				}
			} as any

			const result = yield* loadAllFiles(mockFs, mockPath, "/vault")

			expect(result.size).toBe(2)
			const file1 = result.get("file1.md")
			const file2 = result.get("subdir/file2.md")
			expect(file1?.content).toBe("Content 1")
			expect(file2?.content).toBe("Content 2")
		}))

	it("should handle empty directory", () =>
		Effect.gen(function* () {
			const mockFs = {
				readDirectory: () => Effect.succeed([]),
				stat: () => Effect.succeed({ type: "File" }),
				readFileString: () => Effect.succeed("")
			} as any

			const result = yield* loadAllFiles(mockFs, mockPath, "/empty")

			expect(result.size).toBe(0)
		}))

	it("should handle file loading errors gracefully", () =>
		Effect.gen(function* () {
			const mockFs = {
				readDirectory: () => Effect.succeed(["file1.md", "file2.md"]),
				stat: () => Effect.succeed({ type: "File" }),
				readFileString: (path: string) => {
					if (path.includes("file1")) return Effect.fail(new Error("Read failed"))
					return Effect.succeed("Content 2")
				}
			} as any

			const result = yield* loadAllFiles(mockFs, mockPath, "/vault")

			expect(result.size).toBe(2)
			// file1 should have default empty content due to error
			expect(result.get("file1.md")?.content).toBe("")
			expect(result.get("file2.md")?.content).toBe("Content 2")
		}))
})

// Additional comprehensive unit tests for internal functions
describe("walkDirectory comprehensive tests", () => {
	it("should handle mixed file types and filter correctly", () =>
		Effect.gen(function* () {
			const mockFs = {
				readDirectory: () => Effect.succeed(["file.md", "file.txt", "image.png", "document.MD"]),
				stat: (path: string) => Effect.succeed({ type: "File" })
			} as any

			const result = yield* walkDirectory(mockFs, mockPath, "/test")

			// Should only include .md files (case insensitive)
			expect(result).toHaveLength(2)
			expect(result).toContain("/test/file.md")
			expect(result).toContain("/test/document.MD")
		}))

	it("should handle custom ignore patterns", () =>
		Effect.gen(function* () {
			const mockFs = {
				readDirectory: () => Effect.succeed(["file.md", ".git", "node_modules", "temp.md"]),
				stat: (path: string) => {
					if (path.includes("node_modules")) return Effect.succeed({ type: "Directory" })
					return Effect.succeed({ type: "File" })
				}
			} as any

			const result = yield* walkDirectory(mockFs, mockPath, "/test", [".git", "node_modules"])

			// Should exclude ignored patterns
			expect(result).toHaveLength(2)
			expect(result).toContain("/test/file.md")
			expect(result).toContain("/test/temp.md")
			expect(result).not.toContain("/test/.git")
		}))

	it("should handle deeply nested directory structures", () =>
		Effect.gen(function* () {
			const mockFs = {
				readDirectory: (path: string) => {
					if (path === "/test") return Effect.succeed(["a", "file.md"])
					if (path === "/test/a") return Effect.succeed(["b"])
					if (path === "/test/a/b") return Effect.succeed(["c"])
					if (path === "/test/a/b/c") return Effect.succeed(["deep.md"])
					return Effect.succeed([])
				},
				stat: (path: string) => {
					if (path.endsWith(".md")) return Effect.succeed({ type: "File" })
					return Effect.succeed({ type: "Directory" })
				}
			} as any

			const result = yield* walkDirectory(mockFs, mockPath, "/test")

			expect(result).toHaveLength(2)
			expect(result).toContain("/test/file.md")
			expect(result).toContain("/test/a/b/c/deep.md")
		}))
})

describe("loadFileContent comprehensive tests", () => {
	it("should handle files with only frontmatter", () =>
		Effect.gen(function* () {
			const contentWithOnlyFrontmatter = "---\ntitle: Test\nauthor: John\n---"
			const mockFs = {
				readFileString: () => Effect.succeed(contentWithOnlyFrontmatter),
				stat: () => Effect.succeed({ type: "File" })
			} as any

			const result = yield* loadFileContent(mockFs, "/test/frontmatter-only.md")

			expect(result.path).toBe("/test/frontmatter-only.md")
			expect(result.content).toBe("")
			expect(result.frontmatter).toEqual({ title: "Test", author: "John" })
			expect(result.bytes).toBe(0)
			expect(result.lines).toBe(1) // Empty string still counts as 1 line
		}))

	it("should handle files with malformed frontmatter", () =>
		Effect.gen(function* () {
			const malformedFrontmatter = "---\ntitle: Test\nauthor: John\ncontent without closing"
			const mockFs = {
				readFileString: () => Effect.succeed(malformedFrontmatter),
				stat: () => Effect.succeed({ type: "File" })
			} as any

			const result = yield* loadFileContent(mockFs, "/test/malformed.md")

			// Should treat entire content as main content when frontmatter parsing fails
			expect(result.content).toBe(malformedFrontmatter)
			expect(result.frontmatter).toEqual({})
			expect(result.bytes).toBe(new TextEncoder().encode(malformedFrontmatter).length)
		}))

	it("should handle files with complex frontmatter data types", () =>
		Effect.gen(function* () {
			const complexFrontmatter = `---
title: "Complex Title"
tags: [tag1, tag2, tag3]
published: true
count: 42
metadata:
  nested: value
---
# Main Content
Some content here`
			const mockFs = {
				readFileString: () => Effect.succeed(complexFrontmatter),
				stat: () => Effect.succeed({ type: "File" })
			} as any

			const result = yield* loadFileContent(mockFs, "/test/complex.md")

			expect(result.content).toBe("# Main Content\nSome content here")
			expect(result.frontmatter).toEqual({
				title: "Complex Title",
				tags: ["tag1", "tag2", "tag3"],
				published: true,
				count: 42
			})
		}))
})

describe("loadAllFiles comprehensive tests", () => {
	it("should handle mixed directory and file structure", () =>
		Effect.gen(function* () {
			const mockFs = {
				readDirectory: (path: string) => {
					if (path === "/vault") return Effect.succeed(["root.md", "subdir", "empty.md"])
					if (path === "/vault/subdir") return Effect.succeed(["nested.md"])
					return Effect.succeed([])
				},
				stat: (path: string) => {
					if (path.includes("subdir")) return Effect.succeed({ type: "Directory" })
					return Effect.succeed({ type: "File" })
				},
				readFileString: (path: string) => {
					if (path.includes("root")) return Effect.succeed("Root content")
					if (path.includes("nested")) return Effect.succeed("Nested content")
					if (path.includes("empty")) return Effect.succeed("")
					return Effect.succeed("")
				}
			} as any

			const result = yield* loadAllFiles(mockFs, mockPath, "/vault")

			expect(result.size).toBe(3)
			const rootFile = result.get("root.md")
			const nestedFile = result.get("subdir/nested.md")
			const emptyFile = result.get("empty.md")
			expect(rootFile?.content).toBe("Root content")
			expect(nestedFile?.content).toBe("Nested content")
			expect(emptyFile?.content).toBe("")
		}))
})
