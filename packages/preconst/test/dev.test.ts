import assert from "node:assert/strict";
import { lstat, mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fixture, json, packageFixture, readJson, run } from "./helpers.ts";

test("clean removes only managed dist directories and dev symlinks source entrypoints after check", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/a", {
    name: "a",
    preconst: {
      exports: {
        ".": "./src/index.ts",
        "./utils/*": "./src/utils/*.ts",
        "./things/*": "./src/thing-*.ts",
      },
      imports: true,
      extraExports: { "./style.css": "./dist/style.css" },
    },
    imports: { "#utils/*": "./src/utils/*.ts" },
    sources: [
      "src/utils/one.ts",
      "src/utils/nested/two.ts",
      "src/thing-one.ts",
      "src/thing-one/two.ts",
    ],
  });
  await mkdir(path.join(root, "packages/a/dist"), { recursive: true });
  await writeFile(path.join(root, "packages/a/dist/stale.js"), "");
  await mkdir(path.join(root, "unmanaged/dist"), { recursive: true });
  await writeFile(path.join(root, "unmanaged/dist/keep.js"), "");

  const fixed = await run(root, "fix");
  assert.equal(fixed.exitCode, 0, fixed.stderr);

  const dev = await run(root, "dev");
  assert.equal(dev.exitCode, 0, dev.stderr);
  assert.equal((await lstat(path.join(root, "packages/a/dist/index.js"))).isSymbolicLink(), true);
  assert.equal(
    (await lstat(path.join(root, "packages/a/dist/utils/one.js"))).isSymbolicLink(),
    true,
  );
  assert.equal(
    (await lstat(path.join(root, "packages/a/dist/utils/nested/two.js"))).isSymbolicLink(),
    true,
  );
  assert.equal(
    (await lstat(path.join(root, "packages/a/dist/thing-one.js"))).isSymbolicLink(),
    true,
  );
  assert.equal(
    (await lstat(path.join(root, "packages/a/dist/thing-one/two.js"))).isSymbolicLink(),
    true,
  );
  await assert.rejects(lstat(path.join(root, "packages/a/dist/package.json")));
  await assert.rejects(lstat(path.join(root, "packages/a/dist/style.css")));
  assert.equal((await lstat(path.join(root, "unmanaged/dist/keep.js"))).isFile(), true);

  await symlink("../src/index.ts", path.join(root, "packages/a/dist/stale.js"));
  const clean = await run(root, "clean");
  assert.equal(clean.exitCode, 0, clean.stderr);
  await assert.rejects(lstat(path.join(root, "packages/a/dist")));
  assert.equal((await lstat(path.join(root, "unmanaged/dist/keep.js"))).isFile(), true);
});

test("clean removes default and inherited package build info", async () => {
  const root = await fixture({ tsconfig: { pkg: "config/pkg.json" } });
  await packageFixture(root, "packages/default", { name: "default" });
  await packageFixture(root, "packages/configured", { name: "configured" });
  await packageFixture(root, "packages/missing-base", { name: "missing-base" });
  const fixed = await run(root, "fix");
  assert.equal(fixed.exitCode, 0, fixed.stderr);

  const configuredTsconfigPath = path.join(root, "packages/configured/config/pkg.json");
  const configuredTsconfig = await readJson(configuredTsconfigPath);
  configuredTsconfig.extends = ["./build-base.json", "./missing-build-base.json"];
  await json(configuredTsconfigPath, configuredTsconfig);
  await json(path.join(root, "packages/configured/config/build-base.json"), {
    compilerOptions: { tsBuildInfoFile: "./cache/state.tsbuildinfo" },
  });

  const missingBaseTsconfigPath = path.join(root, "packages/missing-base/config/pkg.json");
  const missingBaseTsconfig = await readJson(missingBaseTsconfigPath);
  missingBaseTsconfig.extends = "./missing.json";
  missingBaseTsconfig.compilerOptions.tsBuildInfoFile = "./cache/missing.tsbuildinfo";
  await json(missingBaseTsconfigPath, missingBaseTsconfig);

  const defaultBuildInfoPath = path.join(root, "packages/default/config/pkg.tsbuildinfo");
  const configuredBuildInfoPath = path.join(
    root,
    "packages/configured/config/cache/state.tsbuildinfo",
  );
  const missingBaseBuildInfoPath = path.join(
    root,
    "packages/missing-base/config/cache/missing.tsbuildinfo",
  );
  await writeFile(defaultBuildInfoPath, "default build state");
  await mkdir(path.dirname(configuredBuildInfoPath), { recursive: true });
  await writeFile(configuredBuildInfoPath, "configured build state");
  await mkdir(path.dirname(missingBaseBuildInfoPath), { recursive: true });
  await writeFile(missingBaseBuildInfoPath, "missing-base build state");

  const clean = await run(root, "clean");
  assert.equal(clean.exitCode, 0, clean.stderr);
  await assert.rejects(lstat(defaultBuildInfoPath));
  await assert.rejects(lstat(configuredBuildInfoPath));
  await assert.rejects(lstat(missingBaseBuildInfoPath));
});
