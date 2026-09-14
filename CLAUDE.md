## Overview
Two AWS Lambda functions that let the two human-approval gates in the MicroTodoSuite delivery pipeline notify Slack, and let one of them (the GitOps pull-request gate) be approved or rejected directly from Slack. See `microservice-app-docs/full-platform/slack-approval-gateway.md` for the design and the GitHub App it depends on.

## Stack
- Node.js >=24, ES modules, no framework -- plain AWS SDK v3, `@octokit/app`, `@slack/web-api`, `@google/genai`.
- `esbuild` bundles each Lambda entry point into one self-contained file (no `node_modules` in the deployment package).
- Tests use Node's built-in test runner (`node --test`), matching `microservice-app-todos-api`'s convention -- no test framework dependency.
- Deployed as a zip-based Lambda (not a container image) behind an API Gateway HTTP API, defined in `microservice-app-ops`.

## Commands
- Install: `npm ci`
- Test: `npm test`
- Build (produces `dist/<handler>/index.mjs`, one self-contained bundle per Lambda): `npm run build`

## Structure
- `src/github-webhook-handler/` -- receives GitHub webhooks (`pull_request` on `microservice-app-gitops`, `workflow_job` action `waiting` on the five service repos). `handle.mjs` is the pure, dependency-injected logic; `index.mjs` is the real Lambda entry point that wires AWS Secrets Manager, Slack, and Gemini.
- `src/slack-interaction-handler/` -- receives Slack interactive button clicks (Approve / Request changes on the GitOps PR gate only). Same `handle.mjs`/`index.mjs` split.
- `src/shared/` -- `verify-signatures.mjs` (GitHub HMAC + Slack HMAC/replay-window verification), `pr-body-sections.mjs` (parses the same `## Heading` convention `.github`'s `validate-pr.py` requires), `summarize.mjs` (Gemini call, prompted with only the verbatim technical text as ground truth), `github-app.mjs` (installation-token minting), `slack-client.mjs` (posts/updates Slack messages), `load-secrets.mjs` (cached AWS Secrets Manager reads).
- `config/authorized-approvers.json` -- Slack user ID to GitHub login allowlist. Not a secret; it is the entire authorization boundary for who can approve/reject from Slack, so review changes to it like any other access-control change. Bundled into the Lambda zip at build time (an esbuild JSON import), not read from disk at runtime.
- `test/` -- one file per module/handler, using fake dependency objects instead of a mocking library.

## Conventions
- `handle.mjs` files take a `deps` object and return `{ statusCode, body }`; `index.mjs` files are the only place that touch `process.env`, AWS Secrets Manager, or the real Slack/GitHub/Gemini clients. Keep that split -- it is what makes the handlers testable without a live Lambda.
- The Gemini prompt in `summarize.mjs` must only ever be given verbatim, already-validated technical text (a PR's own required body sections, or deterministic job/run metadata) as its factual input. Never let it fetch or infer additional facts -- its output feeds a production approval decision.
- Write everything in English -- branch names, commit messages, pull-request titles and bodies, review comments, code comments, documentation, and specification text. No bilingual sections. Changing this rule takes a recorded decision in `microservice-app-docs`, not a remark in conversation.
- Open every pull request through `.github/pull_request_template.md` and follow `microservice-app-docs/docs/Pull request and task tracking conventions.md`: one concern per short-lived `<type>/<summary>` branch, a Conventional Commit title with a scope, and every template section filled. Constitution principle 13 makes this binding, not advisory.
- Keep the Spec-Driven Development commit pair intact: `test(<scope>): specify ...` must be committed failing before `feat(<scope>): implement ...`. Never squash the pair; the failing-test commit is the evidence the cycle was followed.
- Track every task. Name in the pull-request body the task IDs it advances, qualified by repository and spec, and update `tasks.md` in that same pull request rather than a follow-up. Mark a task `[X]` only after locating and inspecting its named artifact -- never from a summary, a green check, a rendered manifest, or recollection. Annotate partial delivery instead of ticking it; work no register covers either gains a task or records in the PR body why none applies.
- Never merge with `--admin`, force-push to `main`, disable a branch protection rule to land one's own work, or approve one's own pull request. An AI agent may open, describe, and update a pull request; it may never approve one and never author an acceptance or approval artifact -- only a named human unlocks a gate.
- Report outcomes faithfully in commits and pull-request bodies: name what is red, say what was skipped, and correct an earlier claim that turns out to be wrong rather than leaving the record wrong.

## Notes on what is verified vs. deferred
- `extract-workflow-job-summary.mjs`'s reading of the `workflow_job` payload's environment field is a documented, disclosed best guess (see the comment in that file) -- verify it against one real webhook delivery before relying on the "environment" value in production.
- `npm test` runs entirely against fake dependencies; it never calls a real GitHub, Slack, or Gemini API, and never touches AWS. There is no live end-to-end test in this repo -- that verification happens once the GitHub App exists, the Lambdas are deployed, and one real gitops PR / one real prod deployment triggers the flow for real.
