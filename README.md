# Obsidian API

Local API for interacting with an Obsidian vault.

> **Note**: This is a learning exercise project. For production use, consider using the more mature [obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin instead.

## Credits

Inspired by [obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api) by Adam Coddington.

## Configuration

The API requires a `VAULT_PATH` environment variable pointing to your Obsidian vault directory.

### Setting VAULT_PATH

**Option 1: Environment variable**

```sh
export VAULT_PATH="/path/to/your/vault"
bun run dev
```

**Option 2: .env file**
Create a `.env` file in the project root:

```
VAULT_PATH=/path/to/your/vault
```

**Option 3: Inline with command**

```sh
VAULT_PATH="/path/to/your/vault" bun run dev
```

### Path Examples

The vault path supports tilde (`~`) expansion for home directory:

```sh
# Absolute path
VAULT_PATH="/Users/username/Documents/MyVault"

# Relative to home directory
VAULT_PATH="~/Documents/MyVault"

# Windows
VAULT_PATH="C:\Users\username\Documents\MyVault"
```

## Development

Run the development server:

```sh
bun run dev
```

### Distributed Tracing with Jaeger

This project includes OpenTelemetry distributed tracing with Jaeger for monitoring and debugging API requests.

#### Starting Jaeger

**Option 1: Docker (Recommended)**

```sh
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4317:4317 \
  -p 4318:4318 \
  -p 6831:6831/udp \
  -p 6832:6832/udp \
  jaegertracing/all-in-one:latest
```

**Option 2: Docker Compose**

```sh
docker-compose up -d jaeger
```

#### Viewing Traces

Once Jaeger is running, access the web UI at:

- **Jaeger UI**: http://localhost:16686

The Jaeger UI allows you to:
- Search and filter traces by service name, operation, and duration
- View detailed trace timelines showing request flow
- Analyze performance bottlenecks
- Monitor error rates and patterns

#### Trace Data

The API automatically sends trace data to Jaeger including:
- HTTP request metadata (method, URL, status)
- Vault operations (file reads, searches, cache operations)
- Performance metrics and error information
- Custom attributes for better observability

#### Stopping Jaeger

```sh
# Stop the Docker container
docker stop jaeger
docker rm jaeger

# Or with Docker Compose
docker-compose down
```

## Operations

**Building**

```sh
bun run build
```

**Testing**

```sh
bun run test
```

**Linting & Formatting**

```sh
bun run lint        # Check code style
bun run lint-fix    # Auto-fix linting issues
bun run format      # Check formatting
bun run format-fix  # Auto-format code
```

> **Note**: This project uses Biome for linting and formatting. On NixOS, the scripts automatically fall back to using the Nix development environment.

## API Documentation

Once the server is running, you can access:

- **Swagger UI**: http://localhost:3000/docs
- **API Endpoints**: http://localhost:3000/vault/files, http://localhost:3000/vault/metrics, etc.

## Available Endpoints

- `GET /vault/files` - List all markdown files in the vault
- `GET /vault-files/{filename}` - Get content of a specific file
- `POST /vault/reload` - Reload the vault cache
- `GET /vault/metrics` - Get vault statistics
- `GET /vault/search/simple/{query}` - Search for text in files
