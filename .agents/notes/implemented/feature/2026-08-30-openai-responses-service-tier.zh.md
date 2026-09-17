# Agent Note: OpenAI Responses 服务层级选择

Status: implemented

[English](2026-08-30-openai-responses-service-tier.md) | 中文

## Problem

OpenAI Responses 部署可以为每个请求选择服务层级，但 pi-ai 提供方配置没有表达该选择的字段。因此，网关路由无法保留 Harness 设置中选择的层级。直接通过 `streamSimple()` 传递 pi-ai 的 `serviceTier` 选项也不够，因为该辅助函数不会把此选项复制到完整请求载荷中。

## Decision

`PiAiProviderProfile.serviceTier` 接受 `auto`、`default`、`flex`、`scale` 或 `priority`。除非路由上的每个模型都使用 `openai-responses` 或 `openai-codex-responses`，配置解析会拒绝该字段，因此其他提供方协议永远不会收到仅适用于 OpenAI 的字段。

适配器提供 pi-ai 的 `onPayload` 钩子，并在 `streamSimple()` 组装完整载荷后加入 `service_tier`。该钩子保留全部现有字段，并且不改变传输、推理、压缩、重试和身份验证行为。请求时配置解析遵循现有的 [LLM 配置决策](../../archived/architecture/2026-07-29-request-level-llm-config-credentials.zh.md)。

## Alternatives considered

**直接把 `serviceTier` 传给 `streamSimple()`。** 拒绝，因为该辅助函数在发送提供方请求之前会丢弃此选项。

**向每个 pi-ai 协议加入 `service_tier`。** 拒绝，因为该字段属于 OpenAI Responses，其他提供方可能拒绝未知请求字段。

**根据端点或模型推断层级。** 拒绝，因为该选择由部署策略负责，同一端点可以处理不同层级的请求。

## Consequences

部署可以在 `settings.yaml` 或 `cordis.yml` 中选择 OpenAI Responses 层级，包括通过兼容网关路由的 OpenAI Codex 订阅流量。配置错误的非 Responses 路由会在配置解析时失败。线路级测试会解码压缩后的 Codex 请求正文，并断言传输的 JSON 载荷包含配置字段。
