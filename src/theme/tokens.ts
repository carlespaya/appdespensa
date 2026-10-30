// Sistema de diseño: glassmorphism sobre fondo profundo + neumorfismo sutil en sombras.
// Todos los componentes leen de aquí; un tema claro solo requiere otro objeto `colors`.

export const colors = {
  bgTop: '#060A14',
  bgBottom: '#0B1626',
  orbMint: 'rgba(61, 245, 176, 0.22)',
  orbBlue: 'rgba(61, 139, 255, 0.24)',

  glassFill: 'rgba(255, 255, 255, 0.06)',
  glassFillStrong: 'rgba(255, 255, 255, 0.10)',
  /** Fallback opaco-translúcido donde no hay blur nativo (Android sin BlurTargetView). */
  glassFallback: 'rgba(20, 30, 48, 0.82)',
  glassBorder: 'rgba(255, 255, 255, 0.12)',
  glassHighlight: 'rgba(255, 255, 255, 0.22)',

  text: '#F2F6FC',
  textMuted: 'rgba(242, 246, 252, 0.62)',
  textFaint: 'rgba(242, 246, 252, 0.38)',

  mint: '#3DF5B0',
  mintDeep: '#12C98A',
  blue: '#3D8BFF',
  blueDeep: '#2563EB',
  warning: '#FFB547',
  danger: '#FF6B7A',
  onAccent: '#04130D',
} as const;

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const type = {
  display: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.8, color: colors.text },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4, color: colors.text },
  subtitle: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text },
  caption: { fontSize: 13, fontWeight: '500' as const, color: colors.textMuted },
  overline: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.2, color: colors.textFaint, textTransform: 'uppercase' as const },
  number: { fontVariant: ['tabular-nums' as const] },
};

/** Sombra suave "neumórfica": profunda y difusa, nunca dura. */
export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.35,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 12 },
  elevation: 8,
};

export const gradients = {
  mint: [colors.mint, colors.mintDeep] as const,
  blue: [colors.blue, colors.blueDeep] as const,
  background: [colors.bgTop, colors.bgBottom] as const,
};

export const euro = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
