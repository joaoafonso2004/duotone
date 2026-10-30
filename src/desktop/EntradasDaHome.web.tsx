import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { rotuloDaOrigem } from '../lib/origemDaFila';
import { trackKey } from '../lib/shuffle';
import { entradaDoContinuar, resumoDaMistura } from '../lib/entradasDaHome';
import { usePlayer } from '../state/player';
import type { Track } from '../types';
import { useDestinos } from '../navigation/destinos';
import { CapaDuotone } from './duotone.web';
import { COR, ESP, FONT, RAIO, TIPO } from './tokens.web';
import { Button, capaDaFaixa, marcar } from './ui.web';

/**
 * Os dois cartões de entrada da Home (30/10, passo 6 de `docs/PLANO-ELEVAR-PC.md`;
 * maquete `docs/pc-elevar-maquete.html`): o que estavas a ouvir, para continuar,
 * e a Daily mix, para tocar. Antes de tudo o resto: a página abria numa fila de
 * prateleiras iguais, e o que a pessoa mais quer (continuar, ou deixar a app
 * escolher) estava a uma rolagem de distância.
 *
 * Nada novo vai à rede: a faixa e a posição vêm do leitor (que as guarda entre
 * sessões) e a Daily mix é a da loja `useMisturaDoDia`, a mesma lista o dia todo.
 */

/** O progresso da faixa, à parte: é o único bocado que muda ao segundo. */
function Progresso({ duracaoS }: { duracaoS: number | null }) {
  const posicao = usePlayer((s) => s.positionMs);
  const fracao = duracaoS && duracaoS > 0 ? Math.min(1, Math.max(0, posicao / (duracaoS * 1000))) : 0;
  return <View style={estilos.progresso} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(fracao * 100) }}>
    <View style={[estilos.progressoCheio, { width: `${fracao * 100}%` }]} />
  </View>;
}

function Continuar() {
  const atual = usePlayer((s) => s.current);
  const aTocar = usePlayer((s) => s.isPlaying);
  const origem = usePlayer((s) => s.origemDaFila);
  const sugeridas = usePlayer((s) => s.sugeridas);
  const doRadio = usePlayer((s) => s.doRadio);
  const { irPara } = useDestinos();
  if (!atual) return null;
  const chave = trackKey(atual);
  const rotulo = rotuloDaOrigem(origem, { sugerida: sugeridas.includes(chave), doRadio: doRadio.includes(chave) });
  const e = entradaDoContinuar(aTocar);
  return <View {...marcar('cartao', 'brilho')} style={estilos.cartao}>
    <View style={estilos.capa}><CapaDuotone uri={capaDaFaixa(atual)} viva style={{ borderRadius: RAIO.cartao }} /></View>
    <View style={estilos.texto}>
      <Text style={estilos.etiqueta}>{e.etiqueta}</Text>
      <Text numberOfLines={1} style={estilos.titulo}>{tituloDaFaixa(atual)}</Text>
      <Text numberOfLines={1} style={estilos.legenda}>{displayArtist(atual)}{rotulo ? ` · ${rotulo.antes.toLowerCase()} ${rotulo.nome}` : ''}</Text>
      <Progresso duracaoS={atual.durationSeconds ?? null} />
      <View style={{ alignSelf: 'flex-start' }}>
        <Button icon="play" onPress={() => { if (e.acao === 'abrir') irPara({ tipo: 'a-tocar' }); else void usePlayer.getState().togglePlay(); }}>{e.botao}</Button>
      </View>
    </View>
  </View>;
}

function DailyMix({ faixas }: { faixas: readonly Track[] }) {
  if (faixas.length < 1) return null;
  const quatro = faixas.slice(0, 4);
  const tocar = () => {
    const leitor = usePlayer.getState();
    void leitor.tocarLista([...faixas], leitor.shuffle, leitor.shuffleInteligente, { tipo: 'prateleira', nome: 'Daily mix' });
  };
  return <View {...marcar('cartao', 'brilho')} style={estilos.cartao}>
    {/* Quatro capas, duas a duas: a dois tons até o rato lhes tocar. */}
    <View style={estilos.mosaico}>
      {quatro.map((t) => <View key={trackKey(t)} style={estilos.quarto}><CapaDuotone uri={capaDaFaixa(t)} style={{ borderRadius: 0 }} /></View>)}
    </View>
    <View style={estilos.texto}>
      <Text style={estilos.etiqueta}>Daily mix</Text>
      <Text numberOfLines={1} style={estilos.titulo}>New today</Text>
      <Text numberOfLines={1} style={estilos.legenda}>{resumoDaMistura(faixas.length)}</Text>
      <View style={{ alignSelf: 'flex-start', marginTop: ESP.md }}>
        <Button secondary icon="play" onPress={tocar}>Play</Button>
      </View>
    </View>
  </View>;
}

export function EntradasDaHome({ misturaDoDia }: { misturaDoDia: readonly Track[] }) {
  const temAtual = usePlayer((s) => !!s.current);
  if (!temAtual && misturaDoDia.length < 1) return null;
  return <View style={estilos.linha}>
    <Continuar />
    <DailyMix faixas={misturaDoDia} />
  </View>;
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: ESP.lg, marginBottom: ESP.xxl },
  cartao: { flex: 1, minWidth: 320, flexDirection: 'row', alignItems: 'center', gap: ESP.lg, padding: ESP.lg, borderRadius: RAIO.superficie,
    borderWidth: 1, borderColor: COR.linhaSuave, backgroundColor: COR.elevado } as any,
  capa: { width: 132, height: 132, flexShrink: 0 },
  mosaico: { width: 132, height: 132, flexShrink: 0, flexDirection: 'row', flexWrap: 'wrap', borderRadius: RAIO.cartao, overflow: 'hidden' },
  quarto: { width: '50%', height: '50%' },
  texto: { flex: 1, minWidth: 0, gap: 3 },
  etiqueta: { ...TIPO.micro, color: COR.textoFraco },
  titulo: { fontFamily: FONT.display, fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: COR.texto, marginTop: 2 },
  legenda: { ...TIPO.corpo, color: COR.textoMedio },
  progresso: { height: 3, borderRadius: 2, backgroundColor: COR.linha, marginTop: ESP.sm, marginBottom: ESP.md, overflow: 'hidden' },
  progressoCheio: { height: '100%', borderRadius: 2, backgroundColor: COR.texto },
});
