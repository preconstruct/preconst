import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { runPreconst } from "../src/preconst.ts";
import { fixture, json, run } from "./helpers.ts";

test("package manifests must be strict JSON", async () => {
  const root = await fixture();
  await writeFile(
    path.join(root, "package.json"),
    `{
      // comments are not allowed in package manifests
      "name": "root",
      "preconst": { "packages": ["packages/*"] }
    }\n`,
  );

  const result = await run(root, "check");
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /Unexpected token|Expected property name/);
});

test("runPreconst returns structured diagnostics without terminal streams", async () => {
  const root = await fixture();
  await json(path.join(root, "package.json"), { name: "root", type: "module" });

  assert.deepEqual(await runPreconst({ command: "check", cwd: root }), {
    command: "check",
    status: "invalid",
    diagnostics: [
      {
        kind: "validation",
        message: "root package.json must contain preconst.packages configuration",
      },
    ],
  });
});
