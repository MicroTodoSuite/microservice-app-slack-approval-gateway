import { WebClient } from "@slack/web-api";

// A Slack section block's mrkdwn text object must stay under 3000 characters
// (the API rejects the whole message otherwise, so this can't be an
// afterthought). The Infracost cost tables this text carries can run long;
// truncate rather than fail to post the approval entirely.
const SLACK_TEXT_LIMIT = 3000;
const TRUNCATION_NOTE = "\n... (truncated, see the pull request for the full detail)";

function technicalDetailText(technicalText) {
  const full = `*Technical detail:*\n\`\`\`${technicalText}\`\`\``;
  if (full.length <= SLACK_TEXT_LIMIT) return full;

  const budget = SLACK_TEXT_LIMIT - "*Technical detail:*\n```".length - "```".length - TRUNCATION_NOTE.length;
  return `*Technical detail:*\n\`\`\`${technicalText.slice(0, budget)}${TRUNCATION_NOTE}\`\`\``;
}

export function summaryBlocks({ title, technicalText, nonTechnicalText }) {
  return [
    { type: "header", text: { type: "plain_text", text: title, emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*For anyone on the team:*\n${nonTechnicalText}` } },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: technicalDetailText(technicalText) } },
  ];
}

export function createSlackClient({ botToken, channel }) {
  const web = new WebClient(botToken);

  return {
    // Gate 1 (gitops PR): interactive Approve / Request changes buttons.
    async postApprovalMessage({ title, technicalText, nonTechnicalText, actions }) {
      return web.chat.postMessage({
        channel,
        text: title, // fallback for notifications that can't render blocks
        blocks: [
          ...summaryBlocks({ title, technicalText, nonTechnicalText }),
          {
            type: "actions",
            elements: actions.map((action) => ({
              type: "button",
              text: { type: "plain_text", text: action.label },
              style: action.style,
              action_id: action.actionId,
              value: action.value,
            })),
          },
        ],
      });
    },

    // Gate 2 (prod environment waiting): link-only, no buttons -- approval
    // stays in GitHub's UI by design.
    async postNotification({ title, technicalText, nonTechnicalText, link }) {
      return web.chat.postMessage({
        channel,
        text: title,
        blocks: [
          ...summaryBlocks({ title, technicalText, nonTechnicalText }),
          {
            type: "section",
            text: { type: "mrkdwn", text: `<${link}|Review and approve in GitHub>` },
          },
        ],
      });
    },

    async updateMessage({ channel: targetChannel, ts, text }) {
      return web.chat.update({ channel: targetChannel ?? channel, ts, text });
    },

    // Ephemeral feedback for an unauthorized or malformed interaction, sent
    // via the interaction payload's own response_url rather than chat.postMessage
    // -- no extra scope needed, and it is only ever visible to the clicking user.
    async postEphemeral({ responseUrl, text }) {
      const response = await fetch(responseUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response_type: "ephemeral", replace_original: false, text }),
      });
      if (!response.ok) {
        throw new Error(`Slack response_url call failed: ${response.status}`);
      }
    },
  };
}
