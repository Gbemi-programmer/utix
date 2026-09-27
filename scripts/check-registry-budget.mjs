#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryFile = path.join(root, "core", "registry", "registry.generated.ts");
const source = readFileSync(registryFile, "utf8");

const budget = {
  maxEagerFeatureImports: 0,
  maxManifestOnlyEntries: 0
};

const eagerImportMatches = [...source.matchAll(/import\s+.*?\s+from\s+["']@\/features\/[^"]+\/panel["']/g)];
const lazyLoadMatches = [...source.matchAll(/load:\s*async\s*\(\)\s*=>\s*\{\s*const\s+(?:module|mod)\s*=\s*await\s+import\(\s*["']@\/features\/[^"]+\/panel["']\s*\)/g)];

if (eagerImportMatches.length > budget.maxEagerFeatureImports) {
  console.error(
    `[registry-budget] eager feature-panel imports detected: ${eagerImportMatches.length}. ` +
      "The shared registry may not import implementations directly. Use metadata + load()."
  );
  process.exit(1);
}

if (lazyLoadMatches.length === 0) {
  console.error(
    "[registry-budget] no lazy feature loaders were generated; the registry is still eager."
  );
  process.exit(1);
}

console.log(
  `[registry-budget] ok — ${lazyLoadMatches.length} lazy feature loaders emitted, ` +
  `${eagerImportMatches.length} eager feature-panel imports remain under the budget.`
);
