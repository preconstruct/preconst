# Check and fix basic managed package exports

## What to build

Add the first end-to-end managed package repair path for package manifest fields and simple source exports. `preconst check` should detect drift, and `preconst fix` should deterministically write managed `package.json` fields for the common root entrypoint flow while preserving package-level `preconst.exports` shorthand exactly as authored.

This slice should cover simple string TypeScript leaves, generated package `exports`, required ESM package shape, legacy field removal, and the package `files` rule.

## Acceptance criteria

- [ ] `preconst.exports` is required for managed packages during `check`; when missing, `fix` adds a root entrypoint using `./src/index.tsx` if present, otherwise `./src/index.ts` if present, otherwise `./src/index.ts`.
- [ ] `preconst.exports` shorthand string form is accepted and preserved by `fix` without normalizing it to object form.
- [ ] Simple managed source leaves under `./src/` ending in `.ts` or `.tsx` are transformed into matching `./dist/*.js` export targets.
- [ ] Managed source leaves are validated by path shape under `./src/` with a `.ts` or `.tsx` extension, and invalid managed source leaves are reported by `check`.
- [ ] Managed packages must have `type: "module"` and generated object-form `package.json#exports`; `fix` writes those managed fields deterministically.
- [ ] Legacy manifest fields `main`, `module`, `types`, and `typesVersions` are errors in `check` and are removed by `fix`.
- [ ] If `files` exists, `check` requires it to include `dist` or `dist/**`, and `fix` may add `dist`.
- [ ] Automated tests cover valid simple exports, missing entrypoint config repair, shorthand preservation, forbidden legacy fields, and deterministic manifest output.

## Blocked by

- ignored/issues/01-bootstrap-cli-root-config-discovery.md
