import { Context, Effect, Layer } from "effect"
import { VaultConfig } from "../config/vault.js"

export class SearchService extends Context.Tag("SearchService")<
  SearchService,
  {
    readonly simpleSearch: () => Effect.Effect<string>
  }
>() {}

export const SearchServiceLive = Layer.effect(
  SearchService,
  Effect.gen(function*() {
    const config = yield* VaultConfig

    return {
      simpleSearch: () => Effect.succeed(`Vault path configured: ${config.vaultPath}`)
    }
  })
)
