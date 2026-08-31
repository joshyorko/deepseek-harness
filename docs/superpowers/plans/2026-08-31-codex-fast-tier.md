# Codex Fast Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route DSH OpenAI Codex subscription requests through Headroom with official `service_tier: fast` semantics.

**Architecture:** Keep generic routes on pi-ai `streamSimple()`. Tiered OpenAI Responses routes use pi-ai's API-specific `stream()` so request construction and response accounting share the selected tier.

**Tech Stack:** TypeScript, Cordis, pi-ai 0.84.2, Vitest, Dagger, Homebrew

## Global Constraints

- Preserve DSH-owned OAuth credential resolution and Headroom `baseURL` routing.
- Keep `gpt-5.6-luna` with reasoning `max` as the installed default.
- Do not print credential payloads or tokens.
- Do not change headless shutdown code without a reproducible failing test.

---

### Task 1: Fast-tier request path

**Files:**
- Modify: `packages/llm/llm-pi-ai/src/config.ts`
- Modify: `packages/llm/llm-pi-ai/src/adapter.ts`
- Test: `packages/llm/llm-pi-ai/tests/adapter.spec.ts`
- Test: `packages/llm/llm-pi-ai/tests/sdk-options.spec.ts`
- Test: `packages/llm/llm-pi-ai/tests/catalog.spec.ts`

**Interfaces:**
- Consumes: `PiAiProviderProfile.serviceTier`, pi-ai `Models.stream()` and `Models.streamSimple()`.
- Produces: `service_tier: "fast"` on OpenAI Responses requests with response-tier semantics retained.

- [ ] **Step 1: Write failing tests for `fast` validation and decoded Codex wire output**
- [ ] **Step 2: Run the focused tests and confirm the missing `fast`/wrong stream failures**
- [ ] **Step 3: Add `fast` and route tiered Responses calls through `Models.stream()`**
- [ ] **Step 4: Run the focused and full package tests**
- [ ] **Step 5: Update the owning Agent Note and generated config catalog pair**

### Task 2: Installed acceptance

**Files:**
- Modify: `/home/kdlocpanda/.dsh/settings.yaml`

**Interfaces:**
- Consumes: stored `llm-pi-ai/openai-codex` OAuth grant and Headroom `http://10.10.10.89/v1`.
- Produces: installed Luna/max request through Headroom with Fast mode selected.

- [ ] **Step 1: Run focused TypeScript, lint, documentation, and whitespace checks**
- [ ] **Step 2: Run clean Dagger Homebrew build and packed-install verification**
- [ ] **Step 3: Inspect the packed adapter for the API-specific tier path**
- [ ] **Step 4: Set the live profile to `serviceTier: fast` and install the built artifact for acceptance**
- [ ] **Step 5: Run installed Web and real headless Headroom acceptance, requiring normal exit**
- [ ] **Step 6: Commit the focused repository change and report the rebuild command**
