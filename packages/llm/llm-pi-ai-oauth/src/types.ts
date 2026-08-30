import type { AuthorizationEntry, AuthorizationNotice, AuthorizationPrompt } from '@deepseek-ai/dsh-authorization/types'

export type { AuthorizationEntry, AuthorizationNotice, AuthorizationPrompt }

export interface AuthorizationFlowView extends AuthorizationEntry {
  readonly configured: boolean
  readonly writable: boolean
}

export type AuthorizationAttemptState = 'running' | 'prompt' | 'authorized' | 'cancelled' | 'failed'
export interface AuthorizationPromptView { readonly id: string; readonly kind: 'text' | 'secret' | 'select'; readonly message: string; readonly placeholder?: string; readonly options?: readonly { readonly id: string; readonly label: string; readonly description?: string }[] }

export interface AuthorizationAttemptView {
  readonly state: AuthorizationAttemptState
  readonly notices: readonly AuthorizationNotice[]
  readonly prompt?: AuthorizationPromptView
  readonly error?: { readonly code: string; readonly message: string }
}

export interface AuthorizationStartView {
  readonly attemptId: string
  readonly key: string
  readonly status: AuthorizationAttemptView
}
