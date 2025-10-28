import { Config, Context, Effect, Layer } from "effect";
import * as os from "node:os";
import * as path from "node:path";

export class VaultConfig extends Context.Tag("VaultConfig")<
  VaultConfig,
  {
    readonly vaultPath: string;
  }
>() {}

const vaultPathConfig = Config.string("VAULT_PATH").pipe(
  Config.withDescription("Path to the Obsidian vault directory"),
  Config.map((vaultPath) => {
    // Expand ~ to home directory if present
    const expandedPath = vaultPath.startsWith("~")
      ? path.join(os.homedir(), vaultPath.slice(1))
      : vaultPath;

    return path.resolve(expandedPath);
  }),
);

export const VaultConfigLive = Layer.effect(
  VaultConfig,
  Effect.gen(function* () {
    const vaultPath = yield* vaultPathConfig;

    return {
      vaultPath,
    };
  }),
);
