# Obsidian API

Local API for interacting with an Obsidian vault.

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

**Linting**

```sh
bun run lint
```
