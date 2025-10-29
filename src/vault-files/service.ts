import { HttpApiError } from "@effect/platform";
import { FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { Effect } from "effect";
import { VaultConfig } from "../config/vault.js";

export class VaultFilesService extends Effect.Service<VaultFilesService>()(
  "VaultFilesService",
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      return {
        getFile: (filename: string) =>
          Effect.gen(function* () {
            const config = yield* VaultConfig;

            // Validate filename
            if (!filename || filename.trim() === "") {
              return yield* Effect.fail(new HttpApiError.BadRequest());
            }

            // Ensure filename ends with .md
            const normalizedFilename = filename.endsWith(".md")
              ? filename
              : `${filename}.md`;
            const filePath = path.join(config.vaultPath, normalizedFilename);

            const exists = yield* fs.exists(filePath);

            if (!exists) {
              return yield* Effect.fail(new HttpApiError.NotFound());
            }

            const content = yield* fs.readFileString(filePath);
            return content;
          }).pipe(
            Effect.catchTag("BadArgument", () =>
              Effect.fail(new HttpApiError.BadRequest()),
            ),
            Effect.catchTag("SystemError", () =>
              Effect.fail(new HttpApiError.NotFound()),
            ),
          ),
      };
    }),
    dependencies: [BunContext.layer],
  },
) {}
