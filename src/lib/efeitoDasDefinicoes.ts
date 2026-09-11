/**
 * O que cada definição está a fazer AGORA -- a linha por baixo de cada opção.
 *
 * As opções mortas saíram na 2.6.3; as que ficaram fazem alguma coisa, mas
 * nenhuma dizia o quê, e várias têm limites que só se descobriam a usar: o
 * crossfade não corre com repeat de uma faixa, a normalização só baixa, o
 * padrão da velocidade só vale a partir da música seguinte, e o "Clear YouTube
 * cache" apaga também os downloads feitos de propósito. Uma opção que diz o
 * efeito que tem é a diferença entre "liguei e nada mudou" e "liguei e sei
 * porque é que esta música não mudou".
 *
 * Cada função devolve a frase, ou `null` quando não há nada que valha a pena
 * dizer (uma opção desligada que se explica sozinha). Em inglês, como o resto
 * da interface. Sem imports de runtime: `scripts/test-efeito-das-definicoes.ts`
 * corre em Node puro.
 */

/** "12.3 MB", "1.4 GB". */
export function tamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

/** "23:40", no relógio de quem lê. */
function hora(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Reprodução
// ---------------------------------------------------------------------------

/**
 * A qualidade: a escolha diz o que se PEDE, e isto diz o que está a tocar. Uma
 * faixa descarregada toca do ficheiro, e a que caiu no player do YouTube tem a
 * qualidade que ele escolher -- nos dois casos a opção não manda, e é isso que
 * se tem de ler.
 */
export function efeitoDaQualidade(e: {
  escolha: 'high' | 'saver';
  motor: 'native' | 'webview' | 'resolving' | null;
  descarregada: boolean;
  kbps: number | null;
  codec: string | null;
}): string {
  if (e.motor === 'webview') return 'Now playing through YouTube’s player · YouTube picks the quality';
  if (e.motor === 'native' && e.descarregada) return 'Now playing from a download · no data used';
  if (e.motor === 'native' && e.kbps) return `Now playing: ${Math.round(e.kbps)} kbps${e.codec ? ` ${e.codec}` : ''}`;
  return e.escolha === 'saver'
    ? 'Picks the lowest bitrate to save mobile data'
    : 'Picks the highest bitrate YouTube offers';
}

/**
 * O crossfade, com os limites que ele tem. O "repeat one" desliga-o de todo
 * (`podeCrossfade` em lib/crossfade.ts), e só entra em mudanças automáticas.
 */
export function efeitoDoCrossfade(e: { segundos: number; repeatUma: boolean }): string | null {
  if (!(e.segundos > 0)) return null;
  if (e.repeatUma) return 'Paused while repeat one is on';
  return `Only when a song ends on its own · not on songs shorter than ${e.segundos * 2} s`;
}

/**
 * Os padrões da velocidade e do equalizador. Valem para as faixas SEM ajuste
 * próprio, e a que está a tocar só muda na seguinte -- mexer no padrão e não
 * ouvir diferença nenhuma era a pergunta que isto responde.
 */
export function efeitoDoPadrao(e: {
  tipo: 'velocidade' | 'equalizador';
  temFaixa: boolean;
  temAjusteProprio: boolean;
  igualAoPadrao: boolean;
  /** Para a velocidade: a da faixa que toca, já escrita ("1.25×"). */
  valorDaFaixa?: string | null;
}): string {
  const coisa = e.tipo === 'velocidade' ? 'speed' : 'equaliser';
  if (!e.temFaixa) return `For every song that has no ${coisa} of its own`;
  if (e.temAjusteProprio) {
    return e.tipo === 'velocidade' && e.valorDaFaixa
      ? `The song playing keeps its own speed: ${e.valorDaFaixa}`
      : `The song playing keeps its own ${coisa}`;
  }
  if (!e.igualAoPadrao) return 'The song playing changes on the next one';
  return `The song playing uses this ${coisa}`;
}

/** O temporizador diz a hora a que para, e não só quanto falta. */
export function efeitoDoTemporizador(e: { restanteS: number; agora: Date }): string | null {
  if (!(e.restanteS > 0)) return null;
  return `Stops at ${hora(new Date(e.agora.getTime() + e.restanteS * 1000))}`;
}

/**
 * A normalização SÓ BAIXA: o leitor do iPhone não passa do volume máximo, por
 * isso uma faixa mais baixa do que a referência fica como está. Uma faixa
 * descarregada antes de a normalização existir não tem o valor e toca a 100%.
 */
export function efeitoDaNormalizacao(e: {
  ligada: boolean;
  temFaixa: boolean;
  /** A loudness da faixa que toca, face à referência do YouTube. `null` = não se sabe. */
  loudnessDb: number | null;
}): string | null {
  if (!e.ligada) return null;
  if (!e.temFaixa) return 'Only lowers songs louder than YouTube’s reference';
  if (e.loudnessDb === null || !Number.isFinite(e.loudnessDb)) return 'No loudness data for this song · plays at full volume';
  if (e.loudnessDb <= 0.05) return 'This song: unchanged · it is not louder than the reference';
  return `This song: −${e.loudnessDb.toFixed(1)} dB`;
}

/** O rádio, e de onde vêm as músicas -- a cascata de api/radio.ts, por ordem. */
export function efeitoDoRadio(e: { ligado: boolean; aTocarRadio: boolean }): string {
  if (!e.ligado) return 'The queue stops at its last song';
  if (e.aTocarRadio) return 'Radio is playing now · from your library, then Flow, then YouTube';
  return 'When the queue ends: your library first, then Flow, then YouTube';
}

// ---------------------------------------------------------------------------
// O resto
// ---------------------------------------------------------------------------

export function efeitoDeManterOEcra(ligado: boolean): string | null {
  return ligado ? 'The screen stays on while Duotone is open' : null;
}

/**
 * O "Clear YouTube cache" apaga TODO o áudio guardado no telemóvel -- os
 * downloads que se fizeram de propósito incluídos. Dizê-lo antes de carregar é
 * o ponto: descobrir depois, sem rede, é tarde.
 */
export function efeitoDeLimparACache(e: { bytes: number; downloads: number }): string {
  if (!(e.bytes > 0)) return 'Nothing stored right now';
  const quantos = e.downloads === 1 ? '1 download' : `${e.downloads} downloads`;
  return e.downloads > 0
    ? `Frees ${tamanho(e.bytes)} · also removes your ${quantos}`
    : `Frees ${tamanho(e.bytes)} · songs download again when you play them`;
}

/** O servidor de PO Token, pelo último teste. */
export function efeitoDoPoToken(e: {
  url: string;
  ultimoTeste: { ok: boolean; ms: number | null } | null;
}): string | null {
  if (!e.url.trim()) return 'Not used · playback works without it';
  if (!e.ultimoTeste) return 'Not tested yet';
  if (!e.ultimoTeste.ok) return 'Last test: not reachable';
  return `Last test: reachable${e.ultimoTeste.ms !== null ? ` · ${Math.round(e.ultimoTeste.ms)} ms` : ''}`;
}

/**
 * A presença no Discord, pelo que a ponte responde. A escuta privada cala-a
 * mesmo com a opção ligada, e isso tem de se ler aqui -- senão parecia partida.
 */
export function efeitoDoDiscord(e: {
  ligado: boolean;
  privada: boolean;
  /** O que a ponte disse da última vez. `null` = ainda não tentou. */
  estado: 'a-mostrar' | 'sem-musica' | 'discord-fechado' | null;
}): string | null {
  if (!e.ligado) return null;
  if (e.privada) return 'Hidden: private listening is on';
  if (e.estado === 'discord-fechado') return 'Discord is closed · open it to show your music';
  if (e.estado === 'sem-musica') return 'Connected · nothing playing to show';
  if (e.estado === 'a-mostrar') return 'Showing what you play on Discord';
  return 'Connecting to Discord…';
}
