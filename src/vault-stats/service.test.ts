import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { VaultCacheTest } from "../vault-cache/service.js"
import { VaultStatsService } from "./service.js"

describe("VaultStatsService", () => {
	it("should calculate metrics for empty cache", () =>
		Effect.gen(function* () {
			const service = yield* VaultStatsService
			const metrics = yield* service.getMetrics()

			expect(metrics).toEqual({
				totalFiles: 0,
				totalBytes: 0,
				totalLines: 0,
				averageFileSize: 0,
				largestFile: { path: "none", bytes: 0 },
				smallestFile: { path: "none", bytes: 0 }
			})
		}).pipe(Effect.provide(VaultStatsService.Default), Effect.provide(VaultCacheTest(new Map()))))

	it("should calculate metrics for single file", () =>
		Effect.gen(function* () {
			const service = yield* VaultStatsService
			const metrics = yield* service.getMetrics()

			expect(metrics.totalFiles).toBe(1)
			expect(metrics.totalLines).toBe(3)
			expect(metrics.largestFile.path).toBe("test.md")
			expect(metrics.smallestFile.path).toBe("test.md")
		}).pipe(
			Effect.provide(VaultStatsService.Default),
			Effect.provide(VaultCacheTest(new Map([["test.md", "Line 1\nLine 2\nLine 3"]])))
		))

	it("should calculate metrics for multiple files", () =>
		Effect.gen(function* () {
			const service = yield* VaultStatsService
			const metrics = yield* service.getMetrics()

			expect(metrics.totalFiles).toBe(3)
			expect(metrics.largestFile.path).toBe("large.md")
			expect(metrics.smallestFile.path).toBe("small.md")
			expect(metrics.averageFileSize).toBeGreaterThan(0)
		}).pipe(
			Effect.provide(VaultStatsService.Default),
			Effect.provide(
				VaultCacheTest(
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
			const service = yield* VaultStatsService
			const content = "Hello"
			const expectedBytes = new TextEncoder().encode(content).length
			const metrics = yield* service.getMetrics()

			expect(metrics.totalBytes).toBe(expectedBytes)
		}).pipe(Effect.provide(VaultStatsService.Default), Effect.provide(VaultCacheTest(new Map([["test.md", "Hello"]])))))
})
