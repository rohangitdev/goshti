/** Warm, calm palette — evening lamp light at Aaji's house. */
export const colors = {
  background: '#FFF4E3',
  surface: '#FFFBF4',
  surfaceWarm: '#FBE3C4',
  primary: '#C2562F', // terracotta
  primaryPressed: '#A44723',
  onPrimary: '#FFF8EE',
  accent: '#E3A23A', // turmeric
  leaf: '#5E8B5A',
  text: '#4A2C1D',
  textMuted: '#8A6A55',
  border: '#EBCFAE',
  favourite: '#D9475A',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 12, md: 20, lg: 28, pill: 999 } as const;

/** Minimum touch target for small hands. */
export const touch = { min: 64, large: 88 } as const;

export const type = {
  display: { fontSize: 48, fontWeight: '700' as const, lineHeight: 64 },
  title: { fontSize: 28, fontWeight: '700' as const, lineHeight: 40 },
  heading: { fontSize: 22, fontWeight: '700' as const, lineHeight: 32 },
  body: { fontSize: 18, fontWeight: '400' as const, lineHeight: 28 },
  label: { fontSize: 20, fontWeight: '600' as const, lineHeight: 30 },
  caption: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
};

export const shadow = {
  shadowColor: '#7A4A2A',
  shadowOpacity: 0.12,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
} as const;
