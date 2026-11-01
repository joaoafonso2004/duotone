import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { ENTRADA } from '../lib/movimento';
import {
  duracaoEmTexto, fraseDoCalendario, fraseDoTempo, horaEmTexto, LUGARES_DO_LEQUE, tempoGrande, tipoDeOuvinte,
  type ResumoDoMes as Resumo,
} from '../lib/resumoDoMes';

/**
 * As seis páginas do resumo do mês (1/11, `docs/recap-maquete.html`): o mês,
 * o tempo, o artista, a música, o ritmo e o cartaz. Cada uma com uma ideia só
 * e um desenho próprio. A moldura (as barras, os toques, o fundo) é o
 * `ResumoDoMes.tsx`; as contas, o `lib/resumoDoMes.ts`.
 *
 * As coisas entram por ordem (a mola ENTRADA, no driver nativo) e os números
 * contam. Com menos movimento nada voa nem conta: a página aparece pronta.
 */

export type PropsDaPagina = {
  resumo: Resumo;
  /** A cor da página (a da capa dela), para o que se acende. */
  cor: string;
  /** Quanto encolhem as imagens e os números grandes (1 num iPhone grande). */
  escala: number;
  /** A largura útil da página, para a grelha do calendário. */
  largura: number;
  reduzido: boolean;
  pc: boolean;
  aoTocarTop5: () => void;
  aoFechar: () => void;
};

/** Os títulos e as capas limpos, como nas listas: nada de "[Official Video]" nem faixas pretas. */
const titulo = (m: Resumo['musicas'][number]) => tituloDaFaixa({ source: m.source, title: m.titulo, artist: m.artista });
const artista = (m: Resumo['musicas'][number]) => displayArtist({ source: m.source, title: m.titulo, artist: m.artista });
const capa = (uri: string | null) => capaParaLista(uri);

/** "194 h" ou "45 min", para as barras de comparar. */
const horasOuMinutos = (min: number) => (min >= 120 ? `${Math.round(min / 60)} h` : `${min} min`);

