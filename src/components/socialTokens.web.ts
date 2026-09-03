import { colors as base, type as baseType } from '../theme';
import { COR, RAIO, TIPO } from '../desktop/tokens.web';

export const colors = {
  ...base, bg: COR.painel, surface: COR.elevado, surfaceHigh: COR.hover,
  surfacePressed: COR.hover, border: COR.linhaSuave, borderStrong: COR.linha,
  text: COR.texto, textSecondary: COR.textoMedio, textTertiary: COR.textoFraco,
  accent: COR.metalClaro, accentSoft: COR.metalSuave, danger: COR.erro,
};
export const type = {
  ...baseType,
  // O `largeTitle` faltava aqui, e sem ele um componente partilhado que o
  // usasse caia na escala do telemovel. E o nivel do titulo de uma pagina --
  // o mesmo que o `Page` usa -- por isso e o `display`.
  largeTitle: { ...TIPO.display, color: COR.texto, lineHeight: 40 },
  title: { ...TIPO.titulo, color: COR.texto },
  headline: { ...TIPO.seccao, color: COR.texto },
  body: { ...TIPO.corpo, color: COR.texto },
  caption: { ...TIPO.legenda, color: COR.textoMedio },
  micro: { ...TIPO.micro, color: COR.textoMedio },
};
export const radii = { sm: RAIO.ctrl, md: RAIO.cartao, lg: RAIO.cartao, xl: RAIO.superficie, pill: RAIO.pilula };
export const SOCIAL_GUTTER = 48;
