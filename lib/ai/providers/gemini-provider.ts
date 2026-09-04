import type {
  AIProvider,
  AIResponse,
  GenerateRequest,
} from "@/lib/ai/provider";
import {
  fromGeminiResponse,
  toGeminiContents,
  toGeminiTools,
} from "@/lib/ai/providers/gemini-message-mapping";

/**
 * Gemini's REST generateContent API — no SDK dependency, matching
 * OllamaProvider's own style and CLAUDE.md §8's "never scatter
 * provider-specific SDK calls" rule. See
 * lib/ai/providers/gemini-message-mapping.ts for why the request/response
 * shapes need real translation rather than a field rename.
 *
 * Deliberately does not implement generateEmbedding. AIProvider already
 * treats it as optional for exactly this situation (see its own comment)
 * — the knowledge base's pgvector column is a fixed vector(768), matching
 * nomic-embed-text; Gemini's embedding models default to a different
 * dimensionality, and getting that wrong would silently corrupt retrieval
 * rather than fail loudly. Adding Gemini embeddings later is additive, not
 * a rewrite — it just isn't part of what this was asked to fix.
 */
export class GeminiProvider implements AIProvider {
  constructor(private readonly apiKey: string) {}

  async generateResponse(request: GenerateRequest): Promise<AIResponse> {
    const { systemInstruction, contents } = toGeminiContents(request.messages);

    // Which model to call is request.model, exactly like OllamaProvider —
    // Agent.model is already a free string ("qwen2.5:14b" today), so a
    // Gemini agent just sets it to "gemini-2.5-flash-lite" instead. No new
    // configuration surface: when Google eventually forces a migration off
    // this model (its retirement date is still "no earlier than October
    // 16, 2026, not final" per Google's own docs as of this writing),
    // that's editing the agent's Model field, not a code change.
    const tools = toGeminiTools(request.tools);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Header, not ?key=... in the URL — the query-param form is
          // still accepted for backwards compatibility, but the key would
          // then land in request logs and error messages that echo the
          // URL. Header keeps it out of both.
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          ...(systemInstruction && { systemInstruction }),
          contents,
          ...(tools && { tools }),
          ...(request.responseFormat === "json" && {
            generationConfig: { responseMimeType: "application/json" },
          }),
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Gemini request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as Parameters<
      typeof fromGeminiResponse
    >[0];
    return fromGeminiResponse(data);
  }
}
