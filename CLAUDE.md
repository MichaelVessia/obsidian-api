# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian API server built with Effect-TS and Bun. It provides a local HTTP API for interacting with Obsidian vaults, featuring a structured API design with Swagger documentation.

## Development Commands

**Running the development server:**

```bash
bun run dev
```

**Building the project:**

```bash
bun run build
```

**Running tests:**

```bash
bun run test
```

**Running a specific test:**

```bash
bun run test -- test/SpecificFile.test.ts
```

**Linting:**

```bash
bun run lint
```

**Lint fixes:**

```bash
bun run lint-fix
```

**Type checking:**

```bash
bun run check
```

**Test coverage:**

```bash
bun run coverage
```

## Architecture

### Core Stack

- **Runtime**: Bun with TypeScript
- **HTTP Framework**: Effect Platform with structured HttpApi
- **Testing**: Vitest with @effect/vitest
- **Package Manager**: pnpm

### HTTP API Structure

The server uses Effect Platform's HttpApi system with a layered architecture:

1. **API Definition Layer**: Groups and endpoints are defined using `HttpApiGroup` and `HttpApiEndpoint`
2. **Implementation Layer**: Handlers are implemented using `HttpApiBuilder.group`
3. **Service Layer**: The complete API is assembled with `HttpApiBuilder.api`
4. **Server Layer**: HTTP server with middleware (CORS, logging, Swagger) using `HttpApiBuilder.serve`

### Key Components

- **main.ts**: Entry point containing complete API definition and server setup
- **API Groups**: Currently has `search` and `vaultFiles` groups for organizing endpoints
- **Swagger Documentation**: Auto-generated at `/docs` endpoint
- **Middleware**: CORS and logging enabled by default

### Project Structure Patterns

- Tests are colocated with source files (e.g., `src/search/service.test.ts` next to `src/search/service.ts`)
- Tests use `@effect/vitest` and follow the pattern in `test/Dummy.test.ts`
- TypeScript configuration uses project references with separate configs for src and test
- ESLint configuration includes Effect-specific rules and formatting via dprint
- Build system supports both ESM and CJS outputs with proper module annotations

### Effect-TS Patterns

- Use `Effect.succeed()` for synchronous operations
- Layer composition with `Layer.provide()` for dependency injection
- Schema validation with `Schema.String` and parameter definitions
- Handler functions receive context objects with `params` for path parameters

### Testing Patterns

#### Unit Testing with Mocks

All services and configs export test layers for unit testing without real dependencies:

- **VaultConfigTest(vaultPath)**: Mock vault config
- **SearchServiceTest(fn)**: Mock search service
- **VaultFilesServiceTest(fn)**: Mock vault files service

Example usage:

```typescript
it("should work with mocks", () =>
  Effect.gen(function* () {
    const service = yield* SearchService;
    const results = yield* service.simpleSearch("test");
    expect(results).toHaveLength(1);
  }).pipe(
    Effect.provide(
      SearchServiceTest(() => Effect.succeed([{ filePath: "test.md", lineNumber: 1, context: "text" }]))
    )
  ));
```

Combine multiple mocks with `Layer.mergeAll()`:

```typescript
Effect.provide(
  Layer.mergeAll(
    SearchServiceTest(...),
    VaultFilesServiceTest(...)
  )
)
```

See `src/example-integration.test.ts` for full examples.

### Development Notes

- Server runs on port 3000 by default
- Uses Bun runtime directly in main.ts instead of separate server utilities
- Package aliases are configured for `@template/basic` (maps to src) and `@template/basic/test`
- Tests require `setupTests.ts` to be loaded
