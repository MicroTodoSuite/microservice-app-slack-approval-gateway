function header(headers, name) {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

function parseSlackPayload(rawBody) {
  const params = new URLSearchParams(rawBody);
  return JSON.parse(params.get("payload"));
}

export async function handleSlackInteractionEvent({ headers, rawBody, deps }) {
  const verified = deps.verifySlackSignature({
    payload: rawBody,
    timestampHeader: header(headers, "x-slack-request-timestamp"),
    signatureHeader: header(headers, "x-slack-signature"),
    secret: deps.signingSecret,
  });
  if (!verified) {
    return { statusCode: 401, body: "invalid signature" };
  }

  const interaction = parseSlackPayload(rawBody);
  if (interaction.type !== "block_actions") {
    return { statusCode: 200, body: "ignored" };
  }

  const approver = deps.authorizedApprovers.find((entry) => entry.slackUserId === interaction.user.id);
  if (!approver) {
    await deps.slackClient.postEphemeral({
      responseUrl: interaction.response_url,
      text: "You are not authorized to approve or reject this. Ask a listed reviewer to act on it.",
    });
    return { statusCode: 200, body: "unauthorized" };
  }

  const action = interaction.actions[0];
  const { repo, prNumber } = JSON.parse(action.value);
  const [owner, name] = repo.includes("/") ? repo.split("/") : ["MicroTodoSuite", repo];
  const octokit = await deps.getInstallationOctokit(owner, name);

  if (action.action_id === "approve") {
    await octokit.rest.pulls.createReview({ owner, repo: name, pull_number: prNumber, event: "APPROVE" });
    await octokit.rest.pulls.merge({ owner, repo: name, pull_number: prNumber });
    await deps.slackClient.updateMessage({
      channel: interaction.channel.id,
      ts: interaction.message.ts,
      text: `:white_check_mark: PR #${prNumber} approved and merged by ${approver.githubLogin}.`,
    });
    return { statusCode: 200, body: "approved" };
  }

  if (action.action_id === "reject") {
    await octokit.rest.pulls.createReview({
      owner,
      repo: name,
      pull_number: prNumber,
      event: "REQUEST_CHANGES",
      body: `Changes requested from Slack by ${approver.githubLogin}.`,
    });
    await deps.slackClient.updateMessage({
      channel: interaction.channel.id,
      ts: interaction.message.ts,
      text: `:x: PR #${prNumber} changes requested by ${approver.githubLogin}.`,
    });
    return { statusCode: 200, body: "rejected" };
  }

  return { statusCode: 200, body: "ignored" };
}
