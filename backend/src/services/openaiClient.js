import OpenAI from "openai";

let _client = null;
export function getOpenAI() {
  if (_client) return _client;
  if (!process.env.OPENAI_API_KEY) return null;
  _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export const hasOpenAI = () => Boolean(process.env.OPENAI_API_KEY);
