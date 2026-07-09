# Generate and validate configured tsconfig files

## What to build

Add `check` and `fix` support for root build, base, and package tsconfig files. The implementation should read tsconfigs as JSONC, write managed tsconfigs as deterministic plain JSON, respect configured filenames, and enforce the owned compiler and project-reference settings defined by the spec.

This slice should establish tsconfig path resolution and ownership behavior without yet deriving package references from dependencies.

## Acceptance criteria

- [ ] Root `preconst.tsconfig` keys are optional and default to the spec's base, build, and package config filenames.
- [ ] Configured root build path must be a root-relative local path inside the project.
- [ ] Configured package tsconfig path must be package-relative, local to each package, and must not escape the package directory.
- [ ] Configured base may be either a root-relative local path inside the project or a package-based specifier.
- [ ] The root build tsconfig is exact-owned and contains only `files: []` and package references to discovered package tsconfig files.
- [ ] Package tsconfigs enforce direct or indirect extension of the configured base, `composite: true`, `rootDir: "src"`, `outDir: "dist"`, `include: ["src"]`, and owned `references`.
- [ ] `tsBuildInfoFile` is neither generated nor enforced.
- [ ] When creating the default local base tsconfig, `fix` writes the required strict declaration NodeNext/source-import compiler options from the spec.
- [ ] When a configured local editable base exists, `fix` adds missing required NodeNext/source-import options but does not add `strict` or `declaration`.
- [ ] When the configured base is package-based, `check` requires the required NodeNext/source-import options and `fix` does not attempt to repair it.
- [ ] Automated tests cover default and custom tsconfig paths, local and package-based base resolution, JSONC reading, deterministic JSON writing, and ownership enforcement.

## Blocked by

- ignored/issues/01-bootstrap-cli-root-config-discovery.md
