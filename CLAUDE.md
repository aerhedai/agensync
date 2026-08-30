# Agentic AI Business Automation Platform

## Product & Engineering Specification — V1

---

# 1. Project Overview

We are building an early-stage B2B agentic AI automation platform.

The long-term business goal is to help companies automate repetitive business processes that currently require employees to:

1. Receive information
2. Understand/classify it
3. Extract relevant information
4. Make decisions based on business rules
5. Look up information in company systems
6. Perform actions in other systems
7. Communicate the result
8. Escalate unusual or sensitive situations to a human

The platform should allow a business to create AI-powered agents that can interact with business tools and complete these processes.

The important distinction is:

> This is not primarily an AI chatbot.

The product is an **AI-powered business process automation platform**.

The AI should be capable of:

```text
Receive information
        ↓
Understand information
        ↓
Reason about what needs to happen
        ↓
Select appropriate tools
        ↓
Execute actions
        ↓
Observe the results
        ↓
Continue / retry / escalate
        ↓
Complete the task
```

---

# 2. Example Use Case

The initial example use case is an AI Quote Agent.

A business receives an email:

"Hi,

Can you provide a quote for 500 units of Product A delivered to Birmingham?"

The agent should eventually be able to:

1. Detect that this is a quote request.
2. Extract:

   * Customer
   * Product
   * Quantity
   * Delivery location
   * Other relevant information
3. Find the customer in the company's database/CRM.
4. Find the requested product.
5. Check availability.
6. Calculate pricing.
7. Generate a quote.
8. Determine whether human approval is required.
9. If approval is not required, send the quote.
10. If approval is required, create an approval request.
11. Once approved, continue the workflow.
12. Record every step of the process.

However, this is only an example.

The platform must be designed so that the same underlying infrastructure can eventually support:

* Customer support agents
* Invoice processing agents
* Order processing agents
* Sales agents
* Recruitment agents
* Scheduling agents
* Procurement agents
* Document processing agents
* Internal operations agents
* Other repetitive business workflows

---

# 3. Product Vision

The long-term product should allow a company to configure:

```text
Trigger
   ↓
Agent
   ↓
Instructions
   ↓
Tools
   ↓
Business rules
   ↓
Workflow
   ↓
Human approval when necessary
   ↓
Actions
   ↓
Audit trail
```

A customer should eventually be able to connect their existing systems and configure an agent without needing to build the automation themselves.

Long-term integrations could include:

* Gmail
* Microsoft Outlook
* Slack
* Microsoft Teams
* HubSpot
* Salesforce
* Microsoft Dynamics
* Xero
* QuickBooks
* Google Drive
* OneDrive
* REST APIs
* Custom internal APIs
* Databases

These integrations are NOT all required for V1.

---

# 4. V1 Goal

V1 should NOT attempt to build the entire commercial platform.

The goal of V1 is to prove the core technology:

> A user can create an AI agent, give it instructions and tools, run it against an input, allow it to perform controlled actions, and see a complete record of what happened.

The first implementation should be deliberately small.

We should prioritize:

* Correct architecture
* Understandable code
* Strong TypeScript practices
* Clear separation of responsibilities
* Testability
* Security
* Observability
* Extensibility

Do NOT prematurely build:

* Microservices
* Kubernetes
* Kafka
* Complex distributed infrastructure
* Multiple cloud providers
* Dozens of integrations
* A marketplace
* Complex billing
* Enterprise SSO
* A huge workflow visual editor

Those can be introduced later when there is a real requirement.

---

# 5. Initial Technology Stack

Use the following stack unless there is a strong technical reason to change it.

## Frontend / Application

* Next.js
* React
* TypeScript
* Next.js App Router
* Tailwind CSS
* shadcn/ui

## Database

* PostgreSQL
* Prisma ORM

## Validation

* Zod

All external/user-provided data must be validated.

Never trust request bodies, query parameters, webhook payloads or tool inputs without validation.

## AI

Initially support a local AI model through Ollama.

The development machine contains an RTX 3090.

The local GPU should be used for development and experimentation to minimise API costs.

The architecture should nevertheless abstract the model provider so that commercial APIs can be introduced later.

Do NOT tightly couple the entire application to one model provider.

## Development

* Git
* GitHub
* Docker
* Docker Compose
* pnpm
* ESLint
* TypeScript strict mode
* Automated tests
* GitHub Actions

---

# 6. High-Level Architecture

The initial architecture should be a modular monolith.

