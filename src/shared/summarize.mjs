const DEFAULT_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = [
  "You translate a software delivery approval into one short paragraph for a",
  "non-technical reader (a manager or client with no engineering background).",
  "You are given the exact, already-reviewed technical text describing the",
  "change below. Do not add, guess, or infer any fact, risk, or detail that is",
  "not explicitly stated in that text. If the text does not say something, do",
  "not say it either. Plain language, 2-3 sentences, no jargon, no markdown.",
].join(" ");

// The model's only job is to rephrase; the facts it may use are exactly the
// verbatim, already-validated PR/deployment text passed in as technicalText.
// This keeps an LLM out of the business of deciding *what* changed -- it only
// ever restates what a human (or a deterministic extractor) already said.
export async function summarizeForNonTechnicalAudience({ technicalText, context, geminiClient, model = DEFAULT_MODEL }) {
  const response = await geminiClient.models.generateContent({
    model,
    contents: [
      `Service: ${context.service}`,
      `Action awaiting approval: ${context.action}`,
      "",
      "Technical text (the only source of facts you may use):",
      technicalText,
    ].join("\n"),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      maxOutputTokens: 300,
    },
  });

  if (!response.text) {
    throw new Error("Gemini response contained no text");
  }
  return response.text;
}
