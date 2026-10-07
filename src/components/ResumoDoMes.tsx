import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lerReproducoes } from '../api/listeningStats';
import {
  calcularResumoDoMes, chaveDoMes, horaEmTexto, inicioDaLeitura, mesAnterior, mostrarResumo, tempoGrande,
  type ResumoDoMes as Resumo,
} from '../lib/resumoDoMes';
import { getResumoVistoEm, setResumoVistoEm } from '../lib/prefs';
import { useAbertura } from '../state/abertura';
import { useAuth } from '../state/auth';
import { useTheme } from '../state/theme';
import { colors } from '../theme';
import { DentroDeUmModal } from './dentroDeUmModal';

/** Quanto fica cada página antes de passar sozinha. */
export const DURACAO_DA_PAGINA_MS = 6500;
export const PAGINAS = 3;

/**
 * "O teu mês" (7/10): três páginas como uma story do Instagram, por cima de
 * tudo, na primeira abertura do mês (nos primeiros sete dias). Substituiu o
 * cartaz de sexta-feira.
 *
 * Toque à direita avança, à esquerda volta; premir pausa; passa sozinha ao fim
 * de `DURACAO_DA_PAGINA_MS`. O X fecha. No PC é um cartão 9:16 ao centro da
 * janela. As contas vivem em lib/resumoDoMes.ts.
 *
 * Marca-se como visto ao MOSTRAR (a regra do cartaz que substituiu): mudar de
 * separador ou reabrir a app não o traz outra vez. Um mês sem música que chegue
 * (`MINIMO_DE_ESCUTAS`) não mostra nada.
 */
export function ResumoDoMes() {
  const sessao = useAuth((s) => s.session);
  const tapado = useAbertura((s) => s.aFrente);
  const [resumo, setResumo] = useState<Resumo | null>(null);

  useEffect(() => {
    if (!sessao) return;
    let vivo = true;
    void (async () => {
      const agora = new Date();
      const visto = await getResumoVistoEm().catch(() => null);
      if (!vivo || !mostrarResumo(agora, visto)) return;
      const { rows, unavailable } = await lerReproducoes(inicioDaLeitura(agora));
      if (!vivo || unavailable) return;
      const mes = mesAnterior(agora);
      const r = calcularResumoDoMes(rows, mes);
      void setResumoVistoEm(chaveDoMes(mes)).catch(() => {});
      if (r) setResumo(r);
    })();
    return () => { vivo = false; };
  }, [sessao]);

  if (!resumo || tapado) return null;
  return <Story resumo={resumo} aoFechar={() => setResumo(null)} />;
}

