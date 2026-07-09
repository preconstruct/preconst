import { glob } from "node:fs/promises";
import path from "node:path";
import { asObject, exists, jsonEqual, writeJson } from "./json.ts";
import {
  isSafePackageSourcePath,
  packageExportTargetError,
  packageSourcePathError,
  toPosix,
} from "./paths.ts";
import type {
  Analysis,
  DevLink,
  Diagnostic,
  JsonObject,
  JsonValue,
  ManagedPackage,
  RepairMode,
} from "./types.ts";

const LEGACY_FIELDS = ["main", "module", "types", "typesVersions"];

type PackageManifest = Pick<ManagedPackage, "dir" | "manifest" | "name">;

export async function reconcilePackageManifest(
  pkg: ManagedPackage,
  mode: RepairMode,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  let changed = false;
  const manifest = pkg.manifest;
  const preconst = asObject(manifest.preconst);
  if (!preconst) {
    diagnostics.push({ message: `${pkg.name} must contain package preconst configuration` });
    return diagnostics;
  }

  validatePackageImports(pkg, diagnostics);

  if (preconst.exports === undefined) {
    if (mode === "fix") {
      preconst.exports = await defaultSourceEntry(pkg.dir);
      changed = true;
    } else {
      diagnostics.push({ message: `${pkg.name} must define preconst.exports` });
      return diagnostics;
    }
  }

  const generated = await buildGeneratedExports(pkg, preconst, diagnostics);
  if (generated === undefined) return diagnostics;

  if (manifest.type !== "module") {
    if (mode === "fix") {
      manifest.type = "module";
      changed = true;
    } else {
      diagnostics.push({ message: `${pkg.name} must have type: "module"` });
    }
  }

  for (const field of LEGACY_FIELDS) {
    if (field in manifest) {
      if (mode === "fix") {
        delete manifest[field];
        changed = true;
      } else {
        diagnostics.push({ message: `${pkg.name} must not contain legacy field ${field}` });
      }
    }
  }

  if ("files" in manifest) {
    if (!Array.isArray(manifest.files)) {
      diagnostics.push({ message: `${pkg.name} files must be an array when present` });
    } else if (!manifest.files.includes("dist") && !manifest.files.includes("dist/**")) {
      if (mode === "fix") {
        manifest.files.push("dist");
        changed = true;
      } else {
        diagnostics.push({ message: `${pkg.name} files must include dist or dist/**` });
      }
    }
  }

  if (!jsonEqual(manifest.exports, generated)) {
    if (mode === "fix") {
      manifest.exports = generated;
      changed = true;
    } else {
      diagnostics.push({ message: `${pkg.name} package.json#exports is out of date` });
    }
  }

  if (changed) await writeJson(pkg.manifestPath, manifest);
  return diagnostics;
}

export async function writePackageDistPackageJson(
  dir: string,
  manifest: JsonObject,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const preconst = asObject(manifest.preconst);
  const pkg: PackageManifest = {
    dir,
    manifest,
    name: typeof manifest.name === "string" ? manifest.name : path.basename(dir),
  };
  if (preconst?.imports !== true) {
    diagnostics.push({
      message: `${pkg.name} must set preconst.imports: true to run dist-pkg-json`,
    });
    return diagnostics;
  }
  if (manifest.imports === undefined) {
    diagnostics.push({ message: `${pkg.name} must define imports to run dist-pkg-json` });
    return diagnostics;
  }
  await writeDistManifests([pkg], diagnostics);
  return diagnostics;
}

export async function writeWorkspaceDistPackageJsons(
  packages: ManagedPackage[],
): Promise<{ targetCount: number; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const targets = packagesWithManagedImports(packages);
  await writeDistManifests(targets, diagnostics);
  return { targetCount: targets.length, diagnostics };
}

export async function deriveDevLinks(pkg: ManagedPackage): Promise<Analysis<DevLink[]>> {
  const diagnostics: Diagnostic[] = [];
  const leaves: Array<{ source: string; location: string }> = [];
  function visit(node: JsonValue | undefined, location: string): void {
    if (typeof node === "string") leaves.push({ source: node, location });
    else if (node && typeof node === "object" && !Array.isArray(node)) {
      for (const [key, nested] of Object.entries(node)) visit(nested, jsonPath(location, key));
    }
  }
  visit(asObject(pkg.manifest.preconst)?.exports, "preconst.exports");

  const links: DevLink[] = [];
  for (const { source: leaf, location } of leaves) {
    let sources: string[];
    if (leaf.includes("*")) {
      const validated = transformSourceLeaf(pkg, leaf, "export", location);
      diagnostics.push(...validated.diagnostics);
      if (validated.value === undefined) continue;
      sources = await expandSourcePattern(pkg, leaf);
    } else {
      sources = [leaf];
    }
    for (const source of sources) {
      const transformed = transformSourceLeaf(pkg, source, "export", location);
      diagnostics.push(...transformed.diagnostics);
      if (transformed.value) links.push({ source, target: transformed.value });
    }
  }
  return { value: links, diagnostics };
}

