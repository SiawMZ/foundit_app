import { useColorScheme } from 'react-native';

const light = {
  bg: '#FFFFFF',
  surface: '#F5F5F5',
  border: '#E5E5E5',
  text: '#0A0A0A',
  muted: '#737373',
  inverse: '#FFFFFF',
  accent: '#0A0A0A',
  danger: '#B91C1C',
};

const dark: typeof light = {
  bg: '#0A0A0A',
  surface: '#171717',
  border: '#262626',
  text: '#FAFAFA',
  muted: '#A3A3A3',
  inverse: '#0A0A0A',
  accent: '#FAFAFA',
  danger: '#F87171',
};

export type Colors = typeof light;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 };
export const font = { xs: 11, sm: 13, md: 15, lg: 17, xl: 22, xxl: 28 };

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
