import { Platform, Share } from 'react-native';
import { APP_VERSION, BUILD_ID } from './buildInfo';
import { relatorio } from './playbackDiagnostics';

/**
 * O relatório de reprodução, pela folha de partilha do iPhone.
 *
 * No PC o relatório descarrega-se como ficheiro (Definições -> Playback
 * diagnostics). No telemóvel isso não serve: não há pasta de transferências à
 * vista, e quem precisa do relatório é quem o vai MANDAR -- a um amigo, por
 * mensagem. A folha de partilha é exatamente esse gesto.
 *
 * O texto é o do `relatorio()`, igual nas duas plataformas: cliente InnerTube,
 * PO Token, HTTP -- o detalhe que NÃO vai para o ecrã e que faz falta a quem
 * tem de perceber porque é que a música parou.
 */
export async function partilharRelatorioDeReproducao(): Promise<void> {
  const texto = relatorio({
    versao: APP_VERSION,
    build: BUILD_ID,
    plataforma: `${Platform.OS} ${String(Platform.Version)}`,
    gerado: new Date().toISOString(),
  });
  await Share.share({ title: 'Duotone playback report', message: texto });
}
