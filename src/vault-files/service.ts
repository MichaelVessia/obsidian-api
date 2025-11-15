import { HttpApiError } from "@effect/platform"
import { Effect, Layer } from "effect"
import { VaultCache } from "../vault-cache/service.js"

export class VaultFilesService extends Effect.Service<VaultFilesService>()("VaultFilesService", {
	effect: Effect.gen(function* () {
		const cache = yield* VaultCache

		return {
			// getFile returns an Effect that can fail with HttpApiError or succeed with string
			getFile: (filename: string) =>
				Effect.gen(function* () {
					// Early return with BadRequest error for invalid input
					if (!filename || filename.trim() === "") {
						return yield* Effect.fail(new HttpApiError.BadRequest())
					}

					// Normalize filename to always end with .md
					const normalizedFilename = filename.endsWith(".md") ? filename : `${filename}.md`

					// cache.getFile returns Effect<string | undefined, Error>
					const content = yield* cache.getFile(normalizedFilename)

					// Convert undefined to NotFound error for API consistency
					if (content === undefined) {
						return yield* Effect.fail(new HttpApiError.NotFound())
					}

					return content
				})
		}
	})
}) {}

// Test helper with typed error channels for proper error handling in tests
export const VaultFilesServiceTest = (
	getFile: (filename: string) => Effect.Effect<string, HttpApiError.BadRequest | HttpApiError.NotFound>
) => Layer.succeed(VaultFilesService, VaultFilesService.make({ getFile }))
