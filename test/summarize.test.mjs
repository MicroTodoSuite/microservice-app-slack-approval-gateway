import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeForNonTechnicalAudience } from "../src/shared/summarize.mjs";

function fakeAnthropicClient(responseText) {
  const calls = [];
  return {
    calls,
    messages: {
      async create(request) {
        calls.push(request);
        return { content: [{ type: "text", text: responseText }] };
      },
    },
  };
}

test("summarizeForNonTechnicalAudience sends the technical text verbatim as the only factual input", async () => {
  const client = fakeAnthropicClient("We're updating the login service. Low risk.");
  const technicalText = "## Why\nRotates a compromised credential.";
  await summarizeForNonTechnicalAudience({
    technicalText,
    context: { service: "auth-api", action: "merge-to-production" },
    anthropicClient: client,
  });

  assert.equal(client.calls.length, 1);
  const [request] = client.calls;
  const promptText = JSON.stringify(request);
  assert.match(promptText, /Rotates a compromised credential/);
});

test("summarizeForNonTechnicalAudience instructs the model not to add unstated facts", async () => {
  const client = fakeAnthropicClient("Summary.");
  await summarizeForNonTechnicalAudience({
    technicalText: "## Why\nSomething happened.",
    context: { service: "todos-api", action: "deploy-to-production" },
    anthropicClient: client,
  });

  const [request] = client.calls;
  const promptText = JSON.stringify(request).toLowerCase();
  assert.match(promptText, /do not (add|invent|include|guess|infer)[^.]*\b(fact|information|detail)/);
});

test("summarizeForNonTechnicalAudience returns the model's text response", async () => {
  const client = fakeAnthropicClient("We're publishing a small, low-risk update.");
  const result = await summarizeForNonTechnicalAudience({
    technicalText: "## Why\nFixes a typo.",
    context: { service: "frontend", action: "merge-to-production" },
    anthropicClient: client,
  });
  assert.equal(result, "We're publishing a small, low-risk update.");
});

test("summarizeForNonTechnicalAudience propagates an API failure rather than inventing a fallback summary", async () => {
  const failingClient = {
    messages: {
      async create() {
        throw new Error("anthropic unavailable");
      },
    },
  };
  await assert.rejects(
    () =>
      summarizeForNonTechnicalAudience({
        technicalText: "## Why\nSomething.",
        context: { service: "auth-api", action: "merge-to-production" },
        anthropicClient: failingClient,
      }),
    /anthropic unavailable/,
  );
});