```text
                    Next.js Application
                           │
              ┌────────────┴────────────┐
              │                         │
           Frontend                 API Layer
              │                         │
              └────────────┬────────────┘
                           │
                     Service Layer
                           │
             ┌─────────────┼─────────────┐
             │             │             │
           Agents       Workflows       Runs
             │             │             │
             └─────────────┼─────────────┘
                           │
                      Agent Runtime
                           │
              ┌────────────┼────────────┐
              │            │            │
             LLM         Tools       Policies
              │            │            │
              └────────────┼────────────┘
                           │
                      PostgreSQL
```

The application should initially be deployed as one application.

Do not split components into microservices unless there is a demonstrated need.

---

# 7. Repository Structure

Use a clear and predictable project structure.

Suggested structure:

```text
agent-platform/

├── app/
│   ├── (auth)/
│   ├── dashboard/
│   ├── agents/
│   ├── workflows/
│   ├── runs/
│   ├── approvals/
│   ├── settings/
│   └── api/
│
├── components/
│   ├── ui/
│   ├── agents/
│   ├── workflows/
│   ├── runs/
│   └── approvals/
│
├── lib/
│   ├── agents/
│   ├── workflows/
│   ├── runs/
│   ├── tools/
│   ├── integrations/
│   ├── policies/
│   ├── approvals/
│   ├── ai/
│   ├── db/
│   └── auth/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── tests/
│   ├── unit/
│   └── integration/
│
├── public/
│
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── eslint.config.*
├── .env.example
├── CLAUDE.md
└── README.md
```

The exact structure can change if there is a strong reason, but maintain clear separation between UI, API, business logic, database access and infrastructure.

---

# 8. Core Domain Concepts

The following concepts should form the foundation of the application.

## Organisation

A company using the platform.

An organisation owns:

* Users
* Agents
* Workflows
* Integrations
* Runs
* Approvals
* Audit logs

Design the database with multi-tenancy in mind from the beginning.

Every organisation-owned record must be associated with an organisation.

---

## User

A person belonging to an organisation.

Eventually users will have roles such as:

* Owner
* Admin
* Member
* Approver

For V1, a simple role model is sufficient.

---

## Agent

An AI worker with:

* Name
* Description
* Instructions
* Model configuration
* Available tools
* Organisation
* Status
* Version
* Creation date
* Update date

Example:

```text
Name:
Quote Agent

Description:
Processes incoming quote requests.

Instructions:
Read quote requests and extract the relevant information.
Use the available tools to retrieve customer and product information.
Never send a quote above £10,000 without approval.
```

---

# 9. Agent Tools

Agents must NOT have unrestricted access to the system.

They interact with the outside world through explicitly defined tools.

Examples:

```text
find_customer
find_product
check_inventory
calculate_quote
create_quote
send_email
```

A tool should contain:

* Name
* Description
* Input schema
* Output schema
* Handler
* Permission requirements

Example conceptual tool:

```typescript
{
  name: "find_customer",
  description: "Find a customer by email address",
  inputSchema: ...,
  execute: async (...) => ...
}
```

The LLM may request a tool.

The application must then:

1. Validate the tool name.
2. Validate the parameters.
3. Check the agent has access to the tool.
4. Check organisation permissions.
5. Apply relevant policies.
6. Execute the tool.
7. Record the tool call.
8. Return the result to the agent.

The LLM must never bypass this system.

---

# 10. Agent Runtime

The agent runtime is the core of the application.

A basic run should operate conceptually like:

```text
Input
 ↓
Agent receives input
 ↓
LLM interprets input
 ↓
LLM determines next action
 ↓
Tool request
 ↓
Validate tool request
 ↓
Policy check
 ↓
Execute tool
 ↓
Record result
 ↓
Return result to LLM
 ↓
LLM determines next action
 ↓
...
 ↓
Complete
```

The runtime should support:

* Input
* Agent instructions
* Available tools
* Tool calls
* Tool results
* Run state
* Errors
* Completion
* Human approval
* Maximum iteration limits

There must always be safeguards against infinite agent loops.

For example:

```text
MAX_AGENT_STEPS = 20
```

The exact number should be configurable.

---

# 11. Run System

Every time an agent executes, create an AgentRun.

Example:

```text
AgentRun

ID: run_123
Agent: Quote Agent
Status: RUNNING
Started: 10:42
```

Each run should contain RunSteps.

Example:

```text
Run
 │
 ├── Input received
 │
 ├── LLM decision
 │
 ├── find_customer
 │
 ├── find_product
 │
 ├── check_inventory
 │
 ├── calculate_quote
 │
 ├── create_quote
 │
 └── send_email
```