function transformSourceLeaf(
  pkg: PackageManifest,
  source: string,
  kind: "export" | "import",
  location: string,
): Analysis<string> {
  if (!hasAtMostOneWildcard(source)) {
    return {
      value: undefined,
      diagnostics: [
        {
          message: `${pkg.name} value at ${location} is invalid: source paths must contain at most one "*"; received ${JSON.stringify(source)}`,
        },
      ],
    };
  }
  const isTsx = source.endsWith(".tsx");
  if (!isSafePackageSourcePath(pkg.dir, source)) {
    const reason = packageSourcePathError(pkg.dir, source);
    return {
      value: undefined,
      diagnostics: [
        {
          message: `${pkg.name} value at ${location} is invalid: source paths ${reason}; received ${JSON.stringify(source)}`,
        },
      ],
    };
  }
  const prefix = kind === "export" ? "./dist" : ".";
  return {
    value: prefix + source.slice("./src".length, -(isTsx ? "tsx" : "ts").length) + "js",
    diagnostics: [],
  };
}

async function expandSourcePattern(pkg: ManagedPackage, pattern: string): Promise<string[]> {
  const results: string[] = [];
  const directPattern = toPosix(pattern.slice(2));
  const starIndex = directPattern.indexOf("*");
  const recursivePattern =
    directPattern.slice(0, starIndex) + "*/**/*" + directPattern.slice(starIndex + 1);
  for await (const source of glob([directPattern, recursivePattern], { cwd: pkg.dir })) {
    results.push(`./${toPosix(source)}`);
  }
  return results;
}

async function buildGeneratedExports(
  pkg: ManagedPackage,
  preconst: JsonObject,
  diagnostics: Diagnostic[],
): Promise<JsonObject | undefined> {
  const managed = normalizeManagedExports(pkg, preconst.exports, diagnostics);
  if (!managed) return undefined;
  const output: JsonObject = { ...managed };
  if (!("./package.json" in managed) || managed["./package.json"] !== null) {
    if (!("./package.json" in output)) output["./package.json"] = "./package.json";
  }

  const extra = preconst.extraExports;
  if (extra !== undefined) {
    const extraObject = asObject(extra);
    if (!extraObject) {
      diagnostics.push({ message: `${pkg.name} preconst.extraExports must be an object` });
      return undefined;
    }
    for (const [key, value] of Object.entries(extraObject)) {
      const keyError = exportKeyError(key);
      if (keyError) {
        diagnostics.push({
          message: `${pkg.name} preconst.extraExports key ${JSON.stringify(key)} is invalid: ${keyError}`,
        });
        return undefined;
      }
      const valueError = extraExportValueError(value, jsonPath("preconst.extraExports", key));
      if (valueError) {
        diagnostics.push({ message: `${pkg.name} ${valueError}` });
        return undefined;
      }
      output[key] = value;
    }
  }
  return output;
}

function normalizeManagedExports(
  pkg: ManagedPackage,
  value: JsonValue | undefined,
  diagnostics: Diagnostic[],
): JsonObject | undefined {
  if (typeof value === "string") {
    const transformed = transformSourceLeaf(pkg, value, "export", "preconst.exports");
    diagnostics.push(...transformed.diagnostics);
    return transformed.value === undefined ? undefined : { ".": transformed.value };
  }
  const object = asObject(value);
  if (!object || Array.isArray(value)) {
    diagnostics.push({ message: `${pkg.name} preconst.exports must be a string or object` });
    return undefined;
  }

  const result: JsonObject = {};
  for (const [key, exportValue] of Object.entries(object)) {
    const keyError = exportKeyError(key);
    if (keyError) {
      diagnostics.push({
        message: `${pkg.name} preconst.exports key ${JSON.stringify(key)} is invalid: ${keyError}`,
      });
      return undefined;
    }
    const transformed = transformManagedValue(
      pkg,
      exportValue,
      diagnostics,
      jsonPath("preconst.exports", key),
    );
    if (transformed === undefined) return undefined;
    result[key] = transformed;
  }
  return result;
}

function transformManagedValue(
  pkg: ManagedPackage,
  value: JsonValue,
  diagnostics: Diagnostic[],
  location = "preconst.exports",
): JsonValue | undefined {
  if (value === null) return null;
  if (typeof value === "string") {
    const transformed = transformSourceLeaf(pkg, value, "export", location);
    diagnostics.push(...transformed.diagnostics);
    return transformed.value;
  }
  if (Array.isArray(value)) {
    diagnostics.push({
      message: `${pkg.name} value at ${location} is invalid: arrays are not supported`,
    });
    return undefined;
  }
  const object = asObject(value);
  if (!object) {
    diagnostics.push({
      message: `${pkg.name} value at ${location} is invalid: expected a source path, condition object, or null; received ${typeof value}`,
    });
    return undefined;
  }
  const result: JsonObject = {};
  for (const [key, nested] of Object.entries(object)) {
    const transformed = transformManagedValue(pkg, nested, diagnostics, jsonPath(location, key));
    if (transformed === undefined) return undefined;
    result[key] = transformed;
  }
  return result;
}

