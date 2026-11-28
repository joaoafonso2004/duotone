import { Saida } from './Saida.web';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import { refDoAlvo } from './Arrastar.web';
import { alvoDaFila } from './alvosDeLargar.web';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { FilaArrastavel } from './FilaArrastavel.web';
import { RadioEmTresEstados } from './RadioEmTresEstados.web';
import { useFilaDoLeitor } from './useFilaDoLeitor.web';
import { styles } from './estilos.web';
import { Artwork, Button, Dialog, Field, formatTime, IconButton } from './ui.web';
import { COR, ESP, ESTADO } from './tokens.web';
import { tempoDaFila } from '../lib/leitorDoPc';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { destinoDaOrigem, olhoDaOrigem } from '../lib/aparencia';
import { rotuloDaOrigem } from '../lib/origemDaFila';
import { trackKey } from '../lib/shuffle';
import { usePlayer } from '../state/player';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useDestinos } from '../navigation/destinos';
import type { Track } from '../types';
import type { CommonPageProps } from './rotas';

const { createPortal } = require('react-dom') as { createPortal: (filho: React.ReactNode, onde: Element) => React.ReactElement };

type Fila = ReturnType<typeof useFilaDoLeitor>;

/**
 * O número de músicas em Up next conta até ao novo valor (520 ms, a abrandar):
 * a descer a zero quando a fila sai ou a Radio a troca, e a subir quando a nova
 * chega. Com "menos movimento" muda de uma vez.
 */
