export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonValue = JsonObject | JsonArray | string | number | boolean | null;

export type RunInput = {
  command: Mode;
  cwd: string;
};

export type RunResult = {
  command: Mode;
  status: "ok" | "invalid" | "failed";
  diagnostics: RunDiagnostic[];
};

export type RunDiagnostic = Diagnostic & {
  kind: "validation" | "failure";
};

export type Mode = "check" | "fix" | "clean" | "dev" | "dist-pkg-json";
export type RepairMode = "check" | "fix";

export type RootConfig = {
  packages: string[];
  tsconfig: {
    base: string;
    build: string;
    pkg: string;
  };
};

export type ManagedPackage = {
  dir: string;
  manifestPath: string;
  manifest: JsonObject;
  name: string;
  tsconfigPath: string;
};

export type DevLink = {
  source: string;
  target: string;
};

export type Workspace = {
  rootDir: string;
  rootManifest: JsonObject;
  config: RootConfig;
  packages: ManagedPackage[];
};

export type Diagnostic = {
  message: string;
};

export type Analysis<T> = {
  value: T | undefined;
  diagnostics: Diagnostic[];
};

export type Result<T> =
  | { ok: true; value: T; diagnostics: [] }
  | { ok: false; diagnostics: Diagnostic[] };

export const DEFAULT_TSCONFIG = {
  base: "./tsconfig.preconst.base.json",
  build: "./tsconfig.preconst.build.json",
  pkg: "tsconfig.preconst.pkg.json",
};

export const REQUIRED_BASE_OPTIONS: JsonObject = {
  module: "NodeNext",
  moduleResolution: "NodeNext",
  allowImportingTsExtensions: true,
  rewriteRelativeImportExtensions: true,
};

export const DEFAULT_BASE_OPTIONS: JsonObject = {
  strict: true,
  declaration: true,
  ...REQUIRED_BASE_OPTIONS,
};
