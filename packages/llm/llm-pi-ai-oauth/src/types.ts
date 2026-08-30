import type { AuthorizationEntry, AuthorizationNotice, AuthorizationPrompt } from '@deepseek-ai/dsh-authorization/types'

export type { AuthorizationEntry, AuthorizationNotice, AuthorizationPrompt }

export interface AuthorizationFlowView extends AuthorizationEntry {
  readonly configured: boolean
  readonly writable: boolean
}

export type AuthorizationAttemptState = 'running' | 'authorized' | 'cancelled' | 'failed'

export interface AuthorizationAttemptView {
  readonly state: AuthorizationAttemptState
  readonly notices: readonly AuthorizationNotice[]
  readonly prompt?: AuthorizationPrompt
  readonly promptId?: string
}

export interface AuthorizationStartView {
  readonly attemptId: string
  readonly status: AuthorizationAttemptView
}
