import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { checkIsSaved, removeFromLibrary, saveToLibrary } from '../api/library';
import type { SharedItem } from '../api/social';
import { EscolherPlaylist } from '../desktop/EscolherPlaylist.web';
import { MenuDeContexto, pontoDoEvento, type PontoNoEcra } from '../desktop/MenuDeContexto.web';
import { criarEPor, porNaPlaylist } from '../desktop/porNaPlaylist.web';
import { COR } from '../desktop/tokens.web';
import { tituloDaFaixa } from '../lib/artistName';
import { avisarErro, avisarFeito } from '../lib/avisoDeRemocao';
import { menuDaMensagem, REACOES_RAPIDAS, type AcaoDaMensagem } from '../lib/menuDaMensagem';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { useConnectivity } from '../state/connectivity';
import { usePlayer } from '../state/player';
import { useSaved } from '../state/saved';
import type { AbrirMenuDaMensagem, OpcoesDoMenuDaMensagem } from './MenuDaMensagem';

const avisar = (texto: string) => { avisarFeito(texto); };

/** Copiar para a área de transferência; sem autorização para ela (a janela sem foco), pelo caminho antigo. */
async function copiar(texto: string): Promise<void> {
  try { await navigator.clipboard.writeText(texto); return; } catch { /* abaixo */ }
  const area = document.createElement('textarea');
  area.value = texto;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('copy');
}

/**
 * O botão direito numa mensagem do chat no PC (24/10, `lib/menuDaMensagem.ts`):
 * as reações numa fila no topo, como no Teams, e por baixo Reply, Copy text e,
 * numa música partilhada, o que se faz a uma música (com o painel "Add to
 * playlist ›"). Com texto selecionado no balão, o botão direito fica para o
 * Copy do Windows (`MessageBubble`).
 */
export function useMenuDaMensagem(opcoes: OpcoesDoMenuDaMensagem) {
  const [menu, setMenu] = useState<{ m: SharedItem; rato: PontoNoEcra; podeResponder: boolean } | null>(null);
  const abrirMenuDaMensagem = useCallback<AbrirMenuDaMensagem>((m, e, o) => {
    e?.preventDefault?.();
    setMenu({ m, rato: pontoDoEvento(e), podeResponder: o?.podeResponder !== false });
  }, []);
  const menuDaMensagem = menu
    ? <MenuDaMensagem m={menu.m} rato={menu.rato} podeResponder={menu.podeResponder} opcoes={opcoes} aoFechar={() => setMenu(null)} />
    : null;
  return { abrirMenuDaMensagem, menuDaMensagem };
}

function MenuDaMensagem({ m, rato, podeResponder, opcoes, aoFechar }: {
  m: SharedItem; rato: PontoNoEcra; podeResponder: boolean; opcoes: OpcoesDoMenuDaMensagem; aoFechar: () => void;
}) {
  const semRede = useConnectivity((s) => s.offline);
  const faixa = m.trackData ?? null;
  const guardada = useSaved((s) => (faixa ? s.keys.has(`${faixa.source}:${faixa.sourceId}`) : false));
  const minha = opcoes.minhaReacao(m);
  const texto = m.message?.trim() ?? '';
  const linhas = menuDaMensagem({ podeResponder, temTexto: !!texto, faixa: faixa ? { guardada } : null, semRede })
    .map((l) => ({ id: l.id, rotulo: l.rotulo, icone: l.icone, inicioDeGrupo: l.inicioDeGrupo, motivo: l.motivo, submenu: l.id === 'por-em-playlist' }));

  const fazer = async (id: AcaoDaMensagem) => {
    try {
      if (id === 'responder') opcoes.aoResponder(m);
      else if (id === 'copiar') {
        try { await copiar(texto); } catch { avisarErro("Couldn't copy the text."); return; }
        avisarFeito('Copied.');
      }
      else if (!faixa) return;
      else if (id === 'tocar') await usePlayer.getState().tocarMusica(faixa, undefined, true);
      else if (id === 'fila') { usePlayer.getState().addToQueue(faixa); avisarFeito(`${tituloDaFaixa(faixa)} added to the queue.`); }
      else if (id === 'gostar') {
        // Otimista, como no menu de um amigo: o coração muda já e volta atrás se falhar.
        useSaved.getState().markSaved(faixa, !guardada);
        try {
          if (guardada) {
            const { trackId } = await checkIsSaved(faixa.source, faixa.sourceId);
            if (trackId) await removeFromLibrary(trackId);
            avisarFeito('Removed from Liked Songs.');
          } else {
            await saveToLibrary(faixa);
            avisarFeito('Added to Liked Songs.');
          }
          window.dispatchEvent(new Event('duotone:refresh-library'));
        } catch (e) {
          useSaved.getState().markSaved(faixa, guardada);
          throw e;
        }
      }
    } catch (e) {
      avisarErro(mensagemDeErro(e, "Couldn't do that. Try again."));
    }
  };

  return <MenuDeContexto
    rato={rato}
    rotulo="Options for this message"
    cabecalho={<View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessibilityRole={'group' as any} accessibilityLabel="React">
      {REACOES_RAPIDAS.map((emoji) => <Pressable key={emoji} accessibilityRole="button"
        accessibilityLabel={minha === emoji ? `Remove your ${emoji}` : `React with ${emoji}`} accessibilityState={{ selected: minha === emoji }}
        onPress={() => { aoFechar(); opcoes.aoReagir(m, minha === emoji ? null : emoji); }}
        style={({ hovered, focused }: any) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
          backgroundColor: minha === emoji ? 'rgba(233,234,238,.14)' : hovered || focused ? 'rgba(233,234,238,.07)' : 'transparent' })}>
        <Text style={{ fontSize: 19, color: COR.texto }}>{emoji}</Text>
      </Pressable>)}
    </View>}
    linhas={linhas}
    submenu={faixa ? ({ fechar, voltar }) => <EscolherPlaylist faixa={faixa} aoFechar={fechar} aoVoltar={voltar}
      aoEscolher={(p, jaLaEsta) => void porNaPlaylist(faixa, p, jaLaEsta, avisar)}
      aoCriar={(nome) => void criarEPor(faixa, nome, avisar)} /> : undefined}
    aoEscolher={(id) => void fazer(id as AcaoDaMensagem)}
    aoFechar={aoFechar}
  />;
}
