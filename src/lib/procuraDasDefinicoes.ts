import { ROTULOS } from './rotulosDasDefinicoes';

/**
 * A procura das Definições (27/11, `docs/definicoes-por-seccoes-maquete.html`). O
 * João não encontrou o "Ambient full screen" do PC, que já existia: com as secções
 * a mostrar só uma ou duas, a procura é o caminho para o resto.
 *
 * Cada definição com o rótulo que se vê (o mesmo da linha: é por ele que a linha
 * acende), a secção em cada plataforma (sem secção, não existe lá) e palavras que
 * alguém escreveria à procura dela. `test-procura-das-definicoes.ts` confere que cada
 * rótulo está mesmo no ecrã da plataforma.
 */
export type SeccaoDoIphone = 'playback' | 'sound' | 'appearance' | 'general' | 'library' | 'storage' | 'account' | 'scrobbling' | 'about';
export type SeccaoDoPc = 'reproducao' | 'som' | 'aspeto' | 'windows' | 'atalhos' | 'biblioteca' | 'conta' | 'sobre';

export type DefinicaoProcuravel = { rotulo: string; palavras?: string; iphone?: SeccaoDoIphone; pc?: SeccaoDoPc };

export const NOMES_DAS_SECCOES_DO_IPHONE: Record<SeccaoDoIphone, string> = {
  playback: 'Playback', sound: 'Sound', appearance: 'Appearance', general: 'General', library: 'Library',
  storage: 'Storage', account: 'Account', scrobbling: 'Scrobbling', about: 'About',
};
export const NOMES_DAS_SECCOES_DO_PC: Record<SeccaoDoPc, string> = {
  reproducao: 'Playback', som: 'Sound', aspeto: 'Appearance', windows: 'Windows', atalhos: 'Shortcuts',
  biblioteca: 'Library', conta: 'Account', sobre: 'About',
};

