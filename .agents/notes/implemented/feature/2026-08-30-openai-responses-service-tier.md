# Agent Note: OpenAI Responses service tier selection

Status: implemented

English | [中文](2026-08-30-openai-responses-service-tier.zh.md)

## Problem

OpenAI Responses deployments can select a service tier per request, but a pi-ai provider profile had no field for that choice. A gateway route therefore could not preserve the tier selected in Harness settings. Passing pi-ai's `serviceTier` option through `streamSimple()` was insufficient because that helper did not copy the option into its complete request payload.

## Decision

`PiAiProviderProfile.serviceTier` accepts `auto`, `default`, `flex`, `scale`, or `priority`. Profile resolution rejects the field unless every model on the route uses `openai-responses` or `openai-codex-responses`, so other provider protocols never receive an OpenAI-only field.

The adapter supplies pi-ai's `onPayload` hook and adds `service_tier` after `streamSimple()` has assembled the complete payload. The hook retains all existing fields and leaves transport, reasoning, compression, retry, and authentication behavior unchanged. Request-time profile resolution follows the existing [LLM configuration decision](../architecture/2026-07-29-request-level-llm-config-credentials.md).

## Alternatives considered

**Pass `serviceTier` directly to `streamSimple()`.** Rejected because the helper drops that option before the provider request is sent.

**Add `service_tier` to every pi-ai protocol.** Rejected because the field belongs to OpenAI Responses and another provider may reject an unknown request field.

**Infer a tier from the endpoint or model.** Rejected because deployment policy owns the choice and the same endpoint may serve requests with different tiers.

## Consequences

Deployments can select an OpenAI Responses tier in `settings.yaml` or `cordis.yml`, including OpenAI Codex subscription traffic routed through a compatible gateway. Misconfigured non-Responses routes fail during profile resolution. Wire-level tests decode compressed Codex request bodies and assert the configured field on the transmitted JSON payload.
