// Thin re-export so existing call sites' import path stays stable —
// the real logic (resolving an organisation's own connected AI provider,
// never a global shared one) lives in organisation-ai-provider.ts.
export { getAIProvider } from "@/lib/ai/organisation-ai-provider";
