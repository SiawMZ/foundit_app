import { Platform, useColorScheme, useWindowDimensions, type TextStyle } from 'react-native';

/**
 * Swiss (International Typographic) style: white paper, black type, one red for action,
 * sharp corners, strong rules, flush-left grotesk type.
 */
const light = {
  bg: '#FFFFFF',
  surface: '#F2F2F0',
  /** Strong rules and outlines. */
  line: '#000000',
  /** Hairline dividers. */
  border: '#DCDCDA',
  text: '#000000',
  muted: '#707070',
  inverse: '#FFFFFF',
  /** Swiss red: primary actions, the active item, highlights. */
  accent: '#E3000F',
  onAccent: '#FFFFFF',
  danger: '#E3000F',
  backdrop: 'rgba(0,0,0,0.5)',
};

const dark: typeof light = {
  bg: '#0B0B0B',
  surface: '#181818',
  line: '#F2F2F2',
  border: '#2B2B2B',
  text: '#F2F2F2',
  muted: '#9A9A9A',
  inverse: '#0B0B0B',
  accent: '#FF2B2B',
  onAccent: '#FFFFFF',
  danger: '#FF2B2B',
  backdrop: 'rgba(0,0,0,0.7)',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

/** 4-pt grid. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

/** Swiss style is square. Kept as tokens so a softer look stays a one-line change. */
export const radius = { sm: 0, md: 0, lg: 0, pill: 0 };

export const fonts = {
  regular: 'InterTight_400Regular',
  medium: 'InterTight_500Medium',
  bold: 'InterTight_700Bold',
  black: 'InterTight_800ExtraBold',
};

/** Type scale. Use through <T variant="…"> rather than ad-hoc font sizes. */
export const type = {
  display: { fontFamily: fonts.black, fontSize: 40, lineHeight: 42, letterSpacing: -1.4 },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 28, letterSpacing: -0.6 },
  heading: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase' },
  number: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** Wide layouts (desktop web, tablets) get the sidebar instead of bottom tabs. */
export function useIsWide() {
  const { width } = useWindowDimensions();
  return width >= (Platform.OS === 'web' ? 900 : 1000);
}

/** Two-digit index used for Swiss-style numbering: 01, 02 … */
export function pad2(n: number) {
  return String(n).padStart(2, '0');
}
