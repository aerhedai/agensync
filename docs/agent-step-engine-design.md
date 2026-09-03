# Design: Step-Based Agents and Unified Record Types

Status: **proposed, not built.** Written for review before implementation,
per CLAUDE.md §29.

This proposes replacing the fixed "Category type" choice on the agent form
with a composable list of steps, and collapsing the three-way catalog into
one Record Type concept. Both are applications of CLAUDE.md §3 —
primitives, not verticals — to the two places that most visibly still
violate it.

---

## 1. The problem

### 1.1 Agent creation narrows instead of enabling

`components/agents/agent-form.tsx` asks the user to pick one of five
"Category types". They are not five instances of one idea:

| Option                          | What it actually is                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `acknowledge_reply`             | A generic shape, configured via `pipelineConfig`                                         |
| `entity_status_signal`          | A generic shape, configured via `pipelineConfig`                                         |
| `entity_correspondence_archive` | A generic shape, configured via `pipelineConfig`                                         |
| `loop`                          | Fully general, model decides everything                                                  |
| `quote`                         | **A hardcoded vertical** — "find the customer, find the product, price it, send a quote" |

Choosing one then changes which fields are even visible:
`extractionFields` renders only for `acknowledge_reply`,
`replySubjectTemplate` only for two of the five, and so on. The form's
answer to "what can this agent do?" is a fixed menu, and one entry on that
menu is a specific business process that every unrelated business has to
scroll past.

The concrete failure this causes: an agent that reads an emailed invoice
and files it as a record is not expressible. `acknowledge_reply` can look
records up but never creates one; `entity_status_signal` requires a
structured JSON webhook, not free-text email. The only option left is
`loop`, which is the most expensive and least predictable mode. That is
not a missing feature — it is a missing _step order_.

### 1.2 The cost/generality tension

Today generality and cost are the same dial:

```
LOOP     general, expensive   — model picks tools; whole conversation and
                                every granted tool's JSON schema resent
                                each turn
HARNESS  cheap, rigid         — narrow atomic LLM calls, but the sequence
                                is a TypeScript file only a developer can
                                add
```

Measured (docs/production-notes.md): one quote email costs ~2,500–3,500
tokens across 3–4 calls, **~85% of it prompt tokens**. Prompt bloat, not
generation, is the cost.

### 1.3 The catalog repeats the pattern

`/catalog` presents Products, Customers, and Custom entities as three
siblings — two privileged built-ins beside the generic mechanism that was
supposed to supersede them.

---

## 2. Core proposal: steps as data

An agent stops being _a type_ and becomes _an ordered list of steps_.

```
Agent = trigger context
      + [ ordered steps ]
      + granted tools
      + guardrails
```

Six step kinds, deliberately few. Only two ever call the model:

| Kind      | LLM call | Purpose                                                |
| --------- | -------- | ------------------------------------------------------ |
| `extract` | 1 narrow | Pull named fields from the input                       |
| `lookup`  | none     | `find_record` / `search_records` into a named variable |
| `compute` | none     | Derive a value from values already known               |
| `branch`  | none     | Condition → take one of two step paths                 |
| `compose` | 1 narrow | Write text from facts already established              |
| `act`     | none     | Invoke a tool; policy decides approval                 |

Every existing pipeline is then a sequence, not a file:

```
acknowledge_reply  extract → lookup? → compose → act(send_email)
quote              extract → lookup(Customer) → lookup(Product)
                   → compute(total) → compose → act(send_email)
status signal      parse → lookup → act(upsert) → branch → act
invoice → record   extract → lookup? → act(create_record)
```

The last line is the case that is impossible today and requires no new
code under this design — only a step order nobody had written down.

### 2.1 Why this resolves the tension rather than trading it off

The reason LOOP is expensive is that the model is asked to decide _and_
format a tool call in one open-ended generation, with every tool schema
and the entire prior conversation in context to do it.

A step sequence removes both:

- **Sequencing is deterministic**, so no tool schemas need to be in any
  prompt at all. `lookup`, `compute`, `branch` and `act` cost zero tokens.
- **Each LLM call is stateless and narrow.** An `extract` prompt carries
  its field list and the input; a `compose` prompt carries established
  facts. Neither carries prior turns.

Generality is preserved because the _sequence_ is unconstrained. The
narrowing that makes an agent reliable comes from its own step list, not
from a menu the platform imposes.

### 2.2 Proposed step schema

Stored in `Agent.pipelineConfig` (already a JSON bag with per-shape Zod
validation — this extends that pattern rather than adding a column):

```ts
type Step =
  | { kind: "extract"; fields: { name: string; description: string }[] }
  | {
      kind: "lookup";
      as: string;
      recordType: string;
      match: { field: string; from: string } | { query: string };
    }
  | { kind: "compute"; as: string; expression: string }
  | { kind: "branch"; when: Condition; then: Step[]; else?: Step[] }
  | { kind: "compose"; as: string; instructions: string }
  | { kind: "act"; tool: ToolName; args: Record<string, string> };
```

`{placeholder}` interpolation against named values resolves references
between steps — the same mechanism `entity_status_signal` already uses for
its folder paths and message templates, generalised.

Invariants worth stating explicitly, because they are what keep this from
becoming an unbounded workflow engine:

- **Steps are a flat sequence with one level of branching.** No loops, no
  goto, no recursion. A step list always terminates.
- **The model never chooses a step.** It only fills in fields
  (`extract`) or writes prose (`compose`).
