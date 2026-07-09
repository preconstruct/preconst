import assert from "node:assert/strict";
import { lstat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fixture, json, packageFixture, readJson, run } from "./helpers.ts";

test("fix repairs simple manifests, preserves shorthand, removes legacy fields, and is deterministic", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/a", {
    name: "a",
    preconst: {},
    main: "dist/index.js",
    files: ["README.md"],
  });

  const fixed = await run(root, "fix");
  assert.equal(fixed.exitCode, 0, fixed.stderr);
  const manifest = await readJson(path.join(root, "packages/a/package.json"));
  assert.equal(manifest.preconst.exports, "./src/index.ts");
  assert.equal(manifest.type, "module");
  assert.deepEqual(manifest.exports, {
    ".": "./dist/index.js",
    "./package.json": "./package.json",
  });
  assert.equal("main" in manifest, false);
  assert.deepEqual(manifest.files, ["README.md", "dist"]);

  const check = await run(root, "check");
  assert.equal(check.exitCode, 0, check.stderr);

  const again = await run(root, "fix");
  assert.equal(again.exitCode, 0, again.stderr);
  assert.deepEqual(await readJson(path.join(root, "packages/a/package.json")), manifest);
});

test("exports support conditions, wildcards, nulls, extra overrides, and ordering", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/a", {
    name: "a",
    preconst: {
      exports: {
        ".": {
          browser: "./src/index.browser.ts",
          default: "./src/index.ts",
        },
        "./utils/*": "./src/utils/*.ts",
        "./package.json": null,
        "./private/*": null,
      },
      extraExports: {
        "./utils/*": "./dist/overridden/*.js",
        "./style.css": "./dist/style.css",
      },
    },
    sources: ["src/index.browser.ts", "src/utils/a.ts"],
  });

  const fixed = await run(root, "fix");
  assert.equal(fixed.exitCode, 0, fixed.stderr);
  const manifest = await readJson(path.join(root, "packages/a/package.json"));
  assert.deepEqual(Object.keys(manifest.exports), [
    ".",
    "./utils/*",
    "./package.json",
    "./private/*",
    "./style.css",
  ]);
  assert.deepEqual(manifest.exports["."], {
    browser: "./dist/index.browser.js",
    default: "./dist/index.js",
  });
  assert.equal(manifest.exports["./utils/*"], "./dist/overridden/*.js");
  assert.equal(manifest.exports["./package.json"], null);
});

test("imports require explicit package ownership and validate source leaves", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/missing", {
    name: "missing",
    imports: { "#x": "./src/x.ts" },
    sources: ["src/x.ts"],
  });
  await packageFixture(root, "packages/ignored", {
    name: "ignored",
    preconst: { exports: "./src/index.ts", imports: false },
    imports: { bad: "external" },
  });
  await packageFixture(root, "packages/invalid", {
    name: "invalid",
    preconst: { exports: "./src/index.ts", imports: true },
    imports: { "#": "./src/x.ts", "#bad": "./lib/bad.js" },
  });

  const check = await run(root, "check");
  assert.equal(check.exitCode, 1);
  assert.match(check.stderr, /missing package\.json#imports requires preconst\.imports/);
  assert.match(check.stderr, /invalid import key #/);

  await packageFixture(root, "packages/valid", {
    name: "valid",
    preconst: { exports: "./src/index.ts", imports: true },
    imports: {
      "#x": "./src/x.ts",
      "#view": ["./src/view.tsx", null],
      "#env": { node: "./src/env.node.ts", default: "./src/env.ts" },
    },
    sources: ["src/x.ts", "src/view.tsx", "src/env.node.ts", "src/env.ts"],
  });
  await json(path.join(root, "packages/missing/package.json"), {
    name: "missing",
    version: "1.0.0",
    preconst: { exports: "./src/index.ts", imports: true },
    imports: { "#x": "./src/x.ts" },
  });
  await json(path.join(root, "packages/invalid/package.json"), {
    name: "invalid",
    version: "1.0.0",
    preconst: { exports: "./src/index.ts", imports: true },
    imports: { "#bad": "./src/x.ts" },
  });

  const fixed = await run(root, "fix");
  assert.equal(fixed.exitCode, 0, fixed.stderr);
  const valid = await run(root, "check");
  assert.equal(valid.exitCode, 0, valid.stderr);
});

