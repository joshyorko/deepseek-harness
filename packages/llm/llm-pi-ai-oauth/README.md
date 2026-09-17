---
description: "The optional browser authorization companion for pi-ai provider sign-in flows in self-hosted web compositions."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-pi-ai-oauth

## Summary

`@deepseek-ai/dsh-llm-pi-ai-oauth` exposes pi-ai authorization flows through a self-hosted browser Remote and Models settings card. Attempts remain ephemeral, notices and prompts are redacted to browser-safe fields, and credential grants remain owned by the pi-ai authorization and credential seams.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

Mount this companion with `@deepseek-ai/dsh-llm-pi-ai`, `@deepseek-ai/dsh-authorization`, and a writable credential provider when a web user must sign into a pi-ai provider. The companion supplies the browser Remote and settings-card presentation; pi-ai owns provider login and refresh, while the authorization and credential packages own flow state and durable records.

The Remote supports listing flows, starting and polling attempts, answering prompts, cancellation, and sign-out. The card materializes a provider profile only after authorization succeeds, so an authorized provider can be selected by the existing Models settings surface.

## Dev Note

The Host controller keeps only redacted attempt state and delegates credential writes to `ctx.authorization` and `ctx.credentials`. The Client card consumes generated Remote methods and never receives grant payloads.

## Model Experience

### Browser authorization

#### What the model sees

No authorization notice, prompt response, attempt identifier, or browser-only state reaches a model request. The model sees only later requests authenticated by the stored `ctx.credentials` record.

#### Token effect

Authorization does not consume model tokens. Later provider requests use the credential selected by pi-ai.

#### KV Cache effect

Authorization does not alter a model request prefix or its cache identity.

## Known Limitations and Deferred Work

- **Attempts are process-local** — reloading the page or disposing the Host abandons an in-flight attempt and requires the user to start again.
- **Provider flows remain pi-ai-owned** — this package does not implement OAuth endpoints, token exchange, refresh, or provider-specific credentials.
- **Headroom integration is not included** — no Headroom session, memory, or lifecycle handoff is defined by this companion.
