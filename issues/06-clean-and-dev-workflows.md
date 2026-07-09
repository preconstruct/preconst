# Implement clean and dev workflows

## What to build

Add the operational `preconst clean` and `preconst dev` commands. `clean` should discover managed packages and remove only their `dist` directories. `dev` should run the full read-only check, perform the same cleaning behavior, and recreate `dist/*.js` symlinks to configured source entrypoints from managed exports.

This slice should not add build, watch, dependency-linking, typecheck, source linting, or runtime-profile behavior.

## Acceptance criteria

- [ ] `preconst clean` discovers managed packages and deletes only each managed package's `dist` directory.
- [ ] `preconst clean` does not run the full `check`.
- [ ] `preconst dev` runs the full `check` before making changes and stops without cleaning or symlinking if check fails.
- [ ] `preconst dev` performs the same cleaning behavior as `clean`.
- [ ] `preconst dev` creates `dist/*.js` symlinks to configured source entrypoints from `preconst.exports` only.
- [ ] `preconst dev` ignores `preconst.extraExports` for symlink creation.
- [ ] Wildcard managed exports are expanded for symlink creation and handled deterministically where the implementation naturally needs ordering.
- [ ] `preconst dev` does not create `node_modules` symlinks and does not attempt to manage runtime profile concerns such as native TypeScript, bundlers, JSX handling, or erasable syntax.
- [ ] Automated tests cover clean deletion boundaries, dev check-before-write behavior, simple symlink creation, wildcard symlink expansion, and extra export ignoring.

## Blocked by

- ignored/issues/01-bootstrap-cli-root-config-discovery.md
- ignored/issues/03-full-export-semantics-and-ordering.md
