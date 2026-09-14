import { App } from "@octokit/app";

// Thin wrapper around @octokit/app, mirroring the exact mint pattern
// .github's create-github-app-token action uses (app-level JWT auth, then an
// installation access token scoped to one repository) -- see
// microservice-app-docs/full-platform/github-app-authentication.md and
// slack-approval-gateway.md for the App's own permissions/installation scope.
export function createGithubApp({ appId, privateKey }) {
  return new App({ appId, privateKey });
}

// Resolves the installation for a specific owner/repo and returns an Octokit
// instance authenticated as that installation -- never the app's own JWT
// identity, which cannot call most REST endpoints directly.
export async function getInstallationOctokit(app, owner, repo) {
  const { data: installation } = await app.octokit.request("GET /repos/{owner}/{repo}/installation", {
    owner,
    repo,
  });
  return app.getInstallationOctokit(installation.id);
}
