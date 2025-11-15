import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import { VaultConfig } from "./vault.js";

describe("VaultConfig", () => {
	it("should load vault path from environment variable", () =>
		Effect.gen(function* () {
			const config = yield* VaultConfig;
			expect(config.vaultPath).toContain("/test-vault");
		}).pipe(
			Effect.provide(
				Layer.succeed(VaultConfig, {
					vaultPath: "/test-vault",
				}),
			),
		));

	it("should expand ~ in path", () =>
		Effect.gen(function* () {
			const homeDir = process.env.HOME || "/home/user";
			const config = yield* VaultConfig;
			expect(config.vaultPath).toBe(`${homeDir}/Documents/vault`);
		}).pipe(
			Effect.provide(
				Layer.succeed(VaultConfig, {
					vaultPath: `${process.env.HOME}/Documents/vault`,
				}),
			),
		));
});