function NumeroQueAnda({ valor, estilo }: { valor: number; estilo?: any }) {
  const reduzido = useReducedMotion();
  const [mostrado, setMostrado] = useState(valor);
  const de = useRef(valor);
  useEffect(() => {
    if (reduzido || de.current === valor) { de.current = valor; setMostrado(valor); return; }
    const inicio = de.current, t0 = performance.now();
    let quadro = 0;
    const passo = (agora: number) => {
      const f = Math.min(1, (agora - t0) / 520);
      de.current = Math.round(inicio + (valor - inicio) * (1 - Math.pow(1 - f, 3)));
      setMostrado(de.current);
      if (f < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [valor, reduzido]);
  return <Text style={estilo ?? styles.npFilaContagem}>{mostrado}</Text>;
}

/**
 * Uma aba da cabeça da fila: o nome, e na aberta a linha de aço por baixo (25/11, a
 * proposta A da maquete do cartão; era um traço de 2 px sem brilho, em letra de 18).
 * "Up next" leva o número da fila ao lado (`filhos`).
 */
export function AbaDaFila({ rotulo, ativa, aoCarregar, filhos }: { rotulo: string; ativa: boolean; aoCarregar: () => void; filhos?: React.ReactNode }) {
  return <Pressable accessibilityRole={'tab' as any} accessibilityState={{ selected: ativa }} accessibilityLabel={rotulo} onPress={aoCarregar}
    style={[styles.npAba, ativa && ESTADO.linhaEscolhida]}>
    {({ hovered }: any) => <>
      <Text style={[styles.npAbaTexto, (ativa || hovered) && { color: COR.texto }]}>{rotulo}</Text>
      {filhos}
    </>}
  </Pressable>;
}

/** As abas do cartão do Now Playing grande (31/10: a terceira, "About", é nova). */
export type AbaDoCartao = 'fila' | 'letra' | 'sobre';

/** As três abas juntas: "Up next" (com o número da fila), "Lyrics" e "About". */
export function AbasDoCartao({ fila, aba, aoMudar }: { fila: Fila; aba: AbaDoCartao; aoMudar: (aba: AbaDoCartao) => void }) {
  return <View accessibilityRole={'tablist' as any} style={styles.npAbas}>
    <AbaDaFila rotulo="Up next" ativa={aba === 'fila'} aoCarregar={() => aoMudar('fila')} filhos={<NumeroQueAnda valor={fila.saida ? 0 : fila.upNext.length} />} />
    <AbaDaFila rotulo="Lyrics" ativa={aba === 'letra'} aoCarregar={() => aoMudar('letra')} />
    <AbaDaFila rotulo="About" ativa={aba === 'sobre'} aoCarregar={() => aoMudar('sobre')} />
  </View>;
}

/**
 * A que toca, à cabeça da fila (25/11, a proposta A da maquete do cartão): "Now playing"
 * em letra técnica, a capa, o nome, o tempo e um fio de progresso. Era uma barra cinzenta
 * acesa (no Now Playing) e uma caixa (no painel). Lê a posição só aqui, para o resto não
 * se redesenhar a cada segundo. `aoMenu` (o painel): o "…" com o menu da música.
 */
export function AgoraNaFila({ track, aoMenu }: { track: Track; aoMenu?: () => void }) {
  const posicaoMs = usePlayer((s) => s.positionMs) ?? 0;
  const duracaoMs = usePlayer((s) => s.durationMs) ?? 0;
  const fracao = duracaoMs > 0 ? Math.min(1, Math.max(0, posicaoMs / duracaoMs)) : 0;
  const compacta = !!aoMenu;
  return <View style={styles.npAgora} accessibilityLabel={`Now playing: ${tituloDaFaixa(track)}`}
    {...(aoMenu ? ({ onContextMenu: (e: any) => { e.preventDefault(); aoMenu(); } } as any) : {})}>
    <Text style={styles.npMicro}>Now playing</Text>
    <View style={styles.npAgoraLinha}>
      <Artwork track={track} size={compacta ? 46 : 52} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.npAgoraTitulo, compacta && { fontSize: 15 }]}>{tituloDaFaixa(track)}</Text>
        <Text numberOfLines={1} style={styles.npAgoraArtista}>{displayArtist(track)}</Text>
      </View>
      {duracaoMs > 0 ? <Text style={styles.npAgoraTempo}>{`${formatTime(posicaoMs / 1000)} / ${formatTime(duracaoMs / 1000)}`}</Text> : null}
      {aoMenu ? <IconButton name="ellipsis-horizontal" label={`Options for ${tituloDaFaixa(track)}`} onPress={aoMenu} /> : null}
    </View>
    <View style={styles.npFio} aria-hidden><View style={[styles.npFioFeito, { transform: [{ scaleX: fracao }] }]} /></View>
  </View>;
}

/**
 * De onde é a fila, à esquerda da linha do Radio no painel da direita (25/11): "Playing
 * from" e o nome, que abre a lista quando dá. No Now Playing é o topo da página que o diz.
 * Uma música que a app meteu (Radio, Smart Shuffle) diz isso, como no Now Playing.
 */
export function OrigemNoPainel() {
  const origemDaFila = usePlayer((s) => s.origemDaFila);
  const current = usePlayer((s) => s.current);
  const doRadio = usePlayer((s) => s.doRadio);
  const sugeridas = usePlayer((s) => s.sugeridas);
  const emJam = useOuvirJuntos((s) => !!s.sessao);
  const { irPara } = useDestinos();
  if (!current || emJam) return null;
  const chave = trackKey(current);
  const rotulo = rotuloDaOrigem(origemDaFila, { sugerida: sugeridas.includes(chave), doRadio: doRadio.includes(chave) });
  if (!rotulo) return null;
  const destino = destinoDaOrigem(rotulo.alvo);
  const olho = olhoDaOrigem(rotulo.antes);
  return <Pressable disabled={!destino} onPress={() => { if (destino) irPara(destino); }}
    accessibilityRole={destino ? 'link' : undefined} accessibilityLabel={`${olho} ${rotulo.nome}`} style={styles.npOrigemNoPainel}>
    {({ hovered }: any) => <>
      <Text numberOfLines={1} style={[styles.npMicro, { flexShrink: 0 }]}>{olho}</Text>
      <Text numberOfLines={1} style={[styles.npOrigemNoPainelNome, !!destino && hovered && { textDecorationLine: 'underline' }]}>{rotulo.nome}</Text>
    </>}
  </Pressable>;
}

/** O desenho de "guardar a fila como playlist": o mesmo do "Add to playlist" do Now Playing. */
const desenhoDeGuardar = (cor: string) => <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" aria-hidden="true">
  <path d="M3 6h13M3 11h13M3 16h8M18 13.5v7M14.5 17h7" />
</svg>;

/**
 * O que se faz à fila (25/11, a proposta A): baralhar, guardar e limpar em ícones com
 * legenda, como os do leitor (eram três palavras soltas ao lado da pílula do Radio).
 * Limpar pede confirmação por extenso. Com várias escolhidas, o que se faz com elas.
 */
export function AcoesDaFila({ fila }: { fila: Fila }) {
  if (fila.escolhidas.size) return <View style={styles.npFilaAcoes}>
    <Text style={[styles.npFilaLimparTexto, { marginRight: ESP.xs }]}>{`${fila.escolhidas.size} selected`}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Play the selected songs next" onPress={fila.porASeguir}
      style={({ hovered }: any) => [styles.npFilaLimpar, hovered && { backgroundColor: ESTADO.hover }]}>
      <Text style={[styles.npFilaLimparTexto, { color: COR.texto }]}>Play next</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Remove the selected songs" onPress={fila.tirarEscolhidas}
      style={({ hovered }: any) => [styles.npFilaLimpar, hovered && { backgroundColor: ESTADO.hover }]}>
      <Text style={[styles.npFilaLimparTexto, { color: COR.texto }]}>Remove</Text>
    </Pressable>
    <IconButton name="close" label="Clear the selection" onPress={fila.largarEscolhidas} />
  </View>;
  const n = fila.upNext.length;
  return <View style={styles.npFilaAcoes}>
    {/* Baralhar outra vez (16/11): só o que vem a seguir; as postas à mão ficam à frente. */}
    {fila.podeEditar && n > 1 ? <IconButton name="shuffle" label="Shuffle again" onPress={fila.baralhar} /> : null}
    {fila.current || n ? <IconButton name="list" label="Save queue as playlist" onPress={fila.pedirNome} desenho={desenhoDeGuardar} /> : null}
    {fila.podeLimpar && n > 0 ? (fila.aConfirmarLimpar
      ? <Pressable accessibilityRole="button" accessibilityLabel={`Confirm: clear ${n} tracks from the queue`} onPress={fila.limpar}
        style={({ hovered }: any) => [styles.npFilaLimpar, hovered && { backgroundColor: ESTADO.hover }]}>
        <Text style={[styles.npFilaLimparTexto, { color: COR.aviso }]}>{`Clear ${n} ${n === 1 ? 'song' : 'songs'}?`}</Text>
      </Pressable>
      : <IconButton name="trash-outline" label="Clear the queue" onPress={fila.limpar} />) : null}
  </View>;
}

/**
 * "Next · 12 songs" e quanto falta, por cima das próximas (25/11, a proposta A). No
 * cartão do Now Playing o tempo vai à direita; no painel e no Now Playing estreito a
 * direita é dos botões da fila (`direita`), e o tempo fica de fora: a 340 px com os três
 * ícones o rótulo era cortado a meio ("26 M…").
 */
export function RotuloDasProximas({ fila, direita = null }: { fila: Fila; direita?: React.ReactNode }) {
  const n = fila.saida ? 0 : fila.upNext.length;
  const tempo = fila.saida ? null : tempoDaFila(fila.upNext.map((e) => e.track));
  if (!fila.upNext.length && !direita) return null;
  return <View style={styles.npProximas}>
    <Text numberOfLines={1} style={styles.npMicro}>
      {fila.upNext.length ? <>Next · <NumeroQueAnda valor={n} estilo={styles.npMicro} />{n === 1 ? ' song' : ' songs'}</> : 'Next'}
    </Text>
    <View style={{ flex: 1 }} />
    {direita ?? (tempo ? <Text style={styles.npMicro}>{tempo}</Text> : null)}
  </View>;
}

export function CabecaDaFila({ fila, abas, origem = null }: {
  fila: Fila;
  /** As abas "Up next", "Lyrics" e "About" no cartão da fila do Now Playing grande. */
  abas?: { aba: AbaDoCartao; aoMudar: (aba: AbaDoCartao) => void };
  /**
   * De onde é a fila, à esquerda da linha do Radio (o painel da direita). No Now
   * Playing não: o topo da página já o diz ("Playing from ..."), e seria duas vezes.
   */
  origem?: React.ReactNode;
}) {
  return <View>
    {/* Duas linhas (25/11, a proposta A): as abas e os botões da fila; depois o Radio,
        com o que aconteceu à esquerda. Sem abas (o painel, o Now Playing estreito) os
        botões vão para a linha das próximas. */}
    {abas ? <View style={styles.npFilaCabeca}>
      <AbasDoCartao fila={fila} aba={abas.aba} aoMudar={abas.aoMudar} />
      <View style={{ flex: 1 }} />
      <AcoesDaFila fila={fila} />
    </View> : null}
    <RadioEmTresEstados esquerda={origem} empilhada={!abas} />
    {abas ? null : <RotuloDasProximas fila={fila} direita={<AcoesDaFila fila={fila} />} />}
    {/* Voltar à fila que se deixou (9/11): por baixo da cabeça e por cima das
        linhas, com as letras do Save e do Clear. Nas abas, só na "Up next". */}
    {fila.anterior && (!abas || abas.aba === 'fila') ? <Pressable accessibilityRole="button" accessibilityLabel={fila.anterior.acessivel}
      onPress={fila.voltar} style={({ hovered, focused }: any) => [styles.npFilaVoltar, (hovered || focused) && { backgroundColor: ESTADO.hover }]}>
      <Ionicons name="return-up-back" size={15} color={COR.textoMedio} />
      <Text numberOfLines={1} style={[styles.npFilaLimparTexto, { flex: 1, minWidth: 0 }]}>{fila.anterior.rotulo}</Text>
      <Text style={styles.npFilaVoltarDetalhe}>{fila.anterior.detalhe}</Text>
      {/* O X (28/11, pedido do João): tira a linha e esquece a fila deixada. É o
          Pressable de dentro, por isso o clique não chega ao "Back to". */}
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={fila.esquecerAnterior}
        style={({ hovered, focused }: any) => [styles.npFilaVoltarFechar, (hovered || focused) && { backgroundColor: ESTADO.hover }]}>
        {({ hovered }: any) => <Ionicons name="close" size={14} color={hovered ? COR.texto : COR.textoFraco} />}
      </Pressable>
    </Pressable> : null}
    {fila.radioErro && !fila.emJam ? <Text accessibilityRole="alert" style={styles.npRadioErro}>{fila.radioErro}</Text> : null}
    {/* Num portal (30/10): cada View do RNW tem `z-index: 0`, e o diálogo, dentro
        da cabeça da fila, ficava preso a essa camada -- o veu só cobria a cabeça,
        e os botões, por baixo da lista, deixavam de receber o clique (iam para a
        fila). Só existe aberto: o contentor fixo cobre a janela e apanharia o rato. */}
    <Saida aberto={!!fila.aGuardar}>{() => createPortal(
      <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 310 } as any}>
        <Dialog open title="Save queue as playlist" onClose={() => { if (!fila.aGravar) fila.setAGuardar(null); }}>
          <View style={{ paddingBottom: 16 }}>
            <Field autoFocus placeholder="Playlist name" value={fila.aGuardar?.nome ?? ''}
              onChangeText={(nome) => fila.setAGuardar({ nome })}
              onSubmitEditing={() => void fila.guardar(fila.aGuardar?.nome ?? '')} />
          </View>
          <View style={styles.dialogActions}>
            <Button secondary onPress={() => fila.setAGuardar(null)} disabled={fila.aGravar}>Cancel</Button>
            <Button onPress={() => void fila.guardar(fila.aGuardar?.nome ?? '')} disabled={fila.aGravar || !fila.aGuardar?.nome.trim()}>
              {fila.aGravar ? 'Saving…' : 'Save'}
            </Button>
          </View>
        </Dialog>
      </View>,
      document.body,
    )}</Saida>
  </View>;
}

