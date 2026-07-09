import { styleText } from "node:util";
import type { RunResult } from "./types.ts";

type Format = Parameters<typeof styleText>[0];
type Stream = NodeJS.WritableStream;

const commands = [
  ["check", "Check project configuration"],
  ["fix", "Fix project configuration"],
  ["clean", "Remove build output"],
  ["dev", "Create dist -> src symlinks for development"],
  ["dist-pkg-json", "Write dist package.json for imports field"],
] as const;

const options = [
  ["-h, --help", "Show help"],
  ["-v, --version", "Show version"],
] as const;

export function formatHelp(stream: Stream): string {
  return [
    `${style("bold", "Usage:", stream)} ${style("cyan", "preconst <command>", stream)}`,
    "",
    style("bold", "Commands:", stream),
    ...commands.map(([command, description]) => formatDescription(command, description, stream)),
    "",
    style("bold", "Options:", stream),
    ...options.map(([option, description]) => formatDescription(option, description, stream)),
    "",
  ].join("\n");
}

export function formatVersion(version: string, stream: Stream): string {
  return `${style("bold", "preconst", stream)} ${version}\n`;
}

export function formatUsageError(error: string, stream: Stream): string {
  return [
    `${style("red", "✖", stream)} ${style("red", error, stream)}`,
    `  ${style("dim", "Run preconst --help for usage.", stream)}`,
    "",
  ].join("\n");
}

export function formatRunResult(
  result: RunResult,
  streams: { stdout: Stream; stderr: Stream },
): { stdout: string; stderr: string } {
  if (result.status === "ok") {
    return {
      stdout: `${style("green", "✔", streams.stdout)} ${style("bold", "preconst", streams.stdout)} ${style("cyan", result.command, streams.stdout)} ${style("green", "succeeded", streams.stdout)}\n`,
      stderr: "",
    };
  }

  const heading = `${style("red", "✖", streams.stderr)} ${style("bold", "preconst", streams.stderr)} ${style("cyan", result.command, streams.stderr)} ${style("red", "failed", streams.stderr)}`;
  const diagnostics = result.diagnostics.map(
    ({ message }) => `  ${style("red", "•", streams.stderr)} ${message}`,
  );
  return { stdout: "", stderr: `${[heading, ...diagnostics].join("\n")}\n` };
}

function formatDescription(label: string, description: string, stream: Stream): string {
  return `  ${style("cyan", label.padEnd(15), stream)}${style("dim", description, stream)}`;
}

function style(format: Format, text: string, stream: Stream): string {
  return styleText(format, text, { stream });
}