The user should be able to inspect this history.

---

# 12. Run Status

Use explicit statuses.

```text
PENDING
RUNNING
WAITING_FOR_APPROVAL
COMPLETED
FAILED
CANCELLED
```

Do not represent important workflow state using arbitrary strings.

Use TypeScript enums/unions and corresponding database enums where appropriate.

---

# 13. Human Approval

Human approval is a fundamental part of the platform.

The agent should not automatically perform every action.

Example:

```text
Quote = £7,500
→ Automatically allowed

Quote = £27,000
→ Approval required
```

The agent runtime should be able to pause.

```text
Agent
 ↓
Policy
 ↓
Approval required
 ↓
WAITING_FOR_APPROVAL
 ↓
Human approves
 ↓
Agent resumes
 ↓
Continue workflow
```

The approval record should contain:

* Run ID
* Requested action
* Reason
* Requested timestamp
* Status
* Approver
* Decision timestamp

---

# 14. Policy System

Policies determine what agents are allowed to do.

The LLM should not be the authority on permissions.

Example:

```text
Quote under £10,000:
ALLOW

Quote over £10,000:
REQUIRE_APPROVAL

Delete customer:
DENY

Send external email:
ALLOW
```

The policy engine should be deterministic application code.

AI can recommend an action.

Application code decides whether that action is permitted.

---

# 15. AI Provider Abstraction

Do not scatter model-specific SDK calls throughout the application.

Create an abstraction.

Conceptually:

```text
AI Provider
    │
    ├── Ollama
    ├── OpenAI
    ├── Anthropic
    └── Future providers
```

The agent runtime should interact with a common interface.

For example:

```typescript
interface AIProvider {
  generateResponse(...): Promise<AIResponse>;
}
```

The exact implementation should be decided during development.

The purpose is to prevent the entire system becoming tightly coupled to one provider.

---

# 16. Local AI

During development:

```text
Next.js
   ↓
Agent Runtime
   ↓
AI Provider
   ↓
Ollama
   ↓
RTX 3090
```

The model does not need to be perfect.

The purpose is to develop:

* Agent architecture
* Tool calling
* State handling
* Prompting
* Structured outputs
* Error handling
* Testing

Commercial models can be added later.

---

# 17. Database Schema

Use PostgreSQL through Prisma.

Initial entities should include approximately:

```text
Organisation
User
Agent
AgentTool
Workflow
WorkflowNode
AgentRun
RunStep
ToolCall
Approval
AuditLog
```

Do not add unnecessary entities just because they might be useful later.

Database design should support:

* Organisation isolation
* Agent ownership
* Run history
* Tool execution history
* Approval history
* Auditability

---

# 18. Database Access

Do not query PostgreSQL directly from React components.

Use:

```text
UI
 ↓
API / Server Action
 ↓
Service
 ↓
Repository
 ↓
Prisma
 ↓
PostgreSQL
```

Repositories are responsible for database access.

Services contain business logic.

Routes/API handlers deal with HTTP concerns.

This separation is important for maintainability and testing.

---

# 19. Validation

Use Zod for external input.

Every API endpoint should validate input.

Example:

```text
HTTP Request
     ↓
Zod validation
     ↓
Service
     ↓
Repository
```

Never assume incoming data is valid.

Tool parameters should also be validated.

---

# 20. Error Handling

Errors should be deliberate and structured.

The application must distinguish between:

```text
Validation error
Authentication error
Authorisation error
Tool error
External API error
AI error
Database error
Workflow error
Unknown error
```

Do not silently swallow errors.

Do not use empty catch blocks.

Every important failure should be logged and associated with the relevant run where possible.

---

# 21. Logging

Every agent run should have structured logs.

Example:

```text
RUN_STARTED
AGENT_DECISION
TOOL_REQUESTED
TOOL_EXECUTED
TOOL_FAILED
APPROVAL_REQUESTED
APPROVAL_GRANTED
RUN_COMPLETED
RUN_FAILED
```

Logs should contain relevant identifiers such as:

* organisationId
* agentId
* runId
* toolCallId

Do not log secrets or sensitive credentials.

---

# 22. Security Principles

Security must be considered from the beginning.

Requirements:

* Never expose API keys to the browser.
* Never allow users to access another organisation's records.
* Validate all external input.
* Authorise every sensitive action.
* Keep credentials server-side.
* Never allow arbitrary code execution through an agent tool.
* Restrict tools available to each agent.
* Do not let the LLM bypass application permissions.
* Record important external actions.
* Avoid logging sensitive information unnecessarily.

