// Generates messages.json via Gemini. Run daily by .github/workflows/generate-messages.yml.
// On any failure it exits non-zero without touching the existing messages.json.
import { writeFileSync } from "node:fs";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error("GEMINI_API_KEY is not set");
  process.exit(1);
}

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const COLS = 22;
const CHAR_SET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?.,'-:";
const COUNT = 16;

const now = new Date();
const endOfYear = new Date(now.getFullYear() + 1, 0, 1);
const daysLeft = Math.ceil((endOfYear - now) / 86400000);
const dateLine = now.toLocaleDateString("en-US", {
  weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
});

const prompt = `You write messages for a physical split-flap display board (like a Vestaboard).
The board shows a live countdown of hours left in the year. Below it, your message appears.

Today is ${dateLine}. There are ${daysLeft} days left in ${now.getFullYear()}.

Write ${COUNT} messages. Each message is exactly 2 lines. Each line is AT MOST ${COLS} characters.
Only use these characters: uppercase A-Z, digits 0-9, space, and ! ? . , ' - :

Voice and themes:
- Blunt, aphoristic, zero fluff. Like a wise operator, not a greeting card.
- Focus, leverage, saying no, deep work, shipping, the scarcity of time.
- Building in the AI era: making things is cheap now, choosing what to make is the hard part.
- A few may reference the day of week or time of year. Most should be timeless.
- No hashtags, no emoji, no quotes attribution.

Return JSON: an array of ${COUNT} objects, each {"line1": "...", "line2": "..."}.`;

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
  {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 1.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              line1: { type: "STRING" },
              line2: { type: "STRING" },
            },
            required: ["line1", "line2"],
          },
        },
      },
    }),
  }
);

if (!res.ok) {
  console.error(`Gemini API error: HTTP ${res.status}`, await res.text());
  process.exit(1);
}

const body = await res.json();
const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
if (!text) {
  console.error("No text in Gemini response", JSON.stringify(body).slice(0, 500));
  process.exit(1);
}

const sanitize = (line) =>
  String(line).toUpperCase().trim()
    .split("").map((c) => (CHAR_SET.includes(c) ? c : " ")).join("")
    .replace(/\s+/g, " ").trim();

const messages = JSON.parse(text)
  .map((m) => [sanitize(m.line1), sanitize(m.line2)])
  .filter(([l1, l2]) => l1 && l1.length <= COLS && l2.length <= COLS);

if (messages.length < 10) {
  console.error(`Only ${messages.length} valid messages after validation; refusing to write`);
  process.exit(1);
}

writeFileSync(new URL("../messages.json", import.meta.url), JSON.stringify(messages, null, 2) + "\n");
console.log(`Wrote ${messages.length} messages (${MODEL})`);
