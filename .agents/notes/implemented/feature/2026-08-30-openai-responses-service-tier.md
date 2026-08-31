# Agent Note: OpenAI Responses service tier selection

Status: implemented

English | [中文](2026-08-30-openai-responses-service-tier.zh.md)

## Problem

OpenAI Responses deployments can select a service tier per request, but a pi-ai provider profile had no field for that choice. A gateway route therefore could not preserve the tier selected in Harness settings. Passing pi-ai's `serviceTier` option through `streamSimple()` was insufficient because that helper did not copy the option into its complete request payload.

## Decision

`PiAiProviderProfile.serviceTier` accepts `auto`, `default`, `flex`, `scale`, `priority`, or `fast`. Profile resolution rejects the field unless every model on the route uses `openai-responses` or `openai-codex-responses`, so other provider protocols never receive an OpenAI-only field. `fast` follows [OpenAI Fast mode](https://developers.openai.com/api/docs/guides/fast-mode); OpenAI also accepts `priority` for the same behavior on supported models.

The adapter uses pi-ai's API-specific `Models.stream()` path when a Responses route selects a tier. That path owns request construction, response-tier resolution, and usage accounting. Standard OpenAI Responses sends configured `fast` literally; OpenAI Codex subscription Responses sends `priority`, the Fast-mode equivalent that its backend accepts. Routes without a tier and every other protocol continue through `Models.streamSimple()`. Transport, reasoning, compression, retry, endpoint, headers, and authentication behavior stay unchanged. Request-time profile resolution follows the existing [LLM configuration decision](../architecture/2026-07-29-request-level-llm-config-credentials.md).

## Alternatives considered

**Pass `serviceTier` directly to `streamSimple()`.** Rejected because the helper drops that option before the provider request is sent.

**Add `service_tier` through `onPayload`.** Rejected because changing only the completed JSON bypasses pi-ai's response-tier resolution and usage accounting.

**Add `service_tier` to every pi-ai protocol.** Rejected because the field belongs to OpenAI Responses and another provider may reject an unknown request field.

**Infer a tier from the endpoint or model.** Rejected because deployment policy owns the choice and the same endpoint may serve requests with different tiers.

## Consequences

Deployments can select an OpenAI Responses tier in `settings.yaml` or `cordis.yml`, including OpenAI Codex subscription traffic routed through a compatible gateway. Misconfigured non-Responses routes fail during profile resolution. Wire-level tests decode compressed Codex request bodies and assert the configured field on the transmitted JSON payload.