/** Entra a subir, pela ordem `i` (110 ms entre cada). */
function Entra({ i, reduzido, style, children }: { i: number; reduzido: boolean; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(reduzido ? 1 : 0)).current;
  useEffect(() => {
    if (reduzido) return;
    const a = Animated.spring(v, { toValue: 1, ...ENTRADA, delay: i * 110 + 120, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [i, reduzido, v]);
  return (
    <Animated.View style={[style, {
      opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
      transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
    }]}>
      {children}
    </Animated.View>
  );
}

/** Um número que conta de zero até `alvo` (1,3 s, a abrandar no fim). */
function Conta({ alvo, reduzido, style }: { alvo: number; reduzido: boolean; style: StyleProp<any> }) {
  const [n, setN] = useState(reduzido ? alvo : 0);
  useEffect(() => {
    if (reduzido) { setN(alvo); return; }
    const v = new Animated.Value(0);
    const id = v.addListener(({ value }) => setN(Math.round(alvo * value)));
    const a = Animated.timing(v, { toValue: 1, duration: 1300, delay: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => { a.stop(); v.removeListener(id); };
  }, [alvo, reduzido]);
  return <Text style={style}>{n.toLocaleString('en')}</Text>;
}

/** Um valor de 0 a 1 que corre uma vez ao montar (no driver nativo). */
function useProgresso(ms: number, reduzido: boolean, atraso = 0): Animated.Value {
  const v = useRef(new Animated.Value(reduzido ? 1 : 0)).current;
  useEffect(() => {
    if (reduzido) return;
    const a = Animated.timing(v, { toValue: 1, duration: ms, delay: atraso, easing: Easing.linear, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [ms, atraso, reduzido, v]);
  return v;
}

/** Uma barra que cresce da esquerda até `fracao` da linha. */
function Barra({ fracao, cor, reduzido, atraso, grossura = 8 }: { fracao: number; cor: string; reduzido: boolean; atraso: number; grossura?: number }) {
  const v = useRef(new Animated.Value(reduzido ? 1 : 0)).current;
  useEffect(() => {
    if (reduzido) return;
    const a = Animated.spring(v, { toValue: 1, ...ENTRADA, delay: atraso, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [atraso, reduzido, v]);
  return (
    <View style={{ height: grossura, flex: 1 }}>
      <Animated.View style={{
        height: grossura, borderRadius: grossura / 2, backgroundColor: cor, width: `${Math.max(2, Math.round(fracao * 100))}%`,
        transformOrigin: 'left', transform: [{ scaleX: v }],
      } as any} />
    </View>
  );
}

function Rotulo({ texto, reduzido }: { texto: string; reduzido: boolean }) {
  return <Entra i={0} reduzido={reduzido}><Text style={e.rotulo}>{texto.toUpperCase()}</Text></Entra>;
}

function Capa({ uri, lado, raio, style }: { uri: string | null; lado: number; raio: number; style?: StyleProp<any> }) {
  const u = capa(uri);
  return u
    ? <Image source={{ uri: u }} contentFit="cover" style={[{ width: lado, height: lado, borderRadius: raio }, style]} />
    : <View style={[{ width: lado, height: lado, borderRadius: raio, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, style]}>
        <Ionicons name="musical-notes" size={Math.round(lado / 3)} color="rgba(255,255,255,0.5)" />
      </View>;
}

// ------------------------------------------------------------------- 0 · o mês

/** As cinco capas do mês num leque: a primeira ao meio e à frente. */
function Leque({ resumo, escala, reduzido }: { resumo: Resumo; escala: number; reduzido: boolean }) {
  const lado = Math.round(170 * escala);
  return (
    <View style={{ height: Math.round(280 * escala), marginTop: 24, alignItems: 'center', justifyContent: 'center' }}>
      {resumo.musicas.slice(0, 5).map((m, j) => {
        const k = LUGARES_DO_LEQUE[j]!;
        return <CapaDoLeque key={m.sourceId} uri={m.capa} lado={lado} k={k} j={j} escala={escala} reduzido={reduzido} />;
      })}
    </View>
  );
}

function CapaDoLeque({ uri, lado, k, j, escala, reduzido }: { uri: string | null; lado: number; k: number; j: number; escala: number; reduzido: boolean }) {
  const v = useRef(new Animated.Value(reduzido ? 1 : 0)).current;
  useEffect(() => {
    if (reduzido) return;
    const a = Animated.spring(v, { toValue: 1, ...ENTRADA, delay: j * 90 + 200, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [j, reduzido, v]);
  return (
    <Animated.View style={{
      position: 'absolute', zIndex: 10 - Math.abs(k), opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
      shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 25, shadowOffset: { width: 0, height: 24 },
      transform: [
        { perspective: 900 },
        { translateX: k * 54 * escala },
        { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) },
        { rotateY: `${k * -16}deg` },
        { rotateZ: `${k * 3}deg` },
        { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1 - Math.abs(k) * 0.08] }) },
      ],
    }}>
      <Capa uri={uri} lado={lado} raio={14} />
    </Animated.View>
  );
}

function PaginaDoMes({ resumo, escala, reduzido, pc }: PropsDaPagina) {
  const t = tempoGrande(resumo.minutos);
  return (
    <View style={e.cheia}>
      <Rotulo texto="Your month in music" reduzido={reduzido} />
      <Leque resumo={resumo} escala={escala} reduzido={reduzido} />
      <Entra i={3} reduzido={reduzido} style={{ marginTop: 'auto' }}>
        <Text style={[e.mes, { fontSize: Math.round(76 * escala), lineHeight: Math.round(72 * escala) }]}>{resumo.nome}</Text>
        <Text style={e.ano}>{resumo.mes.ano}</Text>
      </Entra>
      <Entra i={4} reduzido={reduzido} style={e.linhaDoResumo}>
        <Text style={e.miudo}><Text style={e.forte}>{t.valor}</Text> {t.unidade}</Text>
        <Text style={e.miudo}><Text style={e.forte}>{resumo.escutas.toLocaleString('en')}</Text> songs</Text>
        <Text style={e.miudo}><Text style={e.forte}>{resumo.dias}</Text> {resumo.dias === 1 ? 'day' : 'days'}</Text>
      </Entra>
      <Entra i={5} reduzido={reduzido}>
        <Text style={e.comecar}>{pc ? 'Click or press → to start' : 'Tap to start →'}</Text>
      </Entra>
    </View>
  );
}

// ------------------------------------------------------------------ 1 · o tempo

function Calendario({ resumo, largura, reduzido }: { resumo: Resumo; largura: number; reduzido: boolean }) {
  const entre = 5;
  const lado = Math.floor((largura - 28 - entre * 6) / 7);
  const maximo = Math.max(1, ...resumo.porDia);
  const total = 600 + resumo.diasDoMes * 22 + 500;
  const acende = useProgresso(total, reduzido);
  const celulas: React.ReactNode[] = [];
  for (let i = 0; i < resumo.primeiroDia; i++) celulas.push(<View key={`v${i}`} style={{ width: lado, height: Math.round(lado / 1.35) }} />);
  resumo.porDia.forEach((min, d) => {
    // Um dia sem música fica um contorno: vê-se que faltou.
    const o = min > 0 ? 0.18 + 0.82 * (min / maximo) : 0.07;
    const de = (600 + d * 22) / total, ate = (1100 + d * 22) / total;
    celulas.push(
      <Animated.View key={d} accessibilityLabel={`${d + 1}: ${horasOuMinutos(min)}`} style={{
        width: lado, height: Math.round(lado / 1.35), borderRadius: 4, backgroundColor: '#fff',
        opacity: acende.interpolate({ inputRange: [de, Math.min(1, ate)], outputRange: [0, o], extrapolate: 'clamp' }),
      }} />,
    );
  });
  return (
    <View style={e.cartao}>
      <View style={e.cabDoCartao}>
        <Text style={e.cabTexto}>{resumo.nome.toUpperCase()}</Text>
        <Text style={e.cabTexto}>{fraseDoCalendario(resumo)}</Text>
      </View>
      <View style={[e.grelha, { gap: entre, marginBottom: 6 }]}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => <Text key={i} style={[e.semana, { width: lado }]}>{l}</Text>)}
      </View>
      <View style={[e.grelha, { gap: entre }]}>{celulas}</View>
    </View>
  );
}

function PaginaDoTempo({ resumo, escala, largura, reduzido }: PropsDaPagina) {
  const t = tempoGrande(resumo.minutos);
  const antes = resumo.minutosAntes;
  const maior = Math.max(resumo.minutos, antes ?? 0, 1);
  return (
    <View style={e.cheia}>
      <Rotulo texto="Time listening" reduzido={reduzido} />
      <Entra i={1} reduzido={reduzido}><Text style={e.titulo}>You listened for</Text></Entra>
      <Entra i={2} reduzido={reduzido} style={e.numero}>
        <Conta alvo={Number(t.valor)} reduzido={reduzido} style={[e.numeroGrande, { fontSize: Math.round(124 * escala), lineHeight: Math.round(128 * escala) }]} />
        <Text style={e.unidade}>{t.unidade}</Text>
      </Entra>
      <Entra i={3} reduzido={reduzido}><Text style={e.frase}>{fraseDoTempo(resumo)}</Text></Entra>
      <Entra i={4} reduzido={reduzido} style={{ marginTop: 22 }}>
        <Calendario resumo={resumo} largura={largura} reduzido={reduzido} />
      </Entra>
      {antes !== null ? (
        <Entra i={5} reduzido={reduzido} style={{ marginTop: 16, gap: 8 }}>
          <View style={e.comparar}>
            <Text style={e.compararNome}>{resumo.nomeAntes}</Text>
            <Barra fracao={antes / maior} cor="rgba(255,255,255,0.35)" reduzido={reduzido} atraso={900} />
            <Text style={e.compararValor}>{horasOuMinutos(antes)}</Text>
          </View>
          <View style={e.comparar}>
            <Text style={e.compararNome}>{resumo.nome.slice(0, 3)}</Text>
            <Barra fracao={resumo.minutos / maior} cor="#fff" reduzido={reduzido} atraso={900} />
            <Text style={e.compararValor}>{horasOuMinutos(resumo.minutos)}</Text>
          </View>
        </Entra>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- 2 · o artista

/** Um anel na cor do artista a girar devagar à volta da foto (parado com menos movimento). */
function Anel({ lado, cor, reduzido }: { lado: number; cor: string; reduzido: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduzido) return;
    const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [reduzido, v]);
  const fora = lado + 24;
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', left: -12, top: -12, width: fora, height: fora, borderRadius: fora / 2, borderWidth: 3,
      borderTopColor: cor, borderRightColor: 'transparent', borderBottomColor: cor, borderLeftColor: 'transparent', opacity: 0.9,
      transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
    }} />
  );
}

function PaginaDoArtista({ resumo, cor, escala, reduzido }: PropsDaPagina) {
  const [topo, ...resto] = resumo.artistas;
  if (!topo) return null;
  const lado = Math.round(210 * escala);
  return (
    <View style={e.cheia}>
      <Rotulo texto="Your top artist" reduzido={reduzido} />
      <Entra i={1} reduzido={reduzido} style={{ alignSelf: 'center', marginTop: 22, width: lado, height: lado }}>
        <Anel lado={lado} cor={cor} reduzido={reduzido} />
        <Capa uri={topo.capa} lado={lado} raio={lado / 2} />
      </Entra>
      <Entra i={2} reduzido={reduzido}>
        <Text numberOfLines={2} style={[e.nomeGrande, { marginTop: 24 }]}>{topo.nome}</Text>
      </Entra>
      <Entra i={3} reduzido={reduzido}>
        <Text style={e.meta}>{`${topo.escutas.toLocaleString('en')} plays · ${topo.parte}% of your month`}</Text>
      </Entra>
      <View style={{ marginTop: 20, gap: 11 }}>
        {resto.map((a, i) => (
          <Entra key={a.nome} i={i + 4} reduzido={reduzido} style={e.linhaDoTop}>
            <Text style={e.posicao}>{i + 2}</Text>
            <Capa uri={a.capa} lado={30} raio={15} />
            <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
              <Text numberOfLines={1} style={e.nomeDoTop}>{a.nome}</Text>
              <View style={{ flexDirection: 'row' }}>
                <Barra fracao={a.escutas / topo.escutas} cor="rgba(255,255,255,0.4)" reduzido={reduzido} atraso={(i + 4) * 110 + 300} grossura={3} />
              </View>
            </View>
            <Text style={e.contagem}>{a.escutas}</Text>
          </Entra>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- 3 · a música

/** A capa a flutuar em 3D, devagar, como a do leitor (parada com menos movimento). */
function CapaQueFlutua({ uri, lado, reduzido }: { uri: string | null; lado: number; reduzido: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduzido) return;
    const ida = Animated.timing(v, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
    const volta = Animated.timing(v, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
    const a = Animated.loop(Animated.sequence([ida, volta]));
    a.start();
    return () => a.stop();
  }, [reduzido, v]);
  return (
    <Animated.View style={{
      alignSelf: 'center', shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 30 },
      transform: [
        { perspective: 900 },
        { rotateX: v.interpolate({ inputRange: [0, 1], outputRange: ['6deg', '-4deg'] }) },
        { rotateY: v.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '10deg'] }) },
      ],
    }}>
      <Capa uri={uri} lado={lado} raio={16} />
    </Animated.View>
  );
}

function PaginaDaMusica({ resumo, escala, reduzido, aoTocarTop5 }: PropsDaPagina) {
  const [topo, ...resto] = resumo.musicas;
  if (!topo) return null;
  return (
    <View style={e.cheia}>
      <Rotulo texto="Song of the month" reduzido={reduzido} />
      <Entra i={1} reduzido={reduzido} style={{ marginTop: 16 }}>
        <CapaQueFlutua uri={topo.capa} lado={Math.round(220 * escala)} reduzido={reduzido} />
      </Entra>
      <Entra i={2} reduzido={reduzido}>
        <Text numberOfLines={2} style={[e.nomeGrande, { fontSize: Math.round(40 * escala), lineHeight: Math.round(42 * escala), marginTop: 22 }]}>{titulo(topo)}</Text>
      </Entra>
      <Entra i={3} reduzido={reduzido}><Text numberOfLines={1} style={e.meta}>{artista(topo)}</Text></Entra>
      <Entra i={4} reduzido={reduzido} style={e.pilula}>
        <Text style={e.pilulaTexto}>
          {topo.minutos > 0 ? `${topo.escutas} plays · about ${duracaoEmTexto(topo.minutos)} of it` : `${topo.escutas} plays`}
        </Text>
      </Entra>
      <View style={{ marginTop: 16, gap: 9 }}>
        {resto.map((m, i) => (
          <Entra key={m.sourceId} i={i + 5} reduzido={reduzido} style={e.linhaDoTop}>
            <Text style={[e.posicao, { width: 16 }]}>{i + 2}</Text>
            <Capa uri={m.capa} lado={38} raio={8} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={e.nomeDaMusica}>{titulo(m)}</Text>
              <Text numberOfLines={1} style={e.artistaDaMusica}>{artista(m)}</Text>
            </View>
            <Text style={e.contagem}>{m.escutas}</Text>
          </Entra>
        ))}
      </View>
      <Entra i={9} reduzido={reduzido} style={{ marginTop: 'auto', alignSelf: 'flex-start' }}>
        <Pressable accessibilityRole="button" onPress={aoTocarTop5}
          style={({ pressed }) => [e.botaoBranco, pressed && { transform: [{ scale: 0.96 }] }]}>
          <Ionicons name="play" size={15} color="#0A0A0F" />
          <Text style={e.botaoBrancoTexto}>Play your top 5</Text>
        </Pressable>
      </Entra>
    </View>
  );
}

// ----------------------------------------------------------------- 4 · o ritmo

/** O relógio de 24 horas: uma barra por hora, do tamanho das escutas, e a de pico acesa. */
function Relogio({ resumo, lado, reduzido }: { resumo: Resumo; lado: number; reduzido: boolean }) {
  const cx = lado / 2;
  const r0 = lado * 0.248;
  const comprimento = lado * 0.2;
  const maximo = Math.max(1, ...resumo.porHora);
  const total = 300 + 24 * 28 + 700;
  const cresce = useProgresso(total, reduzido);
  return (
    <View style={{ width: lado, height: lado, alignSelf: 'center', marginTop: 18 }}>
      <View style={{ position: 'absolute', left: cx - r0 + 8, top: cx - r0 + 8, width: (r0 - 8) * 2, height: (r0 - 8) * 2, borderRadius: r0, backgroundColor: 'rgba(0,0,0,0.25)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }} />
      {resumo.porHora.map((n, h) => {
        const pico = h === resumo.hora;
        const len = 8 + comprimento * (n / maximo);
        const grossura = pico ? 7 : 5;
        const de = (300 + h * 28) / total, ate = Math.min(1, (1000 + h * 28) / total);
        return (
          <Animated.View key={h} style={{
            position: 'absolute', left: cx - len / 2, top: cx - grossura / 2, width: len, height: grossura, borderRadius: grossura / 2,
            backgroundColor: pico ? '#fff' : 'rgba(255,255,255,0.38)',
            transform: [
              { rotate: `${(h / 24) * 360 - 90}deg` },
              { translateX: cresce.interpolate({ inputRange: [de, ate], outputRange: [r0, r0 + len / 2], extrapolate: 'clamp' }) },
              { scaleX: cresce.interpolate({ inputRange: [de, ate], outputRange: [0.01, 1], extrapolate: 'clamp' }) },
            ],
          }} />
        );
      })}
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={e.horaDoPico}>{resumo.hora !== null ? horaEmTexto(resumo.hora) : '—'}</Text>
        <Text style={e.horaDoPicoLegenda}>your peak hour</Text>
      </View>
    </View>
  );
}

function PaginaDoRitmo({ resumo, escala, reduzido }: PropsDaPagina) {
  const hora = resumo.hora;
  const segundo = resumo.novos > 0
    ? { valor: resumo.novos, texto: resumo.novos === 1 ? 'new artist' : 'new artists', icone: 'sparkles' as const }
    : { valor: resumo.dias, texto: resumo.dias === 1 ? 'day with music' : 'days with music', icone: 'calendar' as const };
  return (
    <View style={e.cheia}>
      <Rotulo texto="Your rhythm" reduzido={reduzido} />
      <Entra i={1} reduzido={reduzido}><Relogio resumo={resumo} lado={Math.round(250 * escala)} reduzido={reduzido} /></Entra>
      {hora !== null ? (
        <Entra i={2} reduzido={reduzido} style={{ marginTop: 20 }}>
          <Text style={e.tipo}>{tipoDeOuvinte(hora)}</Text>
          <Text style={e.tipoLegenda}>{`Most of your music played around ${horaEmTexto(hora)}.`}</Text>
        </Entra>
      ) : null}
      <View style={e.ladrilhos}>
        <Entra i={3} reduzido={reduzido} style={e.ladrilho}>
          <Text style={e.ladrilhoNumero}>{resumo.seguidos}</Text>
          <View style={e.ladrilhoLinha}><Ionicons name="flame" size={15} color="#fff" /><Text style={e.ladrilhoTexto}>{resumo.seguidos === 1 ? 'day in a row' : 'days in a row'}</Text></View>
        </Entra>
        <Entra i={4} reduzido={reduzido} style={e.ladrilho}>
          <Text style={e.ladrilhoNumero}>{segundo.valor.toLocaleString('en')}</Text>
          <View style={e.ladrilhoLinha}><Ionicons name={segundo.icone} size={15} color="#fff" /><Text style={e.ladrilhoTexto}>{segundo.texto}</Text></View>
        </Entra>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- 5 · o cartaz

function PaginaDoCartaz({ resumo, reduzido, aoFechar }: PropsDaPagina) {
  const t = tempoGrande(resumo.minutos);
  const musica = resumo.musicas[0];
  const celulas: [string, string][] = [
    [t.unidade === 'hours' ? 'Hours' : 'Minutes', t.valor],
    ['Songs', resumo.escutas.toLocaleString('en')],
    ['Top artist', resumo.artistas[0]?.nome ?? '—'],
    ['Top song', musica ? titulo(musica) : '—'],
    ['Streak', `${resumo.seguidos} ${resumo.seguidos === 1 ? 'day' : 'days'}`],
    resumo.novos > 0 ? ['New artists', resumo.novos.toLocaleString('en')] : ['Days', `${resumo.dias}`],
  ];
  return (
    <View style={e.cheia}>
      <Rotulo texto={`That was ${resumo.nome}`} reduzido={reduzido} />
      <Entra i={1} reduzido={reduzido} style={[e.cartaz, { marginVertical: 'auto' }]}>
        <View style={e.cartazCab}>
          <Text style={e.cartazTitulo}>{`${resumo.nome} ${resumo.mes.ano}`}</Text>
          <Text style={e.cartazMarca}>DUOTONE</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginVertical: 16 }}>
          {resumo.musicas.slice(0, 5).map((m) => (
            <View key={m.sourceId} style={{ flex: 1, aspectRatio: 1, borderRadius: 8, overflow: 'hidden' }}>
              {capa(m.capa) ? <Image source={{ uri: capa(m.capa)! }} contentFit="cover" style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />}
            </View>
          ))}
        </View>
        <View style={e.cartazGrelha}>
          {celulas.map(([rotulo, valor]) => (
            <View key={rotulo} style={{ width: '48%' }}>
              <Text style={e.cartazRotulo}>{rotulo.toUpperCase()}</Text>
              <Text numberOfLines={1} style={e.cartazValor}>{valor}</Text>
            </View>
          ))}
        </View>
      </Entra>
      <Entra i={3} reduzido={reduzido}>
        <Pressable accessibilityRole="button" onPress={aoFechar}
          style={({ pressed }) => [e.botaoBranco, { alignSelf: 'stretch', justifyContent: 'center', height: 48, borderRadius: 24 }, pressed && { transform: [{ scale: 0.97 }] }]}>
          <Text style={[e.botaoBrancoTexto, { fontSize: 16 }]}>Done</Text>
        </Pressable>
      </Entra>
    </View>
  );
}

export const PAGINAS_DO_RESUMO = [PaginaDoMes, PaginaDoTempo, PaginaDoArtista, PaginaDaMusica, PaginaDoRitmo, PaginaDoCartaz];

const e = StyleSheet.create({
  cheia: { flex: 1 },
  rotulo: { fontSize: 12, fontWeight: '700', letterSpacing: 2.2, color: 'rgba(255,255,255,0.72)' },
  mes: { fontWeight: '800', letterSpacing: -3.5, color: '#fff' },
  ano: { fontSize: 26, fontWeight: '600', letterSpacing: -0.5, color: 'rgba(255,255,255,0.7)', marginTop: 10 },
  linhaDoResumo: { flexDirection: 'row', gap: 16, marginTop: 18 },
  miudo: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  forte: { fontWeight: '800', color: '#fff' },
  comecar: { marginTop: 22, fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  titulo: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: '#fff', marginTop: 14 },
  numero: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 4 },
  numeroGrande: { fontWeight: '800', letterSpacing: -6, color: '#fff', fontVariant: ['tabular-nums'] },
  unidade: { fontSize: 28, fontWeight: '700', color: '#fff' },
  frase: { fontSize: 17, color: 'rgba(255,255,255,0.82)', marginTop: 6 },
  cartao: { padding: 14, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.28)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  cabDoCartao: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cabTexto: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  grelha: { flexDirection: 'row', flexWrap: 'wrap' },
  semana: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
  comparar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  compararNome: { width: 30, fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  compararValor: { minWidth: 54, textAlign: 'right', fontSize: 13, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
  nomeGrande: { fontSize: 44, lineHeight: 46, fontWeight: '800', letterSpacing: -1.8, color: '#fff' },
  meta: { fontSize: 15, color: 'rgba(255,255,255,0.8)', marginTop: 8 },
  linhaDoTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  posicao: { width: 18, fontSize: 15, fontWeight: '800', color: 'rgba(255,255,255,0.55)', fontVariant: ['tabular-nums'] },
  nomeDoTop: { fontSize: 16, fontWeight: '700', color: '#fff' },
  contagem: { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontVariant: ['tabular-nums'] },
  pilula: { alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  pilulaTexto: { fontSize: 14, fontWeight: '700', color: '#fff' },
  nomeDaMusica: { fontSize: 15, fontWeight: '700', color: '#fff' },
  artistaDaMusica: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.62)' },
  botaoBranco: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 20, borderRadius: 23, backgroundColor: '#fff' },
  botaoBrancoTexto: { fontSize: 15, fontWeight: '700', color: '#0A0A0F' },
  horaDoPico: { fontSize: 30, fontWeight: '800', letterSpacing: -1, color: '#fff' },
  horaDoPicoLegenda: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  tipo: { fontSize: 30, lineHeight: 33, fontWeight: '800', letterSpacing: -1, color: '#fff' },
  tipoLegenda: { fontSize: 15, fontWeight: '500', color: 'rgba(255,255,255,0.75)', marginTop: 6 },
  ladrilhos: { flexDirection: 'row', gap: 10, marginTop: 20 },
  ladrilho: { flex: 1, padding: 14, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.28)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  ladrilhoNumero: { fontSize: 34, fontWeight: '800', letterSpacing: -1, color: '#fff', fontVariant: ['tabular-nums'] },
  ladrilhoLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  ladrilhoTexto: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  cartaz: { borderRadius: 24, padding: 20, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 30, shadowOffset: { width: 0, height: 30 } },
  cartazCab: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cartazTitulo: { fontSize: 30, fontWeight: '800', letterSpacing: -1.2, color: '#fff' },
  cartazMarca: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: 'rgba(255,255,255,0.6)' },
  cartazGrelha: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  cartazRotulo: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: 'rgba(255,255,255,0.6)' },
  cartazValor: { fontSize: 26, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6, color: '#fff', marginTop: 4 },
});
