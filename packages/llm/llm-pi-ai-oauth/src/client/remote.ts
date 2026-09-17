import type { RemoteResult, TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-llm-pi-ai-oauth/remote'

/** The generated authorization namespace mounted by the Web connection. */
export type ClientAuthorizationRemote = TypertRemoteNamespaceMap['authorization']

/** The generated settings methods used to materialize a provider profile. */
export type ClientSettingsRemote = Pick<
  import('@deepseek-ai/dsh-api-remotes/client').ClientRemote['settings'], 'describe' | 'mutate'
>

/** A generated Remote result's failure branch, kept for UI classification. */
export type ClientRemoteFailure = Extract<RemoteResult<never>, { readonly ok: false }>['error']

/**
 * Unwrap a generated Remote result while retaining its caller-facing message.
 * @param result - generated Remote result to unwrap.
 * @returns the successful result value.
 * @throws {Error} when the Remote result contains a failure.
 */
export function remoteValue<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw new Error(result.error.message)
}
