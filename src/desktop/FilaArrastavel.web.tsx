import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { Track } from '../types';
import { comecouAArrastar, deslize, indiceAlvo } from '../lib/reorder';
import { styles } from './estilos.web';
import { COR, ESP } from './tokens.web';
import { Artwork, formatTime, ui } from './ui.web';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { EstrelaInteligente } from '../components/BrilhoInteligente';
import { trackKey } from '../lib/shuffle';
import { usePlayer } from '../state/player';

/**
 * A fila do Now Playing, reordenável a arrastar.
 *
 * **Porque não é o arrastar do HTML.** Era o que estava aqui (`draggable`,
 * `dataTransfer`) e não pegava: o `<img>` da capa começa o seu próprio arrasto
 * de imagem e rouba o gesto, e o `onDrop` só chega quando o cursor larga
 * exatamente por cima de outra linha. Além disso a API do HTML não deixa
 * mostrar o que quer que seja enquanto se arrasta — dá um fantasma
 * semitransparente do browser e mais nada.
 *
 * Com eventos de ponteiro o gesto é nosso: a linha segue o rato, as vizinhas
 * abrem espaço no destino, e o que se vê antes de largar é exatamente o que
 * fica. A garantia disso está no teste (`scripts/test-reorder.ts`), que
 * reconstrói a lista a partir dos deslizes desenhados e a compara com o
 * resultado real nos 25 casos possíveis.
 */

/** Quanto tempo as vizinhas levam a abrir espaço. Curto: é uma resposta ao
 * gesto, não uma animação para se ver. */
const DESLIZE_MS = 160;

type Entrada = { track: Track; index: number };

type Arrasto = {
  deVisivel: number;
  /** Índice na fila real, que é o que a store entende. */
  deReal: number;
  inicioY: number;
  altura: number;
  dy: number;
  /** Só passa a `true` depois do limiar — abaixo dele isto é um clique. */
  ativo: boolean;
};

