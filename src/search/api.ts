import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "@effect/platform";
import { Effect, Layer, Schema } from "effect";
import { SearchResults } from "./schema.js";
import { SearchService } from "./service.js";

const queryParam = HttpApiSchema.param("query", Schema.String);

export const searchGroup = HttpApiGroup.make("Search").add(
  HttpApiEndpoint.get("simple")`/search/simple/${queryParam}`.addSuccess(
    SearchResults,
  ),
);

const api = HttpApi.make("Search").add(searchGroup);

export const searchHandlers = HttpApiBuilder.group(api, "Search", (handlers) =>
  handlers.handle("simple", ({ path: { query } }) =>
    Effect.flatMap(SearchService, (service) => service.simpleSearch(query)),
  ),
);

export const SearchLive = Layer.provide(searchHandlers, SearchService.Default);
