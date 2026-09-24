import { registarNaVelocidade } from '../lib/playbackDiagnostics';
import { usePlayer } from './player';

/**
 * Para a secção "speed" do relatório (24/9): cada mudança da loja que interessa
 * à velocidade e à pausa, seja quem for que a fez. O relatório de 3.7.8 mostrou
 * a velocidade do motor a saltar entre 1 e 0,95 a cada pausa SEM nenhum pedido
 * da barra, e a música a voltar a tocar meio segundo depois de cada pausa sem
 * passar pelo play da app -- e não dizia quem. Isto diz o quê mudou e quando;
 * as etiquetas no motor dizem de onde veio cada play.
 */
export function vigiarOLeitor(): () => void {
  return usePlayer.subscribe((s, p) => {
    const m: string[] = [];
    if (s.playbackRate !== p.playbackRate) m.push(`playbackRate ${p.playbackRate} -> ${s.playbackRate}`);
    if (s.padraoRate !== p.padraoRate) m.push(`default rate ${p.padraoRate} -> ${s.padraoRate}`);
    if (s.isPlaying !== p.isPlaying) m.push(`isPlaying ${p.isPlaying} -> ${s.isPlaying}`);
    if (s.current?.sourceId !== p.current?.sourceId) m.push(`track ${p.current?.sourceId ?? '-'} -> ${s.current?.sourceId ?? '-'}`);
    if (s.activeBackend !== p.activeBackend) m.push(`backend ${p.activeBackend} -> ${s.activeBackend}`);
    if (m.length) registarNaVelocidade(`store: ${m.join(' | ')}`);
  });
}
