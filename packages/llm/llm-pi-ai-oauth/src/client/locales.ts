/** English dictionary for the authorization card. */
export const en = {
  signIn: 'Sign in', signingIn: 'Signing in…', signedIn: 'Signed in.', continue: 'Continue', cancel: 'Cancel', cancelling: 'Cancelling…',
  signOut: 'Sign out', signingOut: 'Signing out…', select: 'Select an option', open: 'Open', code: 'Code', promptId: 'Prompt ID',
  startFailed: 'Could not start sign-in. Try again.', statusFailed: 'Could not check sign-in status. Try again.',
  responseFailed: 'That response was rejected. Try again.', cancelFailed: 'Could not cancel sign-in. Try again.',
  waiting: 'Waiting for sign-in to finish…', profileSaved: 'Provider profile ready.', profileFailed: 'Could not prepare the provider profile.',
  conflict: 'The settings changed while sign-in was completing. Close and reopen this card.', signOutFailed: 'Could not sign out. Try again.',
  unavailable: 'Sign-in is unavailable for this provider.', readOnly: 'Sign-in is unavailable because settings are read-only.',
  failed: 'Sign-in failed. Try again.', cancelled: 'Sign-in cancelled.',
} as const

/** The authorization-card locale namespace key union. */
export type AuthorizationLocaleKey = keyof typeof en

/** Chinese dictionary with the same keys as {@link en}. */
export const zh: { [Key in keyof typeof en]: string } = {
  signIn: '登录', signingIn: '登录中…', signedIn: '已登录。', continue: '继续', cancel: '取消', cancelling: '正在取消…',
  signOut: '退出登录', signingOut: '正在退出登录…', select: '选择选项', open: '打开', code: '代码', promptId: '提示 ID',
  startFailed: '无法开始登录，请重试。', statusFailed: '无法检查登录状态，请重试。',
  responseFailed: '该回答被拒绝，请重试。', cancelFailed: '无法取消登录，请重试。',
  waiting: '正在等待登录完成…', profileSaved: '提供方配置已准备就绪。', profileFailed: '无法准备提供方配置。',
  conflict: '登录完成时设置已被修改。请关闭并重新打开此卡片。', signOutFailed: '无法退出登录，请重试。',
  unavailable: '此提供方的登录不可用。', readOnly: '设置为只读，登录不可用。', failed: '登录失败，请重试。', cancelled: '登录已取消。',
}
