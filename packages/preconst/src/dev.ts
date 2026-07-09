import { mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { asObject, exists, readJsoncObject } from "./json.ts";
import { deriveDevLinks } from "./package-manifest.ts";
import { resolveTsconfig } from "./tsconfig-resolver.ts";
import type { ResolvedCompilerOption } from "./tsconfig-resolver.ts";
import type { Diagnostic, ManagedPackage, Workspace } from "./types.ts";

export async function clean(workspace: Workspace): Promise<void> {
  await Promise.all(
    workspace.packages.map(async (pkg) => {
      await rm(path.join(pkg.dir, "dist"), { recursive: true, force: true });
      await rm(await packageBuildInfoPath(pkg), { force: true });
    }),
  );
}

async function packageBuildInfoPath(pkg: ManagedPackage): Promise<string> {
  let configured: ResolvedCompilerOption | undefined;
  if (await exists(pkg.tsconfigPath)) {
    try {
      const config = await readJsoncObject(pkg.tsconfigPath);
      const value = asObject(config.compilerOptions)?.tsBuildInfoFile;
      if (value !== undefined) {
        configured = { value, sourceConfigPath: pkg.tsconfigPath };
      }
    } catch {
      // Fall through to the default path when a broken config cannot be resolved.
    }
  }
  if (!configured) {
    const resolved = await resolveTsconfig(pkg.tsconfigPath);
    configured = resolved.value.compilerOptions.tsBuildInfoFile;
  }
  if (typeof configured?.value === "string" && configured.value.length > 0) {
    return path.resolve(path.dirname(configured.sourceConfigPath), configured.value);
  }
  const tsconfigPathParts = path.parse(pkg.tsconfigPath);
  return path.join(tsconfigPathParts.dir, `${tsconfigPathParts.name}.tsbuildinfo`);
}

export async function createDevSymlinks(workspace: Workspace): Promise<Diagnostic[]> {
  const packageDiagnostics = await Promise.all(
    workspace.packages.map(async (pkg) => {
      const derived = await deriveDevLinks(pkg);
      for (const link of derived.value ?? []) {
        const targetPath = path.join(pkg.dir, link.target);
        await mkdir(path.dirname(targetPath), { recursive: true });
        await symlink(
          path.relative(path.dirname(targetPath), path.join(pkg.dir, link.source)),
          targetPath,
        );
      }
      return derived.diagnostics;
    }),
  );
  return packageDiagnostics.flat();
}
