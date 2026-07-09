import path from "node:path";
import { asObject } from "./json.ts";
import { compareString, relativeJsonPath } from "./paths.ts";
import type { Analysis, Diagnostic, JsonObject, Workspace } from "./types.ts";

export function deriveReferences(workspace: Workspace): Analysis<Map<string, JsonObject[]>> {
  const diagnostics: Diagnostic[] = [];
  const byName = new Map(workspace.packages.map((pkg) => [pkg.name, pkg]));
  const edges = new Map<string, { target: string; devOnly: boolean }[]>();
  for (const pkg of workspace.packages) {
    const outgoing: { target: string; devOnly: boolean }[] = [];
    const nonDevDeps = new Set<string>();
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      for (const name of Object.keys(asObject(pkg.manifest[field]) ?? {})) nonDevDeps.add(name);
    }
    for (const name of nonDevDeps) {
      if (name !== pkg.name && byName.has(name)) outgoing.push({ target: name, devOnly: false });
    }
    for (const name of Object.keys(asObject(pkg.manifest.devDependencies) ?? {})) {
      if (name !== pkg.name && byName.has(name) && !nonDevDeps.has(name)) {
        outgoing.push({ target: name, devOnly: true });
      }
    }
    edges.set(
      pkg.name,
      outgoing.sort((a, b) => compareString(a.target, b.target)),
    );
  }

  const activeEdges = new Map([...edges].map(([name, value]) => [name, [...value]]));
  let omitted = true;
  while (omitted) {
    omitted = false;
    for (const [source, outgoing] of activeEdges) {
      for (const edge of [...outgoing]) {
        if (edge.devOnly && hasPath(activeEdges, edge.target, source)) {
          activeEdges.set(
            source,
            outgoing.filter((candidate) => candidate !== edge),
          );
          omitted = true;
          break;
        }
      }
      if (omitted) break;
    }
  }

  const cycle = findCycle(activeEdges);
  if (cycle)
    diagnostics.push({
      message: `managed package dependency cycle: ${cycle.join(" -> ")}`,
    });

  const references = new Map<string, JsonObject[]>();
  for (const pkg of workspace.packages) {
    const refs = (activeEdges.get(pkg.name) ?? []).map((edge) => {
      const target = byName.get(edge.target);
      return {
        path: relativeJsonPath(path.dirname(pkg.tsconfigPath), target?.tsconfigPath ?? ""),
      };
    });
    references.set(pkg.name, refs);
  }
  return { value: references, diagnostics };
}

function hasPath(
  edges: Map<string, { target: string }[]>,
  from: string,
  to: string,
  seen = new Set<string>(),
): boolean {
  if (from === to) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return (edges.get(from) ?? []).some((edge) => hasPath(edges, edge.target, to, seen));
}

function findCycle(edges: Map<string, { target: string }[]>): string[] | undefined {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  function visit(name: string): string[] | undefined {
    if (visiting.has(name)) return [...stack.slice(stack.indexOf(name)), name];
    if (visited.has(name)) return undefined;
    visiting.add(name);
    stack.push(name);
    for (const edge of edges.get(name) ?? []) {
      const cycle = visit(edge.target);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(name);
    visited.add(name);
    return undefined;
  }
  for (const name of edges.keys()) {
    const cycle = visit(name);
    if (cycle) return cycle;
  }
  return undefined;
}
