/**
 * The AI settings both the bot and the website need (from their wrangler.jsonc vars + secrets).
 * Their Env types satisfy this structurally, so they can pass `env` straight in.
 */
export interface AiSettings {
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  OPENAI_REASONING: string;
  AI_MAX_INPUT_CHARS?: string;
  AI_LIMIT_PER_ADMIN_PER_HOUR?: string;
  AI_LIMIT_PER_DAY?: string;
  AI_PRICE_INPUT_PER_M?: string;
  AI_PRICE_OUTPUT_PER_M?: string;
}
