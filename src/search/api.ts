import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform";
import { Schema } from "effect";
import { SearchResults } from "./schema.js";

const queryParam = HttpApiSchema.param("query", Schema.String);

export const searchGroup = HttpApiGroup.make("Search").add(
	HttpApiEndpoint.get("simple")`/search/simple/${queryParam}`.addSuccess(
		SearchResults,
	),
);
