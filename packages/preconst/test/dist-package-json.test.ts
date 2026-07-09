import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fixture, packageFixture, readJson, run } from "./helpers.ts";

test("dist-pkg-json writes mapped import package manifests for selected packages", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/a", {
    name: "a",
    preconst: { exports: "./src/index.ts", imports: true },
    imports: {
      "#x": "./src/x.ts",
      "#view": ["./src/view.tsx", null],
      "#env": { node: "./src/env.node.ts", default: "./src/env.ts" },
    },
    sources: ["src/x.ts", "src/view.tsx", "src/env.node.ts", "src/env.ts"],
  });
  await packageFixture(root, "packages/no-imports", {
    name: "no-imports",
    preconst: { exports: "./src/index.ts", imports: true },
  });
  await packageFixture(root, "packages/not-owned", {
    name: "not-owned",
    preconst: { exports: "./src/index.ts", imports: false },
    imports: { "#ignored": "external" },
  });

  const workspaceRun = await run(root, "dist-pkg-json");
  assert.equal(workspaceRun.exitCode, 0, workspaceRun.stderr);
  assert.deepEqual(await readJson(path.join(root, "packages/a/dist/package.json")), {
    type: "module",
    imports: {
      "#x": "./x.js",
      "#view": ["./view.js", null],
      "#env": { node: "./env.node.js", default: "./env.js" },
    },
  });
  await assert.rejects(readJson(path.join(root, "packages/no-imports/dist/package.json")));
  await assert.rejects(readJson(path.join(root, "packages/not-owned/dist/package.json")));

  const local = await run(path.join(root, "packages/a"), "dist-pkg-json");
  assert.equal(local.exitCode, 0, local.stderr);
  const noImports = await run(path.join(root, "packages/no-imports"), "dist-pkg-json");
  assert.equal(noImports.exitCode, 1);
  assert.match(noImports.stderr, /must define imports/);
});
