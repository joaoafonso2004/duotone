import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { MENU_DO_RADIO } from '../lib/menuDoRadio';
import { COR, FONT } from '../desktop/tokens.web';
import { marcar } from '../desktop/ui.web';
import { pausarAtalhosDaJanela } from '../desktop/useAtalhosDaJanela.web';
import type { TipoDeRadio } from '../state/player';

// Sem tipos instalados para o react-dom; só se usa o portal.
const { createPortal } = require('react-dom') as { createPortal: (filho: React.ReactNode, onde: Element) => React.ReactElement };

export type AncoraDoMenuDoRadio = { x: number; y: number; width: number; height: number };

const LARGURA = 248;
const ALTURA_DO_TITULO = 32;
const ALTURA_DA_LINHA = 52;
const PADDING = 6;
const ALTURA = PADDING * 2 + ALTURA_DO_TITULO + ALTURA_DA_LINHA * MENU_DO_RADIO.opcoes.length;
const MARGEM = 12;
const AFASTAMENTO = 8;
const FUNDO = '#18181F';
const MOLA = 'cubic-bezier(.3,1.28,.45,1)';
const SUAVE = 'cubic-bezier(.2,.8,.2,1)';

/**
 * O menu do Radio no PC (18/10, variante A de `docs/radio-menu-animacao.html`):
 * a pastilha estica-se e transforma-se no menu (a forma anima posição, tamanho,
 * cantos e cor), e depois entram as linhas. Ao escolher, o menu encolhe de
 * volta para dentro da pastilha. As mesmas regras do `MenuDeContexto`: fecha
 * com um clique fora, Esc, a janela a perder o foco ou a mudar de tamanho, e
 * os atalhos da janela ficam parados enquanto está aberto. Sem desfoque (o PC
 * não usa desfoque de fundo). Quem pediu menos movimento vê só aparecer.
 */
