import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fixture, json, packageFixture, readJson, run } from "./helpers.ts";

test("discovery supports empty globs, package manifests only, root package, and name validation", async () => {
  const root = await fixture();
  await json(path.join(root, "package.json"), {
    name: "root",
    type: "module",
    preconst: { packages: ["missing/*", "packages/*", "!packages/excluded"] },
  });
  await mkdir(path.join(root, "packages/no-manifest"), { recursive: true });
  await packageFixture(root, "packages/a", { name: "a" });
  await packageFixture(root, "packages/excluded", { name: "excluded", preconst: {} });
  await run(root, "fix");

  const valid = await run(root, "check");
  assert.equal(valid.exitCode, 0, valid.stderr);
  const excludedManifest = await readJson(path.join(root, "packages/excluded/package.json"));
  assert.equal(excludedManifest.type, undefined);
  assert.equal(excludedManifest.exports, undefined);

  const rootManaged = await fixture({ packages: ["."] });
  await mkdir(path.join(rootManaged, "src"), { recursive: true });
  await writeFile(path.join(rootManaged, "src/index.ts"), "export const value = 1;\n");
  await json(path.join(rootManaged, "package.json"), {
    name: "root-pkg",
    type: "module",
    preconst: { packages: ["."], exports: "./src/index.ts" },
  });
  const rootCheck = await run(rootManaged, "fix");
  assert.equal(rootCheck.exitCode, 0, rootCheck.stderr);

  const nameless = await fixture();
  await json(path.join(nameless, "package.json"), {
    name: "root",
    preconst: { packages: ["packages/*"] },
  });
  await packageFixture(nameless, "packages/a", { name: undefined });
  const failed = await run(nameless, "check");
  assert.equal(failed.exitCode, 1);
  assert.match(failed.stderr, /string name/);
});

test("non-dev dependency cycles fail check", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/a", { name: "a", dependencies: { b: "workspace:*" } });
  await packageFixture(root, "packages/b", { name: "b", peerDependencies: { a: "workspace:*" } });
  await run(root, "fix");

  const check = await run(root, "check");
  assert.equal(check.exitCode, 1);
  assert.match(check.stderr, /dependency cycle/);
});
