import { ganhosEmVigor, usePlayer } from '../state/player';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { emitirEqDoJam, ouvirEqDoJam, type EqDoJamAoVivo } from './eqDoJamAoVivo';
import type { Track } from '../types';

const chave = (t: Track | null) => t ? `${t.source}:${t.sourceId}` : null;

/** A curva remota é temporária: não escreve presets nem ajustes por faixa. */
export function ligarEqualizadorDaJam(dispositivo: string): () => void {
  const inicio = useOuvirJuntos.getState(), s = inicio.sessao;
  if (!s || !s.eqPartilhado || !s.eqEmissao || !inicio.euId) return () => {};
  let vivo = true, ultimo: EqDoJamAoVivo | null = null;
  const emissor = s.hostId === inicio.euId && s.eqDispositivo === dispositivo;
  const canal = { id: s.id, hostId: s.hostId, eqEmissao: s.eqEmissao };
  const vigente = () => {
    const actual = useOuvirJuntos.getState();
    return vivo && actual.euId === inicio.euId && actual.sessao?.id === s.id
      && actual.sessao.hostId === s.hostId && actual.sessao.eqPartilhado === true && actual.sessao.eqEmissao === s.eqEmissao;
  };
  const aplicar = () => {
    if (!vigente()) return;
    const sala = chave(useOuvirJuntos.getState().sessao!.track), p = usePlayer.getState();
    p._aplicarEqDaJam(ultimo?.faixa === sala && chave(p.current) === sala ? ultimo.ganhos : null, true);
  };
  usePlayer.getState()._aplicarEqDaJam(null, !emissor);
  const transmissao = emissor ? emitirEqDoJam(canal, () => {
    if (!vigente()) return null;
    const p = usePlayer.getState(), faixa = chave(useOuvirJuntos.getState().sessao!.track);
    return faixa && chave(p.current) === faixa ? { faixa, ganhos: ganhosEmVigor(p) } : null;
  }) : null;
  const pararEscuta = !emissor ? ouvirEqDoJam(canal, e => { ultimo = e; aplicar(); }, () => { ultimo = null; aplicar(); }) : () => {};
  const pararLeitor = usePlayer.subscribe((p, antes) => {
    if (!vigente()) return;
    if (emissor) {
      if (chave(p.current) !== chave(antes.current) || ganhosEmVigor(p) !== ganhosEmVigor(antes)) transmissao!.mudou();
    } else if (chave(p.current) !== chave(antes.current)) aplicar();
  });
  const pararSala = useOuvirJuntos.subscribe((p, antes) => {
    if (!vigente()) return;
    if (chave(p.sessao!.track) !== chave(antes.sessao?.track ?? null)) {
      if (emissor) transmissao!.mudou(); else aplicar();
    }
  });
  return () => {
    if (!vivo) return;
    vivo = false; pararLeitor(); pararSala(); pararEscuta(); transmissao?.parar();
    usePlayer.getState()._aplicarEqDaJam(null, false);
  };
}
