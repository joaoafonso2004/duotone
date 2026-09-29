import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Modal, Pressable, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { displayArtist, tituloNoLeitor } from '../lib/artistName';
import { COR_DO_FUNDO, COR_DO_VEU, geometriaDoCartao, TAMANHO_DA_STORY, VEU_DO_CARTAO } from '../lib/cartaoDaStory';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { capaComBarras, molduraSemBarras } from '../lib/modoLimpo';
import { capaGrande, marcarSemCapaGrande, ouvirCapasGrandes } from '../state/capasGrandes';
import { colors, spacing } from '../theme';
import type { Track } from '../types';
import { PillButton } from './PillButton';

const FUNDO = require('../../assets/login_bg.png');
const LOGO = require('../../assets/auth-logo.png');

/**
 * O cartão das Stories no iPhone (29/9, opção A de `docs/cartao-stories.html`;
 * medidas em `lib/cartaoDaStory.ts`, as mesmas do canvas do PC).
 *
 * O cartão desenha-se com vistas, à vista de quem o vai partilhar, e o
 * `react-native-view-shot` fotografa-o a 1080x1920. O "Share" só acende com a
 * capa carregada: fotografado antes, saía um quadrado vazio. Vai pela folha de
 * partilha, onde está o Instagram (Story) e o "Save Image".
 */
