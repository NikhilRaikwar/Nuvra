import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

// Keeps interactive agent actions predictable in both latency and OpenRouter spend.
export const AI_OUTPUT_TOKEN_BUDGET = {
  shortlist: 1_600,
  fitReport: 700,
  proofProject: 1_300,
  applicationDraft: 700,
} as const;

export function createOpenRouterGateway() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenRouter is not configured. Add OPENROUTER_API_KEY to your server .env file.",
    );
  }

  return createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    // OpenRouter normalizes JSON-schema output for models that advertise it.
    supportsStructuredOutputs: true,
    headers: {
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-OpenRouter-Title": "Nuvra",
    },
  });
}
