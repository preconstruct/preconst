import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { parseCommandLine } from "../src/command-line.ts";
import { formatRunResult } from "../src/presentation.ts";
import { runPreconst } from "../src/preconst.ts";

type JsonObject = Record<string, any>;

interface PackageFixtureOptions {
  name?: string;
  preconst?: Record<string, unknown>;
  sources?: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  main?: string;
  files?: string[];
  imports?: Record<string, unknown>;
}

export async function fixture(rootPreconst: Record<string, unknown> = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "preconst-test-"));
  await json(path.join(root, "package.json"), {
    name: "root",
    type: "module",
    private: true,
    preconst: { packages: ["packages/*"], ...rootPreconst },
  });
  return root;
}

export async function packageFixture(
  root: string,
  relative: string,
  options: PackageFixtureOptions = {},
) {
  const dir = path.join(root, relative);
  await mkdir(path.join(dir, "src"), { recursive: true });
  await writeFile(path.join(dir, "src/index.ts"), "export const value = 1;\n");
  for (const source of options.sources ?? []) {
    await mkdir(path.dirname(path.join(dir, source)), { recursive: true });
    await writeFile(path.join(dir, source), "export const value = 1;\n");
  }
  const manifest: Record<string, unknown> = {
    name: options.name,
    version: "1.0.0",
    preconst: options.preconst ?? { exports: "./src/index.ts" },
  };
  for (const key of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
    "devDependencies",
    "main",
    "files",
    "imports",
  ] as const) {
    if (options[key] !== undefined) manifest[key] = options[key];
  }
  if (options.name === undefined) delete manifest.name;
  await json(path.join(dir, "package.json"), manifest);
}

export async function run(cwd: string, command: string) {
  const parsed = parseCommandLine([command]);
  if (!parsed.ok || parsed.action !== "run") throw new Error(`Expected run command: ${command}`);
  const result = await runPreconst({ command: parsed.command, cwd });
  const { stdout, stderr } = formatRunResult(result, {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
  return { ...result, exitCode: result.status === "ok" ? 0 : 1, stdout, stderr };
}

export async function json(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson(file: string): Promise<JsonObject> {
  return JSON.parse(await readFile(file, "utf8"));
}
