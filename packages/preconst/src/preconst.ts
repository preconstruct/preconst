import path from "node:path";
import { clean, createDevSymlinks } from "./dev.ts";
import { asObject, readJsonObject } from "./json.ts";
import {
  reconcilePackageManifest,
  writePackageDistPackageJson,
  writeWorkspaceDistPackageJsons,
} from "./package-manifest.ts";
import { relativePath } from "./paths.ts";
import { deriveReferences } from "./references.ts";
import { reconcileTsconfigs, validateTsconfigPaths } from "./tsconfig.ts";
import { loadWorkspace } from "./workspace.ts";
import type { Diagnostic, Mode, RepairMode, RunInput, RunResult, Workspace } from "./types.ts";

export async function runPreconst(input: RunInput): Promise<RunResult> {
  try {
    if (input.command === "dist-pkg-json") {
      return finish(await runDistPackageJson(input.cwd), input.command);
    }

    if (input.command === "clean") {
      const loaded = await loadWorkspace(input.cwd);
      if (!loaded.ok) {
        return finish(loaded.diagnostics, input.command);
      }
      await clean(loaded.value);
      return finish([], input.command);
    }

    const loaded = await loadWorkspace(input.cwd);
    if (!loaded.ok) {
      return finish(loaded.diagnostics, input.command);
    }
    const workspace = loaded.value;
    const mode: RepairMode = input.command === "fix" ? "fix" : "check";
    const diagnostics = await reconcileWorkspace(workspace, mode);

    if (input.command === "dev") {
      if (diagnostics.length > 0) return finish(diagnostics, input.command);
      await clean(workspace);
      diagnostics.push(...(await createDevSymlinks(workspace)));
    }

    return finish(diagnostics, input.command);
  } catch (error) {
    return {
      command: input.command,
      status: "failed",
      diagnostics: [
        { kind: "failure", message: error instanceof Error ? error.message : String(error) },
      ],
    };
  }
}

async function runDistPackageJson(cwd: string): Promise<Diagnostic[]> {
  const manifest = await readJsonObject(path.join(cwd, "package.json"));
  const packageGlobs = asObject(manifest.preconst)?.packages;
  if (
    Array.isArray(packageGlobs) &&
    packageGlobs.every((packageGlob) => typeof packageGlob === "string")
  ) {
    const loaded = await loadWorkspace(cwd);
    if (!loaded.ok) return loaded.diagnostics;
    const distManifests = await writeWorkspaceDistPackageJsons(loaded.value.packages);
    if (distManifests.diagnostics.length > 0) return distManifests.diagnostics;
    if (distManifests.targetCount === 0) {
      return [
        {
          message:
            "preconst dist-pkg-json found no packages with preconst.imports: true and imports",
        },
      ];
    }
    return [];
  }
  if (packageGlobs !== undefined) {
    return [{ message: "preconst.packages must be a string array" }];
  }
  return writePackageDistPackageJson(cwd, manifest);
}

function finish(diagnostics: Diagnostic[], command: Mode): RunResult {
  if (diagnostics.length > 0) {
    return {
      command,
      status: "invalid",
      diagnostics: diagnostics.map((diagnostic) => ({
        kind: "validation",
        message: diagnostic.message,
      })),
    };
  }
  return { command, status: "ok", diagnostics: [] };
}

async function reconcileWorkspace(workspace: Workspace, mode: RepairMode): Promise<Diagnostic[]> {
  const diagnostics = validateTsconfigPaths(workspace);
  for (const pkg of workspace.packages) {
    if (typeof pkg.manifest.name !== "string") {
      diagnostics.push({
        message: `${relativePath(workspace.rootDir, pkg.manifestPath)} must have a string name`,
      });
    }
  }
  if (diagnostics.length > 0) return diagnostics;
  const references = deriveReferences(workspace);
  diagnostics.push(...references.diagnostics);

  const packageDiagnostics = await Promise.all(
    workspace.packages.map((pkg) => reconcilePackageManifest(pkg, mode)),
  );
  diagnostics.push(...packageDiagnostics.flat());

  if (references.value) {
    diagnostics.push(...(await reconcileTsconfigs(workspace, references.value, mode)));
  }
  return diagnostics;
}
