import path from "node:path";
import { exists, asObject, jsonEqual, readJsoncObject, writeJson } from "./json.ts";
import {
  isInsideOrSame,
  isPackageSpecifier,
  isRootLocalPath,
  relativeJsonPath,
  relativePath,
} from "./paths.ts";
import {
  compilerOptionValues,
  resolveExtendedTsconfig,
  resolveTsconfig,
} from "./tsconfig-resolver.ts";
import {
  DEFAULT_BASE_OPTIONS,
  REQUIRED_BASE_OPTIONS,
  type Diagnostic,
  type JsonObject,
  type ManagedPackage,
  type RepairMode,
  type Workspace,
} from "./types.ts";

export function validateTsconfigPaths(workspace: Workspace): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { rootDir, config } = workspace;
  if (!isRootLocalPath(rootDir, config.tsconfig.build)) {
    diagnostics.push({
      message: "root preconst.tsconfig.build must be a local path inside the project",
    });
  }
  for (const pkg of workspace.packages) {
    const resolved = path.resolve(pkg.dir, config.tsconfig.pkg);
    if (path.isAbsolute(config.tsconfig.pkg) || !isInsideOrSame(pkg.dir, resolved)) {
      diagnostics.push({
        message: `${pkg.name} package tsconfig path must stay inside the package`,
      });
    }
  }
  if (
    !isPackageSpecifier(config.tsconfig.base) &&
    !isRootLocalPath(rootDir, config.tsconfig.base)
  ) {
    diagnostics.push({
      message: "root preconst.tsconfig.base must be local to the project or package-based",
    });
  }
  return diagnostics;
}

export async function reconcileTsconfigs(
  workspace: Workspace,
  references: Map<string, JsonObject[]>,
  mode: RepairMode,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const buildPath = path.resolve(workspace.rootDir, workspace.config.tsconfig.build);
  const rootReferences = workspace.packages.map((pkg) => ({
    path: relativeJsonPath(path.dirname(buildPath), pkg.tsconfigPath),
  }));
  const rootBuild: JsonObject = { files: [], references: rootReferences };
  await enforceJsonFile(buildPath, rootBuild, "root build tsconfig", mode, diagnostics);

  await validateAndMaybeFixBase(workspace, mode, diagnostics);

  const packageDiagnostics = await Promise.all(
    workspace.packages.map(async (pkg) => {
      const diagnostics: Diagnostic[] = [];
      const packageConfigDir = path.dirname(pkg.tsconfigPath);
      const sourceDir = relativePath(packageConfigDir, path.join(pkg.dir, "src")) || ".";
      const outputDir = relativePath(packageConfigDir, path.join(pkg.dir, "dist")) || ".";
      const desired: JsonObject = {
        extends: packageBaseExtends(workspace, pkg),
        compilerOptions: {
          composite: true,
          rootDir: sourceDir,
          outDir: outputDir,
        },
        include: [sourceDir],
        references: references.get(pkg.name) ?? [],
      };
      await enforcePackageTsconfig(
        pkg.tsconfigPath,
        desired,
        `${pkg.name} package tsconfig`,
        mode,
        diagnostics,
      );
      return diagnostics;
    }),
  );
  diagnostics.push(...packageDiagnostics.flat());
  return diagnostics;
}

async function validateAndMaybeFixBase(
  workspace: Workspace,
  mode: RepairMode,
  diagnostics: Diagnostic[],
): Promise<void> {
  const base = workspace.config.tsconfig.base;
  if (isPackageSpecifier(base)) {
    await validatePackageBasedBase(workspace, base, diagnostics);
    return;
  }
  const basePath = path.resolve(workspace.rootDir, base);
  if (!(await exists(basePath))) {
    const desired: JsonObject = { compilerOptions: DEFAULT_BASE_OPTIONS };
    await enforceJsonFile(basePath, desired, "base tsconfig", mode, diagnostics);
    return;
  }
  const actual = await readJsoncObject(basePath);
  const resolved = await resolveTsconfig(basePath);
  if (!resolved.ok) {
    diagnostics.push(...resolved.diagnostics);
    return;
  }
  const missing = missingRequiredOptions(compilerOptionValues(resolved.value));
  const changed = missing.length > 0;
  if (mode === "fix" && changed) {
    const desiredOptions: JsonObject = {
      ...(asObject(actual.compilerOptions) ?? {}),
      ...REQUIRED_BASE_OPTIONS,
    };
    actual.compilerOptions = desiredOptions;
    await writeJson(basePath, actual);
  } else if (changed) {
    diagnostics.push({
      message: "base tsconfig is missing required NodeNext/source-import options",
    });
  }
}

