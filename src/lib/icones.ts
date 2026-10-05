/**
 * Um ícone por SIGNIFICADO, igual no PC e no iPhone (5/10, auditoria de
 * consistência N3/N6/T8). O `people` queria dizer Social no PC e Artists no
 * iPhone, e o Jam usava o mesmo do Social. Os nomes são os base do Ionicons;
 * quem quer a versão de contorno acrescenta `-outline`.
 *
 * A página principal ainda tem dois (casa no iPhone, lupa no PC) e as Liked
 * Songs também (notas no iPhone, coração no PC): são decisões por tomar
 * (auditoria N1 e N2), e por isso ficam de fora daqui.
 */
export const ICONES = {
  artistas: 'mic',
  playlists: 'albums',
  perfil: 'person',
  social: 'people',
  jam: 'headset',
  definicoes: 'settings',
} as const;

export type Icone = (typeof ICONES)[keyof typeof ICONES];
