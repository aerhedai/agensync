import type { AIProvider } from "@/lib/ai/provider";
import { OllamaProvider } from "@/lib/ai/providers/ollama-provider";
import { env } from "@/lib/env";

/**
 * The rest of the app should call this instead of importing a provider
 * class directly — that's what keeps the agent runtime decoupled from
 * any one AI vendor (CLAUDE.md #15).
 */
export function getAIProvider(): AIProvider {
  switch (env.AI_PROVIDER) {
    case "ollama":
      return new OllamaProvider(env.OLLAMA_BASE_URL);
  }
}
