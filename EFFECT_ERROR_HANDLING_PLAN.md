# Effect-Idiomatic Error Handling Plan

## Overview
Make error handling in `src/vault/service.ts` more Effect-idiomatic by replacing silent failures with explicit logging and proper fallback behavior, plus introducing Option for type-safe optional values.

## Current Problems
1. **Silent failures** with `catchAll(() => Effect.succeed(...))` 
2. **No Option usage** for potentially absent values
3. **Poor error visibility** - errors are swallowed without logging
4. **Inconsistent error handling** patterns

## Tasks

### High Priority

#### 1. ✅ Replace catchAll with Effect.matchEffect in file reading operations
**Location:** Lines 58, 114
**Current:** `fs.readFileString(filePath).pipe(Effect.catchAll(() => Effect.succeed('')))`
**Improvement:** Use `Effect.matchEffect` to log read errors before returning empty string fallback
**Status:** COMPLETED - Used Effect.catchAll with logging via Effect.logWarning and Effect.as('')

#### 2. ✅ Replace catchAll with Effect.matchEffect in frontmatter parsing  
**Location:** Lines 59-60, 115-116
**Current:** `parseFrontmatter(content).pipe(Effect.catchAll(() => Effect.succeed({ frontmatter: {}, content })))`
**Improvement:** Use `Effect.matchEffect` to log parsing errors before returning fallback object
**Status:** COMPLETED - Used Effect.matchEffect with logging via Effect.logWarning and Effect.as({ frontmatter: {}, content })

#### 3. ✅ Replace catchAll with Effect.matchEffect in directory walking
**Location:** Line 47
**Current:** `Effect.catchAll(() => Effect.succeed([]))`
**Improvement:** Use `Effect.matchEffect` to log directory walk errors before returning empty array
**Status:** COMPLETED - Used Effect.matchEffect with logging via Effect.logWarning and Effect.as([])

#### 4. ✅ Run tests to ensure all changes work correctly
Verify that the refactored error handling doesn't break existing functionality.
**Status:** COMPLETED - All 80 tests pass

#### 5. ✅ Run bun run check for full verification
Ensure typecheck, lint, format, and tests all pass after changes.
**Status:** COMPLETED - Typecheck, lint, format, and tests all pass

### Medium Priority

#### 6. Convert getFile method to use Option.fromNullable
**Location:** Lines 212-217
**Current:** Returns `vaultFile?.content` (potentially undefined)
**Improvement:** Use `Option.fromNullable(cache.get(relativePath))` and map to content for type-safe optional handling

#### 7. Replace catchAll with Effect.matchEffect in updateFile error handling
**Location:** Line 164
**Current:** `Effect.catchAll(() => Effect.void)`
**Improvement:** Use `Effect.matchEffect` to log update errors before returning void

#### 8. Update VaultServiceTest to match new error handling patterns
**Location:** VaultServiceTest function
**Improvement:** Update test implementations to use Option and match new error handling patterns

## Idiomatic Patterns to Apply

### Effect.matchEffect for Error Handling
```typescript
// Instead of:
Effect.catchAll(() => Effect.succeed(fallback))

// Use:
Effect.matchEffect(operation, {
  onFailure: (error) => Effect.tap(
    Effect.logWarning(`Operation failed: ${context}`, error),
    () => Effect.succeed(fallback)
  ),
  onSuccess: Effect.succeed
})
```

### Option for Optional Values
```typescript
// Instead of:
const vaultFile = cache.get(relativePath)
return vaultFile?.content

// Use:
return Option.fromNullable(cache.get(relativePath)).pipe(
  Option.map((vaultFile) => vaultFile.content)
)
```

## Expected Benefits
1. **Better error visibility** - errors are logged before fallbacks
2. **Type safety** - Option provides compile-time safety for optional values
3. **Consistent patterns** - uniform error handling across the service
4. **Improved debugging** - structured logging for troubleshooting
5. **Effect idiomatic** - follows established Effect-TS patterns

## Verification
- All existing functionality preserved
- Tests pass without modification (except where Option changes return types)
- Full `bun run check` passes
- Error logs appear in console when issues occur