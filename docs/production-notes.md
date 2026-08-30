# Production Hardening Notes

Deliberate V1 simplifications that are fine for local development but must be
addressed before any real deployment. Each entry names the gap, why it was
accepted for now, and what closing it looks like.

## Gmail OAuth tokens encrypted at rest (Phase B — closed)

`Integration.accessToken` / `Integration.refreshToken` were stored as plain
text in Postgres through Phase 9. Now encrypted with AES-256-GCM
(`lib/crypto/token-cipher.ts`), wired in at the single chokepoint all reads/
writes already funnelled through (`lib/integrations/integration-repository.ts`)
— nothing above that layer (the service layer, both Gmail route handlers,
`lib/integrations/gmail/{oauth,client}.ts`) had to change or even knows
encryption exists.

The key comes from `TOKEN_ENCRYPTION_KEY`, an env var. This isn't the
"another env var sitting next to the thing it protects" anti-pattern the
old version of this note warned against — that caution is about not storing
the key in the _same datastore_ as the ciphertext (e.g. a second column on
the `Integration` row, or a `Secrets` table in the same Postgres instance),
which this design avoids: the key lives in process env, the ciphertext lives
in Postgres, genuinely separate trust domains for local/CI purposes. It's
still true that a real secrets manager (not a plain env var) is the correct
home for this key before a genuine production deployment — that part of the
original caution doesn't go away, it's just correctly scoped to "before
production," not "before this closes at all."

## Real multi-tenant auth (Phase B)

Every page/action now resolves organisation and user context from a real
Clerk session (`lib/organisations/current-organisation.ts`,
`lib/auth/current-user.ts`) instead of the old "whichever row was created
first" placeholder. Two deliberate simplifications worth knowing about:

- **Provisioning is lazy, not webhook-based.** A brand-new organisation's
  local `Organisation` row and starter Email Handling workflow
  (`provisionEmailWorkflow()`) are created inline, the first time
  `getCurrentOrganisation()` sees a not-yet-seen `clerkOrgId` — not via a
  `/api/webhooks/clerk` endpoint. A webhook route is a new unauthenticated,
  internet-facing endpoint with signature verification to get right, which
  didn't fit a pass whose whole point was shrinking exposure (see the
  disabled `/api/mcp` route below for the same reasoning applied
  elsewhere). Fine at this scale — first-request provisioning does a
  handful of synchronous Prisma upserts, sub-100ms. Would not be fine at
  high-volume signup (thundering herd of first-requests); the fix there is
  additive (move to an async webhook + queue), not a rewrite.
- **No new authorization enforcement.** `User.role` gets populated
  correctly from Clerk's org role (`org:admin`/`org:member` →
  `ADMIN`/`MEMBER`), but nothing is gated by it yet — approve/reject
  (`app/runs/[id]/actions.ts`) still accepts a decision from whichever
  authenticated user submits it, same as before, just now scoped to real
  org members instead of the whole internet. Restricting approve/reject to
  `APPROVER` is real, separable authorization work for later, once role
  data has actually been trustworthy for a while.

## External MCP HTTP endpoint disabled

`app/api/mcp/route.ts` used to expose Agensync's MCP tool server directly
over HTTP with no authentication and no approval-gate enforcement — a real
caller could invoke `send_email` directly, bypassing the approval/audit
system entirely. Found by a security audit; confirmed nothing in the app
called it internally (the real runtime always connects in-process). Now
returns 404. There's a real future use case (an external AI assistant like
Claude Desktop connecting via MCP for read-only lookups —
`find_customer`/`find_product`/`check_inventory`/`calculate_quote`, none of
which have side effects) worth building once it can be scoped to read-only
tools behind real per-organisation authentication, with `send_email`
deliberately kept off whatever gets exposed.

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
- **Reasoning ("thinking") models are a hidden cost trap for narrow,
  atomic calls specifically.** Tried `qwen3.5:4b` (4.7B, smaller than the
  14B handler model) expecting it to be cheaper/faster for narrow tasks
  like classification — it was 5–10x _slower_. Root cause, confirmed
  directly: it generates a hidden chain-of-thought by default that Ollama
  strips from the visible reply but still counts as real completion
  tokens — a one-sentence reply cost 476 completion tokens and multiple
  seconds. `lib/ai/providers/ollama-provider.ts` now always sends
  `think: false` (harmlessly ignored by models without a thinking mode);
  the same one-sentence reply then cost 10 tokens and ~150ms. On a hosted
  provider this isn't just latency — those hidden tokens get billed, so
  a "cheap" small reasoning model can cost more per call than a bigger
  non-reasoning one for exactly the atomic tasks a neuro-symbolic harness
  is meant to make cheap. Whatever model gets chosen for a hosted
  deployment, check whether it has a reasoning mode and whether it can be
  disabled the same way, before assuming its per-token price is the
  whole cost story.
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
