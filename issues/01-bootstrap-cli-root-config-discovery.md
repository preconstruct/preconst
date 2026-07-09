# Bootstrap the CLI around root config and package discovery

## What to build

Create the first runnable `preconst` CLI path around `preconst check`. It should load the root package configuration, validate the required root package discovery settings, discover managed packages from the configured package globs, and report read-only validation errors without writing project files.

This slice should establish the command surface and shared discovery model that later `fix`, `clean`, and `dev` behavior can reuse.

## Acceptance criteria

- [ ] `preconst check` can be executed from a Node ESM TypeScript package and exits successfully for a valid root config with at least one discovered managed package.
- [ ] The root `preconst.packages` field is required, must be a string array, and is not inferred by any command.
- [ ] Package discovery appends `package.json` to each configured package glob, ignores directories without a package manifest, allows empty individual globs, supports `packages: ["."]`, and errors when zero packages are discovered overall.
- [ ] Every discovered package is treated as managed, including private packages, and validation commands require each managed package to have a string `name`.
- [ ] Unknown commands and unsupported v1 commands such as `init`, watch mode, dry-run, and diff mode are rejected clearly.
- [ ] Automated tests cover root config validation, package discovery edge cases, and the basic CLI exit-code contract.

## Blocked by

None - can start immediately
