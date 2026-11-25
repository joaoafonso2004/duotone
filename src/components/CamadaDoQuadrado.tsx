import { Image } from 'expo-image';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { ENTRADA } from '../lib/movimento';
import {
  alvoSemCapa, duracaoDaMola, ESPERA_MAXIMA_MS, momentoDeAbrir, ouvirVoos, TAPAR_MS, TROCA_MS, VEU_MAXIMO,
  vooDaCapa, vooDaCor, type CapaDoVoo, type FormaDoQuadrado, type Retangulo,
} from '../lib/vooDoQuadrado';
import { pedirFluidez } from '../state/fluidez';
import { dadosDoVoo, mudarFase, ouvirMudancasDoVoo, type DestinoDaCapa } from '../state/vooDoQuadrado';
import { colors } from '../theme';
import { alturaDaCapaDoArtista } from './SeccoesDoArtista';
import { ArtworkCollage } from './ArtworkCollage';

type VooNoEcra = {
  id: string;
  modo: 'entrar' | 'voltar';
  de: Retangulo;
  raio: number;
  forma: FormaDoQuadrado;
  capa: CapaDoVoo | null;
  alvo: Retangulo;
  /** A capa não tem onde pousar (uma pasta, uma mistura): apaga-se no título. */
  apaga: boolean;
};

/** Onde a capa vai pousar antes de a página dizer onde está a dela (`AlvoDoVoo`). */
function alvoPrevisto(destino: DestinoDaCapa, ecra: { width: number }, topo: number): Retangulo {
  if (destino === 'larga') return { x: 0, y: 0, width: ecra.width, height: alturaDaCapaDoArtista(ecra.width) };
  if (destino === 'centro') {
    const lado = Math.min(240, Math.round(ecra.width * 0.52));
    return { x: (ecra.width - lado) / 2, y: topo + 60, width: lado, height: lado };
  }
  return alvoSemCapa(ecra, topo);
}

/**
 * A camada do "entrar pelo quadrado" (24/11, `lib/vooDoQuadrado.ts`): por cima das
 * páginas e por baixo da base. A cor da página cresce do cartão até tapar o ecrã, a
 * capa voa para o topo da página, e a página nova abre por baixo quando a cor já
 * tapa tudo. Ao pousar, a camada apaga-se e a página acende ao mesmo tempo.
 *
 * Só `transform` e opacidade, no driver nativo, com a mola de entrada e a fluidez
 * pedida (120 Hz). Com menos movimento não há voo: a página abre como sempre.
 */
