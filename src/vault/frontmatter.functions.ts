import { Schema, Effect, type ParseResult } from 'effect'
import * as YAML from 'js-yaml'
import { Frontmatter } from './domain.js'

const parseYamlValue = (valueStr: string): Effect.Effect<string | number | boolean | readonly string[] | undefined> =>
  Effect.try({
    try: () => YAML.load(valueStr) as string | number | boolean | readonly string[] | undefined,
    catch: (error) => new Error(`Failed to parse YAML value: ${valueStr}`, { cause: error }),
  }).pipe(Effect.catchAll(() => Effect.succeed(valueStr as string)))

export const parseFrontmatter = (
  content: string,
): Effect.Effect<{ frontmatter: Frontmatter; content: string }, ParseResult.ParseError> => {
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
    const lines = frontmatterStr.split('\n')
    const frontmatterEntries: Array<[string, string | number | boolean | readonly string[] | undefined]> = []

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine || trimmedLine.startsWith('#')) continue

      const colonIndex = trimmedLine.indexOf(':')
      if (colonIndex === -1) continue

      const key = trimmedLine.slice(0, colonIndex).trim()
      const valueStr = trimmedLine.slice(colonIndex + 1).trim()

      const parsedValue = yield* parseYamlValue(valueStr)
      frontmatterEntries.push([key, parsedValue])
    }

    const frontmatterRecord = Object.fromEntries(frontmatterEntries)
    const frontmatter = yield* Schema.decodeUnknown(Frontmatter)(frontmatterRecord)

    return {
      frontmatter,
      content: mainContent ?? '',
    }
  })
}
