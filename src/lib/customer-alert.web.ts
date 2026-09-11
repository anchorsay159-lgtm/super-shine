import type { AlertButton, AlertOptions } from 'react-native';

export function customerAlert(
  title: string,
  message?: string,
  buttons: AlertButton[] = [],
  _options?: AlertOptions,
) {
  if (typeof window === 'undefined') return;

  const copy = message ? `${title}\n\n${message}` : title;
  const cancel = buttons.find((button) => button.style === 'cancel');
  const primary = buttons.find((button) => button !== cancel);

  if (cancel && primary) {
    if (window.confirm(copy)) primary.onPress?.();
    else cancel.onPress?.();
    return;
  }

  window.alert(copy);
  buttons[0]?.onPress?.();
}
