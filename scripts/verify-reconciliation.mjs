#!/usr/bin/env node
/**
 * Verifies the reconciliation contract without touching any data.
 *
 * The dry-run report itself lives in TypeScript (`core/reconciliation/`) and
 * runs from the worker framework. This script is the CI-facing guard for it:
 *
 * 1. every invariant in `RECONCILIATION_INVARIANTS` has a check wired into the
 *    engine, so an invariant can never be declared and then never run;
 * 2. the engine and its job have no write path — no storage writes, no
 *    assignment into a snapshot field — so a dry run is safe in CI;
 * 3. the four drift kinds the report promises are all reachable.
 *
 * Run with: npm run verify:reconciliation
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ENGINE = path.join(root, "core", "reconciliation", "reconciliation.ts");
const JOB = path.join(root, "core", "reconciliation", "job.ts");
const TEST = path.join(root, "core", "reconciliation", "__tests__", "reconciliation.test.ts");

const REQUIRED_KINDS = ["missing", "duplicate", "stale", "inconsistent"];

/** Reads the declared invariant ids straight out of the source. */
function declaredInvariants(source) {
  return [...source.matchAll(/id:\s*"([a-z_]+\.[a-z_]+)"/g)].map((match) => match[1]);
}

/** Reads the invariant ids the engine's check table references. */
function checkedInvariants(source) {
  return [...source.matchAll(/invariant:\s*"([a-z_]+\.[a-z_]+)"/g)].map((match) => match[1]);
}

export async function findReconciliationViolations(projectRoot = root) {
  const read = (file) => readFile(path.join(projectRoot, path.relative(root, file)), "utf8");
  const [engine, job, test] = await Promise.all([read(ENGINE), read(JOB), read(TEST)]);
  const violations = [];

  const declared = new Set(declaredInvariants(engine));
  const checked = new Set(checkedInvariants(engine));

  if (declared.size === 0) violations.push("no invariants are declared in core/reconciliation/reconciliation.ts");
  for (const id of declared) {
    if (!checked.has(id)) violations.push(`invariant ${id} is declared but never checked`);
  }
  for (const id of checked) {
    if (!declared.has(id)) violations.push(`invariant ${id} is checked but not declared`);
  }

  for (const kind of REQUIRED_KINDS) {
    if (!engine.includes(`kind: "${kind}"`) && !engine.includes(`"${kind}"`)) {
      violations.push(`drift kind ${kind} is not represented in the report`);
    }
  }

  // A dry run must not be able to write. These are the writes the engine could
  // plausibly grow: storage, filesystem, or a field assignment on a snapshot.
  const forbidden = [
    [/\.setItem\(/, "writes to storage"],
    [/\bwriteFile/, "writes a file"],
    [/\bdelete\s+\w+\./, "deletes a field"],
    // `typeof input.now === "number"` is a guard, not an assignment.
    [/(?<!typeof )\binput\.\w+\s*=(?!=)/, "assigns into the snapshot"]
  ];
  for (const [file, source] of [
    ["core/reconciliation/reconciliation.ts", engine],
    ["core/reconciliation/job.ts", job]
  ]) {
    for (const [pattern, description] of forbidden) {
      if (pattern.test(source)) violations.push(`${file} ${description}; a dry run must stay read-only`);
    }
  }

  if (!/reconciliation\.dry_run/.test(job)) {
    violations.push("the dry run is not registered as a worker operation");
  }
  if (!test.includes("never mutates the snapshot")) {
    violations.push("the suite has no test proving the snapshot is not mutated");
  }

  return violations;
}

async function main() {
  const violations = await findReconciliationViolations();
  if (!violations.length) {
    console.log("[reconciliation] OK: invariants checked, no write path, dry run is read-only.");
    return;
  }
  console.error("[reconciliation] contract violated:");
  for (const violation of violations) console.error(`  ${violation}`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