function Story({ resumo, aoFechar }: { resumo: Resumo; aoFechar: () => void }) {
  const tema = useTheme((s) => s.theme);
  const safe = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const largura = web ? Math.min(440, width - 32, (height - 48) * 9 / 16) : width;
  const altura = web ? largura * 16 / 9 : height;
  const [pagina, setPagina] = useState(0);
  const progresso = useRef(new Animated.Value(0)).current;
  const animacao = useRef<Animated.CompositeAnimation | null>(null);

  const avancar = useCallback(() => {
    setPagina((p) => {
      if (p >= PAGINAS - 1) { aoFechar(); return p; }
      return p + 1;
    });
  }, [aoFechar]);
  const correr = useCallback((desde: number) => {
    animacao.current?.stop();
    progresso.setValue(desde);
    animacao.current = Animated.timing(progresso, {
      toValue: 1, duration: Math.max(0, (1 - desde) * DURACAO_DA_PAGINA_MS), easing: Easing.linear, useNativeDriver: true,
    });
    animacao.current.start(({ finished }) => { if (finished) avancar(); });
  }, [progresso, avancar]);
  useEffect(() => { correr(0); return () => animacao.current?.stop(); }, [pagina, correr]);

  const pausar = () => animacao.current?.stop();
  const retomar = () => progresso.stopAnimation((v) => correr(v));
  const tocar = (x: number) => {
    if (x < largura / 3) setPagina((p) => Math.max(0, p - 1));
    else avancar();
  };

  const capa = pagina === 1 ? resumo.artistas[0]?.capa : resumo.musicas[0]?.capa;
  // A largura de cada barrinha: a fila tem 12 de margem de cada lado, o X (36) e 12 entre eles, e 4 entre barras.
  const larguraDaBarra = Math.max(1, (largura - 24 - 36 - 12 - 4 * (PAGINAS - 1)) / PAGINAS);
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={aoFechar}>
      <DentroDeUmModal.Provider value>
      <View style={estilos.fora}>
        <View style={{ width: largura, height: altura, overflow: 'hidden', borderRadius: web ? 22 : 0, backgroundColor: colors.bg }}>
          {capa ? <Image source={{ uri: capa }} contentFit="cover" blurRadius={50} style={[StyleSheet.absoluteFill, { opacity: 0.7, transform: [{ scale: 1.2 }] }]} /> : null}
          <LinearGradient colors={[`${tema.color}66`, 'rgba(10,10,15,0.55)', 'rgba(10,10,15,0.92)']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />

          <Pressable accessibilityRole="button" accessibilityLabel="Next" style={StyleSheet.absoluteFill}
            onPressIn={pausar} onPressOut={retomar} onPress={(e) => tocar(e.nativeEvent.locationX)}>
            <View style={[estilos.conteudo, { paddingTop: (web ? 28 : safe.top + 28), paddingBottom: (web ? 28 : safe.bottom + 28) }]}>
              {pagina === 0 && <PaginaDoTempo resumo={resumo} cor={tema.color} />}
              {pagina === 1 && <PaginaDoArtista resumo={resumo} />}
              {pagina === 2 && <PaginaDaMusica resumo={resumo} />}
            </View>
          </Pressable>

          <View pointerEvents="box-none" style={[estilos.topo, { top: web ? 12 : safe.top + 6 }]}>
            <View style={estilos.barras} pointerEvents="none">
              {Array.from({ length: PAGINAS }, (_, i) => (
                <View key={i} style={estilos.barra}>
                  <Animated.View style={[estilos.cheio, { width: larguraDaBarra,
                    transform: [{ translateX: i < pagina ? 0 : i === pagina
                      ? progresso.interpolate({ inputRange: [0, 1], outputRange: [-larguraDaBarra, 0] }) : -larguraDaBarra }],
                  }]} />
                </View>
              ))}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={aoFechar} style={estilos.fechar}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>
      </DentroDeUmModal.Provider>
    </Modal>
  );
}

function Rotulo({ texto }: { texto: string }) {
  return <Text style={estilos.rotulo}>{texto.toUpperCase()}</Text>;
}

function PaginaDoTempo({ resumo, cor }: { resumo: Resumo; cor: string }) {
  const t = tempoGrande(resumo.minutos);
  const subiu = (resumo.variacao ?? 0) >= 0;
  return (
    <View style={estilos.pagina}>
      <Rotulo texto={`Your ${resumo.nome}`} />
      <Text style={estilos.titulo}>You listened for</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <Text style={estilos.aprox}>≈</Text>
        <Text style={estilos.numeroGrande}>{t.valor}</Text>
        <Text style={estilos.unidade}>{t.unidade}</Text>
      </View>
      <Text style={estilos.linha}>{`${resumo.escutas.toLocaleString()} songs · on ${resumo.dias} ${resumo.dias === 1 ? 'day' : 'days'}`}</Text>
      {resumo.variacao !== null && resumo.variacao !== 0 ? (
        <View style={[estilos.pastilha, { borderColor: cor }]}>
          <Ionicons name={subiu ? 'trending-up' : 'trending-down'} size={16} color="#fff" />
          <Text style={estilos.pastilhaTexto}>{`${Math.abs(resumo.variacao)}% ${subiu ? 'more' : 'less'} than the month before`}</Text>
        </View>
      ) : null}
    </View>
  );
}

