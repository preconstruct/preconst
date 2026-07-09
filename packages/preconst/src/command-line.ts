import type { Mode } from "./types.ts";

export type ParsedCommandLine =
  | { ok: true; action: "run"; command: Mode }
  | { ok: true; action: "help" }
  | { ok: true; action: "version" }
  | { ok: false; error?: string };

export function parseCommandLine(argv: string[]): ParsedCommandLine {
  const [command, ...rest] = argv;
  if (!command) return { ok: false };
  if (command === "--help" || command === "-h") {
    if (rest.length > 0) return unknownArguments(rest);
    return { ok: true, action: "help" };
  }
  if (command === "--version" || command === "-v") {
    if (rest.length > 0) return unknownArguments(rest);
    return { ok: true, action: "version" };
  }
  if (rest.length > 0) return { ok: false, error: `Unknown arguments: ${rest.join(" ")}` };
  if (
    command === "check" ||
    command === "fix" ||
    command === "clean" ||
    command === "dev" ||
    command === "dist-pkg-json"
  ) {
    return { ok: true, action: "run", command };
  }
  return { ok: false, error: `Unknown command: ${command}` };
}

function unknownArguments(args: string[]): ParsedCommandLine {
  return { ok: false, error: `Unknown arguments: ${args.join(" ")}` };
}
