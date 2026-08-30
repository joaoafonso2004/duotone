import React, { useCallback, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  arredondar, daFraccao, eNormal, formatar, paraFraccao, passo,
  PASSO_FINO, PASSO_LARGO, RATE_MAXIMO, RATE_MINIMO,
} from '../lib/playbackRate';
import { COR, ESP, RAIO, TIPO } from './tokens.web';

/** O react-native-web renderiza uma View como <div>, mas os tipos do RN nao
 * conhecem `className`, `onKeyDown`, `role` nem `tabIndex`. E o mesmo truque
 * que o resto do desktop ja usa (o `P`/`V` do RootNavigator). */
const V = View as any;

/**
 * A barra da velocidade de reprodução.
 *
 * Substituiu os três presets ("Slowed / Normal / Fast"), que além de serem só
 * três nem concordavam entre plataformas — o "rápido" era 1,5 no telemóvel e
 * 1,35 no PC.
 *
 * **Vai de 0,5× a 2×, e o gesto e o teclado não andam ao mesmo passo.**
 * Arrastar move de 0,05; as setas movem de 0,01; shift+seta move 0,1. Não é
 * inconsistência, é a única forma de dar as duas coisas: a 0,01 são 151
 * posições, o que nesta barra dá pouco mais de 1 px por degrau — à mão isso
 * não se acerta, e o valor tremia debaixo do cursor. Quem quer um número
 * exato usa as setas.
 *
 * A barra não escreve os extremos por baixo: o valor está ao lado, a marca do
 * 1× está na própria barra, e uma legenda a dizer "0,5× … 2×" era repetir o
 * que o gesto já mostra.
 */
export function BarraVelocidade({
  valor,
  aoMudar,
}: {
  valor: number;
  aoMudar: (v: number) => void;
}) {
  const trilho = useRef<any>(null);
  const actual = arredondar(valor);
  const fraccao = paraFraccao(actual);

  const daPosicao = useCallback((clientX: number) => {
    const el = trilho.current;
    if (!el?.getBoundingClientRect) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    aoMudar(daFraccao((clientX - r.left) / r.width));
  }, [aoMudar]);

  const arrastar = useCallback((e: any) => {
    e.preventDefault?.();
    const alvo = e.currentTarget;
    trilho.current = alvo;
    const mover = (ev: any) => {
      const x = ev.clientX ?? ev.touches?.[0]?.clientX;
      if (typeof x === 'number') daPosicao(x);
    };
    mover(e);
    const largar = () => {
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', largar);
      window.removeEventListener('touchmove', mover);
      window.removeEventListener('touchend', largar);
    };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', largar);
    window.addEventListener('touchmove', mover);
    window.addEventListener('touchend', largar);
  }, [daPosicao]);

  return (
    <View style={{ gap: ESP.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.md }}>
        <V
          role="slider"
          aria-label="Playback speed"
          aria-valuemin={RATE_MINIMO}
          aria-valuemax={RATE_MAXIMO}
          aria-valuenow={actual}
          aria-valuetext={formatar(actual)}
          tabIndex={0}
          onKeyDown={(e: any) => {
            // Seta = 0,01 (o valor exato); shift+seta = 0,1 (atravessar).
            const g = e.shiftKey ? PASSO_LARGO : PASSO_FINO;
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); aoMudar(passo(actual, 1, g)); }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); aoMudar(passo(actual, -1, g)); }
            if (e.key === 'Home') { e.preventDefault(); aoMudar(RATE_MINIMO); }
            if (e.key === 'End') { e.preventDefault(); aoMudar(RATE_MAXIMO); }
          }}
          onMouseDown={arrastar}
          onTouchStart={arrastar}
          className="slider-container"
          style={{ flex: 1, height: 22, justifyContent: 'center', cursor: 'pointer' } as any}
        >
          <View style={{ height: 3, backgroundColor: COR.elevado, borderRadius: RAIO.pilula, overflow: 'hidden' }}>
            <V
              className="slider-fill"
              style={{ height: 3, width: `${fraccao * 100}%`, backgroundColor: COR.texto, borderRadius: RAIO.pilula }}
            />
          </View>
          <V className="slider-thumb" style={{ left: `${fraccao * 100}%` }} />
          {/* A marca do 1x: sem ela nao se encontra o normal a olho. */}
          <V
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: `${paraFraccao(1) * 100}%`,
                width: 1, height: 9, marginLeft: -0.5,
                backgroundColor: COR.textoFraco,
              }}
          />
        </V>
        {/* 54 e nao 46: agora cabe "0.85×", que e um caractere a mais do que
            os valores antigos e encolhia a barra ao aparecer. */}
        <Text style={[TIPO.numero, { color: eNormal(actual) ? COR.textoFraco : COR.texto, width: 54, textAlign: 'right' }]}>
          {formatar(actual)}
        </Text>
        {/* O lugar do "repor" esta SEMPRE reservado, mesmo quando o botao nao
            aparece. Sem isto a barra encolhia assim que se saia do 1x — o
            controlo mudava de tamanho enquanto se usava, e a meio de um
            arrasto o valor saltava debaixo do dedo. */}
        <View style={{ width: 54, alignItems: 'flex-end' }}>
          {!eNormal(actual) && (
            <Pressable
              accessibilityLabel="Reset playback speed to normal"
              onPress={() => aoMudar(1)}
              style={({ hovered }: any) => [
                { minHeight: 24, paddingHorizontal: ESP.sm, borderRadius: RAIO.pilula, justifyContent: 'center' },
                hovered && { backgroundColor: COR.hover },
              ]}
            >
              <Text style={[TIPO.micro, { color: COR.textoFraco }]}>RESET</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
