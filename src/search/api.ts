import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Effect, Layer, Schema } from "effect"
import { SearchService, SearchServiceLive } from "./service.js"

export const searchGroup = HttpApiGroup.make("Search").add(
  HttpApiEndpoint.get("simple")`/search/simple`.addSuccess(Schema.String)
)

const api = HttpApi.make("Search").add(searchGroup)

export const searchHandlers = HttpApiBuilder.group(
  api,
  "Search",
  (handlers) => handlers.handle("simple", () => Effect.flatMap(SearchService, (service) => service.simpleSearch()))
)

export const SearchLive = Layer.provide(searchHandlers, SearchServiceLive)