export const DEFINICOES: readonly DefinicaoProcuravel[] = [
  { rotulo: ROTULOS.smartShuffle, palavras: 'shuffle random suggestions', iphone: 'playback', pc: 'reproducao' },
  { rotulo: ROTULOS.crossfade, palavras: 'fade blend transition gap', iphone: 'playback', pc: 'reproducao' },
  { rotulo: ROTULOS.automix, palavras: 'dj beat transition mix', iphone: 'playback' },
  { rotulo: ROTULOS.refraoNaBarra, palavras: 'chorus refrain hook', iphone: 'playback', pc: 'reproducao' },
  { rotulo: ROTULOS.velocidade, palavras: 'speed rate tempo faster slower', iphone: 'playback' },
  { rotulo: ROTULOS.temporizador, palavras: 'sleep stop timer night', iphone: 'playback', pc: 'reproducao' },
  { rotulo: ROTULOS.autoplay, palavras: 'radio continue queue end', iphone: 'playback', pc: 'reproducao' },
  { rotulo: 'Audio quality', palavras: 'bitrate high data', iphone: 'sound' },
  { rotulo: 'Even out volume', palavras: 'normalise normalize loudness', iphone: 'sound' },
  { rotulo: ROTULOS.equalizador, palavras: 'eq equalizer bass treble', iphone: 'sound', pc: 'som' },
  { rotulo: 'Presets', palavras: 'eq equaliser curves', iphone: 'sound' },
  { rotulo: 'Customise', palavras: 'customize theme look liquid glass background play button', iphone: 'appearance' },
  { rotulo: ROTULOS.acento, palavras: 'colour color cover theme', iphone: 'appearance', pc: 'aspeto' },
  { rotulo: ROTULOS.idioma, palavras: 'language french francais', iphone: 'appearance', pc: 'aspeto' },
  { rotulo: 'Artwork style', palavras: 'cover 3d floating poster', iphone: 'appearance' },
  { rotulo: 'Two-tone lock screen', palavras: 'lock screen cover duotone', iphone: 'appearance' },
  { rotulo: ROTULOS.duracao, palavras: 'duration time column', iphone: 'appearance', pc: 'aspeto' },
  { rotulo: ROTULOS.recuo, palavras: 'rewind back skip', iphone: 'appearance', pc: 'aspeto' },
  { rotulo: 'Now Playing layout', palavras: 'classic cinema', pc: 'aspeto' },
  { rotulo: 'Now Playing background', pc: 'aspeto' },
  { rotulo: 'Now Playing colour', palavras: 'whole window color', pc: 'aspeto' },
  { rotulo: 'Two-tone covers', palavras: 'duotone', pc: 'aspeto' },
  { rotulo: 'Window', palavras: 'opacity transparent translucent solid', pc: 'aspeto' },
  { rotulo: ROTULOS.mensagens, palavras: 'notifications notify chat alert', iphone: 'general', pc: 'windows' },
  { rotulo: ROTULOS.outroAparelhoNoIphone, palavras: 'handoff continue other device pc', iphone: 'general' },
  { rotulo: ROTULOS.outroAparelhoNoPc, palavras: 'handoff continue other device iphone', pc: 'windows' },
  { rotulo: 'Haptic feedback', palavras: 'vibration', iphone: 'general' },
  { rotulo: 'Keep screen awake', palavras: 'display on sleep', iphone: 'general' },
  { rotulo: 'Keep screen on in car mode', palavras: 'car driving carplay', iphone: 'general' },
  { rotulo: ROTULOS.ecraAmbiente, palavras: 'fullscreen afk idle away screensaver', pc: 'windows' },
  { rotulo: 'Close to tray', palavras: 'tray minimise minimize background', pc: 'windows' },
  { rotulo: 'Start with Windows', palavras: 'startup boot login', pc: 'windows' },
  { rotulo: 'Discord status', palavras: 'rich presence', pc: 'windows' },
  { rotulo: ROTULOS.recomendacoes, palavras: 'hidden songs artists less often', iphone: 'library', pc: 'biblioteca' },
  { rotulo: ROTULOS.contaDoSpotify, palavras: 'spotify import', iphone: 'library' },
  { rotulo: ROTULOS.identificar, palavras: 'fix names covers catalogue', iphone: 'library', pc: 'biblioteca' },
  { rotulo: ROTULOS.libraryCheck, palavras: 'duplicates broken unavailable', iphone: 'library', pc: 'biblioteca' },
  { rotulo: ROTULOS.exportarBiblioteca, palavras: 'csv json backup', iphone: 'library', pc: 'biblioteca' },
  { rotulo: ROTULOS.atualizarImportadas, palavras: 'sync link imported', iphone: 'library', pc: 'biblioteca' },
  { rotulo: ROTULOS.descarregarGostadas, palavras: 'offline liked download', iphone: 'storage' },
  { rotulo: 'Downloads', palavras: 'offline saved', iphone: 'storage' },
  { rotulo: 'Storage limit', palavras: 'cache space gb size', iphone: 'storage' },
  { rotulo: 'Clear cache', palavras: 'delete free space', iphone: 'storage' },
  { rotulo: ROTULOS.email, palavras: 'account', iphone: 'account', pc: 'conta' },
  { rotulo: ROTULOS.reporPassword, palavras: 'password', iphone: 'account', pc: 'conta' },
  { rotulo: ROTULOS.sair, palavras: 'log out logout sign out', iphone: 'account', pc: 'conta' },
  { rotulo: 'Clear Liked Songs', iphone: 'account' },
  { rotulo: ROTULOS.apagarConta, palavras: 'remove account', iphone: 'account', pc: 'conta' },
  { rotulo: ROTULOS.versao, palavras: 'version update', iphone: 'about', pc: 'sobre' },
  { rotulo: ROTULOS.apoiar, palavras: 'donate support', iphone: 'about', pc: 'sobre' },
  { rotulo: ROTULOS.privacidade, palavras: 'privacy terms', iphone: 'about', pc: 'sobre' },
  { rotulo: ROTULOS.relatarProblema, palavras: 'bug feedback problem', iphone: 'about', pc: 'sobre' },
];

/** Sem maiúsculas, sem acentos e sem espaços: "fullscreen" encontra "full screen". */
export function normalizarParaProcura(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
}

/** As definições de uma plataforma que respondem ao texto, as do rótulo primeiro. */
export function procurarDefinicoes(texto: string, plataforma: 'iphone' | 'pc'): DefinicaoProcuravel[] {
  const q = normalizarParaProcura(texto);
  if (!q) return [];
  const daqui = DEFINICOES.filter((d) => (plataforma === 'iphone' ? d.iphone : d.pc));
  const noRotulo = daqui.filter((d) => normalizarParaProcura(d.rotulo).includes(q));
  const nasPalavras = daqui.filter((d) => !noRotulo.includes(d)
    && (d.palavras ?? '').split(' ').some((p) => normalizarParaProcura(p).includes(q)));
  return [...noRotulo, ...nasPalavras];
}
