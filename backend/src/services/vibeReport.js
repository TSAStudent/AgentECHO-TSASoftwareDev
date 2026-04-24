import { getOpenAI, hasOpenAI } from "./openaiClient.js";

const SYSTEM = `You are Agent ECHO's post-meeting "vibe report" generator. Given a transcript,
infer the social/emotional dynamics so a deaf user can understand things they may
have missed from tone alone. STRICT JSON:
{
  "overallMood": "one-word",
  "participants": [{"name":"...","vibe":"engaged|skeptical|enthusiastic|withdrawn|frustrated|neutral","evidence":"quote"}],
  "momentsToKnow": ["human readable moments"],
  "suggestedFollowUps": ["..."]
}`;

export async function generateVibeReport({ transcript }) {
  if (!hasOpenAI()) return demoVibe();
  const openai = getOpenAI();
  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.4,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: transcript },
    ],
  });
  try {
    return JSON.parse(resp.choices[0].message.content);
  } catch {
    return demoVibe();
  }
}

function demoVibe() {
  return {
    overallMood: "productive",
    participants: [
      { name: "Dana",   vibe: "engaged",      evidence: "\"Love this direction, let's go.\"" },
      { name: "Marcus", vibe: "skeptical",    evidence: "\"I'm not sure the timeline is realistic.\"" },
      { name: "you",    vibe: "enthusiastic", evidence: "\"I can have the mocks ready tomorrow.\"" },
    ],
    momentsToKnow: [
      "Marcus went quiet after the timeline discussion — may need a 1:1.",
      "Dana was the loudest supporter; lean on her for buy-in.",
    ],
    suggestedFollowUps: [
      "Send Marcus a direct message checking on the timeline concern.",
      "Share a revised milestone plan by end of week.",
    ],
  };
}
