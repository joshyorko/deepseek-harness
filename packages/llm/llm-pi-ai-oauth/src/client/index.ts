import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import authorizationRemote from '@deepseek-ai/dsh-llm-pi-ai-oauth/remote'
import { AuthorizationCard } from './card.tsx'
import { en, zh, type AuthorizationLocaleKey } from './locales.ts'
import type { ClientAuthorizationRemote, ClientSettingsRemote } from './remote.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy owned by the optional provider authorization card. */
    'settings.models.authorization': AuthorizationLocaleKey
  }
}

const NS = 'settings.models.authorization'

/** Browser plugin that mounts the generated Remote and registers the provider-card extension. */
export async function apply(ctx: Context): Promise<void> {
  const disposeRemote = await ctx.remote.$mount(authorizationRemote)
  ctx.effect(() => disposeRemote, 'llm-pi-ai-oauth.client: Remote mount')
  ctx.effect(
    () => ctx.locale.register(NS, { en, zh }),
    'llm-pi-ai-oauth.client: dictionaries',
  )
  const t = ctx.locale.bind(NS)
  const authorization = ctx.get('remote.authorization') as ClientAuthorizationRemote
  const settings = ctx.remote.settings as ClientSettingsRemote
  ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
    name: 'settings.models.provider-card', key: 'llm-pi-ai', locale: NS,
    inject: () => ({ remote: authorization, settings, t }),
  }, AuthorizationCard))
}

export const inject = ['slots', 'locale', 'remote', 'remote.settings']
export const name = 'llm-pi-ai-oauth.client'
export type { AuthorizationCardProps } from './card.tsx'