function validatePackageImports(pkg: ManagedPackage, diagnostics: Diagnostic[]): void {
  const preconst = asObject(pkg.manifest.preconst);
  if (preconst?.imports !== undefined && typeof preconst.imports !== "boolean") {
    diagnostics.push({ message: `${pkg.name} preconst.imports must be a boolean` });
    return;
  }

  if (pkg.manifest.imports === undefined) return;
  if (preconst?.imports === undefined) {
    diagnostics.push({ message: `${pkg.name} package.json#imports requires preconst.imports` });
    return;
  }
  if (preconst.imports === false) return;

  buildMappedImports(pkg, diagnostics);
}

async function writeDistManifests(
  packages: PackageManifest[],
  diagnostics: Diagnostic[],
): Promise<void> {
  const outputs: Array<{ pkg: PackageManifest; imports: JsonObject }> = [];
  for (const pkg of packages) {
    const imports = buildMappedImports(pkg, diagnostics);
    if (imports !== undefined) outputs.push({ pkg, imports });
  }
  if (diagnostics.length > 0) return;

  await Promise.all(
    outputs.map(({ pkg, imports }) =>
      writeJson(path.join(pkg.dir, "dist/package.json"), { type: "module", imports }),
    ),
  );
}

function packagesWithManagedImports(packages: ManagedPackage[]): ManagedPackage[] {
  return packages.filter(
    (pkg) =>
      asObject(pkg.manifest.preconst)?.imports === true && pkg.manifest.imports !== undefined,
  );
}

function buildMappedImports(
  pkg: PackageManifest,
  diagnostics: Diagnostic[],
): JsonObject | undefined {
  const imports = asObject(pkg.manifest.imports);
  if (!imports) {
    diagnostics.push({ message: `${pkg.name} package.json#imports must be an object` });
    return undefined;
  }

  const result: JsonObject = {};
  for (const [key, value] of Object.entries(imports)) {
    if (!isImportKey(key)) {
      diagnostics.push({ message: `${pkg.name} has invalid import key ${key}` });
      return undefined;
    }
    const transformed = transformImportValue(pkg, value, diagnostics, jsonPath("imports", key));
    if (transformed === undefined) return undefined;
    result[key] = transformed;
  }
  return result;
}

function transformImportValue(
  pkg: PackageManifest,
  value: JsonValue,
  diagnostics: Diagnostic[],
  location: string,
): JsonValue | undefined {
  if (value === null) return null;
  if (typeof value === "string") {
    const transformed = transformSourceLeaf(pkg, value, "import", location);
    diagnostics.push(...transformed.diagnostics);
    return transformed.value;
  }
  if (Array.isArray(value)) {
    const result: JsonValue[] = [];
    for (const [index, item] of value.entries()) {
      const transformed = transformImportValue(pkg, item, diagnostics, `${location}[${index}]`);
      if (transformed === undefined) return undefined;
      result.push(transformed);
    }
    return result;
  }
  const object = asObject(value);
  if (!object) {
    diagnostics.push({ message: `${pkg.name} imports contains an invalid value` });
    return undefined;
  }

  const result: JsonObject = {};
  for (const [key, nested] of Object.entries(object)) {
    const transformed = transformImportValue(pkg, nested, diagnostics, jsonPath(location, key));
    if (transformed === undefined) return undefined;
    result[key] = transformed;
  }
  return result;
}

async function defaultSourceEntry(packageDir: string): Promise<string> {
  if (await exists(path.join(packageDir, "src/index.tsx"))) return "./src/index.tsx";
  return "./src/index.ts";
}

function exportKeyError(key: string): string | undefined {
  if (key !== "." && !key.startsWith("./")) return 'must be "." or start with "./"';
  if (!hasAtMostOneWildcard(key)) return 'must contain at most one "*"';
  return undefined;
}

function extraExportValueError(value: JsonValue, location: string): string | undefined {
  if (value === null) return undefined;
  if (typeof value === "string") {
    if (!hasAtMostOneWildcard(value)) {
      return `value at ${location} is invalid: export targets must contain at most one "*"; received ${JSON.stringify(value)}`;
    }
    const targetError = packageExportTargetError(value);
    return targetError
      ? `value at ${location} is invalid: export targets ${targetError}; received ${JSON.stringify(value)}`
      : undefined;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const error = extraExportValueError(item, `${location}[${index}]`);
      if (error) return error;
    }
    return undefined;
  }
  const object = asObject(value);
  if (object) {
    for (const [key, nested] of Object.entries(object)) {
      const error = extraExportValueError(nested, jsonPath(location, key));
      if (error) return error;
    }
    return undefined;
  }
  return `value at ${location} is invalid: expected an export target, condition object, array, or null; received ${typeof value}`;
}

function jsonPath(base: string, key: string): string {
  return `${base}[${JSON.stringify(key)}]`;
}

function isImportKey(key: string): boolean {
  return key.startsWith("#") && key.length > 1 && hasAtMostOneWildcard(key);
}

function hasAtMostOneWildcard(value: string): boolean {
  const first = value.indexOf("*");
  return first === -1 || value.indexOf("*", first + 1) === -1;
}
