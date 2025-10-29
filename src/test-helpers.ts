import { Effect } from "effect";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Creates a temporary test vault with sample files
 */
export const createTestVault = Effect.gen(function* () {
  const tempDir = yield* Effect.promise(() =>
    fs.promises.mkdtemp(path.join(os.tmpdir(), "vault-test-")),
  );

  yield* Effect.promise(() =>
    fs.promises.writeFile(
      path.join(tempDir, "test-note.md"),
      "# Test Note\n\nThis is a test note with some content.\n\n## Section\n\nMore content here.",
    ),
  );

  yield* Effect.promise(() =>
    fs.promises.writeFile(
      path.join(tempDir, "another.md"),
      "# Another Note\n\nDifferent content.",
    ),
  );

  const subDir = path.join(tempDir, "subfolder");
  yield* Effect.promise(() => fs.promises.mkdir(subDir));
  yield* Effect.promise(() =>
    fs.promises.writeFile(
      path.join(subDir, "nested-note.md"),
      "# Nested Note\n\nThis is nested in a subfolder.",
    ),
  );

  return tempDir;
});

/**
 * Cleanup a test vault directory
 */
export const cleanupTestVault = (vaultPath: string) =>
  Effect.promise(() =>
    fs.promises.rm(vaultPath, { recursive: true, force: true }),
  );

/**
 * Provides a scoped test vault that is automatically cleaned up
 * Uses Effect.acquireUseRelease for safe resource management
 */
export const withTestVault = <A, E, R>(
  use: (vaultPath: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(
    createTestVault,
    use,
    cleanupTestVault,
  );
