import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeForNonTechnicalAudience } from "../src/shared/summarize.mjs";

function fakeGroqClient(responseText) {
  const calls = [];
  return {
    calls,
    chat: {
      completions: {
        async create(request) {
          calls.push(request);
          return { choices: [{ message: { content: responseText } }] };
        },
      },
    },
  };
}

test("summarizeForNonTechnicalAudience sends the technical text verbatim as the only factual input", async () => {
  const client = fakeGroqClient("We're updating the login service. Low risk.");
  const technicalText = "## Why\nRotates a compromised credential.";
  await summarizeForNonTechnicalAudience({
    technicalText,
    context: { service: "auth-api", action: "merge-to-production" },
    llmClient: client,
  });

  assert.equal(client.calls.length, 1);
  const [request] = client.calls;
  const promptText = JSON.stringify(request);
  assert.match(promptText, /Rotates a compromised credential/);
});

test("summarizeForNonTechnicalAudience instructs the model not to add unstated facts", async () => {
  const client = fakeGroqClient("Summary.");
  await summarizeForNonTechnicalAudience({
    technicalText: "## Why\nSomething happened.",
    context: { service: "todos-api", action: "deploy-to-production" },
    llmClient: client,
  });

  const [request] = client.calls;
  const promptText = JSON.stringify(request).toLowerCase();
  assert.match(promptText, /do not (add|invent|include|guess|infer)[^.]*\b(fact|information|detail)/);
});

test("summarizeForNonTechnicalAudience returns the model's text response", async () => {
  const client = fakeGroqClient("We're publishing a small, low-risk update.");
  const result = await summarizeForNonTechnicalAudience({
    technicalText: "## Why\nFixes a typo.",
    context: { service: "frontend", action: "merge-to-production" },
    llmClient: client,
  });
  assert.equal(result, "We're publishing a small, low-risk update.");
});

test("summarizeForNonTechnicalAudience propagates an API failure rather than inventing a fallback summary", async () => {
  const failingClient = {
    chat: {
      completions: {
        async create() {
          throw new Error("groq unavailable");
        },
      },
    },
  };
  await assert.rejects(
    () =>
      summarizeForNonTechnicalAudience({
        technicalText: "## Why\nSomething.",
        context: { service: "auth-api", action: "merge-to-production" },
        llmClient: failingClient,
      }),
    /groq unavailable/,
  );
});
