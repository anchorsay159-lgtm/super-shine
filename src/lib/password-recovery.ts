export const HOSTED_PASSWORD_RESET_URL = 'https://super-shine.expo.app/reset-password';

export function passwordRecoveryTokens(url: string) {
  const [beforeHash, hash = ''] = url.split('#', 2);
  const query = beforeHash.includes('?') ? beforeHash.slice(beforeHash.indexOf('?') + 1) : '';
  const params = new URLSearchParams([query, hash].filter(Boolean).join('&'));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const resetPasswordPath = beforeHash.toLowerCase().includes('reset-password');
  return {
    accessToken,
    refreshToken,
    isRecovery: params.get('type') === 'recovery' || Boolean(resetPasswordPath && accessToken && refreshToken),
  };
}
