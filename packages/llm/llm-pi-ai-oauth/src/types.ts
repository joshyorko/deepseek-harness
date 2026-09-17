/** One sign-in method exposed without provider-owned implementation data. */
export interface AuthorizationMethodView {
  readonly id: string
  readonly label: string
}

/** Browser-safe state for one registered authorization flow. */
export interface AuthorizationFlowView {
  readonly key: string
  readonly label: string
  readonly methods: readonly AuthorizationMethodView[]
  readonly inFlight: boolean
  readonly configured: boolean
  readonly writable: boolean
}

/** Browser-safe provider notice. */
export interface AuthorizationNoticeView {
  readonly message: string
  readonly url?: string
  readonly code?: string
}

/** Terminal and in-progress states of one browser authorization attempt. */
export type AuthorizationAttemptState = 'running' | 'prompt' | 'authorized' | 'cancelled' | 'failed'

/** One browser-answerable prompt, including its single-use identity. */
export type AuthorizationPromptView = {
  readonly id: string
  readonly message: string
  readonly placeholder?: string
} & (
  | { readonly kind: 'text' | 'secret' }
  | {
    readonly kind: 'select'
    readonly options: readonly {
      readonly id: string
      readonly label: string
      readonly description?: string
    }[]
  }
)

/** Current state of one ephemeral browser authorization attempt. */
export interface AuthorizationAttemptView {
  readonly attemptId: string
  readonly key: string
  readonly state: AuthorizationAttemptState
  readonly notices: readonly AuthorizationNoticeView[]
  readonly prompt?: AuthorizationPromptView
  readonly error?: { readonly code: string; readonly message: string }
}

/** Receipt returned immediately after an attempt starts. */
export interface AuthorizationStartView {
  readonly attemptId: string
  readonly key: string
  readonly status: AuthorizationAttemptView
}
