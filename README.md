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
