import { Platform } from 'react-native';

export const colors = {
  bg: '#0A0A0F',
  surface: '#14141C',
  surfaceHigh: '#1D1D28',
  surfacePressed: '#242433',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',

  text: '#F5F5F7',
  textSecondary: 'rgba(245,245,247,0.58)',
  // 34% dava 2,9 de contraste sobre a superficie (medido a 12/9, WCAG), e o
  // minimo para texto normal e 4,5. A 48% da 4,7 e continua a ser o terceiro
  // nivel, abaixo do secundario a 58%.
  textTertiary: 'rgba(245,245,247,0.48)',

  accent: '#8B5CF6',
  accentAlt: '#EC4899',
  accentSoft: 'rgba(139,92,246,0.16)',

  spotify: '#1DB954',
  spotifySoft: 'rgba(29,185,84,0.14)',
  youtube: '#FF4E45',
  youtubeSoft: 'rgba(255,78,69,0.14)',

  // Presenca: um amigo ligado. Estava escrito a mao em dois sitios com
  // dois verdes ligeiramente diferentes -- e um estado com significado,
  // por isso tem nome.
  online: '#7EDDB7',

  danger: '#FF453A',
  overlay: 'rgba(0,0,0,0.55)',
};

export const gradients = {
  aurora: ['#7C3AED', '#DB2777'] as const,
  auroraDim: ['rgba(124,58,237,0.35)', 'rgba(219,39,119,0.25)'] as const,
  fadeDown: ['rgba(10,10,15,0)', '#0A0A0F'] as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const type = {
  largeTitle: {
    fontSize: 32,
    fontWeight: '800' as const,
    letterSpacing: 0.2,
    color: colors.text,
  },
  title: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: colors.text,
  },
  headline: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: colors.text,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    color: colors.text,
  },
  caption: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: colors.textSecondary,
  },
  micro: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    color: colors.textTertiary,
  },
};

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
    },
    default: { elevation: 8 },
  }),
};

/** Altura do mini-player (usada para paddings de listas) */
export const MINI_PLAYER_HEIGHT = 64;

/**
 * Até onde o texto acompanha o "Tamanho do texto" do iOS.
 *
 * Sem limite nenhum, o texto crescia até ao tamanho máximo de acessibilidade
 * (mais de 3x) dentro de caixas de altura FIXA -- a barra dos separadores e
 * os cartões de 120 pt da Pesquisa
 * -- e saía delas ou era cortado. Os limites deixam-no crescer até onde a caixa
 * aguenta; o resto do texto (parágrafos, definições) cresce à vontade.
 * Por confirmar num iPhone com o texto no máximo (25/9).
 */
export const ESCALA_MAXIMA = {
  /** Caixas de altura fixa: a barra dos separadores. */
  fixa: 1.2,
  /** Linhas de lista e cartões: podem crescer um pouco mais. */
  lista: 1.4,
} as const;
