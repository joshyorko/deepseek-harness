# Codex Fast Tier Design

## Goal

OpenAI Codex subscription requests continue to authenticate from the DSH credential record and route through Headroom while a provider profile can select official OpenAI Fast mode with `serviceTier: fast`.

## Design

The pi-ai adapter continues using `Models.streamSimple()` for ordinary routes. When a validated `openai-responses` or `openai-codex-responses` profile selects a service tier, the adapter uses pi-ai's API-specific `Models.stream()` entry and supplies the tier as `serviceTier`. Standard Responses sends `fast`; Codex subscription Responses sends the supported Fast-mode equivalent `priority`. This preserves pi-ai's request construction, response-tier resolution, and usage accounting instead of modifying the completed JSON through `onPayload`.

The local tier union includes `fast` from the official OpenAI Fast mode documentation while retaining the values accepted by the installed OpenAI SDK. A narrow compatibility cast is confined to the pi-ai call because the installed OpenAI SDK type predates the documented `fast` value even though pi-ai forwards the runtime value.

Headroom remains the configured `baseURL`; OAuth credential resolution and request headers are unchanged. The user profile selects `gpt-5.6-luna`, reasoning `max`, and `serviceTier: fast`.

## Verification

Red/green adapter tests assert that `fast` reaches the decoded Codex wire payload and that non-Responses routes reject the field. Focused package tests, TypeScript, lint, Dagger `build:official`, packed-install verification, installed Web startup, and a real installed Luna/max request through Headroom must pass. Headless completion must exit normally without an outer timeout killing it.
