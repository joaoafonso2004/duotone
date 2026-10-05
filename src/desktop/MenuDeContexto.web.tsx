import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { posicaoDoMenu } from '../lib/menuDoAmigo';
import { COR, FONT } from './tokens.web';
import { marcar } from './ui.web';
import { pausarAtalhosDaJanela } from './useAtalhosDaJanela.web';

// Sem tipos instalados para o react-dom; só se usa o portal.
const { createPortal } = require('react-dom') as { createPortal: (filho: React.ReactNode, onde: Element) => React.ReactElement };

export type LinhaDoMenu = {
  id: string;
  rotulo: string;
  /** Nome de um ícone do Ionicons. */
  icone: string;
  perigo?: boolean;
  inicioDeGrupo?: boolean;
  /** Indisponível agora: a linha fica apagada e diz porquê por baixo. */
  motivo?: string | null;
};

export type PontoNoEcra = { x: number; y: number };

/**
 * Onde abrir um menu a partir de um clique: o rato, se o evento o traz; senão
 * o último sítio onde se carregou (`ultimoClique`); sem nenhum, o meio da janela.
 */
let ultimo: PontoNoEcra | null = null;
if (typeof window !== 'undefined') {
  const guardar = (e: MouseEvent) => { ultimo = { x: e.clientX, y: e.clientY }; };
  window.addEventListener('mousedown', guardar, true);
  window.addEventListener('contextmenu', guardar, true);
}
export function ultimoClique(): PontoNoEcra {
  if (ultimo) return ultimo;
  return typeof window === 'undefined' ? { x: 0, y: 0 } : { x: window.innerWidth / 2, y: window.innerHeight / 3 };
}
export function pontoDoEvento(e: any): PontoNoEcra {
  const n = e?.nativeEvent ?? e;
  const x = n?.clientX ?? n?.pageX, y = n?.clientY ?? n?.pageY;
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : ultimoClique();
}

const LARGURA = 280;

/**
 * O menu de contexto do PC (5/10, auditoria de consistência M1): abre onde
 * está o rato, como se espera num desktop. O clique direito numa faixa abria
 * um diálogo ao CENTRO do ecrã ("Track Actions"), longe do cursor; só o menu
 * de um amigo da lateral abria no sítio. Agora são todos este: faixas,
 * playlists, atalhos da lateral e amigos.
 *
 * Fecha com um clique fora, Esc, a roda do rato, ou a janela a perder o foco;
 * as setas, Home e End andam pelas linhas. Enquanto está aberto, os atalhos da
 * janela (espaço, setas) ficam parados. Escolher fecha-o ANTES de executar.
 */
export function MenuDeContexto({ rato, rotulo, cabecalho, linhas, aoEscolher, aoFechar }: {
  rato: PontoNoEcra;
  /** O nome do menu para o leitor de ecrã ("Options for ..."). */
  rotulo: string;
  cabecalho?: React.ReactNode;
  linhas: readonly LinhaDoMenu[];
  aoEscolher: (id: string) => void;
  aoFechar: () => void;
}) {
  const caixa = useRef<any>(null);
  const itens = useRef<any[]>([]);
  const [onde, setOnde] = useState<PontoNoEcra | null>(null);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;

  useEffect(() => {
    pausarAtalhosDaJanela(true);
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains?.(e.target)) fechar.current(); };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); fechar.current(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const lista = itens.current.filter(Boolean);
      if (!lista.length) return;
      const agora = lista.indexOf(document.activeElement);
      const proximo = e.key === 'Home' ? 0 : e.key === 'End' ? lista.length - 1
        : e.key === 'ArrowDown' ? (agora + 1) % lista.length : (agora <= 0 ? lista.length - 1 : agora - 1);
      lista[proximo]?.focus?.();
    };
    const sair = () => fechar.current();
    document.addEventListener('mousedown', fora, true);
    window.addEventListener('keydown', tecla, true);
    window.addEventListener('blur', sair);
    window.addEventListener('resize', sair);
    window.addEventListener('wheel', sair, { passive: true });
    return () => {
      pausarAtalhosDaJanela(false);
      document.removeEventListener('mousedown', fora, true);
      window.removeEventListener('keydown', tecla, true);
      window.removeEventListener('blur', sair);
      window.removeEventListener('resize', sair);
      window.removeEventListener('wheel', sair);
    };
  }, []);

  const virado = onde ? { x: onde.x < rato.x, y: onde.y < rato.y } : { x: false, y: false };
  const disponiveis = linhas.filter((l) => !l.motivo);

  return createPortal(
    <View
      ref={caixa}
      accessibilityRole={'menu' as any}
      accessibilityLabel={rotulo}
      onLayout={(e) => {
        if (onde) return;
        const { width, height } = e.nativeEvent.layout;
        setOnde(posicaoDoMenu(rato, { largura: width, altura: height }, { largura: window.innerWidth, altura: window.innerHeight }));
      }}
      {...(onde ? marcar('menu-amigo') : {})}
      style={{
        position: 'fixed', zIndex: 300, width: LARGURA, left: onde?.x ?? rato.x, top: onde?.y ?? rato.y,
        opacity: onde ? 1 : 0, padding: 6, borderRadius: 14, backgroundColor: '#18181F',
        borderWidth: 1, borderColor: '#33333C', boxShadow: '0 16px 40px rgba(0,0,0,.55)',
        maxHeight: 'calc(100vh - 16px)', overflowY: 'auto',
        transformOrigin: `${virado.y ? 'bottom' : 'top'} ${virado.x ? 'right' : 'left'}`,
      } as any}
    >
      {cabecalho ? <View style={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: 10 }}>{cabecalho}</View> : null}
      {linhas.map((l) => {
        const apagada = !!l.motivo;
        const i = disponiveis.indexOf(l);
        return (
          <React.Fragment key={l.id}>
            {l.inicioDeGrupo ? <View style={{ height: 1, backgroundColor: COR.linhaSuave, marginVertical: 5, marginHorizontal: 6 }} /> : null}
            <Pressable
              ref={apagada ? undefined : (n: any) => { itens.current[i] = n; }}
              accessibilityRole={'menuitem' as any}
              accessibilityState={{ disabled: apagada }}
              disabled={apagada}
              {...(apagada ? {} : marcar('menu-linha'))}
              onPress={() => { fechar.current(); aoEscolher(l.id); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: apagada ? 7 : 9, paddingHorizontal: 10, borderRadius: 9, cursor: apagada ? 'default' : undefined } as any}
            >
              <Ionicons name={l.icone as any} size={17} color={l.perigo ? COR.erro : COR.textoMedio} style={{ opacity: apagada ? 0.4 : 1 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 13.5, color: l.perigo ? COR.erro : COR.texto, opacity: apagada ? 0.4 : 1 }}>{l.rotulo}</Text>
                {l.motivo ? <Text numberOfLines={2} style={{ fontFamily: FONT.body, fontSize: 11, color: COR.textoFraco, marginTop: 2 }}>{l.motivo}</Text> : null}
              </View>
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>,
    document.body,
  );
}
