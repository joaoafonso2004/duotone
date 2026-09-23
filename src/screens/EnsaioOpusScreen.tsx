import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { useVideoPlayer } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { aplicarEqualizadorNativo, aplicarVelocidadeNativa, ligarAudioNativo } from '../../modules/duotone-audio';
import { PillButton } from '../components/PillButton';
import { Screen } from '../components/Screen';
import { APP_VERSION, BUILD_ID } from '../lib/buildInfo';
import {
  duracaoCerta, FICHEIROS_DO_ENSAIO, proximaResposta, textoDoResultado, VERIFICACOES,
  type IdDoEnsaio, type MedicaoDoEnsaio, type ResultadoDoEnsaio,
} from '../lib/ensaioOpus';
import { compensacaoLinear, PERFIS } from '../lib/equalizer';
import { atualizarVelocidadeDoMotor, tocarNaVelocidade } from '../lib/velocidadeDoMotor';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'EnsaioOpus'>;

// Estáticos: o Metro só empacota o que vê num `require` literal.
const FONTES: Record<IdDoEnsaio, number> = {
  'aac-fmp4': require('../../assets/ensaio-opus/aac-fmp4.m4a'),
  'opus-fmp4': require('../../assets/ensaio-opus/opus-fmp4.m4a'),
  'opus-mp4': require('../../assets/ensaio-opus/opus-mp4.m4a'),
  'opus-caf': require('../../assets/ensaio-opus/opus.caf'),
};
const CAF_DO_AFCONVERT = (require('../../assets/ensaio-opus/origem.json') as { caf: string }).caf === 'afconvert';

const FLAT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const BASS = PERFIS.find((p) => p.id === 'bass')?.ganhos ?? FLAT;

/**
 * O ensaio do Opus (lib/ensaioOpus.ts). Interno, só do ramo plano-audio.
 *
 * Toca num expo-video PRÓPRIO, e não no motor da app: com uma faixa a fingir
 * no motor verdadeiro, o ensaio contava escutas, aparecia aos amigos como "a
 * ouvir" e ia para o handoff. Tudo o que o motor faz ao item e que interessa
 * aqui é o mesmo: o ficheiro vem de Documents com o nome e a extensão da cache,
 * o módulo nativo liga-se a este leitor (EQ e varispeed pelo mesmo tap), a
 * velocidade passa pelo mesmo `atualizarVelocidadeDoMotor`, e o ecrã bloqueado
 * é o do expo-video. O crossfade não se ensaia aqui -- são dois destes a
 * tocar ao mesmo tempo, e fica para a entrega 3.
 *
 * A música da app é posta em pausa ao tocar.
 */
