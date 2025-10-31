import { FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { Effect, Layer, Ref } from "effect";
import { watch } from "node:fs";
import type { SearchResult } from "../search/schema.js";
import { VaultConfig } from "../config/vault.js";

const log = (message: string) => Effect.sync(() => console.log(`[VaultCache] ${message}`));

const DEBOUNCE_MS = 100;

const walkDirectory = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dirPath: string,
  ignorePatterns: string[] = [".obsidian"],
): Effect.Effect<Array<string>> =>
  Effect.gen(function* () {
    const entries = yield* fs.readDirectory(dirPath);
    const files: Array<string> = [];

    for (const entry of entries) {
      // Skip ignored directories
      if (ignorePatterns.some((pattern) => entry.includes(pattern))) {
        continue;
      }

      const fullPath = path.join(dirPath, entry);
      const stat = yield* fs.stat(fullPath);

      if (stat.type === "Directory") {
        const subFiles = yield* walkDirectory(fs, path, fullPath, ignorePatterns);
        files.push(...subFiles);
      } else if (stat.type === "File" && entry.endsWith(".md")) {
        files.push(fullPath);
      }
    }

    return files;
  }).pipe(Effect.catchAll(() => Effect.succeed([])));

const loadFileContent = (
  fs: FileSystem.FileSystem,
  filePath: string,
): Effect.Effect<string> =>
  fs
    .readFileString(filePath)
    .pipe(Effect.catchAll(() => Effect.succeed("")));

const loadAllFiles = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  vaultPath: string,
): Effect.Effect<Map<string, string>> =>
  Effect.gen(function* () {
    const files = yield* walkDirectory(fs, path, vaultPath);
    const cache = new Map<string, string>();

    for (const filePath of files) {
      const relativePath = path.relative(vaultPath, filePath);
      const content = yield* loadFileContent(fs, filePath);
      cache.set(relativePath, content);
    }

    return cache;
  });

const searchInContent = (
  content: string,
  query: string,
  filePath: string,
): Array<SearchResult> => {
  const lines = content.split("\n");
  const results: Array<SearchResult> = [];
  const lowerQuery = query.toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    if (lowerLine.includes(lowerQuery)) {
      const matchIndex = lowerLine.indexOf(lowerQuery);
      const start = Math.max(0, matchIndex - 100);
      const end = Math.min(line.length, matchIndex + query.length + 100);
      const context = line.slice(start, end);

      results.push({
        filePath,
        lineNumber: i + 1,
        context,
      });
    }
  }

  return results;
};

export class VaultCache extends Effect.Service<VaultCache>()("VaultCache", {
  scoped: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const config = yield* VaultConfig;

    // Initialize cache
    const initialCache = yield* loadAllFiles(fs, path, config.vaultPath);
    const cacheRef = yield* Ref.make(initialCache);
    yield* log(`Cache initialized with ${initialCache.size} files from ${config.vaultPath}`);

    // Track pending updates to debounce rapid changes
    const pendingUpdates = new Map<string, NodeJS.Timeout>();

    const updateFile = (filePath: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const exists = yield* fs.exists(filePath);

        if (exists) {
          const stat = yield* fs.stat(filePath);
          if (stat.type === "File" && filePath.endsWith(".md")) {
            const content = yield* loadFileContent(fs, filePath);
            const relativePath = path.relative(config.vaultPath, filePath);
            yield* Ref.update(cacheRef, (cache) => {
              const newCache = new Map(cache);
              newCache.set(relativePath, content);
              return newCache;
            });
            yield* log(`File updated: ${relativePath}`);
          }
        } else {
          // File deleted
          const relativePath = path.relative(config.vaultPath, filePath);
          yield* Ref.update(cacheRef, (cache) => {
            const newCache = new Map(cache);
            newCache.delete(relativePath);
            return newCache;
          });
          yield* log(`File deleted: ${relativePath}`);
        }
      }).pipe(Effect.catchAll(() => Effect.void));

    const scheduleUpdate = (filename: string | null): void => {
      if (!filename) return;

      const fullPath = path.join(config.vaultPath, filename);

      // Clear existing timeout for this file
      const existing = pendingUpdates.get(fullPath);
      if (existing) {
        clearTimeout(existing);
      }

      // Schedule debounced update
      const timeout = setTimeout(() => {
        pendingUpdates.delete(fullPath);
        Effect.runPromise(updateFile(fullPath));
      }, DEBOUNCE_MS);

      pendingUpdates.set(fullPath, timeout);
    };

    // Set up file watcher
    const watcher = watch(
      config.vaultPath,
      { recursive: true },
      (_eventType, filename) => {
        scheduleUpdate(filename);
      },
    );
    yield* log(`File watcher started on ${config.vaultPath}`);

    // Cleanup watcher on scope release
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        watcher.close();
        // Clear any pending timeouts
        for (const timeout of pendingUpdates.values()) {
          clearTimeout(timeout);
        }
        pendingUpdates.clear();
      }),
    );

    return {
      getFile: (relativePath: string) =>
        Effect.gen(function* () {
          const cache = yield* Ref.get(cacheRef);
          return cache.get(relativePath);
        }),

      getAllFiles: () =>
        Effect.gen(function* () {
          const cache = yield* Ref.get(cacheRef);
          return new Map(cache);
        }),

      searchInFiles: (query: string) =>
        Effect.gen(function* () {
          if (!query || query.trim() === "") {
            return [];
          }

          const cache = yield* Ref.get(cacheRef);
          const results: Array<SearchResult> = [];

          for (const [filePath, content] of cache.entries()) {
            const fileResults = searchInContent(content, query, filePath);
            results.push(...fileResults);
          }

          return results;
        }),

      reload: () =>
        Effect.gen(function* () {
          const newCache = yield* loadAllFiles(fs, path, config.vaultPath);
          yield* Ref.set(cacheRef, newCache);
          yield* log(`Cache manually reloaded with ${newCache.size} files`);
        }),
    };
  }),
  dependencies: [BunContext.layer],
}) {}

export const VaultCacheTest = (cache: Map<string, string>) =>
  Layer.succeed(
    VaultCache,
    VaultCache.make({
      getFile: (relativePath: string) => Effect.succeed(cache.get(relativePath)),
      getAllFiles: () => Effect.succeed(new Map(cache)),
      searchInFiles: (query: string) => {
        if (!query || query.trim() === "") {
          return Effect.succeed([]);
        }
        const results: Array<SearchResult> = [];
        for (const [filePath, content] of cache.entries()) {
          results.push(...searchInContent(content, query, filePath));
        }
        return Effect.succeed(results);
      },
      reload: () => Effect.void,
    }),
  );
