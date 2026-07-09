import assert from "node:assert/strict";
import test from "node:test";
import { parseCommandLine } from "../src/command-line.ts";

test("parses commands and global options", () => {
  assert.deepEqual(parseCommandLine(["check"]), {
    ok: true,
    action: "run",
    command: "check",
  });
  assert.deepEqual(parseCommandLine(["--help"]), { ok: true, action: "help" });
  assert.deepEqual(parseCommandLine(["-h"]), { ok: true, action: "help" });
  assert.deepEqual(parseCommandLine(["--version"]), { ok: true, action: "version" });
  assert.deepEqual(parseCommandLine(["-v"]), { ok: true, action: "version" });
});

test("rejects missing, unknown, and extra arguments", () => {
  assert.deepEqual(parseCommandLine([]), { ok: false });
  assert.deepEqual(parseCommandLine(["chek"]), {
    ok: false,
    error: "Unknown command: chek",
  });
  assert.deepEqual(parseCommandLine(["check", "--help"]), {
    ok: false,
    error: "Unknown arguments: --help",
  });
  assert.deepEqual(parseCommandLine(["--version", "extra"]), {
    ok: false,
    error: "Unknown arguments: extra",
  });
});