export function EnsaioOpusScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const tema = useTheme((s) => s.theme);
  const leitor = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = true;
    p.timeUpdateEventInterval = 0.25;
    p.loop = false;
    p.preservesPitch = false;
    p.showNowPlayingNotification = true;
  });
  const [atual, setAtual] = useState<IdDoEnsaio | null>(null);
  const [resultados, setResultados] = useState<Partial<Record<IdDoEnsaio, ResultadoDoEnsaio>>>({});
  const [posicao, setPosicao] = useState(0);
  const [aTocar, setATocar] = useState(false);
  const [velocidade, setVelocidade] = useState(1);
  const [bass, setBass] = useState(false);
  const [registo, setRegisto] = useState<string[]>([]);
  const pedidoEm = useRef(0);
  const atualRef = useRef<IdDoEnsaio | null>(null);

  const anotar = (linha: string) => {
    const t = pedidoEm.current ? `${Date.now() - pedidoEm.current} ms` : '';
    setRegisto((r) => [...r.slice(-30), `${t} ${linha}`]);
  };
  const medir = (f: (m: MedicaoDoEnsaio) => MedicaoDoEnsaio) => {
    const id = atualRef.current;
    if (!id) return;
    setResultados((r) => {
      const antes = r[id] ?? { medicao: null, respostas: {} };
      const m = antes.medicao ?? { estado: '—', erro: null, duracao: null, msAtePronto: null, fimEm: null };
      return { ...r, [id]: { ...antes, medicao: f(m) } };
    });
  };

  useEffect(() => {
    ligarAudioNativo(leitor);
    const subs = [
      leitor.addListener('statusChange', ({ status, error }) => {
        anotar(`status ${status}${error ? `: ${error.message}` : ''}`);
        medir((m) => ({
          ...m,
          estado: status,
          erro: error?.message ?? m.erro,
          duracao: status === 'readyToPlay' ? leitor.duration : m.duracao,
          msAtePronto: status === 'readyToPlay' && m.msAtePronto === null ? Date.now() - pedidoEm.current : m.msAtePronto,
        }));
      }),
      leitor.addListener('timeUpdate', ({ currentTime }) => setPosicao(currentTime)),
      leitor.addListener('playingChange', ({ isPlaying }) => setATocar(isPlaying)),
      leitor.addListener('playToEnd', () => {
        const fim = leitor.currentTime;
        anotar(`playToEnd at ${fim.toFixed(3)} s`);
        medir((m) => ({ ...m, fimEm: fim }));
      }),
    ];
    return () => {
      for (const s of subs) s.remove();
      leitor.pause();
    };
  }, [leitor]);

  const abrir = async (id: IdDoEnsaio) => {
    usePlayer.getState().pausePlayback();
    atualRef.current = id;
    setAtual(id);
    setPosicao(0);
    setRegisto([]);
    setResultados((r) => ({ ...r, [id]: { medicao: null, respostas: r[id]?.respostas ?? {} } }));
    const f = FICHEIROS_DO_ENSAIO.find((x) => x.id === id)!;
    try {
      // Para Documents, com o nome e a extensão que a cache real teria: o
      // AVPlayer escolhe o leitor também pela extensão do ficheiro.
      const asset = await Asset.fromModule(FONTES[id]).downloadAsync();
      const destino = new File(Paths.document, f.nomeEmDisco);
      new File(asset.localUri ?? asset.uri).copySync(destino, { overwrite: true });
      pedidoEm.current = Date.now();
      anotar(`file ${f.nomeEmDisco} (${destino.size} bytes)`);
      await leitor.replaceAsync({ uri: destino.uri, metadata: { title: `Opus test · ${f.nome}`, artist: 'Duotone' } });
      aplicarEqualizadorNativo(leitor, bass ? BASS : FLAT, compensacaoLinear(bass ? BASS : FLAT));
      tocarNaVelocidade(leitor, velocidade, aplicarVelocidadeNativa);
    } catch (e: any) {
      anotar(`failed to open: ${e?.message ?? e}`);
      medir((m) => ({ ...m, estado: 'error', erro: String(e?.message ?? e) }));
    }
  };

  const mudarVelocidade = (v: number) => {
    setVelocidade(v);
    atualizarVelocidadeDoMotor(leitor, v, aplicarVelocidadeNativa);
    anotar(`speed ${v}×`);
  };
  const mudarEq = () => {
    const ganhos = bass ? FLAT : BASS;
    setBass(!bass);
    aplicarEqualizadorNativo(leitor, ganhos, compensacaoLinear(ganhos));
    anotar(bass ? 'EQ flat' : 'EQ bass boost');
  };
  const irPara = (s: number) => { leitor.currentTime = s; anotar(`seek ${s} s`); };

  const responder = (id: IdDoEnsaio, v: (typeof VERIFICACOES)[number]['id']) => {
    setResultados((r) => {
      const antes = r[id] ?? { medicao: null, respostas: {} };
      return { ...r, [id]: { ...antes, respostas: { ...antes.respostas, [v]: proximaResposta(antes.respostas[v]) } } };
    });
  };

  const partilhar = () => {
    void Share.share({
      message: textoDoResultado({
        ios: String(Platform.Version), build: BUILD_ID, versao: APP_VERSION,
        cafDoAfconvert: CAF_DO_AFCONVERT, resultados,
      }),
    }).catch(() => {});
  };

  const r = atual ? resultados[atual] : undefined;
  const certa = duracaoCerta(r?.medicao?.duracao ?? null);

  return (
    <Screen title="Opus test" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: insets.bottom + MINI_PLAYER_HEIGHT + spacing.xxl }}>
        <Text style={[type.caption, { lineHeight: 18 }]}>
          Does iOS play Opus? Each file is the same 30 s sound: a short high beep at the start, a pulse every second whose
          pitch rises every 5 s, and three beeps at the very end. Play each one to the end, lock the screen once, tick
          what you heard, then share the result. Your music is paused while testing.
        </Text>

        {FICHEIROS_DO_ENSAIO.map((f) => {
          const semCaf = f.id === 'opus-caf' && !CAF_DO_AFCONVERT;
          const escolhido = atual === f.id;
          return (
            <Pressable
              key={f.id}
              disabled={semCaf}
              onPress={() => void abrir(f.id)}
              style={[styles.cartao, escolhido && { borderColor: tema.color }, semCaf && { opacity: 0.4 }]}
            >
              <Text style={[type.body, { fontWeight: '700' }]}>{f.nome}</Text>
              <Text style={type.caption}>{semCaf ? 'Not in this build: afconvert did not write it.' : f.explicacao}</Text>
            </Pressable>
          );
        })}

        {atual ? (
          <View style={styles.cartao}>
            <Text style={[type.body, { fontWeight: '700' }]}>
              {FICHEIROS_DO_ENSAIO.find((x) => x.id === atual)!.nome} · {posicao.toFixed(1)} s
            </Text>
            <Text style={type.caption}>
              Status: {r?.medicao?.estado ?? '—'}
              {r?.medicao?.erro ? ` · ${r.medicao.erro}` : ''}
            </Text>
            <Text style={[type.caption, certa === false && { color: colors.danger }]}>
              Duration read: {r?.medicao?.duracao != null ? `${r.medicao.duracao.toFixed(3)} s` : '—'}
              {certa === null ? '' : certa ? ' · ok' : ' · WRONG (should be 30)'}
            </Text>

            <View style={styles.fila}>
              <PillButton small label={aTocar ? 'Pause' : 'Play'} onPress={() => (aTocar ? leitor.pause() : leitor.play())} />
              <PillButton small variant="ghost" label="0 s" onPress={() => irPara(0)} />
              <PillButton small variant="ghost" label="12 s" onPress={() => irPara(12)} />
              <PillButton small variant="ghost" label="27 s" onPress={() => irPara(27)} />
            </View>
            <View style={styles.fila}>
              {[0.5, 1, 2].map((v) => (
                <PillButton key={v} small variant={velocidade === v ? 'primary' : 'ghost'} label={`${v}×`} onPress={() => mudarVelocidade(v)} />
              ))}
              <PillButton small variant={bass ? 'primary' : 'ghost'} label="Bass boost" onPress={mudarEq} />
            </View>

            {VERIFICACOES.map((v) => {
              const resposta = r?.respostas[v.id];
              return (
                <Pressable key={v.id} onPress={() => responder(atual, v.id)} style={styles.verificacao}>
                  <Text style={[styles.marca, resposta === 'sim' && { color: tema.color }, resposta === 'nao' && { color: colors.danger }]}>
                    {resposta === 'sim' ? 'YES' : resposta === 'nao' ? 'NO' : '—'}
                  </Text>
                  <Text style={[type.caption, { flex: 1 }]}>{v.texto}</Text>
                </Pressable>
              );
            })}

            <Text style={[type.micro, { color: colors.textTertiary }]}>{registo.join('\n')}</Text>
          </View>
        ) : null}

        <PillButton label="Share result" onPress={partilhar} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cartao: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 6,
  },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  verificacao: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  marca: { width: 36, fontSize: 12, fontWeight: '800', color: colors.textTertiary },
});
