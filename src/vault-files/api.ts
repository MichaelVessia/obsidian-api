import {
	HttpApiEndpoint,
	HttpApiError,
	HttpApiGroup,
	HttpApiSchema,
} from "@effect/platform";
import { Schema } from "effect";

const filenameParam = HttpApiSchema.param("filename", Schema.String);

export const vaultFilesGroup = HttpApiGroup.make("Vault Files").add(
	HttpApiEndpoint.get("getFile")`/vault-files/${filenameParam}`
		.addSuccess(
			Schema.String.pipe(
				HttpApiSchema.withEncoding({
					kind: "Text",
					contentType: "text/markdown",
				}),
			),
		)
		.addError(HttpApiError.NotFound)
		.addError(HttpApiError.BadRequest),
);
