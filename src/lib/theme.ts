import { Platform, useColorScheme, useWindowDimensions, type TextStyle } from 'react-native';

/**
 * Swiss (International Typographic) style: warm grey paper, black type, one red for action,
 * sharp corners, strong rules, flush-left grotesk type.
 */
const light = {
  /** Warm paper grey (uncoated poster stock); also the app icon's background. */
  bg: '#F2F0EB',
  surface: '#E8E5DD',
  /** Strong rules and outlines. */
  line: '#000000',
  /** Hairline dividers. */
  border: '#D8D4CA',
  text: '#000000',
  /** 5:1 on the paper background. */
  muted: '#666660',
  inverse: '#F2F0EB',
  /** Swiss red: primary actions, the active item, highlights. Darkened from #E3000F to keep 4.5:1 on paper. */
  accent: '#D6000E',
  onAccent: '#FFFFFF',
  danger: '#D6000E',
  backdrop: 'rgba(20,19,17,0.5)',
};

const dark: typeof light = {
  /** Warm near-black, the same ink as the icon's squares. */
  bg: '#141311',
  surface: '#1E1D1A',
  line: '#F2F0EB',
  border: '#302E2A',
  text: '#F2F0EB',
  muted: '#9A9A94',
  inverse: '#141311',
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
