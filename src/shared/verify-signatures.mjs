import crypto from "node:crypto";

const SLACK_REPLAY_WINDOW_SECONDS = 300;

function timingSafeEqualHex(expectedHex, actualHex) {
  const expected = Buffer.from(expectedHex, "utf8");
  const actual = Buffer.from(actualHex, "utf8");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

// GitHub webhooks: X-Hub-Signature-256: sha256=<hex-hmac-of-raw-body>.
// https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
export function verifyGithubSignature({ payload, signatureHeader, secret }) {
  if (typeof signatureHeader !== "string" || !signatureHeader.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice("sha256=".length);
  const actual = crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  try {
    return timingSafeEqualHex(expected, actual);
  } catch {
    return false;
  }
}

// Slack: X-Slack-Signature: v0=<hex-hmac-of "v0:{timestamp}:{raw-body}">, plus a
// timestamp header checked against replay (Slack recommends rejecting anything
// older than five minutes).
// https://api.slack.com/authentication/verifying-requests-from-slack
export function verifySlackSignature({ payload, timestampHeader, signatureHeader, secret, now = Date.now() / 1000 }) {
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(now - timestamp) > SLACK_REPLAY_WINDOW_SECONDS) return false;
  if (typeof signatureHeader !== "string" || !signatureHeader.startsWith("v0=")) return false;

  const expected = signatureHeader.slice("v0=".length);
  const base = `v0:${timestampHeader}:${payload}`;
  const actual = crypto.createHmac("sha256", secret).update(base, "utf8").digest("hex");
  try {
    return timingSafeEqualHex(expected, actual);
  } catch {
    return false;
  }
}
