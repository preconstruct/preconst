**Preconst Spec**

`preconst` is a configuration linter/fixer for Node ESM TypeScript packages. It does not bundle, typecheck, lint source files, manage dependency versions, create `node_modules` links, or run watchers. Its job is to keep `package.json#exports`, package tsconfigs, and a `tsc --build` project-reference graph coherent.

Use modern Node built-ins where possible: native argument parsing, filesystem APIs, color/style support where available, glob support where available, etc. Prefer few or no runtime dependencies.

**Commands**

`preconst check`
Read-only validation.

`preconst fix`
Writes deterministic JSON for managed `package.json` fields and preconst tsconfigs. Does not infer `preconst.packages`.

`preconst clean`
Discovers managed packages and deletes only each package’s `dist` directory. Does not run full `check`.

`preconst dev`
Runs full `check`, then performs the same cleaning as `clean`, then creates `dist/*.js` symlinks to configured source entrypoints. It does not autofix.

No `init`, no watch mode, no dry-run/diff mode for v1.

**Root Config**

Root `package.json` must contain:

```json
{
  "preconst": {
    "packages": ["packages/*"],
    "tsconfig": {
      "base": "./tsconfig.preconst.base.json",
      "build": "./tsconfig.preconst.build.json",
      "pkg": "tsconfig.preconst.pkg.json"
    }
  }
}
```

`packages` is required and must be `string[]`.

`tsconfig` and all of its keys are optional. Defaults:

```json
{
  "base": "./tsconfig.preconst.base.json",
  "build": "./tsconfig.preconst.build.json",
  "pkg": "tsconfig.preconst.pkg.json"
}
```

Discovery appends `/package.json` to each package glob. Directories without package.json are ignored. Empty globs are okay, but zero discovered packages total is an error. `packages: ["."]` discovers the root package.

**Package Config**

Every discovered package is managed, including private packages. Validation commands require every managed package to have a string `name`; `clean` only needs discovery information and does not validate package-level config.

Package-level config lives in `package.json#preconst`.

```json
{
  "preconst": {
    "exports": {
      ".": "./src/index.ts",
      "./feature": {
        "browser": "./src/feature.browser.ts",
        "default": "./src/feature.ts"
      },
      "./utils/*": "./src/utils/*.ts",
      "./private/*": null
    },
    "extraExports": {
      "./style.css": "./dist/style.css"
    }
  }
}
```

`preconst.exports` is required. If missing, `fix` adds a root entrypoint:

- `./src/index.tsx` if it exists
- else `./src/index.ts` if it exists
- else `./src/index.ts`

`preconst.exports` may also use shorthand:

```json
{
  "preconst": {
    "exports": "./src/index.ts"
  }
}
```

`fix` must preserve shorthand and must not normalize it.

**Managed Exports**

`preconst.exports` supports:

- string TS leaves
- conditional export objects
- wildcard export patterns following Node semantics
- `null`

It does not support arrays.

Every string leaf in `preconst.exports` must be a relative source path under `./src/` ending in `.ts` or `.tsx`. Non-TS leaves are banned here. Static source leaves are validated by path shape rather than filesystem existence. Wildcards may match zero files.

Transform:

```txt
./src/index.ts       -> ./dist/index.js
./src/button.tsx     -> ./dist/button.js
./src/features/*.ts  -> ./dist/features/*.js
```

Top-level export keys must be legal Node export keys: `"."` or starting with `"./"`.

`null` is preserved.

**Extra Exports**

`preconst.extraExports` is copied into final `package.json#exports` as an override layer. It supports string, object, array, and null values. It is lightly validated as package export data, but not transformed.

Final export merge order:

1. Transform `preconst.exports`.
2. If `./package.json` is absent, add `"./package.json": "./package.json"`.
3. Apply `preconst.extraExports` as top-level overrides.

If `preconst.exports["./package.json"]` is `null`, the default package.json export is suppressed.

`package.json#exports` is always generated as object form. `check` enforces deterministic export key order:

- preserve `preconst.exports` top-level order
- append default `./package.json` if needed
- append new `extraExports` keys in user order
- overridden keys keep their existing position
- condition object order is preserved

**Package.json Ownership**

For every managed package:

Required:

```json
{
  "type": "module"
}
```

Generated:

```json
{
  "exports": {}
}
```

Forbidden legacy fields:

```txt
main
module
types
typesVersions
```

`check` errors if they exist. `fix` removes them.

`files` is not generated. If `files` exists, it must include `dist` or `dist/**`; `fix` may add `dist`.

Dependency version ranges are not managed.

**Tsconfig Files**

Default filenames:

```txt
root build:  tsconfig.preconst.build.json
base:        tsconfig.preconst.base.json
package:     tsconfig.preconst.pkg.json
```

The root build tsconfig is exact-owned and must contain only:

```json
{
  "files": [],
  "references": [{ "path": "./packages/a/tsconfig.preconst.pkg.json" }]
}
```

Package references point directly to package tsconfig files, not package directories.

Package tsconfig is partially owned:

```json
{
  "extends": "../../tsconfig.preconst.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": []
}
```

Hard-enforced:

- package config extends configured base directly or indirectly
- `compilerOptions.composite = true`
- `compilerOptions.rootDir = "src"`
- `compilerOptions.outDir = "dist"`
- `include = ["src"]`
- `references` equals derived references

Do not enforce or generate `tsBuildInfoFile`.

If creating the default local base tsconfig, write:

```json
{
  "compilerOptions": {
    "strict": true,
    "declaration": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true
  }
}
```

If the configured base exists and is local/editable, `fix` adds missing required NodeNext/source-import options, but not `strict` or `declaration`.

If the configured base is package-based, it must already contain the required NodeNext/source-import options. `fix` cannot repair it.

Package configs may override base compiler options without error.

Do not import TypeScript APIs. Parse package.json as JSON, tsconfigs as JSONC for reading, and write managed tsconfigs as deterministic plain JSON.

**Tsconfig Resolution**

Support relative and package-based `extends`.

`base` may be:

- root-relative local path inside the project
- package-based specifier

`build` must be a root-relative local path inside the project.

`pkg` must be a package-relative local path inside each package and must not escape the package directory.

Only edit the configured local base path, not arbitrary intermediate configs in the extends chain.

**References**

Root build references every discovered managed package.

Package references are derived from managed workspace dependencies in:

- `dependencies`
- `peerDependencies`
- `optionalDependencies`
- `devDependencies`

Only reference dependencies that are also discovered managed packages. Ignore self-dependencies. User/manual references are not supported; references are owned.

Cycle policy:

- Build graph from all four fields.
- Dev-only edges are edges introduced only by `devDependencies`.
- Silently omit dev-only edges that participate in cycles.
- If cycles remain through non-dev-only edges, error.

**Dev Mode**

`preconst dev`:

1. Runs full `check`.
2. Deletes every managed package’s `dist`.
3. Recreates symlinks for managed TS leaves from `preconst.exports` only.

It ignores `extraExports` for symlink creation.

It does not create `node_modules` symlinks.

It does not care about runtime profile. Node native TypeScript, bundlers, JSX handling, erasable syntax, etc. are outside scope.

Wildcard matches are expanded for symlink creation and sorted deterministically where the default implementation naturally needs order. Collision behavior is not specially handled beyond the straightforward implementation.
