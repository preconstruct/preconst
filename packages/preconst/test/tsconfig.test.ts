import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fixture, json, packageFixture, readJson, run } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const tsc = path.resolve(import.meta.dirname, "../../../node_modules/.bin/tsc");

test("tsconfigs are generated from custom paths and references are derived from dependencies", async () => {
  const root = await fixture({
    tsconfig: {
      base: "./config/base.json",
      build: "./config/build.json",
      pkg: "config/pkg.json",
    },
  });
  await packageFixture(root, "packages/a", {
    name: "a",
    dependencies: { b: "workspace:*", external: "^1.0.0" },
  });
  await packageFixture(root, "packages/b", {
    name: "b",
    devDependencies: { a: "workspace:*" },
  });

  const fixed = await run(root, "fix");
  assert.equal(fixed.exitCode, 0, fixed.stderr);
  assert.deepEqual(await readJson(path.join(root, "config/build.json")), {
    files: [],
    references: [
      { path: "../packages/a/config/pkg.json" },
      { path: "../packages/b/config/pkg.json" },
    ],
  });
  assert.deepEqual(await readJson(path.join(root, "packages/a/config/pkg.json")), {
    extends: "../../../config/base.json",
    compilerOptions: {
      composite: true,
      rootDir: "../src",
      outDir: "../dist",
    },
    include: ["../src"],
    references: [{ path: "../../b/config/pkg.json" }],
  });
  assert.deepEqual((await readJson(path.join(root, "packages/b/config/pkg.json"))).references, []);

  const check = await run(root, "check");
  assert.equal(check.exitCode, 0, check.stderr);
  await execFileAsync(tsc, ["-b", "config/build.json"], { cwd: root });
  assert.equal((await lstat(path.join(root, "packages/a/dist/index.js"))).isFile(), true);
});

test("fix does not write through invalid tsconfig paths", async () => {
  const prefix = `escaped-${randomUUID()}`;
  const root = await fixture({
    tsconfig: {
      base: `../${prefix}-base.json`,
      build: `../${prefix}-build.json`,
      pkg: `../${prefix}-pkg.json`,
    },
  });
  await packageFixture(root, "packages/a", { name: "a" });

  const fixed = await run(root, "fix");
  assert.equal(fixed.exitCode, 1);
  assert.match(fixed.stderr, /tsconfig\.build must be a local path/);
  assert.match(fixed.stderr, /package tsconfig path must stay inside the package/);
  assert.match(fixed.stderr, /tsconfig\.base must be local/);
  await assert.rejects(lstat(path.resolve(root, `../${prefix}-base.json`)));
  await assert.rejects(lstat(path.resolve(root, `../${prefix}-build.json`)));
  await assert.rejects(lstat(path.resolve(root, `packages/${prefix}-pkg.json`)));
});

test("tsconfigs allow comments and trailing commas", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/a", { name: "a" });
  await run(root, "fix");
  await writeFile(
    path.join(root, "packages/a/tsconfig.preconst.pkg.json"),
    `{
      // Preserve unowned compiler options while repairing managed settings.
      "compilerOptions": { "strict": true, },
    }\n`,
  );

  const fixed = await run(root, "fix");
  assert.equal(fixed.exitCode, 0, fixed.stderr);
  assert.equal(
    (await readJson(path.join(root, "packages/a/tsconfig.preconst.pkg.json"))).compilerOptions
      .strict,
    true,
  );
});

test("package-based base tsconfigs are validated but not repaired", async () => {
  const root = await fixture({ tsconfig: { base: "@scope/tsconfig/base.json" } });
  await packageFixture(root, "packages/a", { name: "a" });
  await json(path.join(root, "node_modules/@scope/tsconfig/base.json"), {
    compilerOptions: {
      module: "NodeNext",
    },
  });

  const fix = await run(root, "fix");
  assert.equal(fix.exitCode, 1);
  assert.match(fix.stderr, /moduleResolution/);
  assert.deepEqual(await readJson(path.join(root, "node_modules/@scope/tsconfig/base.json")), {
    compilerOptions: {
      module: "NodeNext",
    },
  });

  await json(path.join(root, "node_modules/@scope/tsconfig/base.json"), {
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      allowImportingTsExtensions: true,
      rewriteRelativeImportExtensions: true,
    },
  });
  const fixed = await run(root, "fix");
  assert.equal(fixed.exitCode, 0, fixed.stderr);
});

test("package-based base tsconfigs resolve from managed package dependencies and follow extends", async () => {
  const root = await fixture({ tsconfig: { base: "@scope/tsconfig/base.json" } });
  await packageFixture(root, "packages/a", { name: "a" });
  const configPackageDir = path.join(root, "packages/a/node_modules/@scope/tsconfig");
  await json(path.join(configPackageDir, "package.json"), { name: "@scope/tsconfig" });
  await json(path.join(configPackageDir, "shared.json"), {
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      allowImportingTsExtensions: true,
      rewriteRelativeImportExtensions: true,
    },
  });
  await json(path.join(configPackageDir, "base.json"), { extends: "./shared.json" });

  const fixed = await run(root, "fix");
  assert.equal(fixed.exitCode, 0, fixed.stderr);
  assert.equal(
    (await readJson(path.join(root, "packages/a/tsconfig.preconst.pkg.json"))).extends,
    "@scope/tsconfig/base.json",
  );
});
