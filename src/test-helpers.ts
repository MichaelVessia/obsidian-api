import { Effect } from "effect"
import { FileSystem } from "@effect/platform"
import type { PlatformError } from "@effect/platform/Error"
import * as Path from "path"

/**
 * Creates a temporary test vault with sample files
 */
export const createTestVault = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem
	const tempDir = yield* fs.makeTempDirectory({ prefix: "vault-test-" })

	yield* fs.writeFileString(
		Path.join(tempDir, "test-note.md"),
		"# Test Note\n\nThis is a test note with some content.\n\n## Section\n\nMore content here."
	)

	yield* fs.writeFileString(Path.join(tempDir, "another.md"), "# Another Note\n\nDifferent content.")

	const subDir = Path.join(tempDir, "subfolder")
	yield* fs.makeDirectory(subDir)
	yield* fs.writeFileString(Path.join(subDir, "nested-note.md"), "# Nested Note\n\nThis is nested in a subfolder.")

	return tempDir
})

/**
 * Cleanup a test vault directory
 */
export const cleanupTestVault = (vaultPath: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem
		yield* fs.remove(vaultPath, { recursive: true })
	})

/**
 * Provides a scoped test vault that is automatically cleaned up
 * Uses Effect.acquireUseRelease for safe resource management
 */
export const withTestVault = <A, E, R>(
	use: (vaultPath: string) => Effect.Effect<A, E, R>
): Effect.Effect<A, E | PlatformError, R | FileSystem.FileSystem> =>
	Effect.acquireUseRelease(createTestVault, use, (vaultPath, _exit) => Effect.ignoreLogged(cleanupTestVault(vaultPath)))
