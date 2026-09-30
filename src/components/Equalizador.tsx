import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import {
  BANDAS, ETIQUETAS_BANDAS, GANHO_MAXIMO, normalizar, ondaDoEqualizador, perfilDe, PERFIS, PLANO,
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
/** A caixa de cada deslizador. Com ±20 dB, 150 pt dao quase quatro pontos por
 * dB -- a 128 os perfis (que andam pelos ±5) mal saiam do meio. */
const ALTURA = 150;
/** A linha do valor em dB, por cima de cada banda. */
const ALTURA_DO_VALOR = 14;
const ESPACO_DO_VALOR = 6;
const BOLA = 14;
/** A onda desenha-se aos bocados (ver `OndaDoEqualizador`): de quantos em
 * quantos pontos vai a linha, e de quantos a area por baixo dela. */
const PASSO_DA_LINHA = 4;
const PASSO_DA_AREA = 3;
const ESPESSURA_DA_LINHA = 2;
const COR_DA_AREA = 'rgba(245,245,247,0.08)';

/** Escolhido a branco: e o "ligado" da app (os interruptores das Definicoes
 * tambem acendem a `colors.text`). Com o `surfaceHigh` de sempre, na folha --
 * que tem esse mesmo fundo -- o escolhido quase nao se distinguia. */
const PALETA_DOS_PERFIS = {
  fill: colors.text,
  text: colors.bg,
  muted: colors.textSecondary,
  border: colors.border,
  selectedBorder: colors.text,
};

/** "+4.5", "0", "−3": o sinal a frente, e o menos tipografico. */
export function formatarGanho(v: number): string {
  if (v === 0) return '0';
  return `${v > 0 ? '+' : '−'}${Math.abs(v)}`;
}

/**
 * Um deslizador vertical de uma banda.
 *
 * **Vertical, como em qualquer equalizador gráfico.** É a forma que diz "isto
 * é uma curva de frequências" antes de se ler uma única etiqueta; dez linhas
 * horizontais leriam-se como uma lista de definições.
 *
 * O desvio ao neutro já não é uma barra a sair do meio: é a onda por trás
 * (`OndaDoEqualizador`), que liga os dez pontos e diz o mesmo de uma vez.
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
    // Em cima é +GANHO_MAXIMO, em baixo é −GANHO_MAXIMO.
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
  const nome = etiqueta.charAt(0) + etiqueta.slice(1).toLowerCase();

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{
          height: ALTURA_DO_VALOR,
          lineHeight: ALTURA_DO_VALOR,
          fontSize: 10,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
          color: valor === 0 ? colors.textTertiary : colors.text,
        }}
      >
        {formatarGanho(valor)}
      </Text>
      <View
        {...responder.panHandlers}
        onLayout={(e) => { alturaRef.current = e.nativeEvent.layout.height; }}
        collapsable={false}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={nome}
        accessibilityValue={{
          min: -GANHO_MAXIMO, max: GANHO_MAXIMO, now: valor, text: `${formatarGanho(valor)} dB`,
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const passo = e.nativeEvent.actionName === 'increment' ? 0.5
            : e.nativeEvent.actionName === 'decrement' ? -0.5 : 0;
          const novo = Math.max(-GANHO_MAXIMO, Math.min(GANHO_MAXIMO, valor + passo));
          if (!passo || novo === valor) return;
          hapticSelection();
          aoMudarRef.current(novo);
        }}
        style={{ marginTop: ESPACO_DO_VALOR, height: ALTURA, alignSelf: 'stretch' }}
      >
        <View style={{
          position: 'absolute', left: '50%', marginLeft: -1.5, top: 0, bottom: 0,
          width: 3, borderRadius: radii.pill, backgroundColor: colors.border,
        }} />
        <View style={{
          position: 'absolute', left: '50%', marginLeft: -BOLA / 2,
          top: `${fraccao * 100}%`, marginTop: -BOLA / 2,
          width: BOLA, height: BOLA, borderRadius: radii.pill,
          backgroundColor: colors.text,
          shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 3, shadowOffset: { width: 0, height: 2 },
        }} />
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={[
          type.micro,
          {
            marginTop: spacing.sm,
            alignSelf: 'stretch',
            textAlign: 'center',
            color: colors.textTertiary,
            fontSize: 9,
            lineHeight: 12,
            // Sem espacamento a mais: "TREBLE" tem de caber numa decima da
            // largura sem encolher.
            letterSpacing: 0,
          },
        ]}
      >
        {etiqueta}
      </Text>
    </View>
  );
}

/**
 * A onda entre os pontos das bandas, com a area ate a linha do 0 dB.
 *
 * **Feita de Views, sem SVG.** A app nao traz o react-native-svg, e trazer
 * um modulo nativo por um desenho obrigava a uma build nova so para isto. A
 * linha sao segmentos curtos rodados, e a area sao colunas finas -- umas
 * duzentas Views, que so se redesenham quando um ganho muda (e o `memo`
 * compara os ganhos por valor, nao por referencia).
 *
 * A forma sai do `ondaDoEqualizador` (lib/equalizer.ts), onde ha testes: passa
 * em todos os pontos e nunca sai da caixa.
 */
const OndaDoEqualizador = memo(function OndaDoEqualizador({
  ganhos,
  largura,
}: {
  ganhos: readonly number[];
  largura: number;
}) {
  if (largura <= 0) return null;
  const y = ondaDoEqualizador(ganhos, largura, ALTURA);
  const meio = ALTURA / 2;

  const area: React.ReactNode[] = [];
  for (let x = 0; x < largura; x += PASSO_DA_AREA) {
    const w = Math.min(PASSO_DA_AREA, largura - x);
    const topo = y(x + w / 2);
    const h = Math.abs(topo - meio);
    if (h < 0.5) continue;
    area.push(
      <View
        key={`a${x}`}
        style={{
          position: 'absolute', left: x, width: w,
          top: Math.min(topo, meio), height: h,
          backgroundColor: COR_DA_AREA,
        }}
      />,
    );
  }

  const linha: React.ReactNode[] = [];
  for (let x0 = 0; x0 < largura; x0 += PASSO_DA_LINHA) {
    const x1 = Math.min(largura, x0 + PASSO_DA_LINHA);
    const y0 = y(x0), y1 = y(x1);
    // Meio ponto a mais em cada segmento, para as juntas nao abrirem.
    const comprimento = Math.hypot(x1 - x0, y1 - y0) + 0.5;
    linha.push(
      <View
        key={`l${x0}`}
        style={{
          position: 'absolute',
          left: (x0 + x1) / 2 - comprimento / 2,
          top: (y0 + y1) / 2 - ESPESSURA_DA_LINHA / 2,
          width: comprimento,
          height: ESPESSURA_DA_LINHA,
          borderRadius: ESPESSURA_DA_LINHA / 2,
          backgroundColor: colors.text,
          transform: [{ rotate: `${Math.atan2(y1 - y0, x1 - x0)}rad` }],
        }}
      />,
    );
  }

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', left: 0, right: 0,
        top: ALTURA_DO_VALOR + ESPACO_DO_VALOR, height: ALTURA,
      }}
    >
      {/* O 0 dB: sem ele nao se ve de onde a onda sobe ou desce. */}
      <View style={{
        position: 'absolute', left: 0, right: 0, top: meio - 0.5, height: 1,
        backgroundColor: colors.borderStrong,
      }} />
      {area}
      {/* Opacidade no grupo e nao em cada segmento: onde dois se tocam nao
          fica um ponto mais claro. */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.9 }}>
        {linha}
      </View>
    </View>
  );
}, (a, b) => a.largura === b.largura
  && a.ganhos.length === b.ganhos.length
  && a.ganhos.every((v, i) => v === b.ganhos[i]));

