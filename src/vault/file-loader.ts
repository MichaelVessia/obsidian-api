import { FileSystem, Path } from '@effect/platform'
import { Effect } from 'effect'
import { VaultConfig } from '../config/vault.js'
import type { VaultFile } from './domain.js'
import { DirectoryReadError, FileReadError, FrontmatterParseError } from './domain.js'
import { parseFrontmatter } from './frontmatter.functions.js'

export class FileLoader extends Effect.Service<FileLoader>()('FileLoader', {
  scoped: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const config = yield* VaultConfig

    // Load a single file with proper error handling
    const loadFile = (
      filePath: string,
    ): Effect.Effect<readonly [string, VaultFile], FileReadError | FrontmatterParseError> =>
      Effect.gen(function* () {
        const relativePath = path.relative(config.vaultPath, filePath)

        // Read file content
        const content = yield* fs.readFileString(filePath).pipe(
          Effect.mapError(
            (error) =>
              new FileReadError({
                filePath,
                cause: error,
              }),
          ),
        )

        // Parse frontmatter with fallback to empty on error
        const parsed = yield* parseFrontmatter(content).pipe(
          Effect.mapError(
            (error) =>
              new FrontmatterParseError({
                filePath,
                cause: error,
              }),
          ),
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(`Failed to parse frontmatter: ${filePath}`, error)
              return { frontmatter: {}, content }
            }),
          ),
        )

        // Calculate metrics
        const bytes = new TextEncoder().encode(parsed.content).length
        const lines = parsed.content.split('\n').length

        const vaultFile = {
          path: filePath,
          content: parsed.content,
          frontmatter: parsed.frontmatter,
          bytes,
          lines,
        }

        return [relativePath, vaultFile] as const
      })

    // Load all files from vault
    const loadAllFiles = Effect.gen(function* () {
      const walkDirectory = Effect.fn('vault.walkDirectory', {
        attributes: { dirPath: (dirPath: string) => dirPath },
      })(
        (dirPath: string): Effect.Effect<Array<string>, DirectoryReadError> =>
          Effect.gen(function* () {
            const entries = yield* fs.readDirectory(dirPath).pipe(
              Effect.mapError(
                (error) =>
                  new DirectoryReadError({
                    dirPath,
                    cause: error,
                  }),
              ),
            )
            const results = yield* Effect.forEach(
              entries,
              (entry) =>
                Effect.gen(function* () {
                  // Skip hidden directories (starting with .) before stat call
                  if (entry.startsWith('.')) {
                    return [] as string[]
                  }

                  const fullPath = path.join(dirPath, entry)
                  const stat = yield* fs.stat(fullPath).pipe(
                    Effect.mapError(
                      (error) =>
                        new DirectoryReadError({
                          dirPath: fullPath,
                          cause: error,
                        }),
                    ),
                  )

                  if (stat.type === 'Directory') {
                    return yield* walkDirectory(fullPath).pipe(
                      Effect.catchAll((error) =>
                        Effect.gen(function* () {
                          yield* Effect.logWarning(`Failed to walk subdirectory: ${fullPath}`, error)
                          return [] as string[]
                        }),
                      ),
                    )
                  } else if (stat.type === 'File' && entry.endsWith('.md')) {
                    return [fullPath]
                  }
                  return [] as string[]
                }),
              { concurrency: 'unbounded' },
            )

            return results.flat()
          }),
      )

      const files = yield* walkDirectory(config.vaultPath).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(`Failed to walk vault directory: ${config.vaultPath}`, error)
            return [] as string[]
          }),
        ),
      )

      const fileContents = yield* Effect.forEach(
        files,
        (filePath) =>
          loadFile(filePath).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* Effect.logWarning(`Failed to load file: ${filePath}`, error)
                return [
                  path.relative(config.vaultPath, filePath),
                  {
                    path: filePath,
                    content: '',
                    frontmatter: {},
                    bytes: 0,
                    lines: 0,
                  },
                ] as const
              }),
            ),
          ),
        { concurrency: 'unbounded' },
      )

      return new Map(fileContents)
    })

    return { loadFile, loadAllFiles }
  }),
}) {}
