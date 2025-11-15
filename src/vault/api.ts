import { HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"

const filenameParam = HttpApiSchema.param("filename", Schema.String)

export const vaultGroup = HttpApiGroup.make("Vault")
	.add(
		HttpApiEndpoint.get("getFile")`/vault-files/${filenameParam}`
			.addSuccess(
				Schema.String.pipe(
					HttpApiSchema.withEncoding({
						kind: "Text",
						contentType: "text/markdown"
					})
				)
			)
			.addError(HttpApiError.NotFound)
			.addError(HttpApiError.BadRequest)
	)
	.add(
		HttpApiEndpoint.get("listFiles", "/vault/files").addSuccess(
			Schema.Record({ key: Schema.String, value: Schema.String })
		)
	)
	.add(
		HttpApiEndpoint.post("reload", "/vault/reload").addSuccess(
			Schema.Struct({
				message: Schema.String,
				filesLoaded: Schema.Number
			})
		)
	)
	.add(
		HttpApiEndpoint.get("metrics", "/vault/metrics").addSuccess(
			Schema.Struct({
				totalFiles: Schema.Number,
				totalBytes: Schema.Number,
				totalLines: Schema.Number,
				averageFileSize: Schema.Number,
				largestFile: Schema.Struct({
					path: Schema.String,
					bytes: Schema.Number
				}),
				smallestFile: Schema.Struct({
					path: Schema.String,
					bytes: Schema.Number
				})
			})
		)
	)
