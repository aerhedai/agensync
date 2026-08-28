# Prompt Transcript

A verbatim log of user prompts given during development of this project, kept per the user's request starting 2026-08-28. Each entry is appended as a new prompt is received.

---

## 2026-08-28

Read CLAUDE.md. Do not write application code yet. I want to begin Phase 1. First inspect the current repository, explain what you think the architecture should be, identify anything missing from the specification, and propose the exact files and dependencies you want to create. I want to understand the TypeScript and architectural decisions, so explain them as you go. Do not make changes until I approve the plan. From now on make sure to save a copy of each prompt I give in a transcript file on the directory.

---

ollama itself is running off this computer on a seperate server, it can be reached through my tailscale network. So should docker compose be used this way. Can you also explain the decisions in section 3

---

Nothing needs to change here. What i also need is to create this as a new git repo. I want to take the development slowly and test at each stage. The file structure has also not been set up yet to include docker compose files, git files etc.

---

can you make sure that this project is under the aerhed organisation

---

can we use node 24 to keep everything up to date.

---

yes move on

---

Ok i want to kind of make sure things that are repetitive are ensured to always happen, what can i do to make these things always happen instead of relying on memory: Updating the transcript after every prompt, taking screenshots of the frontend after every change and adding it to the pull request, ensuring that pull requests are made first before pushing to a branch, after phase 1 which is the setup, i want to start using properly created branching, such as dev before main, then branches off dev when creating features. I want this to all be remembered.

---

now check

---

Lets move on

---

Based on the structure so far what is currently running and how are they communicating

---

Yes continue
