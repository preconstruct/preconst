import { glob } from "node:fs/promises";
import path from "node:path";
import { readJsonObject, asObject } from "./json.ts";
import { toPosix } from "./paths.ts";
import {
  DEFAULT_TSCONFIG,
  type Diagnostic,
  type ManagedPackage,
  type Result,
  type RootConfig,
  type Workspace,
} from "./types.ts";

export async function loadWorkspace(rootDir: string): Promise<Result<Workspace>> {
  const diagnostics: Diagnostic[] = [];
  const rootManifestPath = path.join(rootDir, "package.json");
  const rootManifest = await readJsonObject(rootManifestPath);
  const config = readRootConfig(rootManifest, diagnostics);
  if (!config) return { ok: false, diagnostics };
  const packages = await discoverPackages(rootDir, config, diagnostics);
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return {
    ok: true,
    value: { rootDir, rootManifest, config, packages },
    diagnostics: [],
  };
}

function readRootConfig(
  rootManifest: Record<string, unknown>,
  diagnostics: Diagnostic[],
): RootConfig | undefined {
  const preconst = asObject(rootManifest.preconst);
  if (!preconst) {
    diagnostics.push({
      message: "root package.json must contain preconst.packages configuration",
    });
    return undefined;
  }

  if (
    !Array.isArray(preconst.packages) ||
    !preconst.packages.every((value) => typeof value === "string")
  ) {
    diagnostics.push({
      message: "root preconst.packages is required and must be a string array",
    });
    return undefined;
  }

  const tsconfig = asObject(preconst.tsconfig) ?? {};
  const base = typeof tsconfig.base === "string" ? tsconfig.base : DEFAULT_TSCONFIG.base;
  const build = typeof tsconfig.build === "string" ? tsconfig.build : DEFAULT_TSCONFIG.build;
  const pkg = typeof tsconfig.pkg === "string" ? tsconfig.pkg : DEFAULT_TSCONFIG.pkg;
  return { packages: preconst.packages, tsconfig: { base, build, pkg } };
}

async function discoverPackages(
  rootDir: string,
  config: RootConfig,
  diagnostics: Diagnostic[],
): Promise<ManagedPackage[]> {
  const discovered = new Map<string, string>();
  const packageGlobs = config.packages.filter((packageGlob) => !packageGlob.startsWith("!"));
  const excludedPackageGlobs = config.packages
    .filter((packageGlob) => packageGlob.startsWith("!"))
    .map((packageGlob) => packageGlob.slice(1));
  const manifestPatterns = packageGlobs.map(packageManifestPattern);
  const exclude = [
    "**/.git/**",
    "**/.jj/**",
    "**/node_modules/**",
    "**/dist/**",
    ...excludedPackageGlobs.map(packageManifestPattern),
  ];

  for await (const manifest of glob(manifestPatterns, { cwd: rootDir, exclude })) {
    const manifestPath = path.resolve(rootDir, manifest);
    discovered.set(manifestPath, manifestPath);
  }

  if (discovered.size === 0) {
    diagnostics.push({ message: "preconst discovered zero managed packages" });
    return [];
  }

  const manifestPaths = [...discovered.keys()].sort();
  return Promise.all(
    manifestPaths.map(async (manifestPath) => {
      const manifest = await readJsonObject(manifestPath);
      const dir = path.dirname(manifestPath);
      return {
        dir,
        manifestPath,
        manifest,
        name: typeof manifest.name === "string" ? manifest.name : path.basename(dir),
        tsconfigPath: path.join(dir, config.tsconfig.pkg),
      };
    }),
  );
}

function packageManifestPattern(packageGlob: string): string {
  return path.posix.join(toPosix(packageGlob), "package.json");
}
