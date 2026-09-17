# Bilingual documentation

English | [中文](README.zh.md)

English is the required maintained documentation source. Simplified Chinese counterparts are optional and change only when a user explicitly requests translation. This page defines the opt-in pairing workflow; [translation-rules.md](translation-rules.md) defines how to translate and [terminology.md](terminology.md) owns terminology. The [.agents/skills/dsh-translate-docs](../../.agents/skills/dsh-translate-docs/SKILL.md) workflow is available only through explicit user invocation.

## The pairing contract

- **English is authoritative.** An optional Chinese counterpart is a reviewed projection of its English source and may lag until translation is explicitly requested.
- **A confirmed pair is three sibling files.** The English `foo.md`, the Chinese `foo.zh.md`, and a consistency record `foo.i18n.yaml` live in the same directory. English work does not require creating or updating the other two files.
- **The consistency record.** `foo.i18n.yaml` holds the full git blob hash of each side as of the last time the two were confirmed to say the same thing:

  ```yaml
  foo.md: 3f786850e387550fdab836ed7e6dc881de23001b
  foo.zh.md: 89e6c98d92887913cadf06b2adb97f26cde4849b
  ```

  Blob hashes record the last explicitly confirmed translation state. `--write` stores those snapshots in the local Git object database and pins them under `refs/dsh/translation-pairing/snapshots/`. A later English-only edit may intentionally leave that record stale. When translation is requested, patch the counterpart against the English diff, then run `pnpm run verify-translation-pairing --write <pair>` to confirm the new state.

  When two branches contain valid confirmations of the same pair, the installed `dsh-translation-pairing` Git merge driver composes a new record only if Git's default text merge succeeds for both recorded owner-blob triplets and the merged pair retains its required switchers and structural signature. The Chinese file must retain its English backlink; an authored English source must retain its Chinese link, while a listed generated English source is exempt. Any structure the driver cannot verify remains an ordinary conflict; `pnpm run resolve-translation-pairing-conflicts` applies the same fail-closed operation to a merge that has already stopped, stages every safe pairing record, and exits unsuccessfully when other pairing conflicts remain. The [automatic pairing merges Agent Note](../../.agents/notes/implemented/process/2026-08-08-automatic-translation-pairing-merges.md) owns the mechanism and alternatives.
- **Language switcher.** The Chinese file always links back immediately after its H1 heading with `[English](foo.md) | 中文`. An authored English file reciprocates there with `English | [中文](foo.zh.md)`; a listed generated English source omits that line so it remains byte-identical to generator output. A README published outside GitHub, such as PyPI project metadata, may use the canonical `https://github.com/deepseek-ai/deepseek-harness/blob/master/<repository-path>` URL to the same counterpart so the switcher still resolves there.
- **Structure mirrors the counterpart.** Heading depths and order, list kinds, ordered-list starts, list item counts, table row and column counts, semantic link targets with exact query/fragment suffixes, and verbatim code blocks match one to one across the pair. When a relative document link targets the active bilingual corpus, the English side uses its `.md` path and the Chinese side uses its `.zh.md` path. A missing counterpart in that corpus is a pair-completeness error rather than a fallback; targets outside the active corpus keep the authored path. See [translation-rules.md](translation-rules.md) for the full preservation rules. Existing Markdown gates apply to `.zh.md` files unchanged (`verify-md-wrap`, `verify-md-links`).

## The gate: verify-translation-pairing

`pnpm run verify-translation-pairing` is an explicit translation-workflow check. It is not part of `doc-sync`, `test:docs`, or routine CI:

1. Every document in scope has a complete pair. README discovery is case-insensitive on the basename, so `missions/readme.md` is in scope alongside the other documentation roots.
2. Every pair artifact that exists at all is complete and consistent: all three files present, each side's current blob hash equals the recorded one (editing either side without re-confirming the pair goes red), the Chinese side and every authored English source carry their language switchers (listed generated English sources are exempt), every ordinary relative document link uses its source side's target locale, and the structural signatures match in order — heading depths, verbatim code blocks (info string and content), table row and column counts, list kinds, ordered-list starts, item counts, and semantic link targets with exact query/fragment suffixes apart from the switcher.
3. Files listed as `excluded` have no `.zh.md` and no `.i18n.yaml` at all. Frozen Agent Notes under `.agents/notes/archived/` are outside this evolving gate; their dedicated verifier requires and seals the complete existing triplet instead.

