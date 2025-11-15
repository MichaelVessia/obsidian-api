# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

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

**Formatting:**

```bash
bun run format-fix
```

**Type checking:**

```bash
bun run typecheck
```

**Full verification (typecheck + lint + format + tests):**

```bash
bun run check
```

**IMPORTANT:** Always run `bun run check` after making changes to ensure everything passes before claiming completion.

**Test coverage:**

```bash
bun run coverage
```

## Architecture

### Core Stack

- **Runtime**: Bun with TypeScript
- **HTTP Framework**: Effect Platform with structured HttpApi
- **Testing**: Bun test runner
- **Package Manager**: Bun
- **Linting/Formatting**: Biome

### HTTP API Structure

The server uses Effect Platform's HttpApi system with a layered architecture:

1. **API Definition Layer**: Groups and endpoints are defined using `HttpApiGroup` and `HttpApiEndpoint`
2. **Implementation Layer**: Handlers are implemented using `HttpApiBuilder.group`
3. **Service Layer**: The complete API is assembled with `HttpApiBuilder.api`
4. **Server Layer**: HTTP server with middleware (CORS, logging, Swagger) using `HttpApiBuilder.serve`

### Key Components

- **main.ts**: Entry point that launches the API server
- **api/server.ts**: Complete API server setup with middleware and handlers
- **vault/api.ts**: Vault API group definitions with endpoints
- **vault/service.ts**: Vault service implementation
- **config/vault.ts**: Vault configuration management
- **Swagger Documentation**: Auto-generated at `/docs` endpoint

### Current API Endpoints

The `Vault` group provides these endpoints:
- `GET /vault-files/{filename}` - Get file content
- `GET /vault/files` - List all files
- `POST /vault/reload` - Reload vault index
- `GET /vault/metrics` - Get vault statistics
- `GET /vault/search/simple/{query}` - Simple text search

### Project Structure Patterns

- Tests are colocated with source files (e.g., `src/vault/service.test.ts` next to `src/vault/service.ts`)
- TypeScript configuration uses project references with separate configs for src and test
- Biome configuration for linting and formatting
- Build system supports both ESM and CJS outputs with proper module annotations

### Effect-TS Patterns

- Use `Effect.succeed()` for synchronous operations
- Layer composition with `Layer.provide()` for dependency injection
- Schema validation with `Schema.String` and parameter definitions
- Handler functions receive context objects with `params` for path parameters
- Service layer pattern with `VaultService` interface

### Testing Patterns

#### Unit Testing with Mocks

Services and configs export test layers for unit testing without real dependencies:

- **VaultConfigTest(vaultPath)**: Mock vault config
- **VaultServiceTest(fn)**: Mock vault service

Example usage:

```typescript
it("should work with mocks", () =>
  Effect.gen(function* () {
    const service = yield* VaultService;
    const files = yield* service.getAllFiles();
    expect(files.size).toBe(1);
  }).pipe(
    Effect.provide(
      VaultServiceTest(() => Effect.succeed(new Map([["test.md", "content"]])))
    )
  ));
```

### Development Notes

- Server runs on port 3000 by default
- Uses Bun runtime directly in main.ts
- Tests require `setupTests.ts` to be loaded
- Uses Biome for code quality (linting + formatting)
- Package manager is Bun (not pnpm)
