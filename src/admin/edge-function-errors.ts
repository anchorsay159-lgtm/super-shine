type UnknownRecord = Record<string, unknown>;

const DRIVER_ERROR_MESSAGES: Record<string, string> = {
  ADMIN_REQUIRED: 'Your Admin session is no longer authorized. Sign out, sign in again, and retry.',
  ADMIN_SESSION_MISSING: 'Your Admin session was not sent. Sign out, sign in again, and retry.',
  ADMIN_SESSION_INVALID: 'Your Admin session expired or is invalid. Sign out, sign in again, and retry.',
  ADMIN_PROFILE_LOOKUP_FAILED: 'The server could not verify your Admin profile. Retry once; if it continues, check the Edge Function logs.',
  ADMIN_ROLE_REQUIRED: 'This signed-in account does not have the Admin role required to create employees.',
  INVALID_DRIVER_DETAILS: 'Enter a name, valid employee email, and a temporary password of at least 8 characters.',
  EMAIL_ALREADY_REGISTERED: 'That email already has an account. Use a different employee email.',
  DRIVER_AUTH_CREATE_FAILED: 'The employee sign-in account could not be created. Check the email and password, then retry.',
  DRIVER_PROFILE_CREATE_FAILED: 'The employee sign-in was rolled back because the Driver database role is not ready. Run the Driver role hotfix, then retry.',
  DRIVER_CREATE_FAILED: 'The employee account could not be created. Check the Edge Function logs for the exact backend error.',
};

function errorCode(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const candidate = (value as UnknownRecord).error;
  return typeof candidate === 'string' ? candidate : '';
}

async function responseErrorCode(error: unknown): Promise<string> {
  if (!error || typeof error !== 'object') return '';
  const context = (error as UnknownRecord).context;
  if (!context || typeof context !== 'object') return '';
  const response = context as { clone?: () => { json: () => Promise<unknown> }; json?: () => Promise<unknown> };
  try {
    const payload = response.clone ? await response.clone().json() : response.json ? await response.json() : null;
    return errorCode(payload);
  } catch {
    return '';
  }
}

export async function driverCreationErrorMessage(data: unknown, error: unknown): Promise<string> {
  const code = errorCode(data) || await responseErrorCode(error);
  if (code && DRIVER_ERROR_MESSAGES[code]) return DRIVER_ERROR_MESSAGES[code];
  if (code) return code.replaceAll('_', ' ').toLowerCase();
  if (error && typeof error === 'object' && typeof (error as UnknownRecord).message === 'string') {
    const message = String((error as UnknownRecord).message);
    if (!message.includes('non-2xx')) return message;
  }
  return DRIVER_ERROR_MESSAGES.DRIVER_CREATE_FAILED;
}