Source-oriented code gates consume an exact `.zh.md` fence sequence as a derivative of its unsuffixed sibling instead of compiling or manifesting the same code twice. The sequence must match in length, order, fence kind, and byte-exact body; otherwise both copies remain independently checked and the pairing gate reports the structural mismatch.

`pnpm run verify-translation-pairing --list` prints the current pairing state of every document in scope — missing, out-of-sync, or ok. It never fails; `missing` and `out-of-sync` rows identify violations that the normal check rejects.

`pnpm run verify-translation-pairing <pair...>` checks just the named pairs — any of a pair's three files (or its bare stem) names it — so an update loop verifies its own pair in seconds instead of re-scanning the corpus. The no-argument corpus-wide form is what `doc-sync` and CI run; a scoped green never substitutes for it at PR level.

Run this gate only when confirming an explicitly requested bilingual update. Ordinary English changes may leave an existing pair out of sync without failing routine documentation checks.

The gate's limit, stated plainly: **a green gate means the pair was confirmed consistent at these exact contents, not that the confirmation was sound.** It checks hashes and Markdown structure; it cannot judge whether the two sides say the same thing, or whether the wording is accurate, well-termed, and natural — that is the reviewer's half of the contract, per [translation-rules.md](translation-rules.md). A re-recorded pair with a sloppy counterpart passes the gate; it must not pass review.

## Scope and exclusions

**Optional workflow scope**: the root `CONTRIBUTING.md`, `BRAND_GUIDELINES.md`, and `SAFETY.md` documents, every non-vendor README, and active documents under `.agents/notes/**`, `docs/**`, and `python/**`. This scope describes what the translation tooling can pair, not what routine changes must translate.

Generated English references and graphs participate in pairing when a reviewed Chinese counterpart is available. When a generator owns only English, it remains that source of truth; regeneration that changes English leaves the pair out of sync until the reviewed Chinese counterpart is updated and re-recorded. Freshness and pairing gates enforce their respective invariants independently.

Shared generated regions, such as the Cordis subsystem regions, keep every generated byte identical across languages except localized paired-document paths. A full-page generator can instead render source-owned paired prose, such as [persistence-catalog-text.ts](../../scripts/persistence-catalog-text.ts), from the same structural data with matching Markdown structure and identical code blocks. It regenerates both pages and their consistency record together; review still verifies the paired prose's meaning and terminology.

Generated English sources omit the language switcher that ordinary authored sources carry, because adding it would make the generator stale; their Chinese counterparts still link back to the English source. A manually maintained Chinese counterpart may rewrite only self-referential generation and maintenance statements that would otherwise be false for the reviewed translation; all technical content remains subject to the ordinary faithfulness rules.

**Excluded** (never paired, and the gate rejects a `.zh.md` or `.i18n.yaml` for them):

- [cordis-api/inherited.md](../cordis-api/inherited.md) — generated without a reviewed Chinese counterpart, so both website locales project the English source.
- `docs/AGENTS.md`, `.agents/notes/**/AGENTS.md`, and their `CLAUDE.md` instruction symlinks — agent instructions, maintained in English only like the root `AGENTS.md`.
- `docs/i18n/terminology.md` and [style-samples.md](style-samples.md) — both are bilingual by construction.
- [translation-prompt.md](translation-prompt.md) — the automated pipeline's prompt template; its body is machine-consumed verbatim, so a paired translation would change pipeline behavior.
- [review-ownership/README.md](../../.github/review-ownership/README.md) — repository-internal approval policy maintained in English only.
- `.agents/notes/archived/` — frozen historical triplets. [`verify-archived-agent-notes`](../../scripts/verify-archived-agent-notes.ts) validates their completeness and content seals; translation maintenance must never rewrite them.

**No universal translation requirement**: current and future English documents may exist or change without a Chinese counterpart. [scripts/translation-pairing.manifest.json](../../scripts/translation-pairing.manifest.json) describes the optional tool's discovery behavior.

## Division of labor

Only explicit user requests update Chinese counterparts. The [dsh-translate-docs](../../.agents/skills/dsh-translate-docs/SKILL.md) workflow and pairing verifier support that work; review still owns translation quality, terminology, and structural fidelity. The prompt contract remains executable and `verify-translation-prompt` continues checking the translation tool itself in `doc-sync`.
