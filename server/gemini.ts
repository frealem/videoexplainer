import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

/**
 * Returns a configured GoogleGenAI instance using injected environment keys.
 * Supports GEMINI_API_KEY, GOOGLE_GENAI_API_KEY, and GOOGLE_API_KEY.
 */
export function getGeminiClient(): GoogleGenAI {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.API_KEY ||
    undefined;

  return new GoogleGenAI(
    apiKey
      ? {
          apiKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        }
      : {
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        }
  );
}

/**
 * Dynamic proxy export for backward compatibility so all existing
 * `ai.models.generateContent` calls evaluate the fresh client instance at call time.
 */
export const ai: GoogleGenAI = new Proxy({} as GoogleGenAI, {
  get(_target, prop, receiver) {
    const client = getGeminiClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
