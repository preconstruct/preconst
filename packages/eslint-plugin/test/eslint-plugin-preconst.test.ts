import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "../../..");
const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint");
const pluginPath = path.join(import.meta.dirname, "../src/index.ts");

test("preconst/require-ts-import-extensions fixes relative TypeScript imports", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "preconst-lint-"));
  await mkdir(path.join(dir, "src/folder"), { recursive: true });

  await writeFile(
    path.join(dir, ".oxlintrc.json"),
    JSON.stringify(
      {
        jsPlugins: [pluginPath],
        rules: {
          "preconst/require-ts-import-extensions": "error",
        },
      },
      null,
      2,
    ),
  );

  await writeFile(
    path.join(dir, "src/app.ts"),
    [
      "import './direct';",
      "import Component from './component';",
      "export * from './folder';",
      "export { thing } from './already.ts';",
      "import './plain';",
      "import './both.js';",
      "await import('./lazy.js');",
      "",
    ].join("\n"),
  );
  await writeFile(path.join(dir, "src/direct.ts"), "export const direct = true;\n");
  await writeFile(path.join(dir, "src/component.tsx"), "export default function Component() {}\n");
  await writeFile(path.join(dir, "src/folder/index.ts"), "export const folder = true;\n");
  await writeFile(
    path.join(dir, "src/folder/nested.ts"),
    ["import '.';", "import '..';", ""].join("\n"),
  );
  await writeFile(path.join(dir, "src/already.ts"), "export const thing = true;\n");
  await writeFile(path.join(dir, "src/plain.js"), "export const plain = true;\n");
  await writeFile(path.join(dir, "src/both.js"), "export const both = 'js';\n");
  await writeFile(path.join(dir, "src/both.ts"), "export const both = 'ts';\n");
  await writeFile(path.join(dir, "src/lazy.ts"), "export const lazy = true;\n");
  await writeFile(path.join(dir, "src/index.ts"), "export const root = true;\n");

  await execFileAsync(oxlint, ["--fix", "src/app.ts", "src/folder/nested.ts"], { cwd: dir });

  assert.equal(
    await readFile(path.join(dir, "src/app.ts"), "utf8"),
    [
      "import './direct.ts';",
      "import Component from './component.tsx';",
      "export * from './folder/index.ts';",
      "export { thing } from './already.ts';",
      "import './plain.js';",
      "import './both.js';",
      "await import('./lazy.ts');",
      "",
    ].join("\n"),
  );
  assert.equal(
    await readFile(path.join(dir, "src/folder/nested.ts"), "utf8"),
    ["import './index.ts';", "import '../index.ts';", ""].join("\n"),
  );
});
