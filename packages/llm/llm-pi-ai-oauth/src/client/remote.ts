import type { AuthorizationAttemptView, AuthorizationFlowView, AuthorizationStartView } from '../types.ts'
export interface ClientAuthorizationRemote {
  list(): Promise<readonly AuthorizationFlowView[]>
  start(key: string, method: string): Promise<AuthorizationStartView>
  status(key: string, attemptId: string): Promise<AuthorizationAttemptView>
  respond(key: string, attemptId: string, promptId: string, value: string): Promise<AuthorizationAttemptView>
  cancel(key: string, attemptId: string): Promise<AuthorizationAttemptView>
  signOut(key: string): Promise<void>
}
export interface ClientSettingsRemote { describe(): Promise<{ namespaces: readonly { ns: string; revision: number }[] }>; mutate(ns: string, ops: readonly unknown[], expectedRevision: number | undefined): Promise<unknown> }
