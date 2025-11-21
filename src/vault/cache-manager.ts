import { FileSystem, Path } from '@effect/platform'
import { Effect, Fiber, Ref, Stream } from 'effect'
import { VaultConfig } from '../config/vault.js'
import type { VaultFile } from './domain.js'
import { StatError } from './domain.js'
import { FileLoader } from './file-loader.js'

export interface CacheManagerType {
  readonly cacheRef: Ref.Ref<Map<string, VaultFile>>
  readonly debouncedUpdates: Ref.Ref<Map<string, Fiber.RuntimeFiber<void>>>
}

export class CacheManager extends Effect.Service<CacheManager>()('CacheManager', {
  scoped: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const config = yield* VaultConfig
    const fileLoader = yield* FileLoader

    // Initialize cache
    const initialCache = yield* fileLoader.loadAllFiles
    const cacheRef = yield* Ref.make(initialCache)
    yield* Effect.logInfo(`Cache initialized with ${initialCache.size} files from ${config.vaultPath}`).pipe(
      Effect.annotateLogs({
        vaultPath: config.vaultPath,
        fileCount: initialCache.size,
      }),
    )

    // Effect-managed debounced file updates
    const debouncedUpdates = yield* Ref.make(new Map<string, Fiber.RuntimeFiber<void>>())

    // Update a single file in cache
    const updateFile = (filePath: string) =>
      Effect.gen(function* () {
        const exists = yield* fs.exists(filePath)

        if (exists) {
          const statResult = yield* fs.stat(filePath).pipe(
            Effect.mapError(
              (error) =>
                new StatError({
                  filePath,
                  cause: error,
                }),
            ),
          )

          if (statResult.type === 'File' && filePath.endsWith('.md')) {
            yield* fileLoader.loadFile(filePath).pipe(
              Effect.andThen(([relativePath, vaultFile]) =>
                Effect.gen(function* () {
                  yield* Ref.update(cacheRef, (cache) => {
                    const newCache = new Map(cache)
                    newCache.set(relativePath, vaultFile)
                    return newCache
                  })
                  yield* Effect.logDebug(`File updated: ${relativePath}`).pipe(
                    Effect.annotateLogs({ filePath: relativePath }),
                  )
                }),
              ),
            )
          }
        } else {
          // File deleted
          const relativePath = path.relative(config.vaultPath, filePath)
          yield* Ref.update(cacheRef, (cache) => {
            const newCache = new Map(cache)
            newCache.delete(relativePath)
            return newCache
          })
          yield* Effect.logDebug(`File deleted: ${relativePath}`).pipe(Effect.annotateLogs({ filePath: relativePath }))
        }
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(`Cache update error`, error)
          }),
        ),
      )

    // Schedule debounced update for a file
    const scheduleUpdate = (filePath: string) =>
      Effect.gen(function* () {
        // Cancel existing update for this file
        const existing = yield* Ref.get(debouncedUpdates)
        const existingFiber = existing.get(filePath)
        if (existingFiber) {
          yield* Fiber.interrupt(existingFiber)
        }

        // Schedule new debounced update
        const fiber = yield* Effect.fork(
          Effect.sleep(config.debounceMs).pipe(
            Effect.andThen(() => updateFile(filePath)),
            Effect.ensuring(
              Ref.update(debouncedUpdates, (updates) => {
                const newUpdates = new Map(updates)
                newUpdates.delete(filePath)
                return newUpdates
              }),
            ),
          ),
        )

        yield* Ref.update(debouncedUpdates, (updates) => {
          const newUpdates = new Map(updates)
          newUpdates.set(filePath, fiber)
          return newUpdates
        })
      })

    // Set up file watcher using Effect's FileSystem API with acquireRelease
    yield* Effect.acquireRelease(
      Effect.gen(function* () {
        const fiber = yield* Effect.fork(
          fs.watch(config.vaultPath, { recursive: true }).pipe(
            Stream.runForEach((event) =>
              Effect.gen(function* () {
                if (event.path.endsWith('.md')) {
                  yield* scheduleUpdate(event.path)
                }
              }),
            ),
          ),
        )
        yield* Effect.logInfo(`File watcher started on ${config.vaultPath}`).pipe(
          Effect.annotateLogs({ vaultPath: config.vaultPath }),
        )
        return fiber
      }),
      (fiber) =>
        Effect.gen(function* () {
          yield* Fiber.interrupt(fiber)
          // Cancel all pending debounced updates
          const pending = yield* Ref.get(debouncedUpdates)
          yield* Effect.forEach(Array.from(pending.values()), (pendingFiber) => Fiber.interrupt(pendingFiber), {
            concurrency: 'unbounded',
          })
        }),
    )

    return {
      cacheRef,
      debouncedUpdates,
    } as CacheManagerType
  }),
}) {}
