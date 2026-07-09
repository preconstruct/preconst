import { stat } from "node:fs/promises";
import path from "node:path";
import { asObject, exists, readJsoncObject, readJsonObject } from "./json.ts";
import type { Diagnostic, JsonObject, Result } from "./types.ts";

export type ResolvedTsconfig = {
  compilerOptions: Record<string, ResolvedCompilerOption>;
};

export type ResolvedCompilerOption = {
  value: JsonObject[string];
  sourceConfigPath: string;
};

export type TsconfigResolution =
  | { ok: true; value: ResolvedTsconfig; diagnostics: [] }
  | { ok: false; value: ResolvedTsconfig; diagnostics: Diagnostic[] };

export function compilerOptionValues(config: ResolvedTsconfig): JsonObject {
  return Object.fromEntries(
    Object.entries(config.compilerOptions).map(([key, option]) => [key, option.value]),
  );
}

export async function resolveTsconfig(configPath: string): Promise<TsconfigResolution> {
  return resolveTsconfigFile(path.resolve(configPath), new Set());
}

export async function resolveExtendedTsconfig(
  specifier: string,
  containingConfigPath: string,
): Promise<TsconfigResolution> {
  let configPath: string | undefined;
  try {
    configPath = await resolveExtendsPath(specifier, path.resolve(containingConfigPath));
  } catch (error) {
    return {
      ok: false,
      value: emptyResolvedTsconfig(),
      diagnostics: [{ message: `extended tsconfig could not be read: ${errorMessage(error)}` }],
    };
  }
  return configPath
    ? resolveTsconfigFile(configPath, new Set())
    : {
        ok: false,
        value: emptyResolvedTsconfig(),
        diagnostics: [
          {
            message: `extended tsconfig could not be resolved: ${specifier} from ${containingConfigPath}`,
          },
        ],
      };
}

async function resolveTsconfigFile(
  configPath: string,
  resolving: Set<string>,
): Promise<TsconfigResolution> {
  if (resolving.has(configPath)) {
    return {
      ok: false,
      value: emptyResolvedTsconfig(),
      diagnostics: [{ message: `circular tsconfig extends chain at ${configPath}` }],
    };
  }
  if (!(await exists(configPath))) {
    return {
      ok: false,
      value: emptyResolvedTsconfig(),
      diagnostics: [{ message: `tsconfig could not be found: ${configPath}` }],
    };
  }

  resolving.add(configPath);
  let config: JsonObject;
  try {
    config = await readJsoncObject(configPath);
  } catch (error) {
    resolving.delete(configPath);
    return {
      ok: false,
      value: emptyResolvedTsconfig(),
      diagnostics: [
        { message: `tsconfig could not be read: ${configPath}: ${errorMessage(error)}` },
      ],
    };
  }
  const extended = readExtends(config.extends, configPath);
  if (!extended.ok) {
    resolving.delete(configPath);
    return { ...extended, value: emptyResolvedTsconfig() };
  }

  const compilerOptions: Record<string, ResolvedCompilerOption> = {};
  const diagnostics: Diagnostic[] = [];
  for (const specifier of extended.value) {
    let extendedPath: string | undefined;
    try {
      extendedPath = await resolveExtendsPath(specifier, configPath);
    } catch (error) {
      diagnostics.push({ message: `extended tsconfig could not be read: ${errorMessage(error)}` });
      continue;
    }
    if (!extendedPath) {
      diagnostics.push({
        message: `extended tsconfig could not be resolved: ${specifier} from ${configPath}`,
      });
      continue;
    }
    const base = await resolveTsconfigFile(extendedPath, resolving);
    Object.assign(compilerOptions, base.value.compilerOptions);
    if (!base.ok) {
      diagnostics.push(...base.diagnostics);
      continue;
    }
  }

  const ownCompilerOptions = asObject(config.compilerOptions) ?? {};
  for (const [key, value] of Object.entries(ownCompilerOptions)) {
    compilerOptions[key] = { value, sourceConfigPath: configPath };
  }
  resolving.delete(configPath);

  return diagnostics.length > 0
    ? { ok: false, value: { compilerOptions }, diagnostics }
    : { ok: true, value: { compilerOptions }, diagnostics: [] };
}

function readExtends(value: unknown, configPath: string): Result<string[]> {
  if (value === undefined) return { ok: true, value: [], diagnostics: [] };
  if (typeof value === "string") return { ok: true, value: [value], diagnostics: [] };
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return { ok: true, value, diagnostics: [] };
  }
  return {
    ok: false,
    diagnostics: [{ message: `tsconfig extends must be a string or string array: ${configPath}` }],
  };
}

async function resolveExtendsPath(
  specifier: string,
  containingConfigPath: string,
): Promise<string | undefined> {
  if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
    return resolveConfigCandidate(path.resolve(path.dirname(containingConfigPath), specifier));
  }
  return resolvePackageConfig(specifier, path.dirname(containingConfigPath));
}

async function resolvePackageConfig(
  specifier: string,
  containingDir: string,
): Promise<string | undefined> {
  const parsed = parsePackageSpecifier(specifier);
  if (!parsed) return undefined;

  for (let current = containingDir; ; current = path.dirname(current)) {
    const packageDir = path.join(current, "node_modules", parsed.packageName);
    if (parsed.subpath) {
      const resolved = await resolveConfigCandidate(path.join(packageDir, parsed.subpath));
      if (resolved) return resolved;
    } else if (await exists(packageDir)) {
      const manifestPath = path.join(packageDir, "package.json");
      if (await exists(manifestPath)) {
        const manifest = await readJsonObject(manifestPath);
        for (const field of ["tsconfig", "main"]) {
          const target = manifest[field];
          if (typeof target !== "string") continue;
          const resolved = await resolveConfigCandidate(path.resolve(packageDir, target));
          if (resolved) return resolved;
        }
      }
      const resolved = await resolveConfigCandidate(path.join(packageDir, "tsconfig.json"));
      if (resolved) return resolved;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
  }
}

async function resolveConfigCandidate(candidate: string): Promise<string | undefined> {
  if ((await exists(candidate)) && (await stat(candidate)).isFile()) return candidate;
  if (path.extname(candidate) === "") {
    const jsonCandidate = `${candidate}.json`;
    if (await exists(jsonCandidate)) return jsonCandidate;
  }
  return undefined;
}

function parsePackageSpecifier(
  specifier: string,
): { packageName: string; subpath: string } | undefined {
  const segments = specifier.split("/");
  const packageSegmentCount = specifier.startsWith("@") ? 2 : 1;
  if (
    segments.length < packageSegmentCount ||
    segments.slice(0, packageSegmentCount).some((s) => !s)
  ) {
    return undefined;
  }
  return {
    packageName: segments.slice(0, packageSegmentCount).join("/"),
    subpath: segments.slice(packageSegmentCount).join("/"),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emptyResolvedTsconfig(): ResolvedTsconfig {
  return { compilerOptions: {} };
}
