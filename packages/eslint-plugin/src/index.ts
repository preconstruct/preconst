// @ts-nocheck Oxlint's JavaScript plugin API does not currently publish TypeScript types.
import fs from "node:fs";
import path from "node:path";

const TS_EXTENSIONS = [".ts", ".tsx"];
const JS_EXTENSIONS = [".js"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const EXTENSION_PATTERN = /\.[^./]+$/u;

const requireNodeEsmImports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "require relative imports to include an existing .ts/.tsx/.js extension and explicit /index",
    },
    fixable: "code",
    schema: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          extensions: {
            type: "array",
            items: {
              enum: TS_EXTENSIONS,
            },
            uniqueItems: true,
            minItems: 1,
          },
        },
      },
    ],
    defaultOptions: [
      {
        extensions: TS_EXTENSIONS,
      },
    ],
    messages: {
      useResolved: "Use '{{resolved}}' for this relative import.",
    },
  },

  create(context) {
    const filename = getFilename(context);
    if (!isSourceFile(filename)) return {};

    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const options = context.options ?? [];
    const [{ extensions = TS_EXTENSIONS } = {}] = options;

    function checkSource(node) {
      if (!node || typeof node.value !== "string") return;

      const specifier = node.value;
      if (!isRelativeSpecifier(specifier)) return;

      const resolved = resolveSpecifier(filename, specifier, extensions);
      if (!resolved || resolved === specifier) return;

      context.report({
        node,
        messageId: "useResolved",
        data: { resolved },
        fix(fixer) {
          return fixer.replaceTextRange(node.range, quoteLikeSource(sourceCode, node, resolved));
        },
      });
    }

    return {
      ImportDeclaration(node) {
        checkSource(node.source);
      },
      ExportAllDeclaration(node) {
        checkSource(node.source);
      },
      ExportNamedDeclaration(node) {
        checkSource(node.source);
      },
      ImportExpression(node) {
        checkSource(node.source);
      },
    };
  },
};

function getFilename(context) {
  return context.filename ?? context.getFilename();
}

function isSourceFile(filename) {
  return SOURCE_EXTENSIONS.has(path.extname(filename));
}

function isRelativeSpecifier(specifier) {
  return (
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../")
  );
}

function resolveSpecifier(importer, specifier, extensions) {
  const importerDir = path.dirname(importer);
  const absoluteBase = path.resolve(importerDir, specifier);
  if (isFile(absoluteBase)) return specifier;

  const withoutJsExtension = stripJsExtension(absoluteBase);
  const candidates = candidatePaths(withoutJsExtension, extensions);

  for (const candidate of candidates) {
    if (!isFile(candidate)) continue;
    const relative = toSpecifier(path.relative(importerDir, candidate));
    return relative;
  }

  return undefined;
}

function stripJsExtension(filePath) {
  return filePath.endsWith(".js") || filePath.endsWith(".jsx")
    ? filePath.slice(0, -path.extname(filePath).length)
    : filePath;
}

function candidatePaths(base, extensions) {
  if (hasExtension(base)) return [base];

  const candidateExtensions = [...extensions, ...JS_EXTENSIONS];
  const direct = candidateExtensions.map((extension) => base + extension);
  const index = candidateExtensions.map((extension) => path.join(base, "index" + extension));
  return [...direct, ...index];
}

function hasExtension(filePath) {
  return EXTENSION_PATTERN.test(path.basename(filePath));
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function toSpecifier(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  return normalized.startsWith(".") ? normalized : "./" + normalized;
}

function quoteLikeSource(sourceCode, node, value) {
  const raw = sourceCode.getText(node);
  const quote = raw.startsWith("'") ? "'" : '"';
  return quote + value + quote;
}

export default {
  meta: {
    name: "eslint-plugin-preconst",
  },
  rules: {
    "node-esm-imports": requireNodeEsmImports,
  },
};
