# Derive package project references from managed dependencies

## What to build

Derive the TypeScript project-reference graph from discovered managed package dependencies. Root build references should include every discovered managed package, and package references should be generated from dependency relationships among managed packages with the cycle policy described in the spec.

This slice should make the build graph coherent and fully owned by `preconst`, with no support for manual references.

## Acceptance criteria

- [ ] Root build references include every discovered managed package and point directly to each package tsconfig file rather than package directories.
- [ ] Package references are derived from managed workspace dependencies listed in `dependencies`, `peerDependencies`, `optionalDependencies`, and `devDependencies`.
- [ ] Dependencies that are not discovered managed packages are ignored for reference generation.
- [ ] Self-dependencies are ignored.
- [ ] User/manual package references are unsupported; `check` reports drift and `fix` replaces references with the derived set.
- [ ] Dev-only edges are edges introduced only by `devDependencies`.
- [ ] Dev-only edges participating in cycles are silently omitted.
- [ ] Cycles that remain through non-dev-only edges are reported as errors.
- [ ] Automated tests cover normal dependency references, non-managed dependency ignoring, self-dependency ignoring, dev-only cycle omission, and non-dev cycle errors.

## Blocked by

- ignored/issues/04-tsconfig-generation-validation.md
