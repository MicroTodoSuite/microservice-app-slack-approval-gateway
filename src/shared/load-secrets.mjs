import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({});
const cache = new Map();

// Cached per Lambda execution environment (not per invocation) -- a warm
// Lambda reuses this module's state, so a secret is fetched at most once per
// container lifetime, never logged, and never written back to disk.
export async function getSecret(secretArn) {
  if (!secretArn) {
    throw new Error("getSecret called without a secret ARN");
  }
  if (cache.has(secretArn)) {
    return cache.get(secretArn);
  }
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const value = response.SecretString;
  cache.set(secretArn, value);
  return value;
}
