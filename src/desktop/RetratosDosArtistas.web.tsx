import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useCorDoAmbiente } from '../hooks/useCorDoAmbiente';
import { useFotoDoArtista } from '../hooks/useVizinhancaDoArtista';
import { fotoNoTamanho } from '../lib/catalogo';
import { horasDoArtista, jogadasEmCurto } from '../lib/grelhaDeArtistas';
import type { Track } from '../types';
import { CapaDuotone } from './duotone.web';
import { COR, ESP, FONT, RAIO, TIPO } from './tokens.web';
import { Button, capaDaFaixa, marcar } from './ui.web';

/**
 * Os retratos dos Artists do PC (30/10, passo 4 de `docs/PLANO-ELEVAR-PC.md`;
 * maquete `docs/pc-elevar-maquete.html`): o artista é um disco. O retrato é
 * redondo e a dois tons (a cor volta com o rato no cartão), e por trás dele
 * está um vinil, com a capa de uma música dele no centro, que sai para o lado
 * e roda ao passar o rato. O artista que mais ouves ganha um cartão à frente
 * da grelha.
 *
 * Nada novo vai à rede: a foto é a do catálogo que a grelha já pedia (e que
 * fica no aparelho), e as contas do cartão são da biblioteca e do ranking que a
 * página já lia.
 */

const LADO = 200;

/** A foto do catálogo a 250 px; sem ela, a capa de uma música dele. */
function imagemDoArtista(foto: string | null, faixa: Track | undefined): string | null {
  return foto ? fotoNoTamanho(foto, 250) : faixa ? capaDaFaixa(faixa) : null;
}

/**
 * O retrato de um cartão. `filhos` são o que fica por cima (o ponto de
 * lançamento novo e o coração), em posições do quadrado de 200 px. `aoMontar`
 * entrega o nó DOM do retrato a quem o quiser levar numa viagem (`viajar`).
 */
export function RetratoDoArtista({ nome, faixas, aoMontar, children }: {
  nome: string; faixas: readonly Track[]; aoMontar?: (no: HTMLElement | null) => void; children?: React.ReactNode;
}) {
  const foto = useFotoDoArtista(nome);
  const imagem = imagemDoArtista(foto, faixas[0]);
  // A capa do vinil é de outra música dele, se houver.
  const disco = faixas[1] ? capaDaFaixa(faixas[1]) : faixas[0] ? capaDaFaixa(faixas[0]) : null;
  return <View style={estilos.quadro}>
    <View {...marcar('vinil')} style={estilos.vinil} aria-hidden pointerEvents="none">
      {disco ? <View style={estilos.rotulo}><CapaDuotone uri={disco} viva style={{ borderRadius: 100 }} /></View> : null}
      <View style={estilos.furo} />
    </View>
    <View ref={aoMontar as any} style={estilos.retrato}>
      <CapaDuotone uri={imagem} brilho style={{ borderRadius: LADO / 2 }} />
    </View>
    {children}
  </View>;
}

/**
 * O artista que mais ouves, à frente da grelha: o retrato a cores, as três
 * contas (músicas na biblioteca, horas, reproduções) e três capas em leque. O
 * Play toca as músicas dele da biblioteca; o Open vai à página, com o retrato a
 * viajar.
 */
