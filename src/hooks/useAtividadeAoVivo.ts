import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { atividadeNativa } from '../../modules/duotone-atividade';
import { traduzir } from '../i18n';
import {
  chaveDaAtividade, estadoDaAtividade, type JamParaAtividade, type MisturaParaAtividade, type TemporizadorParaAtividade,
} from '../lib/atividadeAoVivo';
import { tituloDaFaixa } from '../lib/artistName';
import { lerCelulasDaCapa } from '../lib/celulasDaCapa';
import { corCaracteristica, corDoAmbiente } from '../lib/corDaCapa';
import { usePassagemAVista } from '../state/passagemAVista';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { garantirPerfis, usePerfisPublicos } from '../state/perfisPublicos';
import { usePlayer } from '../state/player';
import { useSocial } from '../state/social';
import type { Track } from '../types';

const SEM_COR = ['#4A4A55', '#8A8A96'] as const;

const paraHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** A cor de uma capa para o eclipse: a característica, ou a do ambiente. Já em cache quase sempre. */
async function corDaCapaDe(track: Pick<Track, 'artworkUrl'> | null | undefined, sem: string): Promise<string> {
  try {
    const celulas = await lerCelulasDaCapa(track?.artworkUrl ?? null);
    const viva = celulas ? corCaracteristica(celulas) : null;
    if (viva) return paraHex(viva.r, viva.g, viva.b);
    return corDoAmbiente(celulas) ?? sem;
  } catch {
    return sem;
  }
}

/**
 * A Live Activity do Duotone (26/11, item 8 do plano, a opção B): ouve a Jam, o
 * temporizador e a passagem do AutoMix, e começa, atualiza ou acaba a atividade
 * (`lib/atividadeAoVivo.ts` diz o que vai nela). Só nos acontecimentos: nada corre
 * por segundo (a contagem é o iOS que a desenha), e sem pedidos ao Supabase (as
 * pessoas são as que a Jam já conhece).
 *
 * O iOS só deixa COMEÇAR uma atividade com a app à frente; atualizar e acabar,
 * sempre. Uma que não começou tenta-se outra vez quando a app volta à frente. Por
 * isso uma passagem do AutoMix com o ecrã bloqueado só aparece se já houver uma
 * atividade (uma Jam ou o temporizador).
 *
 * Sem o módulo no binário, não faz nada.
 */
