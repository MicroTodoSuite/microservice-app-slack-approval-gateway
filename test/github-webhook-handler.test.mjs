import { test } from "node:test";
import assert from "node:assert/strict";
import { handleGithubWebhookEvent } from "../src/github-webhook-handler/handle.mjs";

function baseDeps(overrides = {}) {
  const posted = [];
  return {
    webhookSecret: "gh-secret",
    verifyGithubSignature: () => true,
    extractTechnicalSummary: (body) => `TECHNICAL:${body}`,
    extractWorkflowJobSummary: (payload) => ({
      service: payload.repository.name,
      environment: "prod",
      runUrl: "https://github.com/example/run/1",
    }),
    summarize: async ({ technicalText }) => `NON-TECHNICAL:${technicalText}`,
    slackClient: {
      postedApprovals: posted,
      async postApprovalMessage(args) {
        posted.push({ kind: "approval", ...args });
      },
      async postNotification(args) {
        posted.push({ kind: "notification", ...args });
      },
    },
    ...overrides,
  };
}

function headersWith(eventName) {
  return { "x-github-event": eventName, "x-hub-signature-256": "sha256=irrelevant-because-mocked" };
}

test("rejects the request when the signature does not verify", async () => {
  const deps = baseDeps({ verifyGithubSignature: () => false });
  const result = await handleGithubWebhookEvent({
    headers: headersWith("pull_request"),
    rawBody: "{}",
    deps,
  });
  assert.equal(result.statusCode, 401);
  assert.equal(deps.slackClient.postedApprovals.length, 0);
});

test("posts an approval message for a non-draft PR opened against microservice-app-gitops", async () => {
  const deps = baseDeps();
  const payload = {
    action: "opened",
    repository: { name: "microservice-app-gitops" },
    pull_request: { number: 169, draft: false, body: "## What changes\nBumps a digest.", html_url: "https://x/169" },
  };
  const result = await handleGithubWebhookEvent({
    headers: headersWith("pull_request"),
    rawBody: JSON.stringify(payload),
    deps,
  });

  assert.equal(result.statusCode, 200);
  assert.equal(deps.slackClient.postedApprovals.length, 1);
  const posted = deps.slackClient.postedApprovals[0];
  assert.equal(posted.kind, "approval");
  assert.match(posted.technicalText, /TECHNICAL:/);
  assert.match(posted.nonTechnicalText, /NON-TECHNICAL:/);
  // The action value must carry enough metadata for the interaction handler
  // to know exactly which PR to approve/merge -- never guess it from context.
  const approveAction = posted.actions.find((a) => a.actionId === "approve");
  const parsedValue = JSON.parse(approveAction.value);
  assert.equal(parsedValue.repo, "microservice-app-gitops");
  assert.equal(parsedValue.prNumber, 169);
});

test("ignores a draft PR (not ready for human approval yet)", async () => {
  const deps = baseDeps();
  const payload = {
    action: "opened",
    repository: { name: "microservice-app-gitops" },
    pull_request: { number: 1, draft: true, body: "## What changes\nWIP.", html_url: "https://x/1" },
  };
  const result = await handleGithubWebhookEvent({
    headers: headersWith("pull_request"),
    rawBody: JSON.stringify(payload),
    deps,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(deps.slackClient.postedApprovals.length, 0);
});

test("ignores a pull_request event from a repository other than gitops", async () => {
  const deps = baseDeps();
  const payload = {
    action: "opened",
    repository: { name: "microservice-app-auth-api" },
    pull_request: { number: 1, draft: false, body: "## What changes\nX.", html_url: "https://x/1" },
  };
  const result = await handleGithubWebhookEvent({
    headers: headersWith("pull_request"),
    rawBody: JSON.stringify(payload),
    deps,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(deps.slackClient.postedApprovals.length, 0);
});

test("posts a link-only notification (no buttons) when a workflow_job starts waiting on environment approval", async () => {
  const deps = baseDeps();
  const payload = {
    action: "waiting",
    repository: { name: "microservice-app-auth-api" },
    workflow_job: { html_url: "https://github.com/example/run/1" },
  };
  const result = await handleGithubWebhookEvent({
    headers: headersWith("workflow_job"),
    rawBody: JSON.stringify(payload),
    deps,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(deps.slackClient.postedApprovals.length, 1);
  const posted = deps.slackClient.postedApprovals[0];
  assert.equal(posted.kind, "notification");
  assert.equal(posted.actions, undefined);
});

test("ignores a workflow_job event that is not the waiting transition", async () => {
  const deps = baseDeps();
  const payload = {
    action: "completed",
    repository: { name: "microservice-app-auth-api" },
    workflow_job: { html_url: "https://github.com/example/run/1" },
  };
  const result = await handleGithubWebhookEvent({
    headers: headersWith("workflow_job"),
    rawBody: JSON.stringify(payload),
    deps,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(deps.slackClient.postedApprovals.length, 0);
});

test("ignores an event type it does not understand", async () => {
  const deps = baseDeps();
  const result = await handleGithubWebhookEvent({
    headers: headersWith("issue_comment"),
    rawBody: "{}",
    deps,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(deps.slackClient.postedApprovals.length, 0);
});
