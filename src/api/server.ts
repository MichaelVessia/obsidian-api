import { HttpApi, HttpApiBuilder, HttpApiSwagger, HttpMiddleware, HttpServer } from "@effect/platform"
import { BunHttpServer } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { VaultConfigLive } from "../config/vault.js"
import { searchGroup } from "../search/api.js"
import { SearchService } from "../search/service.js"
import { vaultGroup } from "../vault/api.js"
import { VaultService } from "../vault/service.js"
import { VaultStatsService } from "../vault-stats/service.js"

export const api = HttpApi.make("Obsidian API").add(searchGroup).add(vaultGroup)

const searchHandlers = HttpApiBuilder.group(api, "Search", (handlers) =>
	handlers.handle("simple", ({ path: { query } }) =>
		Effect.flatMap(SearchService, (service) => service.simpleSearch(query))
	)
)

const vaultHandlers = HttpApiBuilder.group(api, "Vault", (handlers) =>
	handlers
		.handle("getFile", ({ path: { filename } }) =>
			Effect.flatMap(VaultService, (service) => service.getFileContent(filename))
		)
		.handle("listFiles", () =>
			Effect.gen(function* () {
				const vault = yield* VaultService
				const files = yield* vault.getAllFiles()
				return Object.fromEntries(files)
			})
		)
		.handle("reload", () =>
			Effect.gen(function* () {
				const vault = yield* VaultService
				yield* vault.reload()
				const files = yield* vault.getAllFiles()
				return {
					message: "Vault reloaded successfully",
					filesLoaded: files.size
				}
			})
		)
		.handle("metrics", () => Effect.flatMap(VaultStatsService, (service) => service.getMetrics()))
)

export const ObsidianApiLive = HttpApiBuilder.api(api).pipe(
	Layer.provide(searchHandlers),
	Layer.provide(vaultHandlers),
	Layer.provide(SearchService.Default),
	Layer.provide(VaultStatsService.Default),
	Layer.provide(VaultService.Default),
	Layer.provide(VaultConfigLive)
)

const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
	Layer.provide(HttpApiBuilder.middlewareCors()),
	Layer.provide(
		HttpApiSwagger.layer({
			path: "/docs"
		})
	),
	Layer.provide(ObsidianApiLive),
	HttpServer.withLogAddress
)

const port = 3000

const Server = BunHttpServer.layer({ port })

export const ApiServer = Layer.provide(HttpLive, Server)
