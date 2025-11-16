import { Schema, Effect, type ParseResult } from "effect"

export const Frontmatter = Schema.Record({
	key: Schema.String,
	value: Schema.Union(Schema.String, Schema.Number, Schema.Boolean, Schema.Array(Schema.String))
})

export const VaultFile = Schema.Struct({
	path: Schema.String,
	content: Schema.String,
	frontmatter: Frontmatter.pipe(Schema.optional)
})

export type Frontmatter = Schema.Schema.Type<typeof Frontmatter>
export type VaultFile = Schema.Schema.Type<typeof VaultFile>

const parseYamlValue = (valueStr: string): Effect.Effect<string | number | boolean | readonly string[]> => {
	if (!valueStr) {
		return Effect.succeed("")
	}

	if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
		return Effect.succeed(valueStr.slice(1, -1))
	}

	if (valueStr === "true") {
		return Effect.succeed(true)
	}

	if (valueStr === "false") {
		return Effect.succeed(false)
	}

	if (!Number.isNaN(Number(valueStr)) && valueStr !== "") {
		return Effect.succeed(Number(valueStr))
	}

	if (valueStr.startsWith("[") && valueStr.endsWith("]")) {
		const arrayContent = valueStr.slice(1, -1).trim()
		if (arrayContent === "") {
			return Effect.succeed([])
		}
		return Effect.succeed(arrayContent.split(",").map((item) => item.trim().replace(/^"(.*)"$/, "$1")))
	}

	return Effect.succeed(valueStr)
}

export const parseFrontmatter = (
	content: string
): Effect.Effect<{ frontmatter: Frontmatter; content: string }, ParseResult.ParseError> => {
	const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
	const match = content.match(frontmatterRegex)

	if (!match) {
		return Effect.succeed({ frontmatter: {}, content })
	}

	const [, frontmatterStr, mainContent] = match

	const lines = frontmatterStr.split("\n")
	const frontmatterEntries: Array<[string, string | number | boolean | readonly string[]]> = []

	for (const line of lines) {
		const trimmedLine = line.trim()
		if (!trimmedLine || trimmedLine.startsWith("#")) continue

		const colonIndex = trimmedLine.indexOf(":")
		if (colonIndex === -1) continue

		const key = trimmedLine.slice(0, colonIndex).trim()
		const valueStr = trimmedLine.slice(colonIndex + 1).trim()

		const valueEffect = parseYamlValue(valueStr)
		const parsedValue = Effect.runSync(valueEffect)
		frontmatterEntries.push([key, parsedValue])
	}

	const frontmatterRecord = Object.fromEntries(frontmatterEntries)
	const parseResult = Schema.decodeUnknown(Frontmatter)(frontmatterRecord)

	return Effect.map(parseResult, (frontmatter) => ({
		frontmatter,
		content: mainContent
	}))
}
