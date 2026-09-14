// Best-effort extraction from GitHub's documented `workflow_job` webhook
// payload (action: "waiting"). GitHub's docs state the payload gains a
// `deployment` object with environment metadata when the job targets an
// `environment:` key, but the exact field layout is not fully pinned down in
// the reference the design was written from. Disclosed gap, not a silent
// guess: verify this against one real delivery (GitHub's webhook "Recent
// Deliveries" tab, or a test run against a repo with this App installed)
// before relying on the "environment" value in production, and adjust the
// fallbacks below if it does not match.
export function extractWorkflowJobSummary(payload) {
  return {
    service: payload.repository.name,
    environment: payload.deployment?.environment ?? payload.workflow_job?.environment ?? "prod",
    runUrl: payload.workflow_job.html_url,
  };
}
