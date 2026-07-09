import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { styleText } from "node:util";
import {
  formatHelp,
  formatRunResult,
  formatUsageError,
  formatVersion,
} from "../src/presentation.ts";

test("formats plain help and version output", () => {
  const stream = new PassThrough();
  assert.equal(
    formatHelp(stream),
    [
      "Usage: preconst <command>",
      "",
      "Commands:",
      "  check          Check project configuration",
      "  fix            Fix project configuration",
      "  clean          Remove build output",
      "  dev            Create dist -> src symlinks for development",
      "  dist-pkg-json  Write dist package.json for imports field",
      "",
      "Options:",
      "  -h, --help     Show help",
      "  -v, --version  Show version",
      "",
    ].join("\n"),
  );
  assert.equal(formatVersion("1.2.3", stream), "preconst 1.2.3\n");
});

test("formats plain usage and run results", () => {
  const streams = { stdout: new PassThrough(), stderr: new PassThrough() };
  assert.equal(
    formatUsageError("Unknown command: chek", streams.stderr),
    "✖ Unknown command: chek\n  Run preconst --help for usage.\n",
  );
  assert.deepEqual(formatRunResult({ command: "check", status: "ok", diagnostics: [] }, streams), {
    stdout: "✔ preconst check succeeded\n",
    stderr: "",
  });
  assert.deepEqual(
    formatRunResult(
      {
        command: "check",
        status: "invalid",
        diagnostics: [
          { kind: "validation", message: "root build tsconfig is out of date" },
          { kind: "validation", message: "package exports are out of date" },
        ],
      },
      streams,
    ),
    {
      stdout: "",
      stderr:
        "✖ preconst check failed\n  • root build tsconfig is out of date\n  • package exports are out of date\n",
    },
  );
});

test("uses styleText against the destination stream", () => {
  const stdout = terminalStream();
  const stderr = terminalStream();
  const output = formatRunResult(
    { command: "check", status: "ok", diagnostics: [] },
    { stdout, stderr },
  );

  assert.equal(
    output.stdout,
    `${styleText("green", "✔", { stream: stdout })} ${styleText("bold", "preconst", { stream: stdout })} ${styleText("cyan", "check", { stream: stdout })} ${styleText("green", "succeeded", { stream: stdout })}\n`,
  );
});

function terminalStream(): PassThrough {
  const stream = new PassThrough() as PassThrough & {
    isTTY: boolean;
    getColorDepth: () => number;
    hasColors: () => boolean;
  };
  stream.isTTY = true;
  stream.getColorDepth = () => 8;
  stream.hasColors = () => true;
  return stream;
}