test("exports reject paths that escape their managed directories", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/managed", {
    name: "managed",
    preconst: { exports: "./src/../../escape.ts" },
  });
  await packageFixture(root, "packages/extra", {
    name: "extra",
    preconst: {
      exports: "./src/index.ts",
      extraExports: { "./escape": "./dist/../../escape.js" },
    },
  });

  const fixed = await run(root, "fix");
  assert.equal(fixed.exitCode, 1);
  assert.match(
    fixed.stderr,
    /managed value at preconst\.exports is invalid: source paths must not contain "\.\." path segments/,
  );
  assert.match(
    fixed.stderr,
    /extra value at preconst\.extraExports\["\.\/escape"\] is invalid: export targets must not contain "\.\." path segments/,
  );

  const dev = await run(root, "dev");
  assert.equal(dev.exitCode, 1);
  await assert.rejects(lstat(path.join(root, "packages/escape.js")));
});

test("exports reject keys, sources, and targets containing multiple wildcards", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/key", {
    name: "key",
    preconst: { exports: { "./utils/**": "./src/utils/*.ts" } },
  });
  await packageFixture(root, "packages/source", {
    name: "source",
    preconst: { exports: { "./utils/*": "./src/*/*.ts" } },
  });
  await packageFixture(root, "packages/target", {
    name: "target",
    preconst: {
      exports: "./src/index.ts",
      extraExports: { "./utils/*": "./dist/*/*.js" },
    },
  });

  const fixed = await run(root, "fix");
  assert.equal(fixed.exitCode, 1);
  assert.match(
    fixed.stderr,
    /key preconst\.exports key "\.\/utils\/\*\*" is invalid: must contain at most one "\*"/,
  );
  assert.match(
    fixed.stderr,
    /source value at preconst\.exports\["\.\/utils\/\*"\] is invalid: source paths must contain at most one "\*"/,
  );
  assert.match(
    fixed.stderr,
    /target value at preconst\.extraExports\["\.\/utils\/\*"\] is invalid: export targets must contain at most one "\*"/,
  );
});

test("export diagnostics identify the invalid key or nested value and explain the rule", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/managed-key", {
    name: "managed-key",
    preconst: { exports: { feature: "./src/feature.ts" } },
  });
  await packageFixture(root, "packages/managed-value", {
    name: "managed-value",
    preconst: { exports: { ".": { browser: 42 } } },
  });
  await packageFixture(root, "packages/extra-key", {
    name: "extra-key",
    preconst: {
      exports: "./src/index.ts",
      extraExports: { feature: "./dist/feature.js" },
    },
  });
  await packageFixture(root, "packages/extra-value", {
    name: "extra-value",
    preconst: {
      exports: "./src/index.ts",
      extraExports: { "./feature": { browser: ["./dist/feature.js", "../escape.js"] } },
    },
  });

  const fixed = await run(root, "fix");
  assert.equal(fixed.exitCode, 1);
  assert.match(
    fixed.stderr,
    /managed-key preconst\.exports key "feature" is invalid: must be "\." or start with "\.\/"/,
  );
  assert.match(
    fixed.stderr,
    /managed-value value at preconst\.exports\["\."\]\["browser"\] is invalid: expected a source path, condition object, or null; received number/,
  );
  assert.match(
    fixed.stderr,
    /extra-key preconst\.extraExports key "feature" is invalid: must be "\." or start with "\.\/"/,
  );
  assert.match(
    fixed.stderr,
    /extra-value value at preconst\.extraExports\["\.\/feature"\]\["browser"\]\[1\] is invalid: export targets must start with "\.\/"; received "\.\.\/escape\.js"/,
  );
});
