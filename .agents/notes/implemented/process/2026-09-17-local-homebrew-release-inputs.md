# Agent Note: Local Homebrew builds follow release packaging inputs

Status: implemented

## Problem

The local Dagger Homebrew rehearsal copied the release workflow's Landlock packaging commands, but the native workspace moved from `native/landlock-run` to [`native/system`](../../../../native/system/README.md). The retained web authorization companion also needs to remain in the installed Homebrew bundle.

## Decision

`.dagger/src/index.ts` builds TypeScript from `native/system` and packs `native/system/packages/entry` into the release verification inputs. This matches the release workflow and keeps the `@deepseek-ai/node-addon-system` entry tarball beside the dsh and vendored tarballs.

The local installer keeps its post-install assertion for `@deepseek-ai/dsh-llm-pi-ai-oauth`. Core pi-ai authorization belongs to `@deepseek-ai/dsh-llm-pi-ai`; the companion remains the web authorization package used by the retained web bundle. The companion follows the dsh family version so release verification accepts the complete family.

## Alternatives considered

**Keep the old `native/landlock-run` paths.** The merged workspace no longer contains that directory, so Dagger would fail before packing the Landlock entry.

**Remove the companion assertion.** A successful CLI install would no longer prove that the web authorization package reached the Homebrew bundle.

## Consequences

`make homebrew` remains the build-only local entry point and exports the same release-shaped archive and formula. It must complete the retained OAuth companion's client build before the archive can be exported; the installer remains a separate explicit step.
