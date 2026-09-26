import { posicaoDoAmigo } from '../lib/posicaoDoAmigo';
import type { Friendship } from '../api/social';
import { useOuvirJuntos } from './ouvirJuntos';
import { usePlayer } from './player';
import { agoraNoServidor } from './social';

/** Quanto tempo se espera pelo primeiro som antes de desistir de acertar a posição. */
const ESPERA_PELO_SOM_MS = 15_000;

/**
 * Ir ouvir com um amigo (iPhone e PC; vivia dentro do `AmigosAOuvir`). Duas
 * portas, e a segunda existe sempre:
 *
 *  - se ele tem sessão aberta, ENTRA-SE nela (o servidor deixa qualquer amigo);
 *  - se não tem, toca-se a música dele -- e, desde 26/9, na POSIÇÃO dele,
 *    quando a presença a traz (`posicaoDoAmigo`). O salto dá-se quando o motor
 *    confirma o primeiro som: antes disso o seek perdia-se no carregamento.
 *
 * Falhar não diz nada: quem carregou volta a carregar.
 */
export async function ouvirComAmigo(amigo: Friendship, sessaoId?: string | null): Promise<void> {
  const faixa = amigo.currentlyPlaying;
  if (!faixa) return;
  if (sessaoId) {
    try {
      await useOuvirJuntos.getState().juntarSe(sessaoId, 'friend_presence');
      return;
    } catch {
      // A sessão pode ter acabado entre a leitura e o toque: cai para a música.
    }
  }
  const { source, sourceId, title, artist, artworkUrl, durationSeconds } = faixa;
  await usePlayer.getState().playTrack(
    { source, sourceId, title, artist, artworkUrl, durationSeconds, album: null },
    undefined, true,
  );
  if (!posicaoDoAmigo(faixa, agoraNoServidor())) return;
  const desde = Date.now();
  const parar = usePlayer.subscribe((s) => {
    const outra = s.current?.sourceId !== sourceId;
    if (outra || Date.now() - desde > ESPERA_PELO_SOM_MS) { parar(); return; }
    if (!s.playbackConfirmed) return;
    parar();
    // Lida AGORA, e não no toque: o carregamento levou tempo, e a música dele andou.
    const onde = posicaoDoAmigo(faixa, agoraNoServidor());
    if (onde && onde.ms > 3000 && onde.fracao < 0.98) void usePlayer.getState().seekTo(onde.ms);
  });
}
