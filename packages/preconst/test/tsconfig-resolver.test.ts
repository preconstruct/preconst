import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { compilerOptionValues, resolveTsconfig } from "../src/tsconfig-resolver.ts";
import { fixture, json, packageFixture } from "./helpers.ts";

test("resolves recursive and array extends from package-local node_modules", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/a", { name: "a" });
  const packageDir = path.join(root, "packages/a");
  const configPackageDir = path.join(packageDir, "node_modules/@scope/config");
  await json(path.join(configPackageDir, "package.json"), { name: "@scope/config" });
  await json(path.join(configPackageDir, "shared.json"), {
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      tsBuildInfoFile: "./cache/shared.tsbuildinfo",
    },
  });
  await json(path.join(configPackageDir, "base.json"), {
    extends: "./shared.json",
    compilerOptions: { allowImportingTsExtensions: true },
  });
  await json(path.join(packageDir, "config/local.json"), {
    compilerOptions: { rewriteRelativeImportExtensions: true, strict: false },
  });
  const tsconfigPath = path.join(packageDir, "config/pkg.json");
  await json(tsconfigPath, {
    extends: ["@scope/config/base.json", "./local.json"],
    compilerOptions: { strict: true },
  });

  const resolved = await resolveTsconfig(tsconfigPath);
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.deepEqual(compilerOptionValues(resolved.value), {
    module: "NodeNext",
    moduleResolution: "NodeNext",
    tsBuildInfoFile: "./cache/shared.tsbuildinfo",
    allowImportingTsExtensions: true,
    rewriteRelativeImportExtensions: true,
    strict: true,
  });
  assert.equal(
    resolved.value.compilerOptions.tsBuildInfoFile.sourceConfigPath,
    path.join(configPackageDir, "shared.json"),
  );
});

test("returns diagnostics for circular, missing, and malformed extended configs", async () => {
  const root = await fixture();
  const configDir = path.join(root, "config");
  await json(path.join(configDir, "cycle-a.json"), { extends: "./cycle-b.json" });
  await json(path.join(configDir, "cycle-b.json"), { extends: "./cycle-a.json" });
  await json(path.join(configDir, "missing.json"), { extends: "./gone.json" });
  await json(path.join(configDir, "malformed-root.json"), { extends: "./malformed.json" });
  await writeFile(path.join(configDir, "malformed.json"), "{ invalid");

  const circular = await resolveTsconfig(path.join(configDir, "cycle-a.json"));
  assert.equal(circular.ok, false);
  if (!circular.ok) assert.match(circular.diagnostics[0].message, /circular/);

  const missing = await resolveTsconfig(path.join(configDir, "missing.json"));
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.diagnostics[0].message, /could not be resolved/);

  const malformed = await resolveTsconfig(path.join(configDir, "malformed-root.json"));
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.match(malformed.diagnostics[0].message, /could not be read/);
});
