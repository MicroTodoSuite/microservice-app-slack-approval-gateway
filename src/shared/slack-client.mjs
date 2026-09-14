import { WebClient } from "@slack/web-api";

function summaryBlocks({ title, technicalText, nonTechnicalText }) {
  return [
    { type: "header", text: { type: "plain_text", text: title, emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*For anyone on the team:*\n${nonTechnicalText}` } },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: `*Technical detail:*\n\`\`\`${technicalText}\`\`\`` } },
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