export function CartaoDaStory({ visivel, faixa, aoFechar }: {
  visivel: boolean; faixa: Track | null; aoFechar: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cartao = useRef<View>(null);
  const [capaPronta, setCapaPronta] = useState(false);
  const [fundoPronto, setFundoPronto] = useState(false);
  const [aPartilhar, setAPartilhar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fonte = useSyncExternalStore(ouvirCapasGrandes, () => (faixa ? capaGrande(faixa) : null));

  useEffect(() => { setErro(null); }, [faixa?.sourceId, visivel]);
  useEffect(() => { setCapaPronta(false); }, [fonte]);

  if (!faixa) return null;
  // O maior cartão que cabe, com espaço para o botão por baixo.
  const L = Math.floor(Math.min(width - spacing.xl * 2, ((height - insets.top - insets.bottom - 150) * 9) / 16));
  const g = geometriaDoCartao(L);
  const barras = capaComBarras(fonte);
  const moldura = barras ? molduraSemBarras(g.capa.lado) : null;
  const titulo = tituloNoLeitor(faixa);
  const artista = displayArtist(faixa);

  const partilhar = async () => {
    if (!cartao.current || aPartilhar) return;
    setAPartilhar(true);
    setErro(null);
    try {
      const uri = await captureRef(cartao, {
        format: 'png', quality: 1, result: 'tmpfile',
        width: TAMANHO_DA_STORY.largura, height: TAMANHO_DA_STORY.altura,
      });
      hapticNotification();
      await Share.share({ url: uri });
    } catch {
      setErro('Could not create the image.');
    } finally {
      setAPartilhar(false);
    }
  };

  const veu = VEU_DO_CARTAO.map(({ opacidade }) => `rgba(${COR_DO_VEU.r},${COR_DO_VEU.g},${COR_DO_VEU.b},${opacidade})`);

  return (
    <Modal visible={visivel} animationType="fade" presentationStyle="overFullScreen" transparent onRequestClose={aoFechar}>
      <View style={[styles.ecra, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
        <Pressable onPress={() => { hapticSelection(); aoFechar(); }} hitSlop={12} accessibilityRole="button"
          accessibilityLabel="Close" style={[styles.fechar, { top: insets.top + spacing.sm }]}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>

        <View style={styles.meio}>
          {/* Os cantos redondos são só da pré-visualização: a vista fotografada
              é a de dentro, e a imagem sai retangular como uma Story. */}
          <View style={{ borderRadius: 18, overflow: 'hidden' }}>
          <View ref={cartao} collapsable={false}
            style={{ width: g.largura, height: g.altura, backgroundColor: COR_DO_FUNDO, overflow: 'hidden' }}>
            {/* O fundo da app, o símbolo em cima; sangra para fora do cartão
                para o desfoque não deixar uma moldura clara nas bordas. */}
            <Image source={FUNDO} blurRadius={Math.round(g.fundo.desfoque)} contentFit="cover" contentPosition="top"
              onLoad={() => setFundoPronto(true)}
              style={{ position: 'absolute', left: g.fundo.x, top: g.fundo.y, width: g.fundo.largura, height: g.fundo.altura, opacity: g.fundo.brilho }} />
            <LinearGradient colors={veu as [string, string, ...string[]]} locations={VEU_DO_CARTAO.map((v) => v.em) as [number, number, ...number[]]}
              style={StyleSheet.absoluteFill} pointerEvents="none" />

            <View style={{
              position: 'absolute', left: g.capa.x, top: g.capa.y, width: g.capa.lado, height: g.capa.lado,
              borderRadius: g.capa.raio, backgroundColor: '#15151a',
              shadowColor: '#000', shadowOpacity: g.capa.sombraOpacidade, shadowRadius: g.capa.sombraDesfoque / 2,
              shadowOffset: { width: 0, height: g.capa.sombraY },
            }}>
              <View style={{ flex: 1, borderRadius: g.capa.raio, overflow: 'hidden' }}>
                {fonte ? (
                  <Image source={{ uri: fonte }} contentFit="cover" cachePolicy="memory-disk"
                    onLoad={() => setCapaPronta(true)}
                    onError={() => {
                      // Sem a maxres: marca-se (o leitor aprende também) e vem a
                      // de recurso. Sem nenhuma, partilha-se o cartão sem capa.
                      if (fonte.includes('maxresdefault')) marcarSemCapaGrande(faixa.sourceId);
                      else setCapaPronta(true);
                    }}
                    style={moldura
                      ? { position: 'absolute', left: moldura.esquerda, top: moldura.topo, width: moldura.largura, height: moldura.altura }
                      : StyleSheet.absoluteFill} />
                ) : null}
              </View>
            </View>

            <View style={{ position: 'absolute', left: g.titulo.margem, right: g.titulo.margem, top: g.titulo.topo, alignItems: 'center' }}>
              <Text numberOfLines={g.titulo.linhas} allowFontScaling={false}
                style={{ color: colors.text, fontSize: g.titulo.tamanho, lineHeight: g.titulo.alturaDaLinha, fontWeight: '700', textAlign: 'center', letterSpacing: -0.01 * g.titulo.tamanho }}>
                {titulo}
              </Text>
              <Text numberOfLines={1} allowFontScaling={false}
                style={{ marginTop: g.artista.espaco, color: `rgba(245,245,247,${g.artista.opacidade})`, fontSize: g.artista.tamanho, textAlign: 'center' }}>
                {artista}
              </Text>
            </View>

            <View style={{ position: 'absolute', left: 0, right: 0, top: g.marca.base - g.marca.logo, height: g.marca.logo,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: g.marca.espaco, opacity: g.marca.opacidade }}>
              <Image source={LOGO} style={{ width: g.marca.logo, height: g.marca.logo }} contentFit="contain" />
              <Text allowFontScaling={false}
                style={{ color: colors.text, fontSize: g.marca.tamanho, fontWeight: '600', letterSpacing: g.marca.espacamento }}>
                DUOTONE
              </Text>
            </View>
          </View>
          </View>
        </View>

        {erro ? <Text style={styles.erro}>{erro}</Text> : null}
        <PillButton label={aPartilhar ? 'Preparing…' : 'Share'} onPress={() => void partilhar()}
          loading={aPartilhar} disabled={!capaPronta || !fundoPronto || aPartilhar}
          style={{ alignSelf: 'center', minWidth: 180 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ecra: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', paddingHorizontal: spacing.xl, gap: spacing.lg },
  meio: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fechar: { position: 'absolute', right: spacing.lg, zIndex: 2, padding: 4 },
  erro: { color: colors.textSecondary, textAlign: 'center', fontSize: 13 },
});
