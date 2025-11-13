# Resources Directory

This directory contains external resources for reference purposes.

## Effect-TS Subtree

The `resources/effect` directory contains a git subtree of the [Effect-TS](https://github.com/Effect-TS/effect) repository. This provides complete access to the Effect-TS source code for reference when working with the library.

### Updating the Subtree

To update the Effect-TS subtree to the latest version:

```bash
# Fetch the latest changes from the Effect-TS repository
git fetch effect

# Pull the latest changes into the subtree
git subtree pull --prefix=resources/effect effect main --squash
```

### Updating to a Specific Version

To update to a specific commit or tag:

```bash
# Fetch the latest changes first
git fetch effect

# Pull a specific commit or tag
git subtree pull --prefix=resources/effect effect <commit-or-tag> --squash
```

### Git Remotes

The `effect` remote is configured to point to `git@github.com:Effect-TS/effect.git` and is kept for easy updates. You can view all remotes with:

```bash
git remote -v
```

### Purpose

This subtree is intended for:
- Reference when working with Effect-TS APIs
- Understanding library internals
- Providing context for LLMs working on this project
- Offline access to documentation and examples

The subtree is added with `--squash` to keep the commit history clean while still allowing easy updates.
