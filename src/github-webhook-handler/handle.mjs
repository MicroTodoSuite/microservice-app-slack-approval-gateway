const GITOPS_REPO = "microservice-app-gitops";
const PR_ACTIONS_NEEDING_REVIEW = new Set(["opened", "reopened", "ready_for_review", "synchronize"]);
const TECHNICAL_SECTIONS = ["What changes", "Why", "Risk and rollback"];

function header(headers, name) {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

async function handlePullRequestEvent(payload, deps) {
  const isGitopsRepo = payload.repository.name === GITOPS_REPO;
  const isReviewableAction = PR_ACTIONS_NEEDING_REVIEW.has(payload.action);
  if (!isGitopsRepo || !isReviewableAction || payload.pull_request.draft) {
    return { statusCode: 200, body: "ignored" };
  }

  const technicalText = deps.extractTechnicalSummary(payload.pull_request.body, TECHNICAL_SECTIONS);
  const nonTechnicalText = await deps.summarize({
    technicalText,
    context: { service: GITOPS_REPO, action: "merge-to-production" },
    llmClient: deps.llmClient,
  });

  const value = JSON.stringify({ repo: GITOPS_REPO, prNumber: payload.pull_request.number });
  await deps.slackClient.postApprovalMessage({
    title: `Approval needed: PR #${payload.pull_request.number} into ${GITOPS_REPO}`,
    technicalText,
    nonTechnicalText,
    actions: [
      { actionId: "approve", label: "Approve", style: "primary", value },
      { actionId: "reject", label: "Request changes", style: "danger", value },
    ],
  });
  return { statusCode: 200, body: "posted" };
}

async function handleWorkflowJobEvent(payload, deps) {
  if (payload.action !== "waiting") {
    return { statusCode: 200, body: "ignored" };
  }

  const summary = deps.extractWorkflowJobSummary(payload);
  const technicalText = [
    `Service: ${summary.service}`,
    `Environment: ${summary.environment}`,
    `Run: ${summary.runUrl}`,
  ].join("\n");
  const nonTechnicalText = await deps.summarize({
    technicalText,
    context: { service: summary.service, action: "deploy-to-production" },
    llmClient: deps.llmClient,
  });

  await deps.slackClient.postNotification({
    title: `Waiting for approval: ${summary.service} -> ${summary.environment}`,
    technicalText,
    nonTechnicalText,
    link: summary.runUrl,
  });
  return { statusCode: 200, body: "posted" };
}

export async function handleGithubWebhookEvent({ headers, rawBody, deps }) {
  const signatureHeader = header(headers, "x-hub-signature-256");
  if (!deps.verifyGithubSignature({ payload: rawBody, signatureHeader, secret: deps.webhookSecret })) {
    return { statusCode: 401, body: "invalid signature" };
  }

  const eventName = header(headers, "x-github-event");
  const payload = JSON.parse(rawBody);

  if (eventName === "pull_request") {
    return handlePullRequestEvent(payload, deps);
  }
  if (eventName === "workflow_job") {
    return handleWorkflowJobEvent(payload, deps);
  }
  return { statusCode: 200, body: "ignored" };
}

// Not a GitHub webhook: an infra repo's own CI posts here directly once it has
// computed a real Infracost figure, signed with the same shared secret. This
// avoids the Lambda ever needing to read GitHub's API or parse a rendered
// Infracost PR comment -- the caller already has the exact numbers and the PR
// body in hand from its own workflow context.
export async function handleCostReportEvent({ headers, rawBody, deps }) {
  const signatureHeader = header(headers, "x-hub-signature-256");
  if (!deps.verifyGithubSignature({ payload: rawBody, signatureHeader, secret: deps.webhookSecret })) {
    return { statusCode: 401, body: "invalid signature" };
  }

  const { repo, prNumber, prBody, costSummary } = JSON.parse(rawBody);

  const technicalText = [
    deps.extractTechnicalSummary(prBody, TECHNICAL_SECTIONS),
    "## Estimated cost",
    costSummary,
  ].join("\n\n");
  const nonTechnicalText = await deps.summarize({
    technicalText,
    context: { service: repo, action: "merge-infrastructure-change" },
    llmClient: deps.llmClient,
  });

  const value = JSON.stringify({ repo, prNumber });
  await deps.slackClient.postApprovalMessage({
    title: `Approval needed: PR #${prNumber} into ${repo} (cost estimated)`,
    technicalText,
    nonTechnicalText,
    actions: [
      { actionId: "approve", label: "Approve", style: "primary", value },
      { actionId: "reject", label: "Request changes", style: "danger", value },
    ],
  });
  return { statusCode: 200, body: "posted" };
}