---

# 23. Initial UI

The UI should be professional but simple.

## Dashboard

Display:

```text
Agents
Active Runs
Completed Runs
Failed Runs
Pending Approvals
```

---

## Agents page

```text
Agents

Quote Agent
Status: Active
Runs: 128

Customer Support Agent
Status: Draft
Runs: 0

[Create Agent]
```

---

## Create Agent

Fields:

```text
Name
Description
Instructions
Model
Tools
```

---

## Agent detail page

Sections:

```text
Overview
Instructions
Tools
Configuration
Runs
```

---

## Run detail page

This is one of the most important pages.

Display:

```text
Run #1029

Status: COMPLETED

Input
----------------
"Please quote 500 units of Product A"


Steps
----------------

1. Input received

2. Classified as quote request

3. find_customer
   Result: Customer found

4. find_product
   Result: Product found

5. check_inventory
   Result: 700 units available

6. calculate_quote
   Result: £7,500

7. create_quote
   Result: Quote #18292

8. send_email
   Result: Email sent


Completed in: 8.4 seconds
```

The UI should make it easy to understand exactly what the agent did.

---

# 24. Initial Workflow

For V1, do not build a complex drag-and-drop workflow editor.

Start with a simple workflow representation.

For example:

```text
Trigger
   ↓
Agent
   ↓
Tools
   ↓
Policy
   ↓
Approval
   ↓
Action
```

The database should nevertheless be designed so more complex workflows can be introduced later.

---

# 25. First Demonstration

The first complete demonstration should be:

```text
User enters:

"Customer ABC wants 500 units of Product A."

        ↓

Quote Agent

        ↓

Extract customer/product/quantity

        ↓

find_customer()

        ↓

find_product()

        ↓

check_inventory()

        ↓

calculate_quote()

        ↓

create_quote()

        ↓

Policy check

        ↓

send_email()

        ↓

COMPLETED
```

All steps should appear in the Run interface.

Initially, these tools can use mock/local data.

Do not start by integrating with ten external services.

---

# 26. Development Phases

Build the application incrementally.

## Phase 1 — Project foundation

Create:

* Next.js project
* TypeScript strict mode
* Tailwind
* shadcn/ui
* ESLint
* pnpm
* Docker
* PostgreSQL
* Prisma
* Environment configuration
* Git repository
* README
* CLAUDE.md

Goal:

Application runs locally and connects successfully to PostgreSQL.

---

## Phase 2 — Database

Implement:

* Organisation
* User
* Agent
* AgentRun
* RunStep

Create migrations.

Seed development data.

Goal:

Create and retrieve agents from PostgreSQL.

---

## Phase 3 — Agent UI

Build:

* Dashboard
* Agents list
* Create Agent
* Agent detail
* Edit Agent

Goal:

A user can create an agent through the UI.

---

## Phase 4 — AI abstraction

Implement:

```text
AIProvider
OllamaProvider
```

Test a simple prompt.

Goal:

The application can send input to a local model and receive structured output.

---

## Phase 5 — Tool system

Create the first tools:

```text
find_customer
find_product
check_inventory
calculate_quote
```

Initially these can use local database data.

Goal:

The agent can request tools and receive their results.

---

## Phase 6 — Agent runtime

Implement:

```text
Input
 ↓
AI
 ↓
Tool call
 ↓
Tool result
 ↓
AI
 ↓
...
 ↓
Complete
```

Add:

* Step limits
* Error handling
* Run persistence
* Tool call persistence

Goal:

A complete agent run is persisted and visible in the UI.

---

## Phase 7 — Policy system

Implement simple deterministic policies.

Example:

```text
quote < £10,000
→ automatic

quote >= £10,000
→ approval
```

Goal:

Agent actions are controlled by application-level policies.

---

## Phase 8 — Approval system

Implement:

```text
WAITING_FOR_APPROVAL
```

Create approval UI.

Allow:

```text
Approve
Reject
```

Goal:

Agent can pause and continue after human approval.

---

## Phase 9 — Email integration

Only after the local workflow is reliable.

Add one provider first:

Either Gmail or Microsoft Outlook.

The email should trigger the quote workflow.

Goal:

Real email → agent → processing → response.

---

## Phase 10 — Testing and hardening

Add:

* Unit tests
* Integration tests
* Agent runtime tests
* Tool tests
* API tests
* Database tests
* Permission tests
* Failure tests

