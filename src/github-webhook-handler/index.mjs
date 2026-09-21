import Groq from "groq-sdk";
import { handleGithubWebhookEvent, handleCostReportEvent } from "./handle.mjs";
import { extractWorkflowJobSummary } from "./extract-workflow-job-summary.mjs";
import { verifyGithubSignature } from "../shared/verify-signatures.mjs";
import { extractTechnicalSummary } from "../shared/pr-body-sections.mjs";
import { summarizeForNonTechnicalAudience } from "../shared/summarize.mjs";
import { createSlackClient } from "../shared/slack-client.mjs";
import { getSecret } from "../shared/load-secrets.mjs";

let cachedDeps;

async function buildDeps() {
  if (cachedDeps) return cachedDeps;

  const [webhookSecret, slackBotToken, groqApiKey] = await Promise.all([
    getSecret(process.env.GITHUB_WEBHOOK_SECRET_ARN),
    getSecret(process.env.SLACK_BOT_TOKEN_SECRET_ARN),
    getSecret(process.env.GROQ_API_KEY_SECRET_ARN),
  ]);

  cachedDeps = {
    webhookSecret,
    verifyGithubSignature,
    extractTechnicalSummary,
    extractWorkflowJobSummary,
    summarize: summarizeForNonTechnicalAudience,
    llmClient: new Groq({ apiKey: groqApiKey }),
    slackClient: createSlackClient({ botToken: slackBotToken, channel: process.env.SLACK_CHANNEL_ID }),
  };
  return cachedDeps;
}

// AWS Lambda entry point behind API Gateway (HTTP API, payload format 2.0).
// Two routes share this one function: /github/webhook (real GitHub webhook
// deliveries) and /internal/cost-report (an infra repo's own CI, once it has
// a real Infracost figure in hand) -- routed on the request path, since the
// second one carries no X-GitHub-Event header at all.
export async function handler(event) {
  const deps = await buildDeps();
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString("utf8") : (event.body ?? "");
  const headers = event.headers ?? {};
  const path = event.rawPath ?? event.requestContext?.http?.path ?? "";

  const result = path.endsWith("/internal/cost-report")
    ? await handleCostReportEvent({ headers, rawBody, deps })
    : await handleGithubWebhookEvent({ headers, rawBody, deps });

  return { statusCode: result.statusCode, body: result.body };
}
