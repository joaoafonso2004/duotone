import { requireOptionalNativeModule } from 'expo';
import type { LigacaoAoMotor } from '../../src/lib/youtubeCache';

/**
 * Ponte JS para o módulo que serve ao AVPlayer um ficheiro ainda a ser escrito
 * (ver ios/DuotoneStreamModule.swift e `transmitirAudio` no youtubeCache).
 *
 * `null` quando o binário não o traz -- Expo Go, uma build anterior, o PC --, e
 * aí a reprodução descarrega primeiro, como sempre fez. Mesma decisão do
 * `duotone-audio` e do `duotone-remote-commands`.
 */
const nativo = requireOptionalNativeModule<{
  abrir(sessao: string, caminho: string, total: number): string;
  cresceu(sessao: string, disponiveis: number): void;
  concluir(sessao: string): void;
  fechar(sessao: string): void;
  diagnostico(sessao: string): string;
}>('DuotoneStream');

export const ligacaoAoMotor: LigacaoAoMotor | null = nativo
  ? {
      abrir: (sessao, caminho, total) => nativo.abrir(sessao, caminho, total),
      cresceu: (sessao, disponiveis) => nativo.cresceu(sessao, disponiveis),
      concluir: (sessao) => nativo.concluir(sessao),
      fechar: (sessao) => nativo.fechar(sessao),
    }
  : null;

/**
 * O que o AVPlayer pediu a uma sessão e o que se lhe deu, em JSON. Vazio sem
 * módulo ou depois de a sessão fechar. Vai para o relatório de reprodução: é
 * por aqui que se vê, no aparelho, se o motor esperou pelo fim do ficheiro.
 */
export function diagnosticoDoStream(sessao: string): string {
  try {
    return nativo?.diagnostico(sessao) ?? '';
  } catch {
    return '';
  }
}