export function ArtistaEmRepeticao({ nome, faixas, jogadas, aoTocar, aoAbrir, aoMontar }: {
  nome: string; faixas: readonly Track[]; jogadas: number; aoTocar: () => void; aoAbrir: () => void; aoMontar?: (no: HTMLElement | null) => void;
}) {
  const foto = useFotoDoArtista(nome);
  const cor = useCorDoAmbiente(foto);
  const imagem = imagemDoArtista(foto, faixas[0]);
  const leque = faixas.slice(0, 3).map((t) => capaDaFaixa(t)).filter((c): c is string => !!c);
  const fundo = cor ? { backgroundImage: `radial-gradient(90% 150% at 0% 0%, color-mix(in oklab, ${cor} 38%, transparent), transparent 62%)` } : null;
  return <View {...marcar('cartao', 'brilho')} style={[estilos.destaque, fundo as any]}>
    <View ref={aoMontar as any} style={estilos.destaqueRetrato}>
      <CapaDuotone uri={imagem} viva style={{ borderRadius: LADO / 2 }} />
    </View>
    <View style={estilos.destaqueTexto}>
      <Text style={estilos.etiqueta}>Most played</Text>
      <Text numberOfLines={1} style={estilos.nome}>{nome}</Text>
      <View style={estilos.contas}>
        <View><Text style={estilos.numero}>{faixas.length}</Text><Text style={estilos.legenda}>tracks</Text></View>
        <View><Text style={estilos.numero}>{horasDoArtista(faixas)}</Text><Text style={estilos.legenda}>in your library</Text></View>
        <View><Text style={estilos.numero}>{jogadasEmCurto(jogadas)}</Text><Text style={estilos.legenda}>plays</Text></View>
      </View>
      <View style={estilos.botoes}>
        <Button icon="play" onPress={aoTocar}>Play</Button>
        <Button secondary onPress={aoAbrir}>Open artist</Button>
      </View>
    </View>
    {leque.length ? <View style={estilos.leque} aria-hidden pointerEvents="none">
      {leque.map((c, i) => <View key={`${c}:${i}`} style={[estilos.leque1, { transform: [{ rotate: `${(i - 1) * 8}deg` }, { translateY: i === 1 ? 8 : 0 }] } as any]}>
        <CapaDuotone uri={c} style={{ borderRadius: RAIO.cartao }} />
      </View>)}
    </View> : null}
  </View>;
}

const estilos = StyleSheet.create({
  quadro: { width: LADO, height: LADO },
  retrato: { position: 'absolute', left: 0, top: 0, width: LADO, height: LADO, borderRadius: LADO / 2, overflow: 'hidden', zIndex: 2,
    boxShadow: '0 14px 30px rgba(0,0,0,.45)' } as any,
  // O vinil por trás do retrato: um pouco mais pequeno, para só aparecer ao sair.
  vinil: { position: 'absolute', left: 10, top: 10, width: LADO - 20, height: LADO - 20, borderRadius: LADO, zIndex: 1,
    backgroundImage: 'conic-gradient(#0b0b0d, #26262c, #0b0b0d 18%, #1f1f25 32%, #0b0b0d 50%, #2a2a31 68%, #0b0b0d 84%, #26262c, #0b0b0d)',
    boxShadow: '0 8px 20px rgba(0,0,0,.5)', alignItems: 'center', justifyContent: 'center' } as any,
  rotulo: { width: 80, height: 80, borderRadius: 40, overflow: 'hidden' },
  furo: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#060608' },
  destaque: { flexDirection: 'row', alignItems: 'center', gap: ESP.xxl, padding: ESP.xl, marginBottom: ESP.xxl, borderRadius: RAIO.superficie,
    borderWidth: 1, borderColor: COR.linhaSuave, backgroundColor: COR.elevado, overflow: 'hidden' } as any,
  destaqueRetrato: { width: 176, height: 176, flexShrink: 0, borderRadius: 88, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.55)' } as any,
  destaqueTexto: { flex: 1, minWidth: 0, gap: 4 },
  etiqueta: { ...TIPO.micro, color: COR.textoFraco },
  nome: { fontFamily: FONT.display, fontSize: 44, fontWeight: '800', letterSpacing: -1.6, color: COR.texto, lineHeight: 48 },
  contas: { flexDirection: 'row', gap: ESP.xxl, marginTop: ESP.md, marginBottom: ESP.md },
  numero: { fontFamily: FONT.display, fontSize: 22, fontWeight: '800', color: COR.texto },
  legenda: { ...TIPO.micro, color: COR.textoFraco },
  botoes: { flexDirection: 'row', gap: ESP.sm },
  leque: { position: 'absolute', right: 30, top: 24, flexDirection: 'row' },
  leque1: { width: 96, height: 96, marginLeft: -34, borderRadius: RAIO.cartao, overflow: 'hidden', boxShadow: '0 12px 30px rgba(0,0,0,.45)' } as any,
});