Test cases should include:

```text
Valid request
Invalid request
Unknown customer
Unknown product
Insufficient inventory
AI produces invalid tool parameters
Tool fails
AI loops
Approval required
Approval rejected
External API unavailable
Database failure
```

---

# 27. Testing Philosophy

Do not only test whether functions return the expected output.

Test behaviour.

For the agent:

```text
Given this input,
the agent should eventually perform these actions
and should never perform these forbidden actions.
```

For example:

```text
Input:
Quote for £25,000

Expected:
create_quote()
approval_requested()

Forbidden:
send_email()
```

This is particularly important for agentic systems.

---

# 28. TypeScript Standards

The project is intended to improve and demonstrate professional TypeScript skills.

Use:

* Strict TypeScript
* Explicit types at important boundaries
* Discriminated unions where appropriate
* Zod schemas for runtime validation
* No `any` unless there is an extremely strong justification
* Avoid unnecessary type assertions
* Small focused functions
* Clear interfaces
* Predictable naming
* Consistent error handling

Do not allow Claude Code to generate unnecessary abstractions simply to make the project appear complex.

Prefer readable code.

---

# 29. Claude Code Development Rules

Claude Code is being used as a development assistant.

It should NOT blindly implement large features without explaining them.

Before significant implementation:

1. Explain the problem.
2. Explain the proposed architecture.
3. Identify files that will change.
4. Explain important TypeScript concepts involved.
5. Identify trade-offs.
6. Implement only after the approach is understood.

After implementation:

1. Explain what changed.
2. Explain why.
3. Explain important code paths.
4. List changed files.
5. Run lint.
6. Run typecheck.
7. Run tests.
8. Run build where appropriate.
9. Report failures honestly.

If there is an architectural decision, explain it.

The purpose is not simply to generate code.

The purpose is to build a professional system while teaching the developer how the system works.

---

# 30. Claude Code Must Not

Do not:

* Create unnecessary files.
* Create microservices without justification.
* Add dependencies without explaining why.
* Replace working architecture unnecessarily.
* Use `any` to silence TypeScript errors.
* Disable ESLint rules to make errors disappear.
* Disable TypeScript strictness.
* Ignore failing tests.
* Hide errors.
* Hard-code secrets.
* Put secrets in Git.
* Introduce Kubernetes.
* Introduce Kafka.
* Introduce Redis unless there is a demonstrated need.
* Introduce Temporal unless the workflow requirements justify it.
* Introduce a vector database before it is necessary.

---

# 31. Git Workflow

Use meaningful commits.

Examples:

```text
feat: add agent database model
feat: add agent creation API
feat: add agent creation UI
feat: add local AI provider
feat: add tool execution system
feat: persist agent runs
fix: prevent duplicate tool execution
test: add quote agent runtime tests
```

Do not make enormous commits containing unrelated changes.

---

# 32. CI

GitHub Actions should eventually run:

```text
Install
 ↓
Lint
 ↓
Typecheck
 ↓
Tests
 ↓
Build
```

A pull request should not be considered complete if these checks fail.

---

# 33. Environment Variables

Use:

```text
.env.local
.env.example
```

Never commit real secrets.

Example:

```text
DATABASE_URL=
OLLAMA_BASE_URL=
AI_PROVIDER=
```

Future integrations may add:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
```

---

# 34. Future Architecture

Do not implement this now, but design so the application can eventually evolve into:

```text
                     Web Application
                            │
                            ▼
                         API
                            │
                    ┌───────┴────────┐
                    │                │
                Workflow          Agent Runtime
                Engine                │
                    │                 │
                    └────────┬────────┘
                             │
                         Workers
                             │
                  ┌──────────┼──────────┐
                  │          │          │
                 AI         Tools    Integrations
                  │          │          │
                  └──────────┼──────────┘
                             │
                         PostgreSQL
```

Potential future infrastructure:

* Temporal
* Redis
* Background workers
* S3/object storage
* Cloud deployment
* Managed AI APIs
* More integrations
* Enterprise authentication
* Billing
* Usage metering
* Advanced workflow editor
* Knowledge bases/RAG
* Advanced observability

These should only be introduced when required.

---

# 35. Long-Term Product

Eventually the platform should allow businesses to build agents such as:

```text
Quote Agent

Customer Support Agent

Invoice Agent

Sales Operations Agent

Order Processing Agent

Recruitment Agent

Procurement Agent