- **`act` is still policy-gated.** Nothing here bypasses
  `policy-engine.ts` or per-agent tool grants.
- **The existing step limit still applies** as a backstop.

---

## 3. Agent form: simple and advanced modes

Both modes write the same step list. Simple mode is a generator, not a
different feature set — this is why it does not become a second code path
to maintain in the runtime.

**Simple mode** asks plain questions and derives steps:

```
What starts this?          → trigger
What should it pull out?   → extract step
Does it need to look
  anything up?             → lookup step
What should it do?         → act step (+ compose if the act sends text)
```

**Advanced mode** shows the step list directly: add, remove, reorder,
edit each step's config.

The toggle is a view over one underlying value. Switching from simple to
advanced shows the steps simple mode just generated; switching back is
possible whenever the step list still fits the simple shape, and is
disabled (with the reason shown) when it does not — rather than silently
discarding steps the simple form cannot express.

`quote` disappears as a form option. It becomes a **template**: a named,
pre-filled step list a business can install and then edit freely.

---

## 4. Catalog: one Record Type list

Replace Products | Customers | Custom entities with a single **Record
Types** list, where Product and Customer are ordinary seeded types.

**This is cheaper than CLAUDE.md §7 assumes.** §7 warns that collapsing
`Product` into `CustomEntityType` would replace a real `Decimal` price
with an untyped string. That caution was written assuming the tables held
data. Verified against production: **`Product` and `Customer` each hold
zero rows.** There is no data to downgrade. The collapse is close to a
pure deletion, and §7 should be corrected on this point.

Typed fields are still required — not for the catalog collapse, but for
`compute`, `branch`, and data-driven policies, all of which need to
compare against real numbers and dates.

Minimum field types needed: `text`, `number`, `date`, `boolean`,
`currency`, `reference`.

---

## 5. Token model

### 5.1 Already done and measured

`think:false` (476 → 10 completion tokens on one reply), inbound email
body cleaning, per-agent tool filtering, and A/B-tested instruction
trimming. See docs/production-notes.md — these are not re-litigated here.

### 5.2 What this design changes

| Lever                          | Expected size      | Mechanism                                                           |
| ------------------------------ | ------------------ | ------------------------------------------------------------------- |
| Steps replace LOOP             | **Large**          | Removes tool schemas and conversation history from prompts entirely |
| Single-handler classifier skip | Small, free        | See below                                                           |
| Cheaper classifier model       | Real, hosted only  | Already tried locally; single-GPU model swapping cost 43s           |
| Prompt caching                 | Large, hosted only | System prompt + tool schema are already identical across turns      |

**The single-handler skip is a confirmed gap.**
`lib/routing/deterministic-classify.ts` only matches an agent that has
keywords configured, so a workflow with exactly one active handler and no
keywords still pays a full LLM classification call to make a decision with
one possible answer. Fix: if there is exactly one active handler, route to
it without calling the model.

### 5.3 Honesty about the large number

The step-engine saving is **predicted, not measured.** The reasoning is
sound (85% of current cost is prompt, and this removes the two largest
prompt components), but this codebase has already been surprised once:
removing a single orienting sentence from an agent's instructions caused
4/4 tool-call failures in live testing. Trimming prompts is not reliably
free.

Therefore the first template built under this design must be measured
head-to-head against the equivalent LOOP agent on the same inputs, using
`scripts/token-cost-test.ts`, before the saving is claimed anywhere.

---

## 6. Migration

Production inventory at time of writing:

```
HARNESS / quote               4 agents
HARNESS / acknowledge_reply   8 agents
LOOP    / (classifier)        5 agents
Record types 1, records 1, products 0, customers 0
```

Approach — no big-bang cutover:

1. Build the step engine alongside the existing pipelines. `pipelineKey`
   continues to work untouched.
2. Express each existing pipeline as a step template and verify it
   produces byte-identical behaviour on the existing integration tests.
3. Migrate agents template by template, each with its own migration and
   its own verification, in the order: `acknowledge_reply` (8, simplest
   and most uniform) → `quote` (4) → the two zero-LLM pipelines.
4. Delete a pipeline file only once no agent references it.

Classifier agents (LOOP, 5) are unaffected — classification is not a step
sequence and stays as it is.

---

## 7. Sequencing

```
1. Typed Record Type fields          prerequisite for compute/branch/policies
2. Step engine + step schema         behind the existing pipelines
3. Express existing pipelines        as templates, prove parity on tests
4. Agent form: simple/advanced       quote stops being an option
5. Catalog → Record Types            cheap now: zero rows to migrate
6. Single-handler classifier skip    independent, can land any time
```

Step 6 is independent of everything else and is the cheapest real win on
the list.

---

## 8. Open questions

- **`compute` expression language.** A tiny arithmetic/string evaluator is
  needed. It must not be `eval` or anything that can execute arbitrary
  code (CLAUDE.md §18). Probably a fixed set of operations over named
  values rather than a general expression parser.
- **Where templates live.** Code constants initially (like the current
  pipeline registry) or database rows from the start? Code is simpler and
  matches `WorkflowSource.TEMPLATE`'s existing provenance model.
- **Error semantics per step.** Does a failed `lookup` stop the run or
  take the `else` path? Current pipelines stop on tool failure; branching
  on failure may be worth having but adds surface.
- **Simple-mode round-tripping.** Exactly which step lists are considered
  "simple enough" to switch back to simple mode without loss.
