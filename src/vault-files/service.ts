import { HttpApiError } from "@effect/platform";
import { Effect, Layer } from "effect";
import { VaultCache } from "../vault-cache/service.js";

export class VaultFilesService extends Effect.Service<VaultFilesService>()(
	"VaultFilesService",
	{
		effect: Effect.gen(function* () {
			const cache = yield* VaultCache;

			return {
				getFile: (filename: string) =>
					Effect.gen(function* () {
						// Validate filename
						if (!filename || filename.trim() === "") {
							return yield* Effect.fail(new HttpApiError.BadRequest());
						}

						// Ensure filename ends with .md
						const normalizedFilename = filename.endsWith(".md")
							? filename
							: `${filename}.md`;

						const content = yield* cache.getFile(normalizedFilename);

						if (content === undefined) {
							return yield* Effect.fail(new HttpApiError.NotFound());
						}

						return content;
					}),
			};
		}),
	},
) {}

export const VaultFilesServiceTest = (
	getFile: (
		filename: string,
	) => Effect.Effect<string, HttpApiError.BadRequest | HttpApiError.NotFound>,
) => Layer.succeed(VaultFilesService, VaultFilesService.make({ getFile }));
