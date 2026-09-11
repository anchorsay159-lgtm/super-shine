import { Alert, type AlertButton, type AlertOptions } from 'react-native';

export function customerAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
) {
  Alert.alert(title, message, buttons, options);
}
