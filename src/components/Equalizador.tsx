import React, { useMemo, useRef } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import {
  BANDAS, ETIQUETAS_BANDAS, GANHO_MAXIMO, normalizar, perfilDe, PERFIS, PLANO,
} from '../lib/equalizer';
import { hapticSelection } from '../lib/haptics';
import { colors, radii, spacing, type } from '../theme';
import { SelectionPill } from './SelectionPill';

/**
 * O equalizador -- perfis, dez bandas, e o botao de repor -- sem saber a quem
 * pertencem os ganhos que mostra.
 *
 * **Porque saiu da folha do leitor.** Passou a haver DOIS sitios a mostrar o
 * mesmo equalizador: a folha, que mexe na faixa a tocar, e as Definicoes, que
 * mexem no padrao de todas as faixas. Com o desenho copiado nos dois, qualquer
 * acerto num deles deixava o outro para tras -- e sao dez deslizadores com
 * geometria a mao, que e precisamente o tipo de coisa que diverge em silencio.
 *
 * Nao le nem escreve na store: recebe os ganhos e devolve os novos. E o que
 * lhe permite servir uma faixa num sitio e o padrao no outro.
 */
const ALTURA = 128;
const LARGURA_BANDA = 30;

/**
 * Um deslizador vertical de uma banda.
 *
 * **Vertical, como em qualquer equalizador gráfico.** É a forma que diz "isto
 * é uma curva de frequências" antes de se ler uma única etiqueta; dez linhas
 * horizontais leriam-se como uma lista de definições.
 *
 * O preenchimento sai do MEIO e vai até ao valor, porque um EQ mostra o desvio
 * ao neutro e não um nível a contar de baixo — a mesma decisão do painel do PC.
 */
function DeslizadorDeBanda({
  valor,
  etiqueta,
  aoMudar,
}: {
  valor: number;
  etiqueta: string;
  aoMudar: (v: number) => void;
}) {
  const alturaRef = useRef(ALTURA);
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;
  const ultimoRef = useRef(valor);
  ultimoRef.current = valor;
  const inicioRef = useRef(0);

  const aplicar = (y: number) => {
    const h = alturaRef.current;
    if (!h) return;
    // Em cima é +12 dB, em baixo é −12.
    const f = 1 - Math.max(0, Math.min(1, y / h));
    // Meio dB por degrau: mais fino do que isso não se ouve nem se acerta.
    const novo = Math.round((f * 2 - 1) * GANHO_MAXIMO * 2) / 2;
    if (novo === ultimoRef.current) return;
    ultimoRef.current = novo;
    hapticSelection();
    aoMudarRef.current(novo);
  };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // Sem isto, um gesto vertical numa banda fugia para o scroll do painel —
    // que é exatamente a direção em que se mexe um deslizador destes.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      inicioRef.current = e.nativeEvent.locationY;
      aplicar(inicioRef.current);
    },
    onPanResponderMove: (_e, gesto) => aplicar(inicioRef.current + gesto.dy),
  }), []);

  const fraccao = 1 - (valor + GANHO_MAXIMO) / (GANHO_MAXIMO * 2);

  return (
    <View style={{ alignItems: 'center', gap: spacing.xs, width: LARGURA_BANDA }}>
      <View
        {...responder.panHandlers}
        onLayout={(e) => { alturaRef.current = e.nativeEvent.layout.height; }}
        collapsable={false}
        style={{ height: ALTURA, width: LARGURA_BANDA, justifyContent: 'center' }}
      >
        <View style={{
          position: 'absolute', left: LARGURA_BANDA / 2 - 1.5,
          width: 3, height: '100%', borderRadius: radii.pill,
          backgroundColor: colors.border,
        }} />
        {valor !== 0 && (
          <View style={{
            position: 'absolute', left: LARGURA_BANDA / 2 - 1.5, width: 3,
            top: valor > 0 ? `${fraccao * 100}%` : '50%',
            height: `${Math.abs(fraccao - 0.5) * 100}%`,
            backgroundColor: colors.text, borderRadius: radii.pill,
          }} />
        )}
        <View style={{
          position: 'absolute', left: LARGURA_BANDA / 2 - 7,
          top: `${fraccao * 100}%`, marginTop: -7,
          width: 14, height: 14, borderRadius: radii.pill,
          backgroundColor: colors.text,
        }} />
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[
          type.micro,
          {
            width: LARGURA_BANDA,
            color: colors.textTertiary,
            fontSize: 8,
            lineHeight: 10,
            letterSpacing: 0.1,
            textAlign: 'center',
          },
        ]}
      >
        {etiqueta}
      </Text>
    </View>
  );
}
export function Equalizador({
  ganhos,
  aoMudar,
  /** Uma nota por cima, quando ha alguma coisa a dizer (por exemplo, que o
   *  modulo nativo nao esta neste binario). */
  nota,
}: {
  ganhos: readonly number[];
  aoMudar: (ganhos: number[]) => void;
  nota?: string;
}) {
  const g = normalizar(ganhos);
  const perfil = perfilDe(g);

  return (
    <View style={{ gap: spacing.sm }}>
      {nota ? (
        <Text style={[type.micro, { color: colors.textTertiary }]}>{nota}</Text>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {PERFIS.map((p) => (
          <SelectionPill
            key={p.id}
            selected={perfil?.id === p.id}
            label={p.nome}
            onPress={() => { hapticSelection(); aoMudar(normalizar(p.ganhos)); }}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm }}>
        {BANDAS.map((hz, i) => (
          <DeslizadorDeBanda
            key={hz}
            valor={g[i]}
            etiqueta={ETIQUETAS_BANDAS[i]}
            aoMudar={(v) => {
              const novo = g.slice();
              novo[i] = v;
              aoMudar(normalizar(novo));
            }}
          />
        ))}
      </View>
    </View>
  );
}

/** O "repor" a parte, para cada sitio o poder por onde lhe faz sentido. */
export function ReporEqualizador({ aoRepor }: { aoRepor: () => void }) {
  return (
    <Pressable
      onPress={() => { hapticSelection(); aoRepor(); }}
      style={{ minHeight: 28, paddingHorizontal: spacing.sm, justifyContent: 'center', borderRadius: radii.pill }}
    >
      <Text style={[type.micro, { color: colors.textSecondary }]}>RESET</Text>
    </Pressable>
  );
}

export { PLANO, GANHO_MAXIMO };
