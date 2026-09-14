import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePrBodySections, extractTechnicalSummary } from "../src/shared/pr-body-sections.mjs";

const SAMPLE_BODY = `## What changes
Bumps auth-api's economical/prod overlay to a new digest.

## Why
CI already built, tested, scanned, and signed this digest.

## Tasks
None.

## How it is verified
- ci.yml gates passed.

## Risk and rollback
Low. Rollback is git revert.

## What this PR does not do
Does not change any other overlay.
`;

test("parsePrBodySections splits on '## Heading' the same way validate-pr.py does", () => {
  const sections = parsePrBodySections(SAMPLE_BODY);
  assert.equal(sections["What changes"], "Bumps auth-api's economical/prod overlay to a new digest.");
  assert.equal(sections["Why"], "CI already built, tested, scanned, and signed this digest.");
  assert.equal(sections["Risk and rollback"], "Low. Rollback is git revert.");
});

test("parsePrBodySections returns an empty object for a body with no headings", () => {
  assert.deepEqual(parsePrBodySections("just some text"), {});
});

test("extractTechnicalSummary concatenates the requested sections verbatim, in order", () => {
  const summary = extractTechnicalSummary(SAMPLE_BODY, ["What changes", "Why", "Risk and rollback"]);
  assert.match(summary, /What changes/);
  assert.match(summary, /Bumps auth-api's economical\/prod overlay/);
  assert.match(summary, /Risk and rollback/);
  assert.match(summary, /Rollback is git revert/);
  // Order matters: "Why" must appear before "Risk and rollback" in the output.
  assert.ok(summary.indexOf("CI already built") < summary.indexOf("Low. Rollback"));
});

test("extractTechnicalSummary throws when a required section is missing, rather than silently omitting it", () => {
  const bodyMissingRisk = "## What changes\nSomething.\n\n## Why\nBecause.\n";
  assert.throws(() => extractTechnicalSummary(bodyMissingRisk, ["What changes", "Why", "Risk and rollback"]));
});

test("extractTechnicalSummary never fabricates content beyond the source body", () => {
  const summary = extractTechnicalSummary(SAMPLE_BODY, ["What changes"]);
  assert.equal(summary.trim(), "## What changes\nBumps auth-api's economical/prod overlay to a new digest.");
});