function PaginaDoArtista({ resumo }: { resumo: Resumo }) {
  const [topo, ...resto] = resumo.artistas;
  if (!topo) return null;
  return (
    <View style={estilos.pagina}>
      <Rotulo texto="Your top artist" />
      {topo.capa ? <Image source={{ uri: topo.capa }} contentFit="cover" style={estilos.capaRedonda} /> : null}
      <Text numberOfLines={2} style={estilos.nomeGrande}>{topo.nome}</Text>
      <Text style={estilos.linha}>{`${topo.escutas} plays`}</Text>
      <View style={{ marginTop: 22, gap: 10, alignSelf: 'stretch' }}>
        {resto.map((a, i) => (
          <View key={a.nome} style={estilos.linhaDoTop}>
            <Text style={estilos.posicao}>{i + 2}</Text>
            <Text numberOfLines={1} style={estilos.nomeDoTop}>{a.nome}</Text>
            <Text style={estilos.contagem}>{a.escutas}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PaginaDaMusica({ resumo }: { resumo: Resumo }) {
  const topo = resumo.musicas[0];
  if (!topo) return null;
  const factos = [
    resumo.hora !== null ? { icone: 'time-outline' as const, texto: `Mostly at ${horaEmTexto(resumo.hora)}` } : null,
    resumo.seguidos >= 2 ? { icone: 'flame-outline' as const, texto: `${resumo.seguidos} days in a row` } : null,
    resumo.novos > 0 ? { icone: 'sparkles-outline' as const, texto: `${resumo.novos} new ${resumo.novos === 1 ? 'artist' : 'artists'}` } : null,
  ].filter((f): f is { icone: 'time-outline'; texto: string } => !!f);
  return (
    <View style={estilos.pagina}>
      <Rotulo texto="Song of the month" />
      {topo.capa ? <Image source={{ uri: topo.capa }} contentFit="cover" style={estilos.capaQuadrada} /> : null}
      <Text numberOfLines={2} style={estilos.nomeGrande}>{topo.titulo}</Text>
      {!!topo.artista && <Text numberOfLines={1} style={estilos.linha}>{topo.artista}</Text>}
      <Text style={[estilos.linha, { marginTop: 4 }]}>{`played ${topo.escutas} times`}</Text>
      <View style={{ marginTop: 22, gap: 10, alignSelf: 'stretch' }}>
        {factos.map((f) => (
          <View key={f.texto} style={estilos.facto}>
            <Ionicons name={f.icone} size={18} color="#fff" />
            <Text style={estilos.factoTexto}>{f.texto}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  fora: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
  conteudo: { flex: 1, paddingHorizontal: 28, justifyContent: 'center' },
  topo: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  barras: { flex: 1, flexDirection: 'row', gap: 4 },
  barra: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  // A barra enche por translação (nativa): o branco entra da esquerda numa caixa que o corta.
  cheio: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#fff' },
  fechar: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pagina: { alignItems: 'flex-start' },
  rotulo: { fontSize: 13, fontWeight: '800', letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)', marginBottom: 14 },
  titulo: { fontSize: 26, fontWeight: '700', color: '#fff', letterSpacing: -0.4 },
  aprox: { fontSize: 40, fontWeight: '300', color: 'rgba(255,255,255,0.7)' },
  numeroGrande: { fontSize: 110, lineHeight: 118, fontWeight: '800', color: '#fff', letterSpacing: -4, fontVariant: ['tabular-nums'] },
  unidade: { fontSize: 28, fontWeight: '700', color: '#fff' },
  linha: { fontSize: 17, lineHeight: 23, color: 'rgba(255,255,255,0.85)', marginTop: 8 },
  pastilha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5, backgroundColor: 'rgba(0,0,0,0.25)' },
  pastilhaTexto: { fontSize: 15, fontWeight: '700', color: '#fff' },
  capaRedonda: { width: 190, height: 190, borderRadius: 95, marginBottom: 20, alignSelf: 'center' },
  capaQuadrada: { width: 220, height: 220, borderRadius: 14, borderCurve: 'continuous', marginBottom: 20, alignSelf: 'center' },
  nomeGrande: { fontSize: 38, lineHeight: 44, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  linhaDoTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  posicao: { width: 22, fontSize: 18, fontWeight: '800', color: 'rgba(255,255,255,0.6)', fontVariant: ['tabular-nums'] },
  nomeDoTop: { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff' },
  contagem: { fontSize: 15, color: 'rgba(255,255,255,0.7)', fontVariant: ['tabular-nums'] },
  facto: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)' },
  factoTexto: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