export function useAtividadeAoVivo(): void {
  const ativo = atividadeNativa !== null;
  const sessao = useOuvirJuntos((s) => s.sessao);
  const membros = useOuvirJuntos((s) => s.membros);
  const fila = useOuvirJuntos((s) => s.fila);
  const euId = useOuvirJuntos((s) => s.euId);
  const perfis = usePerfisPublicos((s) => s.perfis);
  const amigos = useSocial((s) => s.friends);
  // Os nomes como no `usePessoasDaSessao`, mas os perfis só se pedem dentro de uma
  // Jam (os mesmos que a barra da Jam já pede): fora dela, nenhum pedido.
  const nomeDe = (id: string) => perfis[id]?.name || amigos.find((f) => f.friendId === id)?.name || (id === euId ? 'You' : 'Someone');
  const idsDaJam = sessao ? [...new Set([sessao.hostId, ...membros.map((m) => m.userId)])].filter(Boolean).sort().join(',') : '';
  useEffect(() => { if (ativo && idsDaJam) garantirPerfis(idsDaJam.split(',')); }, [ativo, idsDaJam]);
  const fimDoTemporizador = usePlayer((s) => s.sleepTimerEndsAt);
  const noFimDaFaixa = usePlayer((s) => s.pararNoFimDaFaixa);
  const passagem = usePassagemAVista();

  // Quem juntou cada música da fila: quando ela passa a tocar, já saiu da fila.
  const quemJuntou = useRef(new Map<string, string>());
  useEffect(() => {
    for (const item of fila) quemJuntou.current.set(item.track.sourceId, item.postoPor);
    if (quemJuntou.current.size > 300) quemJuntou.current = new Map([...quemJuntou.current].slice(-150));
  }, [fila]);

  // Quando o temporizador começou: o anel do iOS vai do começo ao fim.
  const temporizador = useRef<{ fim: number | null; fimDaFaixa: boolean; inicio: number } | null>(null);
  const t = fimDoTemporizador ?? null;
  if (!t && !noFimDaFaixa) temporizador.current = null;
  else if (!temporizador.current || temporizador.current.fim !== t || temporizador.current.fimDaFaixa !== noFimDaFaixa) {
    temporizador.current = { fim: t, fimDaFaixa: noFimDaFaixa && !t, inicio: Date.now() };
  }

  // As cores da passagem: leem-se das capas (em cache), uma vez por passagem.
  const [mistura, setMistura] = useState<MisturaParaAtividade | null>(null);
  useEffect(() => {
    if (!ativo || !passagem?.automix) { setMistura(null); return; }
    let vivo = true;
    const acabaEmMs = passagem.comecaEm + passagem.duracaoMs;
    const sai = usePlayer.getState().current;
    void Promise.all([corDaCapaDe(sai, SEM_COR[0]), corDaCapaDe(passagem.para, SEM_COR[1])]).then(([a, b]) => {
      if (vivo) setMistura({ para: tituloDaFaixa(passagem.para), legenda: passagem.automix?.legenda ?? null, cores: [a, b], acabaEmMs });
    });
    // No fim da passagem a linha sai sozinha (o motor nem sempre a esquece com o ecrã bloqueado).
    const t = setTimeout(() => { if (vivo) setMistura(null); }, Math.max(0, acabaEmMs - Date.now()) + 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [ativo, passagem]);

  const jam: JamParaAtividade | null = sessao && !sessao.acabouEm ? {
    outros: membros.filter((m) => m.userId !== euId).map((m) => ({ id: m.userId, nome: nomeDe(m.userId) })),
    ouvintes: Math.max(1, membros.length),
    quemJuntou: (() => {
      const id = sessao.track ? quemJuntou.current.get(sessao.track.sourceId) : undefined;
      return id ? { nome: nomeDe(id), souEu: id === euId } : null;
    })(),
    anfitriao: sessao.hostId ? { nome: nomeDe(sessao.hostId), souEu: sessao.hostId === euId } : null,
  } : null;
  const temp: TemporizadorParaAtividade | null = temporizador.current
    ? { inicioMs: temporizador.current.inicio, fimMs: temporizador.current.fim }
    : null;

  const estado = ativo ? estadoDaAtividade({ jam, temporizador: temp, mistura }, Date.now(), traduzir) : null;
  const chave = chaveDaAtividade(estado);

  // Manda o que mudou. `enviada` é o que o iOS tem; `falhou`, uma que não começou.
  const enviada = useRef<string | null>(null);
  const falhou = useRef(false);
  const ultimo = useRef(estado);
  ultimo.current = estado;
  useEffect(() => {
    const nativa = atividadeNativa;
    if (!nativa) return;
    const mandar = () => {
      const e = ultimo.current, k = chaveDaAtividade(e);
      if (k === enviada.current && !falhou.current) return;
      if (!e) {
        enviada.current = k; falhou.current = false;
        void nativa.acabar?.().catch(() => {});
        return;
      }
      void nativa.mostrar?.(e).then((ok) => {
        if (chaveDaAtividade(ultimo.current) !== k) return;
        enviada.current = k; falhou.current = !ok;
      }).catch(() => { falhou.current = true; });
    };
    // Um pouco de folga: entrar numa Jam muda a sessão, os membros e a fila de seguida.
    const t = setTimeout(mandar, 250);
    return () => clearTimeout(t);
  }, [chave]);

  // Uma que não começou (a app estava escondida) tenta-se quando a app volta à frente.
  useEffect(() => {
    const nativa = atividadeNativa;
    if (!nativa) return;
    const s = AppState.addEventListener('change', (a) => {
      if (a !== 'active' || !falhou.current || !ultimo.current) return;
      const k = chaveDaAtividade(ultimo.current);
      void nativa.mostrar?.(ultimo.current).then((ok) => { enviada.current = k; falhou.current = !ok; }).catch(() => {});
    });
    return () => s.remove();
  }, []);

  // No arranque, sem nada para mostrar: uma que ficou de antes (a app fechada à bruta) sai.
  useEffect(() => {
    if (!ultimo.current) void atividadeNativa?.acabar?.().catch(() => {});
  }, []);
}

/**
 * A atividade num componente só dela, que não desenha nada: o que ela ouve muda
 * muitas vezes numa Jam, e no `App` cada mudança redesenhava a raiz toda.
 */
export function AtividadeAoVivo(): null {
  useAtividadeAoVivo();
  return null;
}
