import { handleSlackInteractionEvent } from "./handle.mjs";
import { verifySlackSignature } from "../shared/verify-signatures.mjs";
import { createGithubApp, getInstallationOctokit } from "../shared/github-app.mjs";
import { createSlackClient } from "../shared/slack-client.mjs";
import { getSecret } from "../shared/load-secrets.mjs";
// esbuild inlines this JSON import as a plain object at bundle time (see
// scripts/build.mjs), so the allowlist ships inside dist/.../index.mjs
// itself -- no runtime file read, and no risk of the config file being
// missing from the Lambda zip because of its path relative to a bundled file.
import approversConfig from "../../config/authorized-approvers.json";

let cachedDeps;

async function buildDeps() {
  if (cachedDeps) return cachedDeps;

  const [signingSecret, slackBotToken, appPrivateKey] = await Promise.all([
    getSecret(process.env.SLACK_SIGNING_SECRET_ARN),
    getSecret(process.env.SLACK_BOT_TOKEN_SECRET_ARN),
    getSecret(process.env.SLACK_APPROVER_APP_KEY_SECRET_ARN),
  ]);
  // Not sensitive (a public GitHub App id), so it is a plain Lambda
  // environment variable, not a Secrets Manager entry -- ops's own contract
  // forbids an ordinary, state-persisted Secrets Manager value.
  const appId = process.env.SLACK_APPROVER_APP_ID;

  const app = createGithubApp({ appId, privateKey: appPrivateKey });
  const { approvers } = approversConfig;

  cachedDeps = {
    signingSecret,
    verifySlackSignature,
    authorizedApprovers: approvers,
    getInstallationOctokit: (owner, repo) => getInstallationOctokit(app, owner, repo),
    slackClient: createSlackClient({ botToken: slackBotToken, channel: process.env.SLACK_CHANNEL_ID }),
  };
  return cachedDeps;
}

// AWS Lambda entry point behind API Gateway (HTTP API, payload format 2.0).
// Slack interactivity payloads arrive as application/x-www-form-urlencoded.
export async function handler(event) {
  const deps = await buildDeps();
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString("utf8") : (event.body ?? "");
  const result = await handleSlackInteractionEvent({
    headers: event.headers ?? {},
    rawBody,
    deps,
  });
  return { statusCode: result.statusCode, body: result.body };
}
