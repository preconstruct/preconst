import path from "node:path";

export function isPackageSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".") && !path.isAbsolute(specifier);
}

export function isRootLocalPath(rootDir: string, candidate: string): boolean {
  if (isPackageSpecifier(candidate)) return false;
  return isInsideOrSame(rootDir, path.resolve(rootDir, candidate));
}

export function isInsideOrSame(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function isSafePackageExportTarget(value: string): boolean {
  return packageExportTargetError(value) === undefined;
}

export function packageExportTargetError(value: string): string | undefined {
  if (!value.startsWith("./")) return 'must start with "./"';
  if (value.includes("\\")) return "must not contain backslashes";
  return packagePathSegmentsError(value);
}

export function packageSourcePathError(packageDir: string, value: string): string | undefined {
  if (!value.startsWith("./src/")) return 'must start with "./src/"';
  if (!value.endsWith(".ts") && !value.endsWith(".tsx")) return "must end with .ts or .tsx";
  if (value.includes("\\")) return "must not contain backslashes";
  const segmentError = packagePathSegmentsError(value);
  if (segmentError) return segmentError;
  if (!isInsideOrSame(path.join(packageDir, "src"), path.resolve(packageDir, value))) {
    return "must stay inside the package's ./src/ directory";
  }
  return undefined;
}

function packagePathSegmentsError(value: string): string | undefined {
  for (const segment of value.split("/").slice(1)) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment).toLowerCase();
    } catch {
      return `contains invalid percent-encoding in path segment ${JSON.stringify(segment)}`;
    }
    if (decoded === "." || decoded === "..") {
      return `must not contain ${JSON.stringify(decoded)} path segments`;
    }
    if (decoded === "node_modules") return 'must not contain a "node_modules" path segment';
    if (decoded.includes("/") || decoded.includes("\\")) {
      return `must not contain encoded path separators in segment ${JSON.stringify(segment)}`;
    }
  }

  return undefined;
}

export function isSafePackageSourcePath(packageDir: string, value: string): boolean {
  return packageSourcePathError(packageDir, value) === undefined;
}

export function relativeJsonPath(from: string, to: string): string {
  const relative = toPosix(path.relative(from, to));
  return relative.startsWith(".") ? relative : `./${relative}`;
}

export function relativePath(from: string, to: string): string {
  return toPosix(path.relative(from, to));
}

export function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

export function compareString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
