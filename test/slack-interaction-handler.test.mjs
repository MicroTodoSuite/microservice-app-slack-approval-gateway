import { test } from "node:test";
import assert from "node:assert/strict";
import { handleSlackInteractionEvent } from "../src/slack-interaction-handler/handle.mjs";

function formEncodedBody(payloadObject) {
  return `payload=${encodeURIComponent(JSON.stringify(payloadObject))}`;
}

function baseDeps(overrides = {}) {
  const merged = [];
  const reviewed = [];
  const updated = [];
  const ephemeral = [];
  return {
    signingSecret: "slack-secret",
    verifySlackSignature: () => true,
    authorizedApprovers: [
      { slackUserId: "U_JUAN", githubLogin: "Juanmadiaz45" },
      { slackUserId: "U_ESTEBAN", githubLogin: "EstebanGZam" },
    ],
    reviewed,
    merged,
    updated,
    ephemeral,
    getInstallationOctokit: async () => ({
      rest: {
        pulls: {
          async createReview(args) {
            reviewed.push(args);
          },
          async merge(args) {
            merged.push(args);
          },
        },
      },
    }),
    slackClient: {
      async updateMessage(args) {
        updated.push(args);
      },
      async postEphemeral(args) {
        ephemeral.push(args);
      },
    },
    ...overrides,
  };
}

function blockActionsPayload({ userId = "U_JUAN", actionId = "approve", value = JSON.stringify({ repo: "microservice-app-gitops", prNumber: 169 }) } = {}) {
  return {
    type: "block_actions",
    user: { id: userId, username: "whoever" },
    actions: [{ action_id: actionId, value }],
    channel: { id: "C123" },
    message: { ts: "111.222" },
    response_url: "https://hooks.slack.test/actions/abc",
  };
}

test("rejects the request when the Slack signature does not verify", async () => {
  const deps = baseDeps({ verifySlackSignature: () => false });
  const result = await handleSlackInteractionEvent({
    headers: { "x-slack-signature": "v0=irrelevant", "x-slack-request-timestamp": "1" },
    rawBody: formEncodedBody(blockActionsPayload()),
    deps,
  });
  assert.equal(result.statusCode, 401);
  assert.equal(deps.merged.length, 0);
});

test("an authorized approver clicking Approve submits an APPROVE review and merges", async () => {
  const deps = baseDeps();
  const result = await handleSlackInteractionEvent({
    headers: { "x-slack-signature": "v0=x", "x-slack-request-timestamp": "1" },
    rawBody: formEncodedBody(blockActionsPayload({ userId: "U_JUAN", actionId: "approve" })),
    deps,
  });

  assert.equal(result.statusCode, 200);
  assert.equal(deps.reviewed.length, 1);
  assert.equal(deps.reviewed[0].event, "APPROVE");
  assert.equal(deps.reviewed[0].pull_number, 169);
  assert.equal(deps.merged.length, 1);
  assert.equal(deps.updated.length, 1);
  assert.match(deps.updated[0].text, /Juanmadiaz45/);
});

test("an authorized approver clicking Request changes submits REQUEST_CHANGES and never merges", async () => {
  const deps = baseDeps();
  const result = await handleSlackInteractionEvent({
    headers: { "x-slack-signature": "v0=x", "x-slack-request-timestamp": "1" },
    rawBody: formEncodedBody(blockActionsPayload({ userId: "U_ESTEBAN", actionId: "reject" })),
    deps,
  });

  assert.equal(result.statusCode, 200);
  assert.equal(deps.reviewed.length, 1);
  assert.equal(deps.reviewed[0].event, "REQUEST_CHANGES");
  assert.equal(deps.merged.length, 0, "a rejection must never merge the pull request");
});

test("an unrecognized Slack user is refused, logged as ephemeral, and never touches GitHub", async () => {
  const deps = baseDeps();
  const result = await handleSlackInteractionEvent({
    headers: { "x-slack-signature": "v0=x", "x-slack-request-timestamp": "1" },
    rawBody: formEncodedBody(blockActionsPayload({ userId: "U_UNKNOWN_INTRUDER", actionId: "approve" })),
    deps,
  });

  assert.equal(result.statusCode, 200);
  assert.equal(deps.reviewed.length, 0);
  assert.equal(deps.merged.length, 0);
  assert.equal(deps.ephemeral.length, 1);
  assert.match(deps.ephemeral[0].text, /not authorized/i);
});
