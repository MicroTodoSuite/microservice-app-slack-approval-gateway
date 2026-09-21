import { test } from "node:test";
import assert from "node:assert/strict";
import { summaryBlocks } from "../src/shared/slack-client.mjs";

const SLACK_TEXT_LIMIT = 3000;

test("summaryBlocks keeps the technical-detail block within Slack's 3000-character text limit", () => {
  const blocks = summaryBlocks({
    title: "Approval needed",
    technicalText: "x".repeat(5000),
    nonTechnicalText: "A short summary.",
  });

  const technicalBlock = blocks.find((block) => block.text?.text?.includes("Technical detail"));
  assert.ok(technicalBlock, "expected a technical-detail block");
  assert.ok(
    technicalBlock.text.text.length <= SLACK_TEXT_LIMIT,
    `technical-detail block is ${technicalBlock.text.text.length} characters, over Slack's ${SLACK_TEXT_LIMIT}-character limit`,
  );
});

test("summaryBlocks marks the technical detail as truncated when it does not fit", () => {
  const blocks = summaryBlocks({
    title: "Approval needed",
    technicalText: "x".repeat(5000),
    nonTechnicalText: "A short summary.",
  });

  const technicalBlock = blocks.find((block) => block.text?.text?.includes("Technical detail"));
  assert.match(technicalBlock.text.text, /truncated/i);
});

test("summaryBlocks leaves short technical text untouched", () => {
  const technicalText = "## Why\nRotates a compromised credential.";
  const blocks = summaryBlocks({
    title: "Approval needed",
    technicalText,
    nonTechnicalText: "A short summary.",
  });

  const technicalBlock = blocks.find((block) => block.text?.text?.includes("Technical detail"));
  assert.match(technicalBlock.text.text, /Rotates a compromised credential/);
  assert.doesNotMatch(technicalBlock.text.text, /truncated/i);
});
