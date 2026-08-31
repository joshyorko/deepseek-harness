# Agent Note: Chinese documentation is optional

Status: implemented

## Problem

Every English documentation change required a synchronized Simplified Chinese counterpart and pairing record. That requirement blocked unrelated runtime iteration, expanded small changes into translation work, and made generated English updates fail documentation checks until a second language was revised.

## Decision

English is the required maintained documentation source. Chinese counterparts are optional and change only when a user explicitly requests translation. Existing `.zh.md` files and pairing records remain available; this decision does not delete them or prevent reviewed translations.

`doc-sync` and `test:docs` no longer run `verify-translation-pairing`. The pairing command, translation briefing, terminology, merge support, and `dsh-translate-docs` remain available for an explicitly requested bilingual update. Root instructions, documentation instructions, Agent Note rules, and documentation skills no longer require routine counterpart work.

This decision supersedes the mandatory-update rule in the [bilingual pairing decision](2026-07-02-bilingual-docs-and-pairing-gate.md) while retaining its tooling as an opt-in workflow.

## Alternatives considered

**Keep mandatory pairing for generated references only.** Rejected because generated catalogs change frequently with source contracts and would continue blocking runtime changes on translation work.

**Keep the CI gate but allow agents to skip Chinese prose.** Rejected because the executed check would still make the written exception false.

**Delete every Chinese file and translation tool.** Rejected because existing translations remain useful and explicit translation requests still need the established workflow.

## Consequences

Runtime and English documentation changes can land without editing Chinese files or sidecars. Chinese pages may become stale relative to English until someone explicitly requests an update, and the repository no longer claims otherwise. Explicit bilingual work still uses the existing pairing verifier to record a reviewed state.