async function validatePackageBasedBase(
  workspace: Workspace,
  base: string,
  diagnostics: Diagnostic[],
): Promise<void> {
  const packageDiagnostics = await Promise.all(
    workspace.packages.map(async (pkg) => {
      const diagnostics: Diagnostic[] = [];
      const resolved = await resolveExtendedTsconfig(base, pkg.tsconfigPath);
      if (!resolved.ok) {
        diagnostics.push(...resolved.diagnostics);
        return diagnostics;
      }
      const missing = missingRequiredOptions(compilerOptionValues(resolved.value));
      if (missing.length > 0) {
        diagnostics.push({
          message: `package-based base tsconfig for ${pkg.name} is missing required options: ${missing.join(", ")}`,
        });
      }
      return diagnostics;
    }),
  );
  diagnostics.push(...packageDiagnostics.flat());
}

function missingRequiredOptions(compilerOptions: JsonObject): string[] {
  return Object.entries(REQUIRED_BASE_OPTIONS)
    .filter(([key, value]) => !jsonEqual(compilerOptions[key], value))
    .map(([key]) => key);
}

async function enforceJsonFile(
  filePath: string,
  desired: JsonObject,
  label: string,
  mode: RepairMode,
  diagnostics: Diagnostic[],
): Promise<void> {
  if (mode === "fix") {
    if (!(await exists(filePath)) || !jsonEqual(await readJsoncObject(filePath), desired)) {
      await writeJson(filePath, desired);
    }
    return;
  }
  if (!(await exists(filePath))) {
    diagnostics.push({ message: `${label} is missing` });
    return;
  }
  const actual = await readJsoncObject(filePath);
  if (!jsonEqual(actual, desired)) diagnostics.push({ message: `${label} is out of date` });
}

async function enforcePackageTsconfig(
  filePath: string,
  desired: JsonObject,
  label: string,
  mode: RepairMode,
  diagnostics: Diagnostic[],
): Promise<void> {
  if (mode === "fix") {
    const actual = (await exists(filePath)) ? await readJsoncObject(filePath) : {};
    actual.extends = desired.extends;
    const compilerOptions = asObject(actual.compilerOptions) ?? {};
    actual.compilerOptions = {
      ...compilerOptions,
      ...(desired.compilerOptions as JsonObject),
    };
    actual.include = desired.include;
    actual.references = desired.references;
    await writeJson(filePath, actual);
    return;
  }

  if (!(await exists(filePath))) {
    diagnostics.push({ message: `${label} is missing` });
    return;
  }
  const actual = await readJsoncObject(filePath);
  const actualOptions = asObject(actual.compilerOptions) ?? {};
  const desiredOptions = desired.compilerOptions as JsonObject;
  const optionsDrift = Object.entries(desiredOptions).some(
    ([key, value]) => !jsonEqual(actualOptions[key], value),
  );
  if (
    !jsonEqual(actual.extends, desired.extends) ||
    optionsDrift ||
    !jsonEqual(actual.include, desired.include) ||
    !jsonEqual(actual.references, desired.references)
  ) {
    diagnostics.push({ message: `${label} is out of date` });
  }
}

function packageBaseExtends(workspace: Workspace, pkg: ManagedPackage): string {
  return isPackageSpecifier(workspace.config.tsconfig.base)
    ? workspace.config.tsconfig.base
    : relativeJsonPath(
        path.dirname(pkg.tsconfigPath),
        path.resolve(workspace.rootDir, workspace.config.tsconfig.base),
      );
}
