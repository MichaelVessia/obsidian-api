import { Path } from "@effect/platform"
import { BunContext } from "@effect/platform-bun"
import { Config, Context, Effect, Layer } from "effect"

export class VaultConfig extends Context.Tag("VaultConfig")<
	VaultConfig,
	{
		readonly vaultPath: string
	}
>() {}

export const VaultConfigLive = Layer.effect(
	VaultConfig,
	Effect.gen(function* () {
		const path = yield* Path.Path
		const vaultPath = yield* Config.string("VAULT_PATH").pipe(
			Config.withDescription("Path to the Obsidian vault directory")
		)

		// Expand ~ to home directory if present
		const homeDir = Bun.env.HOME || "/"
		const expandedPath = vaultPath.startsWith("~") ? path.join(homeDir, vaultPath.slice(1)) : vaultPath

		return {
			vaultPath: path.resolve(expandedPath)
		}
	})
).pipe(Layer.provide(BunContext.layer))

export const VaultConfigTest = (vaultPath: string) => Layer.succeed(VaultConfig, { vaultPath })
