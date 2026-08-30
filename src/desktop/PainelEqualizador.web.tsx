import React, { useCallback, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  BANDAS, GANHO_MAXIMO, normalizar, perfilDe, PERFIS, PLANO, type Ganhos,
} from '../lib/equalizer';
import { BarraVelocidade } from './BarraVelocidade.web';
import { COR, ESP, RAIO, TIPO } from './tokens.web';
import { ui } from './ui.web';

/**
 * O painel do equalizador: perfis, dez bandas e a velocidade.
 *
 * Os deslizadores são VERTICAIS como em qualquer equalizador gráfico — é a
 * forma que diz "isto é uma curva de frequências" antes de se ler uma única
 * etiqueta. Um EQ em linhas horizontais lê-se como uma lista de definições.
 *
 * O que o painel NÃO faz é fingir. Quando o grafo não pega (sem faixa a tocar,
 * ou o iframe ainda a montar) diz-se isso em cima, em vez de mostrar
 * deslizadores bonitos que não mexem no som.
 */

const ALTURA = 132;

function DeslizadorVertical({
  valor,
  etiqueta,
  aoMudar,
}: {
  valor: number;
  etiqueta: string;
  aoMudar: (v: number) => void;
}) {
  const trilho = useRef<any>(null);

  const daPosicao = useCallback((clientY: number) => {
    const el = trilho.current;
    if (!el?.getBoundingClientRect) return;
    const r = el.getBoundingClientRect();
    if (!r.height) return;
    // Em cima é +12, em baixo é −12.
    const f = 1 - (clientY - r.top) / r.height;
    aoMudar(Math.round((f * 2 - 1) * GANHO_MAXIMO * 2) / 2);
  }, [aoMudar]);

  const arrastar = useCallback((e: any) => {
    e.preventDefault?.();
    trilho.current = e.currentTarget;
    const mover = (ev: any) => {
      const y = ev.clientY ?? ev.touches?.[0]?.clientY;
      if (typeof y === 'number') daPosicao(y);
    };
    mover(e);
    const largar = () => {
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', largar);
    };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', largar);
  }, [daPosicao]);

  // 0 no topo, 1 em baixo.
  const fraccao = 1 - (valor + GANHO_MAXIMO) / (GANHO_MAXIMO * 2);

  return (
    <View style={{ alignItems: 'center', gap: ESP.xs, flex: 1 }}>
      <Text style={[TIPO.numero, { color: valor === 0 ? COR.textoFraco : COR.texto, fontSize: 10 }]}>
        {valor > 0 ? `+${valor}` : String(valor)}
      </Text>
      <div
        role="slider"
        aria-label={`${etiqueta} hertz`}
        aria-valuemin={-GANHO_MAXIMO}
        aria-valuemax={GANHO_MAXIMO}
        aria-valuenow={valor}
        tabIndex={0}
        onKeyDown={(e: any) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); aoMudar(Math.min(GANHO_MAXIMO, valor + 0.5)); }
          if (e.key === 'ArrowDown') { e.preventDefault(); aoMudar(Math.max(-GANHO_MAXIMO, valor - 0.5)); }
        }}
        onDoubleClick={() => aoMudar(0)}
        onMouseDown={arrastar}
        style={{
          height: ALTURA,
          width: 26,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'ns-resize',
          position: 'relative',
          touchAction: 'none',
        } as any}
      >
        {/* O trilho. A linha do meio marca o zero — sem ela não se vê onde é
            que a banda está neutra. */}
        <div style={{ width: 3, height: '100%', background: COR.elevado, borderRadius: 999 } as any} />
        <div style={{
          position: 'absolute', left: 4, right: 4, top: '50%',
          height: 1, background: COR.linha,
        } as any} />
        {/* O preenchimento vai do meio até ao valor: um EQ mostra o DESVIO ao
            neutro, não um nível a contar de baixo. */}
        <div style={{
          position: 'absolute',
          width: 3,
          left: '50%', marginLeft: -1.5,
          background: valor === 0 ? 'transparent' : COR.texto,
          top: valor > 0 ? `${fraccao * 100}%` : '50%',
          height: `${Math.abs(fraccao - 0.5) * 100}%`,
          borderRadius: 999,
        } as any} />
        <div style={{
          position: 'absolute',
          left: '50%', marginLeft: -6,
          top: `calc(${fraccao * 100}% - 6px)`,
          width: 12, height: 12, borderRadius: 999,
          background: COR.texto,
          boxShadow: '0 2px 6px rgba(0,0,0,.5)',
        } as any} />
      </div>
      <Text style={[TIPO.micro, { color: COR.textoFraco }]}>{etiqueta}</Text>
    </View>
  );
}

export function PainelEqualizador({
  ganhos,
  aoMudarGanhos,
  rate,
  aoMudarRate,
  activo,
  lembrado,
}: {
  ganhos: Ganhos;
  aoMudarGanhos: (g: Ganhos) => void;
  rate: number;
  aoMudarRate: (v: number) => void;
  /** O grafo pegou mesmo? */
  activo: boolean;
  /** Esta faixa tem ajuste guardado? */
  lembrado: boolean;
}) {
  const g = normalizar(ganhos);
  const perfil = perfilDe(g);

  return (
    <View style={{ gap: ESP.xl }}>
      <View style={{ gap: ESP.sm }}>
        <Text style={ui.eyebrow}>SPEED</Text>
        <BarraVelocidade valor={rate} aoMudar={aoMudarRate} />
      </View>

      <View style={{ gap: ESP.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={ui.eyebrow}>EQUALISER</Text>
          {/* Dizer a verdade em vez de mostrar deslizadores que nao mexem. */}
          {!activo && <Text style={[TIPO.micro, { color: COR.textoFraco }]}>WAITING FOR PLAYBACK</Text>}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: ESP.xs }}>
          {PERFIS.map((p) => {
            const escolhido = perfil?.id === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => aoMudarGanhos(normalizar(p.ganhos))}
                style={({ hovered }: any) => [
                  {
                    minHeight: 28, paddingHorizontal: ESP.md,
                    borderRadius: RAIO.pilula, justifyContent: 'center',
                    borderWidth: 1, borderColor: escolhido ? 'transparent' : COR.linhaSuave,
                    backgroundColor: escolhido ? COR.metalSuave : 'transparent',
                  },
                  hovered && !escolhido && { backgroundColor: COR.hover },
                ]}
              >
                <Text style={[TIPO.legenda, { color: escolhido ? COR.texto : COR.textoMedio }]}>{p.nome}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: 2, marginTop: ESP.sm }}>
          {BANDAS.map((hz, i) => (
            <DeslizadorVertical
              key={hz}
              valor={g[i]}
              etiqueta={hz >= 1000 ? `${hz / 1000}k` : String(hz)}
              aoMudar={(v) => {
                const novo = g.slice();
                novo[i] = v;
                aoMudarGanhos(normalizar(novo));
              }}
            />
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: ESP.xs }}>
          <Text style={[TIPO.micro, { color: COR.textoFraco }]}>
            {lembrado ? 'SAVED FOR THIS TRACK' : 'DOUBLE-CLICK A BAND TO ZERO IT'}
          </Text>
          <Pressable
            onPress={() => aoMudarGanhos(PLANO.slice())}
            style={({ hovered }: any) => [
              { minHeight: 24, paddingHorizontal: ESP.sm, borderRadius: RAIO.pilula, justifyContent: 'center' },
              hovered && { backgroundColor: COR.hover },
            ]}
          >
            <Text style={[TIPO.micro, { color: COR.textoFraco }]}>RESET</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
