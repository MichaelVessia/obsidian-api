import { Effect, Context, Layer } from "effect"

export class SearchService extends Context.Tag("SearchService")<
  SearchService,
  {
    readonly simpleSearch: () => Effect.Effect<string>
  }
>() {}

export const SearchServiceLive = Layer.succeed(SearchService, {
  simpleSearch: () => Effect.succeed("Hello World")
})