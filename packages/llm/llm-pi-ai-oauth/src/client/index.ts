import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { AuthorizationCard } from './card.tsx'
import type { ClientAuthorizationRemote } from './remote.ts'
import authorizationRemote from '@deepseek-ai/dsh-llm-pi-ai-oauth/remote'

/** Browser plugin that registers the provider-card authorization extension. */
export function apply(ctx: Context): void {
  const client = ctx as Context & { slots: { inject(name: string, factory: () => unknown): void; register(options: Record<string, unknown>, component: unknown): () => void }; remote: { authorization: ClientAuthorizationRemote } }
  client.remote.$mount(authorizationRemote)
  client.slots.inject('settings.models.provider-card', () => client.slots.register({
    name: 'settings.models.provider-card', key: 'llm-pi-ai',
    inject: () => ({ remote: client.remote.authorization }),
  }, AuthorizationCard))
}

export const inject = ['slots', 'remote', 'remote.authorization']
export const name = 'llm-pi-ai-oauth.client'
export type { AuthorizationCardProps } from './card.tsx'
