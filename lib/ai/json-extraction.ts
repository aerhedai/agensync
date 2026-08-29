import type { z } from "zod";

function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced?.[1] ?? text;
}

/**
 * Parses a model's JSON response and validates it against a schema in one
 * step — the model's raw output is never trusted directly (CLAUDE.md #14).
 * Strips a markdown code fence first (models sometimes wrap JSON in one
 * even when told not to). Returns null on anything that doesn't parse or
 * doesn't validate, rather than throwing — a malformed response is a
 * normal, expected outcome to handle, not an exceptional one.
 */
export function parseJsonResponse<T>(
  text: string,
  schema: z.ZodType<T>,
): T | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text.trim()));
  } catch {
    return null;
  }

  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
}
