# Production Hardening Notes

Deliberate V1 simplifications that are fine for local development but must be
addressed before any real deployment. Each entry names the gap, why it was
accepted for now, and what closing it looks like.

## Gmail OAuth tokens stored in plaintext (Phase 9)

`Integration.accessToken` / `Integration.refreshToken` (`prisma/schema.prisma`)
are stored as plain text in Postgres.

**Why accepted for V1:** tokens are server-side only (never sent to the
browser, never logged, never committed — CLAUDE.md §22), and CLAUDE.md's
guiding principle is not to add infrastructure before there's a demonstrated
need (§4, §30). Encryption-at-rest requires key management (where does the
encryption key live? rotation policy?) that has no real answer yet for a
single-tenant local dev setup.

**What closing it looks like:** encrypt both columns (e.g. AES-256-GCM) with
a key sourced from a proper secrets manager (not another env var sitting next
to the thing it protects), before onboarding any real customer data or
deploying outside local development.

## Token/cost optimization

Measured live against real Ollama (see the agent-runtime commit history):
classify + a full handler-agent completion for one quote email costs
roughly 2,500–3,500 tokens across 3–4 LLM calls, and prompt tokens
dominate (~85% of the total) because the whole conversation — system
prompt, tool schemas, every prior tool result — gets resent on every turn.
That shaped where the actual levers are:

- **Instructions text is resent every turn, but trimming it isn't free —
  it was A/B tested, not just shortened and assumed fine.** A first pass
  cut Quote Agent's opening sentence ("A customer is asking for a price
  quote.") along with genuinely redundant wording. Run head to head on
  the same input: without that opening sentence, 4/4 attempts failed (the
  model wrote its tool call as text instead of a real one); with it
  restored, 4/4 succeeded. The rest of the trim tested fine either way.
  Conclusion: cut redundant _wording_, never the sentence that orients the
  model to the task before the imperatives start — `prisma/seed.ts` keeps
  that sentence on every handler agent now, with a comment explaining why
  it's there.
- **The classifier is a good candidate for a cheaper model than the
  handlers, but not on a single local GPU.** Classification is a
  materially simpler task and, in a hosted deployment, mapping it to a
  cheaper model tier than the handlers is a real, direct saving —
  independent of what the handlers use. Tried this locally first
  (`gemma4:12b` for the classifier vs `qwen2.5:14b` for handlers): a run
  alternates models on every call, and on a single-GPU local Ollama host
  that forces a full unload/reload between them — one classification call
  took 43s instead of ~350ms. That's a local-hosting artifact (hosted
  providers keep every model warm, no swap cost), not a real production
  cost, but it made local dev unusably slow, so `prisma/seed.ts` keeps the
  classifier on the same model as the handlers for now. Revisit this
  specifically when choosing hosted models — it's still the right
  optimization there, just not testable cheaply on this dev setup.
- **`lib/integrations/gmail/clean-email-body.ts`** strips signature
  blocks and mobile-client footers from the inbound email body before it
  ever reaches a prompt — deliberately conservative (never touches
  quoted/forwarded content, since a customer's real request has been
  observed sitting inside a forwarded block; a wrongly-stripped request is
  a correctness bug, a few extra tokens is not).
- **Prompt caching is not something we can test or measure locally.**
  Ollama doesn't bill per token and has no equivalent caching API, so
  there's no local experiment that would produce a real number here. But
  the system prompt + tool schema for a given agent are already identical
  across every turn of a run and across different runs of the same agent —
  exactly the shape a hosted provider's prompt-caching feature (Anthropic's
  `cache_control` blocks, OpenAI's automatic caching, Gemini context
  caching) is built to exploit, often at a large discount on the cached
  portion. When migrating off Ollama to a hosted provider, enabling that
  provider's caching feature should be part of the same change, not a
  follow-up — the codebase is already structured to make it a no-op on the
  application side.