Scheduling Agent
```

Each agent should use the same underlying infrastructure:

```text
Agent
+
Instructions
+
Tools
+
Triggers
+
Policies
+
Workflow
+
Memory/Knowledge
+
Human approval
+
Audit trail
```

The business should be able to deploy an agent without rebuilding the underlying system.

---

# 36. Commercial Direction

The eventual commercial proposition is:

> We identify repetitive business processes and turn them into AI-powered workflows that can understand information, make decisions, interact with business systems and complete tasks automatically.

The product should focus on measurable business outcomes:

* Hours saved
* Tasks completed
* Percentage automated
* Human interventions
* Processing time
* Error rate
* Cost savings

The customer should ultimately be able to see:

```text
Quote Agent

Requests processed:        1,248
Automatically completed:   1,031
Human approvals:             183
Failed:                       34

Estimated hours saved:       412
```

This is more valuable than simply showing "AI usage".

---

# 37. Definition of V1 Complete

V1 is complete when the following works locally:

```text
User
 ↓
Next.js dashboard
 ↓
Create Agent
 ↓
Configure instructions
 ↓
Select tools
 ↓
Provide test input
 ↓
Agent Runtime
 ↓
Local LLM
 ↓
Tool calls
 ↓
Database
 ↓
Policy check
 ↓
Human approval if necessary
 ↓
Agent continues
 ↓
Run completes
 ↓
Complete run history visible in UI
```

The entire process must be reproducible locally using Docker and documented in the README.

A new developer should be able to clone the repository, configure environment variables, run Docker Compose, install dependencies, run migrations, seed the database and start the application without undocumented manual steps.

---

# 38. First Milestone

Do NOT attempt to build the entire specification immediately.

The first implementation milestone is:

> **Create an Agent and persist it to PostgreSQL.**

Then:

> **Run the Agent against a test input and persist the Run.**

Then:

> **Allow the Agent to call one controlled tool.**

Then:

> **Display the complete run in the UI.**

Everything should be built incrementally from there.

---

# 39. Engineering Principle

The most important principle for this project is:

> **Build the simplest system that proves the next piece of the product, while maintaining professional engineering standards.**

Do not confuse complexity with quality.

The architecture should be capable of growing into a serious B2B agentic automation platform, but V1 should remain small enough that the developer understands every major part of it.

---

# 40. Workflow Automation and Branching Policy

The following are enforced mechanically (via `.claude/settings.json` hooks and, from Phase 2 onward, GitHub branch protection) rather than left to memory or convention, so they cannot be silently skipped.

## Prompt transcript

Every user prompt is appended automatically to `transcript/prompts.md` by a `UserPromptSubmit` hook (`.claude/hooks/log-prompt.sh`). This is unconditional — it logs every prompt, including ones a user asks not to be logged in the moment; if a prompt must be excluded, remove it from `transcript/prompts.md` afterward. `transcript/` is gitignored — it's a local working log, not part of the repository.

## Frontend screenshots before a PR

Editing any file under `app/`, `components/`, or any `.tsx`/`.css` file sets a local marker (`.claude/.frontend-dirty`, gitignored) via a `PostToolUse` hook (`.claude/hooks/mark-frontend-dirty.sh`). A `PreToolUse` hook (`.claude/hooks/check-pr-screenshot.sh`) blocks `gh pr create` while that marker is set. To proceed: take a screenshot of the running app, attach it to the PR body, then run `rm .claude/.frontend-dirty`.

This gate can only enforce an explicit acknowledgment step — it cannot verify a screenshot was actually taken or is accurate. Treat it as a forcing function against forgetting, not a substitute for actually looking at the page.

## Branching model

In effect from Phase 2 onward — Phase 1 (project foundation) itself was built via direct commits to `main`, which was a deliberate one-time exception for initial scaffolding, not the ongoing policy:

```text
main   — protected, always deployable
  ↑ PR only
dev    — protected, integration branch
  ↑ PR only
feature/* — branched off dev, one per issue/feature
```

* No direct pushes to `main` or `dev`. All changes land via a pull request.
* Feature branches are cut from `dev`, not `main`.
* `main` only receives merges from `dev` (releases), never directly from a feature branch.
* Enforced server-side via GitHub branch protection rules on `main` and `dev` (required PR, required `ci` status check, no direct pushes, no force pushes, enforced for admins too — verified with a real rejected push, not just configured and assumed). A `PreToolUse` hook (`.claude/hooks/block-protected-push.sh`) also blocks direct `git push` to `main`/`dev` locally, as a fast failure ahead of the server-side rejection.
