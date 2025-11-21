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
    const loadFile = Effect.fn('vault.loadFile')(
      (filePath: string): Effect.Effect<readonly [string, VaultFile], FileReadError | FrontmatterParseError> =>
        Effect.gen(function* () {
          const relativePath = path.relative(config.vaultPath, filePath)
          yield* Effect.annotateCurrentSpan('filePath', filePath)
          yield* Effect.annotateCurrentSpan('relativePath', relativePath)

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

          // Parse frontmatter - propagate any errors
          const parsed = yield* parseFrontmatter(content).pipe(
            Effect.mapError(
              (error) =>
                new FrontmatterParseError({
                  filePath,
                  cause: error,
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

          yield* Effect.annotateCurrentSpan('bytes', bytes)
          yield* Effect.annotateCurrentSpan('lines', lines)
          yield* Effect.annotateCurrentSpan(
            'hasFrontmatter',
            parsed.frontmatter ? Object.keys(parsed.frontmatter).length > 0 : false,
          )

          return [relativePath, vaultFile] as const
        }),
    )

    // Load all files from vault
    const loadAllFiles = Effect.gen(function* () {
      const walkAndLoad = Effect.fn('vault.walkAndLoad')(
        (
          dirPath: string,
        ): Effect.Effect<
          Array<readonly [string, VaultFile]>,
          DirectoryReadError | FileReadError | FrontmatterParseError
        > =>
          Effect.gen(function* () {
            yield* Effect.annotateCurrentSpan('dirPath', dirPath)

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
                    return [] as Array<readonly [string, VaultFile]>
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
                    return yield* walkAndLoad(fullPath).pipe(
                      Effect.catchAll((error) =>
                        Effect.gen(function* () {
                          yield* Effect.logWarning(`Failed to walk subdirectory: ${fullPath}`, error)
                          return [] as Array<readonly [string, VaultFile]>
                        }),
                      ),
                    )
                  } else if (stat.type === 'File' && entry.endsWith('.md')) {
                    return yield* loadFile(fullPath).pipe(
                      Effect.map((file) => [file]),
                      Effect.catchAll((error) =>
                        Effect.gen(function* () {
                          yield* Effect.logWarning(`Failed to load file: ${fullPath}`, error)
                          return [] as Array<readonly [string, VaultFile]>
                        }),
                      ),
                    )
                  }
                  return [] as Array<readonly [string, VaultFile]>
                }),
              { concurrency: 'unbounded' },
            )

            const flatResults = results.flat()
            yield* Effect.annotateCurrentSpan('fileCount', flatResults.length)
            return flatResults
          }),
      )

      const fileContents = yield* walkAndLoad(config.vaultPath).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(`Failed to walk vault directory: ${config.vaultPath}`, error)
            return [] as Array<readonly [string, VaultFile]>
          }),
        ),
      )

      return new Map(fileContents)
    })

    return { loadFile, loadAllFiles }
  }),
}) {}
