import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject, JsonValue } from "./types.ts";

export async function readJsonObject(filePath: string): Promise<JsonObject> {
  const text = await readFile(filePath, "utf8");
  return parseJsonObject(filePath, text);
}

export async function readJsoncObject(filePath: string): Promise<JsonObject> {
  const text = await readFile(filePath, "utf8");
  return parseJsonObject(filePath, stripJsonComments(text));
}

function parseJsonObject(filePath: string, text: string): JsonObject {
  const value = JSON.parse(text) as JsonValue;
  const object = asObject(value);
  if (!object) throw new Error(`${filePath} must contain a JSON object`);
  return object;
}

export async function writeJson(filePath: string, value: JsonObject): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function stripJsonComments(text: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
    } else if (char === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      output += "\n";
    } else if (char === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 1;
    } else {
      output += char;
    }
  }
  return stripTrailingCommas(output);
}

function stripTrailingCommas(text: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === ",") {
      let nextToken = i + 1;
      while (/\s/.test(text[nextToken] ?? "")) nextToken += 1;
      if (text[nextToken] === "}" || text[nextToken] === "]") continue;
    }
    output += char;
  }
  return output;
}

export function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
