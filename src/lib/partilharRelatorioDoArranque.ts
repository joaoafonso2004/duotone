import { AppState, Platform, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { useConnectivity } from '../state/connectivity';
import { usePlayer } from '../state/player';
import { arranqueAtual } from './arranqueDaFaixa';
import { getLastBotGuardError } from './botguardBridge';
import { APP_VERSION, BUILD_ID } from './buildInfo';
import { estadoDaFila } from './filaDeDownloads';
import type { Preso } from './montagemDaCapa';
import { historico } from './playbackDiagnostics';
import { montarRelatorioDoArranque } from './relatorioDoArranque';
import { downloadsEmCurso } from './youtubeCache';

/**
 * Guarda o relatório de uma faixa presa a arrancar, pela folha de partilha.
 *
 * Um ficheiro `.json` e não texto solto, como o do diagnóstico de reprodução:
 * este é para GUARDAR ("Guardar em Ficheiros") e abrir depois ao lado do código.
 * Se escrever o ficheiro falhar, vai o mesmo conteúdo como texto.
 */
export async function partilharRelatorioDoArranque(estado: Preso): Promise<void> {
  const p = usePlayer.getState();
  const faixa = p.current;
  const rede = useConnectivity.getState();
  const agora = Date.now();
  const dados = montarRelatorioDoArranque({
    agora,
    gerado: new Date(agora).toISOString(),
    versao: APP_VERSION,
    build: BUILD_ID,
    plataforma: `${Platform.OS} ${String(Platform.Version)}`,
    estado,
    faixa: faixa
      ? { titulo: faixa.title, artista: faixa.artist, videoId: faixa.sourceId, duracaoS: faixa.durationSeconds }
      : null,
    leitor: {
      activeBackend: p.activeBackend,
      buffering: p.buffering,
      isPlaying: p.isPlaying,
      downloadProgress: p.downloadProgress,
      posicaoMs: p.positionMs,
      erro: p.error,
      appEstado: AppState.currentState,
    },
    arranque: arranqueAtual(),
    downloads: downloadsEmCurso(),
    fila: estadoDaFila(),
    rede: { offline: rede.offline, dadosMoveis: rede.dadosMoveis },
    ultimoErroDoPoToken: getLastBotGuardError(),
    eventos: historico(),
  });
  const texto = JSON.stringify(dados, null, 2);
  const titulo = 'Duotone stuck report';
  try {
    const nome = `duotone-preso-${new Date(agora).toISOString().replace(/[:.]/g, '-')}.json`;
    const ficheiro = new File(Paths.cache, nome);
    ficheiro.create();
    ficheiro.write(texto);
    await Share.share({ url: ficheiro.uri, title: titulo });
  } catch {
    await Share.share({ title: titulo, message: texto });
  }
}
