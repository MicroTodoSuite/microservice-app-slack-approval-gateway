// Splits a PR body on "## Heading" the same way .github's
// scripts/conventions/validate-pr.py does, so a section quoted here is
// guaranteed to be the exact, already-validated text a reviewer wrote --
// never re-derived, summarized, or paraphrased by this code.
const SECTION_PATTERN = /^##[ \t]+(.+?)[ \t]*$/gm;

export function parsePrBodySections(body) {
  const sections = {};
  const headings = [...body.matchAll(SECTION_PATTERN)];
  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    const start = heading.index + heading[0].length;
    const end = i + 1 < headings.length ? headings[i + 1].index : body.length;
    sections[heading[1]] = body.slice(start, end).trim();
  }
  return sections;
}

// Concatenates the requested sections, verbatim and in the given order, as
// one Markdown string. Throws rather than silently omitting a missing
// section: a technical summary that quietly drops "Risk and rollback"
// because the heading was misspelled is worse than a loud failure.
export function extractTechnicalSummary(body, headings) {
  const sections = parsePrBodySections(body);
  const parts = headings.map((heading) => {
    if (!(heading in sections)) {
      throw new Error(`PR body is missing the required section: ${heading}`);
    }
    return `## ${heading}\n${sections[heading]}`;
  });
  return parts.join("\n\n");
}
