import { describe, expect, it } from "bun:test"
import { Effect, Layer } from "effect"
import { VaultConfig, VaultConfigTest } from "./vault.js"

describe("VaultConfig", () => {
	it("should load vault path from environment variable", () =>
		Effect.gen(function* () {
			const config = yield* VaultConfig
			expect(config.vaultPath).toContain("/test-vault")
			expect(config.debounceMs).toBe(100)
		}).pipe(
			Effect.provide(
				Layer.succeed(VaultConfig, {
					vaultPath: "/test-vault",
					debounceMs: 100
				})
			)
		))

	it("should expand ~ in path", () =>
		Effect.gen(function* () {
			const homeDir = process.env.HOME || "/home/user"
			const config = yield* VaultConfig
			expect(config.vaultPath).toBe(`${homeDir}/Documents/vault`)
		}).pipe(
			Effect.provide(
				Layer.succeed(VaultConfig, {
					vaultPath: `${process.env.HOME}/Documents/vault`,
					debounceMs: 100
				})
			)
		))

	it("should use default debounceMs when not provided", () =>
		Effect.gen(function* () {
			const config = yield* VaultConfig
			expect(config.debounceMs).toBe(100)
		}).pipe(
			Effect.provide(
				Layer.succeed(VaultConfig, {
					vaultPath: "/test-vault",
					debounceMs: 100
				})
			)
		))

	it("should handle custom debounceMs value", () =>
		Effect.gen(function* () {
			const config = yield* VaultConfig
			expect(config.debounceMs).toBe(500)
		}).pipe(
			Effect.provide(
				Layer.succeed(VaultConfig, {
					vaultPath: "/test-vault",
					debounceMs: 500
				})
			)
		))

	it("should resolve relative paths", () =>
		Effect.gen(function* () {
			const config = yield* VaultConfig
			expect(config.vaultPath).toMatch(/^\/.*\/test-vault$/)
		}).pipe(
			Effect.provide(
				Layer.succeed(VaultConfig, {
					vaultPath: "./test-vault",
					debounceMs: 100
				})
			)
		))

	it("should handle absolute paths", () =>
		Effect.gen(function* () {
			const config = yield* VaultConfig
			expect(config.vaultPath).toBe("/absolute/path/to/vault")
		}).pipe(
			Effect.provide(
				Layer.succeed(VaultConfig, {
					vaultPath: "/absolute/path/to/vault",
					debounceMs: 100
				})
			)
		))

	it("should work with VaultConfigTest helper", () =>
		Effect.gen(function* () {
			const config = yield* VaultConfig
			expect(config.vaultPath).toBe("/mock/vault")
			expect(config.debounceMs).toBe(200)
		}).pipe(Effect.provide(VaultConfigTest("/mock/vault", 200))))

	it("should work with VaultConfigTest helper with default debounce", () =>
		Effect.gen(function* () {
			const config = yield* VaultConfig
			expect(config.vaultPath).toBe("/mock/vault")
			expect(config.debounceMs).toBe(100)
		}).pipe(Effect.provide(VaultConfigTest("/mock/vault"))))
})
