import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyGithubSignature, verifySlackSignature } from "../src/shared/verify-signatures.mjs";

function githubSign(secret, payload) {
  const digest = crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  return `sha256=${digest}`;
}

function slackSign(secret, timestamp, payload) {
  const base = `v0:${timestamp}:${payload}`;
  const digest = crypto.createHmac("sha256", secret).update(base, "utf8").digest("hex");
  return `v0=${digest}`;
}

test("verifyGithubSignature accepts a correctly signed payload", () => {
  const secret = "gh-secret";
  const payload = '{"action":"opened"}';
  const ok = verifyGithubSignature({
    payload,
    signatureHeader: githubSign(secret, payload),
    secret,
  });
  assert.equal(ok, true);
});

test("verifyGithubSignature rejects a tampered payload", () => {
  const secret = "gh-secret";
  const signed = githubSign(secret, '{"action":"opened"}');
  const ok = verifyGithubSignature({
    payload: '{"action":"closed"}',
    signatureHeader: signed,
    secret,
  });
  assert.equal(ok, false);
});

test("verifyGithubSignature rejects the wrong secret", () => {
  const payload = '{"action":"opened"}';
  const ok = verifyGithubSignature({
    payload,
    signatureHeader: githubSign("gh-secret", payload),
    secret: "wrong-secret",
  });
  assert.equal(ok, false);
});

test("verifyGithubSignature rejects a missing or malformed header", () => {
  assert.equal(
    verifyGithubSignature({ payload: "x", signatureHeader: undefined, secret: "s" }),
    false,
  );
  assert.equal(
    verifyGithubSignature({ payload: "x", signatureHeader: "not-a-signature", secret: "s" }),
    false,
  );
});

test("verifySlackSignature accepts a correctly signed, fresh payload", () => {
  const secret = "slack-secret";
  const payload = "payload=%7B%22type%22%3A%22block_actions%22%7D";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const ok = verifySlackSignature({
    payload,
    timestampHeader: timestamp,
    signatureHeader: slackSign(secret, timestamp, payload),
    secret,
  });
  assert.equal(ok, true);
});

test("verifySlackSignature rejects a replayed (stale) timestamp", () => {
  const secret = "slack-secret";
  const payload = "payload=%7B%7D";
  const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600); // 10 minutes old
  const ok = verifySlackSignature({
    payload,
    timestampHeader: staleTimestamp,
    signatureHeader: slackSign(secret, staleTimestamp, payload),
    secret,
  });
  assert.equal(ok, false);
});

test("verifySlackSignature rejects a tampered payload even with a valid-looking signature", () => {
  const secret = "slack-secret";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signatureHeader = slackSign(secret, timestamp, "payload=original");
  const ok = verifySlackSignature({
    payload: "payload=tampered",
    timestampHeader: timestamp,
    signatureHeader,
    secret,
  });
  assert.equal(ok, false);
});
