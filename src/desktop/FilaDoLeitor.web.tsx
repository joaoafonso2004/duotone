import React, { useEffect, useRef, useState } from 'react';
import { refDoAlvo } from './Arrastar.web';
import { alvoDaFila } from './alvosDeLargar.web';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ROTULO_DO_GRUPO } from '../lib/leitorDoPc';
import { FilaArrastavel } from './FilaArrastavel.web';
import { RadioEmTresEstados } from './RadioEmTresEstados.web';
import { useFilaDoLeitor } from './useFilaDoLeitor.web';
import { styles } from './estilos.web';
import { Button, Dialog, Field, marcar } from './ui.web';
import { COR, ESP, ESTADO, FONT } from './tokens.web';
import type { CommonPageProps } from './rotas';

const { createPortal } = require('react-dom') as { createPortal: (filho: React.ReactNode, onde: Element) => React.ReactElement };

type Fila = ReturnType<typeof useFilaDoLeitor>;

/**
 * O número de músicas em Up next conta até ao novo valor (520 ms, a abrandar):
 * a descer a zero quando a fila sai ou a Radio a troca, e a subir quando a nova
 * chega. Com "menos movimento" muda de uma vez.
 */
function NumeroQueAnda({ valor }: { valor: number }) {
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
  return <Text style={styles.npFilaContagem}>{mostrado}</Text>;
}

export function CabecaDaFila({ fila, compacta = false }: { fila: Fila; compacta?: boolean }) {
  return <View>
    <View style={[styles.npFilaCabeca, compacta && { flexWrap: 'wrap', gap: ESP.sm }]}>
      <Text style={[styles.npFilaHeading, compacta && { fontSize: 14 }]}>Up next</Text>
      <NumeroQueAnda valor={fila.saida ? 0 : fila.upNext.length} />
      <View style={{ flex: 1 }} />
      {compacta ? null : <RadioEmTresEstados />}
      {fila.current || fila.upNext.length ? <Pressable accessibilityRole="button" accessibilityLabel="Save queue as playlist"
        onPress={fila.pedirNome} style={({ hovered }: any) => [styles.npFilaLimpar, hovered && { backgroundColor: ESTADO.hover }]}>
        <Text style={styles.npFilaLimparTexto}>Save</Text>
      </Pressable> : null}
      {fila.podeEditar && fila.upNext.length > 0 ? <Pressable accessibilityRole="button"
        accessibilityLabel={fila.aConfirmarLimpar ? `Confirm: clear ${fila.upNext.length} tracks from the queue` : 'Clear the queue'}
        onPress={fila.limpar} style={({ hovered }: any) => [styles.npFilaLimpar, hovered && { backgroundColor: ESTADO.hover }]}>
        <Text style={[styles.npFilaLimparTexto, fila.aConfirmarLimpar && { color: COR.aviso }]}>
          {fila.aConfirmarLimpar ? `Clear ${fila.upNext.length}?` : 'Clear'}
        </Text>
      </Pressable> : null}
    </View>
    {/* No painel (340 px) o Radio não cabe na linha do título com o Save e o
        Clear: fica por baixo, com o Undo ao lado. */}
    {compacta ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm, paddingHorizontal: ESP.sm, paddingBottom: ESP.sm }}>
      <RadioEmTresEstados />
    </View> : null}
    {fila.radioErro && !fila.emJam ? <Text accessibilityRole="alert" style={styles.npRadioErro}>{fila.radioErro}</Text> : null}
    {/* Num portal (30/10): cada View do RNW tem `z-index: 0`, e o diálogo, dentro
        da cabeça da fila, ficava preso a essa camada -- o veu só cobria a cabeça,
        e os botões, por baixo da lista, deixavam de receber o clique (iam para a
        fila). Só existe aberto: o contentor fixo cobre a janela e apanharia o rato. */}
    {fila.aGuardar ? createPortal(
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
    ) : null}
  </View>;
}

export function LinhasDaFila({ fila, compacta = false }: { fila: Fila; compacta?: boolean }) {
  // Largar uma música arrastada aqui põe-na no sítio da linha (24/10). Com a
  // fila vazia continua a haver onde a largar.
  const chave = useRef(`fila:${Math.random().toString(36).slice(2)}`).current;
  // O que a Radio juntou, no fim, fica sob um separador (30/10). São duas listas
  // arrastáveis, cada uma com as suas posições (a de baixo desloca-se pelo
  // tamanho da de cima): arrasta-se dentro de cada uma, não de uma para a outra.
  const visiveis = fila.upNext.slice(0, fila.linhasDaFila);
  const corte = fila.inicioDoGrupo;
  const principal = corte < 0 ? visiveis : visiveis.slice(0, corte);
  const doGrupo = corte < 0 ? [] : visiveis.slice(corte);
  const lista = (id: string, entradas: typeof visiveis, base: number, entrada: 'vira' | null) =>
    <FilaArrastavel key={id} entradas={entradas} podeArrastar={fila.podeEditar}
      aoTocar={fila.aoTocar} aoMenu={fila.aoMenu} aoMover={(de, para) => fila.aoMover(de + base, para + base)}
      compacta={compacta} saida={fila.saida} entrada={entrada} />;
  return <View ref={refDoAlvo(chave, alvoDaFila()) as any} style={{ minHeight: 56 }}>
    {principal.length ? lista('principal', principal, 0, null) : null}
    {doGrupo.length ? <View {...(fila.saida ? marcar('grupo-radio', 'grupo-sai') : marcar('grupo-radio'))} style={estilos.grupo}>
      <Text style={estilos.grupoRotulo}>{ROTULO_DO_GRUPO[fila.tipoDoGrupo]}</Text>
      <View style={estilos.grupoLinha} />
      <Text style={estilos.grupoNumero}>+{doGrupo.length}</Text>
    </View> : null}
    {doGrupo.length ? lista('radio', doGrupo, principal.length, fila.entrada) : null}
    {fila.notaDoFim && fila.upNext.length <= fila.linhasDaFila ? <Text style={styles.npFilaFim}>{fila.notaDoFim}</Text> : null}
  </View>;
}

export function FilaDoLeitor({ more, notify, atual }: Pick<CommonPageProps, 'more' | 'notify'> & { atual: React.ReactNode }) {
  const fila = useFilaDoLeitor({ more, notify });
  return <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingHorizontal: ESP.sm, paddingBottom: ESP.xl }}
    scrollEventThrottle={100} onScroll={fila.aoRolar}>
    {atual}
    <CabecaDaFila fila={fila} compacta />
    <LinhasDaFila fila={fila} compacta />
  </ScrollView>;
}

const estilos = {
  grupo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: ESP.sm, marginTop: 14, marginBottom: 6 } as const,
  grupoRotulo: { fontFamily: FONT.mono, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: COR.textoMedio } as const,
  grupoLinha: { flex: 1, height: 1, backgroundColor: COR.linha } as const,
  grupoNumero: { fontFamily: FONT.mono, fontSize: 11, color: COR.textoFraco, fontVariantNumeric: 'tabular-nums' } as any,
};