export function LinhasDaFila({ fila, compacta = false }: { fila: Fila; compacta?: boolean }) {
  // Largar uma música arrastada aqui põe-na no sítio da linha (24/10). Com a
  // fila vazia continua a haver onde a largar.
  const chave = useRef(`fila:${Math.random().toString(36).slice(2)}`).current;
  // O que a Radio juntou, no fim, é uma lista à parte (30/10), seguida, sem
  // separador (o João, 1/11: não queria o texto). São duas listas arrastáveis,
  // cada uma com as suas posições (a de baixo desloca-se pelo tamanho da de
  // cima): arrasta-se dentro de cada uma, não de uma para a outra.
  const visiveis = fila.upNext.slice(0, fila.linhasDaFila);
  const corte = fila.inicioDoGrupo;
  const principal = corte < 0 ? visiveis : visiveis.slice(0, corte);
  const doGrupo = corte < 0 ? [] : visiveis.slice(corte);
  const lista = (id: string, entradas: typeof visiveis, base: number, entrada: 'vira' | null) =>
    <FilaArrastavel key={id} entradas={entradas} podeArrastar={fila.podeEditar}
      aoTocar={fila.aoTocar} aoMenu={fila.aoMenu} aoMover={(de, para) => fila.aoMover(de + base, para + base)}
      escolhidas={fila.escolhidas} aoEscolher={(e, visivel, real) => fila.aoEscolher(e, visivel + base, real)}
      compacta={compacta} saida={fila.saida} entrada={entrada} primeiroNumero={base + 1} />;
  return <View ref={refDoAlvo(chave, alvoDaFila()) as any} style={{ minHeight: 56 }}>
    {principal.length ? lista('principal', principal, 0, null) : null}
    {doGrupo.length ? lista('radio', doGrupo, principal.length, fila.entrada) : null}
    {fila.notaDoFim && fila.upNext.length <= fila.linhasDaFila ? <View style={styles.npFilaFim}>
      <Ionicons name="radio-outline" size={13} color={COR.textoFraco} />
      <Text style={styles.npFilaFimTexto}>{fila.notaDoFim}</Text>
    </View> : null}
  </View>;
}

export function FilaDoLeitor({ more, notify, atual, origem = null }: Pick<CommonPageProps, 'more' | 'notify'> & { atual: React.ReactNode; origem?: React.ReactNode }) {
  const fila = useFilaDoLeitor({ more, notify });
  return <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingHorizontal: ESP.sm, paddingBottom: ESP.xl }}
    scrollEventThrottle={100} onScroll={fila.aoRolar}>
    {atual}
    <CabecaDaFila fila={fila} origem={origem} />
    <LinhasDaFila fila={fila} compacta />
  </ScrollView>;
}