export function FilaArrastavel({
  entradas,
  podeArrastar,
  aoTocar,
  aoMenu,
  aoMover,
}: {
  entradas: Entrada[];
  /** Num Jam a fila é de todos: não se reordena daqui. */
  podeArrastar: boolean;
  aoTocar: (track: Track) => void;
  /** O índice REAL na fila, para o menu poder tirar a faixa certa. */
  aoMenu: (track: Track, indiceReal: number) => void;
  /**
   * Posições no que se VÊ (o "Up next"), e não índices da fila: com shuffle a
   * ordem vive no percurso, e é o `reordenarProximas` da store que sabe onde
   * mexer -- o mesmo que o iPhone já usava.
   */
  aoMover: (deVisivel: number, paraVisivel: number) => void;
}) {
  const sugeridas = usePlayer((s) => s.sugeridas);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const ref = useRef<Arrasto | null>(null);
  // Depois de arrastar, o `click` ainda chega; sem isto largar a faixa punha-a
  // a tocar.
  const ignorarClique = useRef(false);

  const guardar = useCallback((a: Arrasto | null) => {
    ref.current = a;
    setArrasto(a);
  }, []);

  const alvo = arrasto?.ativo
    ? indiceAlvo(arrasto.deVisivel, arrasto.dy, arrasto.altura, entradas.length)
    : -1;

  // Escape desiste. Um arrasto sem saída é a maneira mais rápida de estragar
  // uma fila sem querer.
  useEffect(() => {
    if (!arrasto?.ativo) return;
    const fugir = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        ignorarClique.current = true;
        guardar(null);
      }
    };
    window.addEventListener('keydown', fugir);
    return () => window.removeEventListener('keydown', fugir);
  }, [arrasto?.ativo, guardar]);

  return (
    <View>
      {entradas.map((entrada, i) => {
        const arrastada = arrasto?.ativo && arrasto.deVisivel === i;
        const desvio = arrasto?.ativo && alvo >= 0 ? deslize(i, arrasto.deVisivel, alvo) : 0;
        const y = arrastada ? arrasto!.dy : desvio * (arrasto?.altura ?? 0);

        return (
          <div
            key={`${entrada.track.source}:${entrada.track.sourceId}:${entrada.index}`}
            className="np-fila-linha"
            onPointerDown={(e: any) => {
              if (!podeArrastar || e.button !== 0) return;
              // Gesto novo comeca sempre limpo. Sem isto, cancelar um arrasto
              // com Escape deixava a bandeira levantada e o clique SEGUINTE era
              // engolido — era preciso clicar duas vezes para tocar uma faixa.
              ignorarClique.current = false;
              // Um pointerId invalido faz o setPointerCapture atirar; nao vale
              // a pena perder o arrasto por causa disso.
              try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
              guardar({
                deVisivel: i,
                deReal: entrada.index,
                inicioY: e.clientY,
                altura: e.currentTarget.offsetHeight || 64,
                dy: 0,
                ativo: false,
              });
            }}
            onPointerMove={(e: any) => {
              const a = ref.current;
              if (!a || a.deVisivel !== i) return;
              const dy = e.clientY - a.inicioY;
              // Abaixo do limiar ainda pode ser um clique — não mexer em nada.
              if (!a.ativo && !comecouAArrastar(dy)) return;
              guardar({ ...a, dy, ativo: true });
            }}
            onPointerUp={(e: any) => {
              const a = ref.current;
              try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {}
              if (!a || a.deVisivel !== i) return;
              if (a.ativo) {
                ignorarClique.current = true;
                const destino = indiceAlvo(a.deVisivel, a.dy, a.altura, entradas.length);
                if (destino !== a.deVisivel) {
                  aoMover(a.deVisivel, destino);
                }
              }
              guardar(null);
            }}
            onPointerCancel={() => {
              ignorarClique.current = !!ref.current?.ativo;
              guardar(null);
            }}
            onClick={() => {
              if (ignorarClique.current) {
                ignorarClique.current = false;
                return;
              }
              aoTocar(entrada.track);
            }}
            onContextMenu={(e: any) => {
              e.preventDefault();
              aoMenu(entrada.track, entrada.index);
            }}
            style={{
              minHeight: 56,
              padding: `0 ${ESP.sm}px`,
              display: 'flex',
              alignItems: 'center',
              gap: `${ESP.md}px`,
              cursor: !podeArrastar ? 'pointer' : arrastada ? 'grabbing' : 'grab',
              userSelect: 'none',
              // O ponteiro tem de continuar a chegar-nos mesmo por cima da
              // capa: sem isto o `<img>` engolia o gesto, que era metade da
              // razao de o arrastar do HTML nunca ter funcionado.
              touchAction: 'none',
              transform: y ? `translateY(${y}px)` : undefined,
              // A linha arrastada segue o rato sem atraso; as outras deslizam.
              transition: arrastada ? 'none' : `transform ${DESLIZE_MS}ms ease`,
              position: 'relative',
              zIndex: arrastada ? 2 : 1,
              borderRadius: 8,
              // A primeira já não vai pintada: com a fila inteira à vista, a
              // linha acesa lia-se como "a que está a tocar", e essa é a capa.
              background: arrastada ? COR.elevado : undefined,
              boxShadow: arrastada ? '0 10px 28px rgba(0,0,0,.55)' : undefined,
            } as any}
          >
            {/* Ao passar o rato a capa mostra o ▶ (tocar esta), como nas
                outras listas. Em CSS (`np-fila-*`): isto é um <div> a sério. */}
            <div className="np-fila-capa">
              <Artwork track={entrada.track} size={40} />
              <span className="np-fila-tocar" aria-hidden="true">
                <Ionicons name="play" size={14} color="#fff" />
              </span>
            </div>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {/* As que vieram do shuffle inteligente ficam marcadas: sem isto
                    a fila enche-se de musicas que nao te lembras de ter posto. */}
                {sugeridas.includes(trackKey(entrada.track)) ? <EstrelaInteligente tamanho={6} /> : null}
                {/* O titulo limpo e o artista, como em todas as listas: aqui
                    aparecia o titulo cru do upload e o canal nao aparecia. */}
                <Text numberOfLines={1} style={[styles.npFilaTitulo, { flex: 1 }]}>{tituloDaFaixa(entrada.track)}</Text>
              </View>
              <Text numberOfLines={1} style={ui.trackSource}>{displayArtist(entrada.track)}</Text>
            </View>
            <Text style={styles.npFilaDuracao}>{formatTime(entrada.track.durationSeconds)}</Text>
            {/* A pega e o "…" só aparecem com o rato em cima (ou arrastada). */}
            {podeArrastar && (
              <span className={arrastada ? 'np-fila-pega np-fila-pega-viva' : 'np-fila-pega'} aria-hidden="true">
                <Ionicons name="reorder-two-outline" size={16} color={arrastada ? COR.texto : COR.textoFraco} />
              </span>
            )}
            <button
              type="button"
              className="np-fila-mais"
              aria-label={`Options for ${tituloDaFaixa(entrada.track)}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); aoMenu(entrada.track, entrada.index); }}
            >
              <Ionicons name="ellipsis-horizontal" size={16} color={COR.textoMedio} />
            </button>
          </div>
        );
      })}
    </View>
  );
}
