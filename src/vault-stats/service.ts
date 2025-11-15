import { Effect, Layer } from "effect"
import { VaultCache } from "../vault-cache/service.js"

export interface VaultMetrics {
	totalFiles: number
	totalBytes: number
	totalLines: number
	averageFileSize: number
	largestFile: { path: string; bytes: number }
	smallestFile: { path: string; bytes: number }
}

export class VaultStatsService extends Effect.Service<VaultStatsService>()("VaultStatsService", {
	effect: Effect.gen(function* () {
		const cache = yield* VaultCache

		return {
			getMetrics: (): Effect.Effect<VaultMetrics> =>
				Effect.gen(function* () {
					const files = yield* cache.getAllFiles()

					let totalBytes = 0
					let totalLines = 0
					let largest = { path: "", bytes: 0 }
					let smallest = { path: "", bytes: Number.MAX_SAFE_INTEGER }

					for (const [path, content] of files.entries()) {
						const bytes = new TextEncoder().encode(content).length
						const lines = content.split("\n").length

						totalBytes += bytes
						totalLines += lines

						if (bytes > largest.bytes) {
							largest = { path, bytes }
						}
						if (bytes < smallest.bytes) {
							smallest = { path, bytes }
						}
					}

					return {
						totalFiles: files.size,
						totalBytes,
						totalLines,
						averageFileSize: files.size > 0 ? Math.round(totalBytes / files.size) : 0,
						largestFile: largest.path ? largest : { path: "none", bytes: 0 },
						smallestFile: smallest.path ? smallest : { path: "none", bytes: 0 }
					}
				})
		}
	})
}) {}

export const VaultStatsServiceTest = (getMetrics: () => Effect.Effect<VaultMetrics>) =>
	Layer.succeed(VaultStatsService, VaultStatsService.make({ getMetrics }))