/**
 * "Custom": o estado quando os ganhos nao batem com perfil nenhum. Nao se
 * carrega -- diz so onde se esta. Tracejado para nao se confundir com um perfil
 * escolhido, que e cheio.
 */
function PerfilAMao() {
  return (
    <View
      accessible
      accessibilityLabel="Custom, selected"
      style={{
        minHeight: 36,
        paddingHorizontal: 14,
        justifyContent: 'center',
        borderRadius: 24,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.borderStrong,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>Custom</Text>
    </View>
  );
}

export function Equalizador({
  ganhos,
  aoMudar,
  /** Uma nota por cima, quando ha alguma coisa a dizer (por exemplo, que o
   *  modulo nativo nao esta neste binario). */
  nota,
  /** As bandas num cartao proprio. A folha precisa dele; nas Definicoes o
   *  equalizador ja esta dentro do cartao da seccao. */
  moldura = false,
  /** Quanto a fila de perfis pode sair para os lados, ate a borda de quem a
   *  contem: assim desliza ate ao fim em vez de ser cortada a meio de um. */
  sangria = 0,
}: {
  ganhos: readonly number[];
  aoMudar: (ganhos: number[]) => void;
  nota?: string;
  moldura?: boolean;
  sangria?: number;
}) {
  const g = normalizar(ganhos);
  const perfil = perfilDe(g);
  const [largura, setLargura] = useState(0);

  // A fila de perfis desliza, e o escolhido tem de estar a vista: ao abrir
  // (o Late night e o ultimo) e quando muda. So se mexe se estiver tapado.
  const filaRef = useRef<ScrollView>(null);
  const posicoesRef = useRef<Record<string, { x: number; w: number }>>({});
  const visivelRef = useRef({ largura: 0, desvio: 0 });
  const mostrar = (id: string | undefined, animado: boolean) => {
    const p = id ? posicoesRef.current[id] : undefined;
    const { largura: vista, desvio } = visivelRef.current;
    if (!p || !vista) return;
    if (p.x + p.w > desvio + vista) {
      filaRef.current?.scrollTo({ x: p.x + p.w + sangria - vista, animated: animado });
    } else if (p.x < desvio) {
      filaRef.current?.scrollTo({ x: Math.max(0, p.x - sangria), animated: animado });
    }
  };
  // `mostrar` so le refs: nasce a cada render, e com ele nas dependencias a
  // fila mexia-se a cada ganho arrastado em vez de so quando o perfil muda.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { mostrar(perfil?.id, true); }, [perfil?.id]);

  const bandas = (
    <View onLayout={(e) => setLargura(e.nativeEvent.layout.width)}>
      <OndaDoEqualizador ganhos={g} largura={largura} />
      <View style={{ flexDirection: 'row' }}>
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

  return (
    <View style={{ gap: spacing.md }}>
      {nota ? (
        <Text style={[type.caption, { color: colors.textTertiary }]}>{nota}</Text>
      ) : null}

      <ScrollView
        ref={filaRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -sangria }}
        contentContainerStyle={{ paddingHorizontal: sangria, gap: spacing.xs }}
        onLayout={(e) => {
          visivelRef.current.largura = e.nativeEvent.layout.width;
          mostrar(perfil?.id, false);
        }}
        onScroll={(e) => { visivelRef.current.desvio = e.nativeEvent.contentOffset.x; }}
        scrollEventThrottle={32}
      >
        {!perfil && <PerfilAMao />}
        {PERFIS.map((p) => (
          <View
            key={p.id}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              posicoesRef.current[p.id] = { x, w: width };
              if (p.id === perfil?.id) mostrar(p.id, false);
            }}
          >
            <SelectionPill
              selected={perfil?.id === p.id}
              label={p.nome}
              palette={PALETA_DOS_PERFIS}
              onPress={() => { hapticSelection(); aoMudar(normalizar(p.ganhos)); }}
            />
          </View>
        ))}
      </ScrollView>

      {moldura ? (
        <View style={{
          backgroundColor: colors.surface,
          borderRadius: radii.lg,
          borderWidth: 0.5,
          borderColor: colors.border,
          paddingTop: spacing.md,
          paddingBottom: spacing.md,
          paddingHorizontal: spacing.xs,
        }}>
          {bandas}
        </View>
      ) : bandas}
    </View>
  );
}

/**
 * O "repor" a parte, para cada sitio o por onde lhe faz sentido. Uma pilula,
 * como o Reset da velocidade ao lado; apagada quando ja nao ha nada a repor.
 */
export function ReporEqualizador({ aoRepor, desativado = false }: { aoRepor: () => void; desativado?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Reset equalizer"
      accessibilityState={{ disabled: desativado }}
      disabled={desativado}
      hitSlop={6}
      onPress={() => { hapticSelection(); aoRepor(); }}
      style={({ pressed }) => ({
        minHeight: 28,
        paddingHorizontal: spacing.md,
        justifyContent: 'center',
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        opacity: desativado ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>Reset</Text>
    </Pressable>
  );
}

export { PLANO, GANHO_MAXIMO };