export function MenuDoRadio({ ancora, visivel, capa, capasDoMix, aoEscolher, aoFechar }: {
  ancora: AncoraDoMenuDoRadio | null;
  visivel: boolean;
  capa: string | null;
  capasDoMix: readonly string[];
  aoEscolher: (tipo: TipoDeRadio) => void;
  aoFechar: () => void;
}) {
  const [montado, setMontado] = useState(false);
  const ultima = useRef(ancora);
  if (ancora) ultima.current = ancora;
  const veu = useRef<HTMLDivElement | null>(null);
  const forma = useRef<HTMLDivElement | null>(null);
  const partes = useRef<(HTMLElement | null)[]>([]);
  const escolha = useRef<TipoDeRadio | null>(null);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  const escolher = useRef(aoEscolher);
  escolher.current = aoEscolher;
  const mostrar = visivel && !!ancora;

  useEffect(() => { if (mostrar) { escolha.current = null; setMontado(true); } }, [mostrar]);

  // Enquanto está aberto: atalhos parados, e as maneiras de fechar.
  useEffect(() => {
    if (!mostrar) return;
    pausarAtalhosDaJanela(true);
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); fechar.current(); } };
    const sair = () => fechar.current();
    window.addEventListener('keydown', tecla, true);
    window.addEventListener('blur', sair);
    window.addEventListener('resize', sair);
    return () => {
      pausarAtalhosDaJanela(false);
      window.removeEventListener('keydown', tecla, true);
      window.removeEventListener('blur', sair);
      window.removeEventListener('resize', sair);
    };
  }, [mostrar]);

  const a = ultima.current;
  const janela = typeof window === 'undefined' ? { w: 1280, h: 800 } : { w: window.innerWidth, h: window.innerHeight };
  const esquerda = a ? Math.min(Math.max(MARGEM, a.x + a.width - LARGURA), janela.w - LARGURA - MARGEM) : 0;
  const cabeEmBaixo = a ? a.y + a.height + AFASTAMENTO + ALTURA <= janela.h - MARGEM : true;
  const topo = a ? (cabeEmBaixo ? a.y + a.height + AFASTAMENTO : Math.max(MARGEM, a.y - AFASTAMENTO - ALTURA)) : 0;
  const reduzido = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Abrir: a forma nasce da pastilha; as linhas entram depois.
  useLayoutEffect(() => {
    if (!montado || !mostrar || !a || !forma.current) return;
    const naPastilha = { left: `${a.x}px`, top: `${a.y}px`, width: `${a.width}px`, height: `${a.height}px`, borderRadius: `${a.height / 2}px`, backgroundColor: 'rgba(233,234,238,0.16)' };
    const noMenu = { left: `${esquerda}px`, top: `${topo}px`, width: `${LARGURA}px`, height: `${ALTURA}px`, borderRadius: '14px', backgroundColor: FUNDO };
    if (reduzido) return;
    veu.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'backwards' });
    forma.current.animate([naPastilha, noMenu], { duration: 460, easing: MOLA, fill: 'backwards' });
    partes.current.forEach((p, i) => p?.animate(
      [{ opacity: 0, transform: 'translateY(-6px) scale(.98)' }, { opacity: 1, transform: 'none' }],
      { duration: 280, delay: 150 + i * 55, easing: SUAVE, fill: 'backwards' },
    ));
    // Só quando monta: a posição é a da abertura.
  }, [montado, mostrar]);

  // Fechar: escolheu -> volta para dentro da pastilha; senão sai depressa.
  useEffect(() => {
    if (mostrar || !montado) return;
    let ativo = true;
    const acabar = () => {
      if (!ativo) return;
      setMontado(false);
      const tipo = escolha.current;
      escolha.current = null;
      if (tipo) escolher.current(tipo);
    };
    if (reduzido || !forma.current || !a) { acabar(); return; }
    const escolheu = !!escolha.current;
    partes.current.forEach((p) => p?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, fill: 'forwards' }));
    veu.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: escolheu ? 300 : 170, fill: 'forwards' });
    const noMenu = { left: `${esquerda}px`, top: `${topo}px`, width: `${LARGURA}px`, height: `${ALTURA}px`, borderRadius: '14px', backgroundColor: FUNDO, opacity: 1 };
    const saida = escolheu
      ? forma.current.animate([noMenu, { ...noMenu, offset: 0.2 },
        { left: `${a.x}px`, top: `${a.y}px`, width: `${a.width}px`, height: `${a.height}px`, borderRadius: `${a.height / 2}px`, backgroundColor: 'rgba(233,234,238,0.16)', opacity: 0 }],
      { duration: 360, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' })
      : forma.current.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
    saida.finished.then(acabar, acabar);
    // Desmontar SEMPRE: a saída é decoração.
    const seguranca = setTimeout(acabar, 600);
    return () => { ativo = false; clearTimeout(seguranca); };
  }, [mostrar, montado]);

  if (!montado || !a) return null;
  const parte = (i: number) => (n: any) => { partes.current[i] = n as HTMLElement | null; };

  return createPortal(
    <>
      <div ref={veu} onMouseDown={() => fechar.current()}
        style={{ position: 'fixed', inset: 0, zIndex: 298, background: 'rgba(0,0,0,.28)' }} />
      <div ref={forma} style={{
        position: 'fixed', zIndex: 299, left: esquerda, top: topo, width: LARGURA, height: ALTURA, borderRadius: 14,
        background: FUNDO, border: '1px solid #33333C', boxShadow: '0 16px 40px rgba(0,0,0,.55)', pointerEvents: 'none',
      }} />
      <View accessibilityRole={'menu' as any} accessibilityLabel="Radio"
        style={{ position: 'fixed', zIndex: 300, left: esquerda, top: topo, width: LARGURA, height: ALTURA, padding: PADDING } as any}>
        <Text ref={parte(0)} numberOfLines={1} style={{
          height: ALTURA_DO_TITULO, paddingHorizontal: 10, paddingTop: 7, fontFamily: FONT.body, fontSize: 12, color: COR.textoMedio,
        }}>{MENU_DO_RADIO.titulo}</Text>
        {MENU_DO_RADIO.opcoes.map((o, i) => (
          <View key={o.tipo} ref={parte(i + 1)}>
            <Pressable accessibilityRole={'menuitem' as any} accessibilityLabel={o.rotulo} {...marcar('menu-linha')}
              onPress={() => { if (!mostrar) return; escolha.current = o.tipo; fechar.current(); }}
              style={{ height: ALTURA_DA_LINHA - 4, marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, borderRadius: 9 } as any}>
              {o.tipo === 'musica'
                ? <Image source={capa ? { uri: capa } : undefined} style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: COR.elevado }} />
                : <QuadradoDoMix capas={capasDoMix} />}
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONT.body, fontSize: 13.5, fontWeight: '600', color: COR.texto }}>{o.rotulo}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </>,
    document.body,
  );
}

function QuadradoDoMix({ capas }: { capas: readonly string[] }) {
  if (!capas.length) {
    return <View style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: COR.elevado, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="shuffle" size={18} color={COR.texto} />
    </View>;
  }
  return <View style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap', backgroundColor: COR.elevado }}>
    {[0, 1, 2, 3].map((i) => <Image key={i} source={{ uri: capas[i % capas.length] }} style={{ width: 18, height: 18 }} />)}
  </View>;
}
