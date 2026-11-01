/**
 * Um ícone por SIGNIFICADO, igual no PC e no iPhone (5/10, auditoria de
 * consistência N3/N6/T8). O `people` queria dizer Social no PC e Artists no
 * iPhone, e o Jam usava o mesmo do Social. Os nomes são os base do Ionicons;
 * quem quer a versão de contorno acrescenta `-outline`.
 *
 * A Home já é a casa nas duas. As Liked Songs ainda têm dois (notas e "Songs"
 * na barra do iPhone, coração e "Liked Songs" no PC): é uma decisão do João,
 * pendente desde 5/10 (A8 da auditoria de 31/10), e por isso ficam de fora daqui.
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
