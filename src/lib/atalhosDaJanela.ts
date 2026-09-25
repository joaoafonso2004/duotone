/**
 * Os atalhos DENTRO da janela do PC: só valem com o Duotone em foco.
 *
 * Não são os atalhos globais (`electron/atalhos.cjs`), que valem no Windows
 * inteiro e por isso não vêm postos -- decisão do João a 24/9: um atalho global
 * rouba a tecla a todas as apps. Estes não roubam nada a ninguém: com outra app
 * à frente, a tecla nem chega aqui. São os que qualquer leitor de música tem:
 *
 *   Espaço          tocar / pausa
 *   Ctrl+F, Ctrl+K  ir à pesquisa
 *   Ctrl+L          gostar da faixa que toca
 *   ← / →           recuar / avançar 10 s
 *   Ctrl+← / →      anterior / seguinte
 *
 * Puro e sem imports: a decisão testa-se em Node (scripts/test-atalhos-da-janela.ts),
 * e quem ouve o teclado (`desktop/useAtalhosDaJanela.web.ts`) só a executa.
 */

export type AcaoDaJanela =
  | 'tocar-pausa' | 'pesquisar' | 'gostar'
  | 'avancar-10' | 'recuar-10' | 'seguinte' | 'anterior';

export type TeclaDaJanela = {
  /** O `KeyboardEvent.key`. */
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** A tecla Windows. */
  meta: boolean;
  /** A tecla está a ser mantida (`KeyboardEvent.repeat`). */
  repetida: boolean;
  /** O foco está num campo de texto: as teclas são de quem escreve. */
  editavel: boolean;
  /** O foco está numa barra que se mexe com as setas (a da velocidade). */
  deslizador: boolean;
};

export function acaoDaJanela(t: TeclaDaJanela): AcaoDaJanela | null {
  // O Alt é do Windows e das letras com AltGr (Ctrl+Alt); a tecla Windows é
  // do sistema. Nenhum dos dois é nosso.
  if (t.alt || t.meta) return null;
  const letra = t.key.length === 1 ? t.key.toLowerCase() : t.key;

  if (t.ctrl && !t.shift && (letra === 'f' || letra === 'k')) return 'pesquisar';
  // Tudo o resto num campo de texto é de quem escreve: o Espaço é um espaço,
  // as setas andam no texto, e o Ctrl+L não é gostar de nada.
  if (t.editavel) return null;

  if (t.ctrl && !t.shift) {
    if (letra === 'l') return t.repetida ? null : 'gostar';
    if (t.key === 'ArrowRight') return 'seguinte';
    if (t.key === 'ArrowLeft') return 'anterior';
    return null;
  }
  if (t.ctrl || t.shift) return null;

  // Manter o Espaço carregado não pode pôr a música a piscar entre tocar e
  // pausar.
  if (t.key === ' ' || t.key === 'Spacebar') return t.repetida ? null : 'tocar-pausa';
  if (t.deslizador) return null;
  if (t.key === 'ArrowRight') return 'avancar-10';
  if (t.key === 'ArrowLeft') return 'recuar-10';
  return null;
}
