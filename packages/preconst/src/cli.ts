#!/usr/bin/env node
import { createRequire } from "node:module";
import { parseCommandLine } from "./command-line.ts";
import { formatHelp, formatRunResult, formatUsageError, formatVersion } from "./presentation.ts";
import { runPreconst } from "./preconst.ts";

const parsed = parseCommandLine(process.argv.slice(2));
if (!parsed.ok) {
  process.stderr.write(
    parsed.error ? formatUsageError(parsed.error, process.stderr) : formatHelp(process.stderr),
  );
  process.exitCode = 1;
} else if (parsed.action === "help") {
  process.stdout.write(formatHelp(process.stdout));
} else if (parsed.action === "version") {
  const require = createRequire(import.meta.url);
  const manifest = require("../package.json") as { version: string };
  process.stdout.write(formatVersion(manifest.version, process.stdout));
} else {
  const result = await runPreconst({
    command: parsed.command,
    cwd: process.cwd(),
  });

  const output = formatRunResult(result, process);
  process.stdout.write(output.stdout);
  process.stderr.write(output.stderr);
  process.exitCode = result.status === "ok" ? 0 : 1;
}