export function CamadaDoQuadrado() {
  const ecra = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduzido = useReducedMotion();
  const [voo, setVoo] = useState<VooNoEcra | null>(null);
  const p = useRef(new Animated.Value(0)).current;
  const camada = useRef(new Animated.Value(1)).current;
  const atual = useRef<{ id: string; pousou: boolean; trocou: boolean; temporizadores: ReturnType<typeof setTimeout>[] } | null>(null);
  const contexto = useRef({ ecra, topo: insets.top, reduzido });
  contexto.current = { ecra, topo: insets.top, reduzido };
  /**
   * A animação a arrancar quando a camada do voo já está desenhada (25/11). Era um
   * `requestAnimationFrame` depois do `setVoo`: mais um fotograma parado entre o
   * toque e o voo. Num efeito de layout da camada, as vistas animadas (filhas) já
   * se ligaram ao driver nativo, e a mola começa antes de o ecrã se pintar.
   */
  const arrancar = useRef<{ id: string; modo: VooNoEcra['modo']; f: () => void } | null>(null);
  useLayoutEffect(() => {
    const a = arrancar.current;
    if (!a || !voo || voo.id !== a.id || voo.modo !== a.modo) return;
    arrancar.current = null;
    a.f();
  }, [voo]);

  useEffect(() => {
    const limpar = () => {
      for (const t of atual.current?.temporizadores ?? []) clearTimeout(t);
      atual.current = null;
    };
    const depois = (ms: number, f: () => void) => { atual.current?.temporizadores.push(setTimeout(f, ms)); };

    /** A troca: a camada apaga-se e a página acende (a `PaginaDoQuadrado` ouve a fase). */
    const trocar = (id: string) => {
      const a = atual.current;
      if (!a || a.id !== id || a.trocou) return;
      a.trocou = true;
      mudarFase(id, 'aberta');
      Animated.timing(camada, { toValue: 0, duration: TROCA_MS, useNativeDriver: true }).start(() => {
        if (atual.current?.id === id) { limpar(); setVoo(null); }
      });
    };
    /** Pousou e a página já existe (e já disse onde é a capa dela, ou não tem): troca. */
    const tentarTrocar = (id: string) => {
      const a = atual.current, d = dadosDoVoo(id);
      if (!a || a.id !== id || !a.pousou || !d?.paginaPronta) return;
      if (d.alvo || d.destino === 'titulo') trocar(id);
      else depois(150, () => trocar(id));
    };

    const pararDeOuvir = ouvirMudancasDoVoo((id) => {
      const d = dadosDoVoo(id);
      if (!d || atual.current?.id !== id) return;
      if (d.alvo && d.destino !== 'titulo') {
        const alvo = d.alvo;
        setVoo((v) => (v && v.id === id && v.modo === 'entrar' ? { ...v, alvo } : v));
      }
      tentarTrocar(id);
    });

    const pararDeDesenhar = ouvirVoos((pedido) => {
      const { ecra: e, topo, reduzido: calmo } = contexto.current;
      if (pedido.tipo === 'entrar') {
        const d = dadosDoVoo(pedido.id);
        if (calmo || !d) return false;
        limpar();
        atual.current = { id: pedido.id, pousou: false, trocou: false, temporizadores: [] };
        p.stopAnimation(); p.setValue(0);
        camada.stopAnimation(); camada.setValue(1);
        setVoo({
          id: pedido.id, modo: 'entrar', de: d.de, raio: d.raio, forma: d.forma, capa: d.capa,
          alvo: alvoPrevisto(d.destino, e, topo), apaga: d.destino === 'titulo',
        });
        const duracao = duracaoDaMola();
        pedirFluidez(duracao + 400);
        // A mola começa quando a camada já existe, no mesmo desenho (`arrancar`).
        arrancar.current = { id: pedido.id, modo: 'entrar', f: () => Animated.spring(p, { toValue: 1, ...ENTRADA, useNativeDriver: true }).start() };
        depois(momentoDeAbrir(d.de, e, d.forma, d.raio) + 16, pedido.navegar);
        depois(duracao, () => { if (atual.current?.id === pedido.id) { atual.current.pousou = true; tentarTrocar(pedido.id); } });
        // Se a página nunca disser nada, aparece na mesma.
        depois(ESPERA_MAXIMA_MS, () => trocar(pedido.id));
        return true;
      }

      // Voltar: a cor tapa a página, a página sai por baixo, e a cor encolhe até ao cartão.
      const d = dadosDoVoo(pedido.id);
      if (calmo || !d) return false;
      limpar();
      atual.current = { id: pedido.id, pousou: true, trocou: true, temporizadores: [] };
      mudarFase(pedido.id, 'a-voltar');
      const acabar = () => { if (atual.current?.id === pedido.id) { limpar(); setVoo(null); mudarFase(pedido.id, null); } };
      void (d.medirAlvo ? d.medirAlvo() : Promise.resolve(null)).then((alvoAgora) => {
        // A capa só volta se ainda estiver à vista (a lista pode tê-la levado para cima).
        const visivel = alvoAgora && alvoAgora.y + alvoAgora.height > 0 && alvoAgora.y < e.height;
        p.stopAnimation(); p.setValue(1);
        camada.stopAnimation(); camada.setValue(0);
        setVoo({
          id: pedido.id, modo: 'voltar', de: d.de, raio: d.raio, forma: d.forma,
          capa: visivel ? d.capa : null, alvo: visivel ? alvoAgora! : alvoPrevisto(d.destino, e, topo), apaga: false,
        });
        pedirFluidez(TAPAR_MS + duracaoDaMola() + 400);
        arrancar.current = { id: pedido.id, modo: 'voltar', f: () => {
          Animated.timing(camada, { toValue: 1, duration: TAPAR_MS, useNativeDriver: true }).start(() => {
            if (atual.current?.id !== pedido.id) return;
            pedido.sair();
            // Encolhe JÁ para o cartão de onde saiu (a medida da entrada), e não
            // depois de dois fotogramas e de medir outra vez: era o atraso a voltar.
            // A página de trás volta à janela no fotograma seguinte; se o cartão
            // mudou de sítio (a lista rolou), o alvo acerta-se a meio.
            Animated.spring(p, { toValue: 0, ...ENTRADA, useNativeDriver: true }).start(({ finished }) => { if (finished) acabar(); });
            requestAnimationFrame(() => {
              void d.medirDe().then((de) => {
                if (atual.current?.id !== pedido.id) return;
                if (!de) {
                  p.stopAnimation();
                  Animated.timing(camada, { toValue: 0, duration: TROCA_MS, useNativeDriver: true }).start(acabar);
                  return;
                }
                const mexeu = Math.abs(de.x - d.de.x) > 2 || Math.abs(de.y - d.de.y) > 2 || Math.abs(de.width - d.de.width) > 2;
                if (mexeu) setVoo((v) => (v && v.id === pedido.id ? { ...v, de } : v));
              });
            });
          });
        } };
      });
      return true;
    });

    return () => { pararDeDesenhar(); pararDeOuvir(); limpar(); };
  }, [camada, p]);

  if (!voo) return null;
  const cor = vooDaCor(voo.de, ecra, voo.forma);
  const capa = vooDaCapa(voo.de, voo.alvo);
  const lado = voo.de.width;
  const entre = (fim: number) => p.interpolate({ inputRange: [0, 1], outputRange: [0, fim] });
  return (
    // Por cima das páginas, apanha os toques durante o voo: um segundo toque não abre outra.
    <Animated.View pointerEvents="auto" style={[StyleSheet.absoluteFill, { opacity: camada }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.veu, {
        opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0, VEU_MAXIMO], extrapolate: 'clamp' }),
      }]} />
      {/* A cor acende no começo: sem isto o cartão virava de repente um quadrado escuro. */}
      <Animated.View pointerEvents="none" style={[styles.cor, {
        left: voo.de.x, top: voo.de.y, width: lado, height: lado, borderRadius: voo.raio,
        opacity: p.interpolate({ inputRange: [0, 0.12], outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [{ translateX: entre(cor.dx) }, { translateY: entre(cor.dy) },
          { scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, cor.escala] }) }],
      }]} />
      {voo.capa ? (
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', left: voo.de.x, top: voo.de.y, width: lado, height: lado,
          borderRadius: voo.raio, overflow: 'hidden',
          opacity: voo.apaga ? p.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 1, 0], extrapolate: 'clamp' }) : 1,
          transform: [{ translateX: entre(capa.dx) }, { translateY: entre(capa.dy) },
            { scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, capa.escala] }) }],
        }}>
          {voo.capa.forma === 'circulo'
            ? <Image source={{ uri: capaParaLista(voo.capa.capas[0]) ?? voo.capa.capas[0] }} style={{ width: lado, height: lado }} contentFit="cover" />
            : <ArtworkCollage artworks={[...voo.capa.capas]} size={lado} />}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veu: { backgroundColor: '#000' },
  cor: { position: 'absolute', backgroundColor: colors.bg },
});
