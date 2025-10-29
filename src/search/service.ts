import { FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { Effect } from "effect";
import { VaultConfig } from "../config/vault.js";
import type { SearchResult } from "./schema.js";

const searchInFile = (
  fs: FileSystem.FileSystem,
  filePath: string,
  query: string,
  relativePath: string,
): Effect.Effect<Array<SearchResult>> =>
  Effect.gen(function* () {
    const content = yield* fs.readFileString(filePath);
    const lines = content.split("\n");
    const results: Array<SearchResult> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lowerLine = line.toLowerCase();
      const lowerQuery = query.toLowerCase();

      if (lowerLine.includes(lowerQuery)) {
        const matchIndex = lowerLine.indexOf(lowerQuery);
        const start = Math.max(0, matchIndex - 100);
        const end = Math.min(line.length, matchIndex + query.length + 100);
        const context = line.slice(start, end);

        results.push({
          filePath: relativePath,
          lineNumber: i + 1,
          context,
        });
      }
    }

    return results;
  }).pipe(Effect.catchAll(() => Effect.succeed([])));

const walkDirectory = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dirPath: string,
): Effect.Effect<Array<string>> =>
  Effect.gen(function* () {
    const entries = yield* fs.readDirectory(dirPath);
    const files: Array<string> = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);

      const stat = yield* fs.stat(fullPath);

      if (stat.type === "Directory") {
        const subFiles = yield* walkDirectory(fs, path, fullPath);
        for (const subFile of subFiles) {
          files.push(subFile);
        }
      } else if (stat.type === "File" && entry.endsWith(".md")) {
        files.push(fullPath);
      }
    }

    return files;
  }).pipe(Effect.catchAll(() => Effect.succeed([])));

export class SearchService extends Effect.Service<SearchService>()(
  "SearchService",
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      return {
        simpleSearch: (query: string) =>
          Effect.gen(function* () {
            if (!query || query.trim() === "") {
              return [];
            }

            const config = yield* VaultConfig;
            const files = yield* walkDirectory(fs, path, config.vaultPath);
            const allResults: Array<SearchResult> = [];

            for (const filePath of files) {
              const relativePath = path.relative(config.vaultPath, filePath);
              const fileResults = yield* searchInFile(
                fs,
                filePath,
                query,
                relativePath,
              );
              for (const result of fileResults) {
                allResults.push(result);
              }
            }

            return allResults;
          }),
      };
    }),
    dependencies: [BunContext.layer],
  },
) {}
