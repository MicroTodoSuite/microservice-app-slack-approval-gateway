import { GoogleGenAI } from "@google/genai";
import { handleGithubWebhookEvent } from "./handle.mjs";
import { extractWorkflowJobSummary } from "./extract-workflow-job-summary.mjs";
import { verifyGithubSignature } from "../shared/verify-signatures.mjs";
import { extractTechnicalSummary } from "../shared/pr-body-sections.mjs";
import { summarizeForNonTechnicalAudience } from "../shared/summarize.mjs";
import { createSlackClient } from "../shared/slack-client.mjs";
import { getSecret } from "../shared/load-secrets.mjs";

let cachedDeps;

async function buildDeps() {
  if (cachedDeps) return cachedDeps;

  const [webhookSecret, slackBotToken, geminiApiKey] = await Promise.all([
    getSecret(process.env.GITHUB_WEBHOOK_SECRET_ARN),
    getSecret(process.env.SLACK_BOT_TOKEN_SECRET_ARN),
    getSecret(process.env.GEMINI_API_KEY_SECRET_ARN),
  ]);

  cachedDeps = {
    webhookSecret,
    verifyGithubSignature,
    extractTechnicalSummary,
    extractWorkflowJobSummary,
    summarize: summarizeForNonTechnicalAudience,
    geminiClient: new GoogleGenAI({ apiKey: geminiApiKey }),
    slackClient: createSlackClient({ botToken: slackBotToken, channel: process.env.SLACK_CHANNEL_ID }),
  };
  return cachedDeps;
}

// AWS Lambda entry point behind API Gateway (HTTP API, payload format 2.0).
export async function handler(event) {
  const deps = await buildDeps();
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString("utf8") : (event.body ?? "");
  const result = await handleGithubWebhookEvent({
    headers: event.headers ?? {},
    rawBody,
    deps,
  });
  return { statusCode: result.statusCode, body: result.body };
}
