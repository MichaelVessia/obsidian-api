import { Schema, Effect, type ParseResult } from 'effect'
import * as YAML from 'js-yaml'
import { Frontmatter, YamlParseError } from './domain.js'

export const parseFrontmatter = (
  content: string,
): Effect.Effect<{ frontmatter: Frontmatter; content: string }, YamlParseError | ParseResult.ParseError> => {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return Effect.succeed({ frontmatter: {}, content })
  }

  const [, frontmatterStr, mainContent] = match

  if (!frontmatterStr) {
    return Effect.succeed({ frontmatter: {}, content: mainContent ?? '' })
  }

  return Effect.gen(function* () {
    const parsed = yield* Effect.try({
      try: () => YAML.load(frontmatterStr),
      catch: (error) => new YamlParseError({ valueStr: frontmatterStr, cause: error }),
    })

    // Filter out null values to convert them to undefined implicitly
    const entries = Object.entries(parsed ?? {})
      .filter(([, v]) => v !== null)
      .map(([k, v]) => [k, v === null ? undefined : v] as const)

    const frontmatter = yield* Schema.decodeUnknown(Frontmatter)(Object.fromEntries(entries))

    return {
      frontmatter,
      content: mainContent ?? '',
    }
  })
}
