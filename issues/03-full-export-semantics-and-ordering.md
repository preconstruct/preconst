# Support full export semantics and deterministic merge ordering

## What to build

Expand managed export handling to match the full v1 export model. `preconst check` and `preconst fix` should support conditional export objects, Node-style wildcard export patterns, `null` entries, `extraExports` override behavior, and deterministic export key ordering.

This slice should make the final generated `package.json#exports` behavior complete while keeping managed TypeScript source exports and lightly validated extra exports as separate concepts.

## Acceptance criteria

- [ ] Managed exports accept string TypeScript leaves, conditional export objects, wildcard export patterns following Node semantics, and `null`, while rejecting arrays in `preconst.exports`.
- [ ] Top-level managed export keys must be legal Node export keys: `"."` or keys starting with `"./"`.
- [ ] Wildcard managed source exports are transformed from `./src/*.ts` or `./src/*.tsx` patterns to matching `./dist/*.js` patterns and may match zero source files.
- [ ] `null` managed exports are preserved in generated exports.
- [ ] `preconst.extraExports` supports string, object, array, and null values, is lightly validated as package export data, and is copied as a top-level override layer without managed source transformation.
- [ ] Generated export merge order is deterministic: preserve `preconst.exports` top-level order, append default `./package.json` when needed, append new `extraExports` keys in user order, keep overridden keys in their existing position, and preserve condition object order.
- [ ] The default `./package.json` export is added when absent and is suppressed when `preconst.exports["./package.json"]` is `null`.
- [ ] Automated tests cover conditional objects, wildcards, nulls, extra export overrides, default package manifest export behavior, and ordering stability.

## Blocked by

- ignored/issues/02-basic-managed-package-exports.md
