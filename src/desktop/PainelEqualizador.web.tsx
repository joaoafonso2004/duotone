import {AdjustmentSyncStatus} from '../components/AdjustmentSyncStatus';
import { useAdjustmentSync } from '../state/trackAdjustments';
import { useConnectivity } from '../state/connectivity';
import {SelectionPill} from '../components/SelectionPill';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  BANDAS, ETIQUETAS_BANDAS, GANHO_MAXIMO, chaveDaFaixa, normalizar, ondaDoEqualizador, PERFIS, PLANO, type Ganhos,
} from '../lib/equalizer';
import {
  criarPreset, limparNome, novoIdDePreset, podeGuardarComoPreset, presetDosGanhos, presetsVisiveis,
} from '../lib/presetsDoEqualizador';
import { mudarPresets, usePresets } from '../state/presets';
import { segueABase, usePlayer } from '../state/player';
import { escolherRecomendadoNaFaixa, useRecomendado, useRecomendadoNaFaixa } from '../state/recomendado';
import { EscolhaDoModelo, LinhaDoRecomendado } from './RecomendadoDoEq.web';
import { BarraVelocidade } from './BarraVelocidade.web';
import { useVelocidadePresa } from '../hooks/useVelocidadePresa';
import { useSeguirAmigo } from '../state/seguirAmigo';
import { useEdicaoDoPreset } from '../hooks/useEdicaoDoPreset';
import { avisarFeito } from '../lib/avisoDeRemocao';
import { COR, ESP, ESTADO, RAIO, TIPO } from './tokens.web';
import { Button, Field } from './ui.web';

/**
 * O painel do equalizador: os presets, a curva das dez bandas e a velocidade,
 * tudo numa vista só (10/11, opção B de `docs/menus-maquete.html`; o João:
 * "tudo numa aba e não em abas separadas").
 *
 * As dez bandas são UMA curva com dez puxadores, e não dez deslizadores: vê-se
 * a forma do som de uma vez, e é a mesma onda que o iPhone já desenha
 * (`ondaDoEqualizador`). Cada banda continua a ser um `slider` -- uma coluna
 * inteira onde se arrasta na vertical, com as mesmas setas e o mesmo duplo
 * clique --, por isso acertar meio dB custa o mesmo que custava.
 *
 * O que o painel NÃO faz é fingir. Quando o grafo não pega (sem faixa a tocar,
 * ou o iframe ainda a montar) diz-se isso, em vez de mostrar uma curva bonita
 * que não mexe no som.
 */

/** A altura do gráfico, e a folga em cima e em baixo para o puxador não cortar. */
const ALTURA = 190;
const FOLGA = 16;
const UTIL = ALTURA - FOLGA * 2;
/** A largura do desenho (o SVG estica na horizontal; a altura é a verdadeira). */
const LARGURA_DO_DESENHO = 1000;
// O escolhido usa o estado "ligado" do resto da app (o metal a 12 % com a aresta);
// os outros não têm contorno.
export const pillPalette={fill:COR.metalSuave,text:COR.texto,muted:COR.textoMedio,border:'transparent',selectedBorder:ESTADO.aresta};
const METAL = 'radial-gradient(circle at 35% 30%, #fff, #C9CBD1 60%, #8E9199)';
/** Uma ação em texto, como o Save e o Clear da fila. */
const textoDeAcao = { ...TIPO.corpo, fontSize: 13, fontWeight: '600', color: COR.textoMedio } as any;
const nomeDaBanda = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const comSinal = (v: number) => (v > 0 ? `+${v}` : String(v));
/** A altura de um ganho no gráfico: +12 em cima, -12 em baixo. */
const alturaDe = (v: number) => FOLGA + (1 - (v + GANHO_MAXIMO) / (GANHO_MAXIMO * 2)) * UTIL;

function CurvaDoEqualizador({ ganhos, aoMudarBanda }: {
  ganhos: readonly number[];
  aoMudarBanda: (banda: number, valor: number) => void;
}) {
  // A banda com o rato, o foco ou o arrasto: é a que mostra o valor.
  const [ativa, setAtiva] = useState<number | null>(null);
  const aArrastar = useRef<number | null>(null);
  const mudar = useRef(aoMudarBanda);
  mudar.current = aoMudarBanda;

  const { linha, area } = useMemo(() => {
    const y = ondaDoEqualizador(ganhos, LARGURA_DO_DESENHO, UTIL);
    let d = '';
    for (let x = 0; x <= LARGURA_DO_DESENHO; x += 8) d += `${x === 0 ? 'M' : 'L'}${x},${(FOLGA + y(x)).toFixed(1)} `;
    const zero = alturaDe(0);
    return { linha: d, area: `${d}L${LARGURA_DO_DESENHO},${zero} L0,${zero} Z` };
  }, [ganhos]);

  const arrastar = (e: any, banda: number) => {
    e.preventDefault?.();
    const r = e.currentTarget.getBoundingClientRect();
    const mover = (ev: any) => {
      const y = ev.clientY ?? ev.touches?.[0]?.clientY;
      if (typeof y !== 'number') return;
      const f = Math.max(0, Math.min(1, (y - r.top - FOLGA) / UTIL));
      // Em cima é +12, em baixo é −12, de meio em meio dB.
      mudar.current(banda, Math.round((1 - f * 2) * GANHO_MAXIMO * 2) / 2);
    };
    aArrastar.current = banda;
    setAtiva(banda);
    mover(e);
    const largar = () => {
      aArrastar.current = null;
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', largar);
    };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', largar);
  };

  return (
    <View>
      <div style={{ position: 'relative', height: ALTURA } as any}>
        <svg aria-hidden viewBox={`0 0 ${LARGURA_DO_DESENHO} ${ALTURA}`} preserveAspectRatio="none" width="100%" height={ALTURA}
          style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' } as any}>
          {/* O zero: uma só linha a atravessar as dez bandas. */}
          <line x1={0} x2={LARGURA_DO_DESENHO} y1={alturaDe(0)} y2={alturaDe(0)} stroke="rgba(233,234,238,0.16)"
            strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
          <path d={area} fill="rgba(233,234,238,0.09)" />
          <path d={linha} fill="none" stroke={COR.texto} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex' } as any}>
          {BANDAS.map((hz, i) => {
            const valor = ganhos[i] ?? 0;
            const y = alturaDe(valor);
            const acesa = ativa === i;
            return (
              <div
                key={hz}
                role="slider"
                aria-label={`${ETIQUETAS_BANDAS[i]} band`}
                aria-valuemin={-GANHO_MAXIMO}
                aria-valuemax={GANHO_MAXIMO}
                aria-valuenow={valor}
                aria-valuetext={`${comSinal(valor)} dB`}
                tabIndex={0}
                onKeyDown={(e: any) => {
                  if (e.key === 'ArrowUp') { e.preventDefault(); aoMudarBanda(i, Math.min(GANHO_MAXIMO, valor + 0.5)); }
                  if (e.key === 'ArrowDown') { e.preventDefault(); aoMudarBanda(i, Math.max(-GANHO_MAXIMO, valor - 0.5)); }
                }}
                onDoubleClick={() => aoMudarBanda(i, 0)}
                onMouseDown={(e: any) => arrastar(e, i)}
                onMouseEnter={() => { if (aArrastar.current === null) setAtiva(i); }}
                onMouseLeave={() => { if (aArrastar.current === null) setAtiva(null); }}
                onFocus={() => setAtiva(i)}
                onBlur={() => { if (aArrastar.current === null) setAtiva(null); }}
                style={{ flex: 1, position: 'relative', cursor: 'ns-resize', touchAction: 'none', outline: 'none' } as any}
              >
                {/* A guia da banda: só se vê na que tem o rato. */}
                <div style={{ position: 'absolute', left: '50%', top: FOLGA, bottom: FOLGA, width: 1, marginLeft: -0.5,
                  background: acesa ? 'rgba(233,234,238,0.14)' : 'rgba(233,234,238,0.04)' } as any} />
                <div style={{ position: 'absolute', left: '50%', top: y, width: 16, height: 16, margin: '-8px 0 0 -8px', borderRadius: 999,
                  background: METAL, boxShadow: '0 3px 10px rgba(0,0,0,.6), inset 0 0 0 .5px rgba(0,0,0,.35)',
                  transform: acesa ? 'scale(1.2)' : 'scale(1)', transition: 'transform 140ms var(--dt-curva)' } as any} />
                {acesa ? (
                  <div style={{ position: 'absolute', left: '50%', top: y - 14, transform: 'translate(-50%, -100%)', pointerEvents: 'none',
                    padding: '3px 9px', borderRadius: 999, background: COR.texto, color: '#111117', whiteSpace: 'nowrap',
                    fontFamily: (TIPO.numero as any).fontFamily, fontSize: 11 } as any}>
                    {`${comSinal(valor)} dB`}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <View style={{ flexDirection: 'row', marginTop: 2 }}>
        {BANDAS.map((hz, i) => (
          <Text key={hz} numberOfLines={1} style={[TIPO.legenda, { flex: 1, textAlign: 'center',
            color: ativa === i ? COR.texto : COR.textoMedio, fontWeight: ativa === i ? '600' : '400' }]}>
            {nomeDaBanda(ETIQUETAS_BANDAS[i]!)}
          </Text>
        ))}
      </View>
    </View>
  );
}

/**
 * So os perfis e as dez bandas, sem a velocidade nem o estado da faixa.
 *
 * Saiu daqui porque passou a haver DOIS sitios a mostrar o mesmo equalizador
 * no PC: esta pagina, que mexe na faixa a tocar, e as Definicoes, que mexem no
 * padrao de todas. Com o desenho copiado nos dois, um acerto num deixava o
 * outro para tras -- e sao dez deslizadores com geometria a mao.
 *
 * Nao le nem escreve na store: recebe os ganhos e devolve os novos.
 */
export function BandasDoEqualizador({
  ganhos,
  aoMudarGanhos,
  presets = PERFIS,
  aoEscolherPreset,
  semPresets = false,
  recomendado,
}: {
  ganhos: Ganhos;
  aoMudarGanhos: (g: Ganhos) => void;
  /** Os presets da fila; os da app se ninguém passar os da pessoa. */
  presets?: readonly { id: string; nome: string; ganhos: readonly number[] }[];
  aoEscolherPreset?: (id: string) => void;
  /** Só as bandas: o editor de um preset (GestorDePresets.web.tsx). */
  semPresets?: boolean;
  /** O Recommended (25/10): o primeiro, sempre, e a linha do que está ligado
   * por baixo quando é o escolhido. Quem o passa decide o que o clique faz. */
  recomendado?: { escolhido: boolean; aoEscolher: () => void; linha: React.ReactNode };
}) {
  const g = normalizar(ganhos);
  // Com o Recommended escolhido nenhum outro acende, mesmo que a curva calhe
  // ser a de um (plana, nas colunas, é a do Flat).
  const perfil = recomendado?.escolhido ? null : presetDosGanhos(presets, g);
  return (
    <View style={{ gap: ESP.sm }}>
      {semPresets ? null : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: ESP.xs }}>
        {recomendado ? (
          <SelectionPill
            palette={pillPalette}
            selected={recomendado.escolhido}
            label="Recommended"
            onPress={recomendado.aoEscolher}
          />
        ) : null}
        {presets.map((p) => (
          <SelectionPill
            palette={pillPalette}
            key={p.id}
            selected={perfil?.id === p.id}
            label={p.nome}
            onPress={() => { aoEscolherPreset?.(p.id); aoMudarGanhos(normalizar(p.ganhos)); }}
          />
        ))}
      </View>}
      {!semPresets && recomendado?.escolhido ? recomendado.linha : null}
      <CurvaDoEqualizador
        ganhos={g}
        aoMudarBanda={(i, v) => {
          const novo = g.slice();
          novo[i] = v;
          aoMudarGanhos(normalizar(novo));
        }}
      />
    </View>
  );
}

/** Uma acção em texto pequeno, como o RESET ao lado. */
function AccaoPequena({ rotulo, aoPremir }: { rotulo: string; aoPremir: () => void }) {
  return (
    <Pressable
      onPress={aoPremir}
      style={({ hovered }: any) => [
        { minHeight: 24, paddingHorizontal: ESP.sm, borderRadius: RAIO.pilula, justifyContent: 'center' },
        hovered && { backgroundColor: ESTADO.hover },
      ]}
    >
      <Text style={textoDeAcao}>{rotulo}</Text>
    </Pressable>
  );
}

/** O "repor" a parte, para cada sitio o por onde lhe faz sentido. */
export function ReporEqualizador({ aoRepor }: { aoRepor: () => void }) {
  return (
    <Pressable
      onPress={aoRepor}
      style={({ hovered }: any) => [
        { minHeight: 24, paddingHorizontal: ESP.sm, borderRadius: RAIO.pilula, justifyContent: 'center' },
        hovered && { backgroundColor: ESTADO.hover },
      ]}
    >
      <Text style={textoDeAcao}>Reset</Text>
    </Pressable>
  );
}

/**
 * O estado numa linha só: o que este EQ é ("Saved for this track") e se já
 * chegou aos outros aparelhos. Eram dois rodapés (a nuvem numa linha, a frase
 * noutra). Com a sincronização falhada volta a peça inteira, que tem o "retry".
 */
function EstadoDoAjuste({ dica, guardado }: { dica: string; guardado: boolean }) {
  const estado = useAdjustmentSync((s) => s.status);
  const offline = useConnectivity((s) => s.offline);
  if (estado === 'error' && !offline) return <AdjustmentSyncStatus />;
  const sinc = offline ? 'on this device' : estado === 'saved' ? 'synced' : estado === 'syncing' ? 'syncing…'
    : estado === 'pending' ? 'sync pending' : estado === 'local' ? 'on this device' : '';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm, flexShrink: 1, minWidth: 0 }}>
      {guardado ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: COR.ok }} /> : null}
      <Text numberOfLines={1} style={{ ...TIPO.legenda, color: COR.textoMedio, flexShrink: 1 }}>{guardado && sinc ? `${dica} · ${sinc}` : dica}</Text>
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
  const memoria = usePresets((st) => st.memoria);
  const velocidadePresa = useVelocidadePresa();
  const seguindo = useSeguirAmigo((s) => s.seguindo);
  const temEqDaEscuta = usePlayer((s) => s.eqDaEscuta != null);
  const eqDaJam = usePlayer(s => s.eqDaJamAtivo);
  const temEqDaJam = usePlayer(s => s.eqDaJam != null);
  const presets = useMemo(() => presetsVisiveis(memoria), [memoria]);
  // O Recommended (25/10): escolhido na faixa, e se ela o segue como base.
  const recomendadoNaFaixa = useRecomendadoNaFaixa();
  const recomendadoLigado = useRecomendado((s) => s.ligado);
  const segue = usePlayer(segueABase);
  const naBaseRecomendada = recomendadoLigado && segue;
  const current = usePlayer((s) => s.current);
  const edicao = useEdicaoDoPreset({
    memoria, ganhos, bloqueado: recomendadoNaFaixa || !!seguindo || eqDaJam,
    contexto: current ? chaveDaFaixa(current) : 'sem-faixa',
  });
  const mudarGanhos = (novos: Ganhos) => { edicao.preservarOrigem(); aoMudarGanhos(novos); };
  const [aEscolherModelo, setAEscolherModelo] = useState(false);
  // Guardar a curva como preset: o campo aparece no lugar da linha de baixo.
  const [aGuardar, setAGuardar] = useState(false);
  const [nome, setNome] = useState('');
  const guardar = () => {
    const limpo = limparNome(nome);
    if (!limpo) return;
    const id = novoIdDePreset(Date.now(), Math.random());
    mudarPresets((m, agora) => criarPreset(m, id, limpo, ganhos, agora));
    edicao.escolher(id);
    setAGuardar(false);
  };

  if (seguindo || eqDaJam) return (
    <View style={{ gap: ESP.md }}>
      <Text style={{ ...TIPO.legenda, color: COR.textoMedio }}>{eqDaJam
        ? temEqDaJam ? 'Following the Jam host’s live EQ' : 'Waiting for the Jam host’s EQ'
        : `Following ${seguindo!.nome}'s ${temEqDaEscuta ? 'live EQ and speed' : 'speed · waiting for live EQ'}`}</Text>
      <View pointerEvents="none" {...({ inert: true } as any)}>
        <BandasDoEqualizador ganhos={ganhos} aoMudarGanhos={() => {}} semPresets />
        <View style={{ marginTop: ESP.lg }}><BarraVelocidade rotulo="Speed" valor={velocidadePresa?.ritmo ?? 1} aoMudar={() => {}} /></View>
      </View>
    </View>
  );

  const velocidade = (
    <View style={{ gap: ESP.xs, marginTop: ESP.md }}>
      {velocidadePresa ? (
        // Numa Jam (ou a ouvir com um amigo) a velocidade não é a escolhida:
        // a barra fica parada no valor real, e diz porquê (18/10).
        <>
          <View pointerEvents="none" style={{ opacity: 0.45 }}>
            <BarraVelocidade rotulo="Speed" valor={velocidadePresa.ritmo} aoMudar={() => {}} />
          </View>
          <Text style={{ ...TIPO.legenda, color: COR.textoMedio }}>{velocidadePresa.motivo}</Text>
        </>
      ) : <BarraVelocidade rotulo="Speed" valor={rate} aoMudar={aoMudarRate} />}
    </View>
  );

  return (
    <View style={{ gap: ESP.lg }}>
      <View style={{ gap: ESP.sm }}>
        {/* Dizer a verdade em vez de mostrar uma curva que nao mexe no som. */}
        {!activo ? <Text style={{ ...TIPO.legenda, color: COR.textoFraco }}>Waiting for playback</Text> : null}

        {aEscolherModelo ? <EscolhaDoModelo aoFechar={() => setAEscolherModelo(false)} /> : <>
        <BandasDoEqualizador
          ganhos={ganhos}
          aoMudarGanhos={mudarGanhos}
          aoEscolherPreset={edicao.escolher}
          presets={presets}
          recomendado={{
            escolhido: recomendadoNaFaixa,
            aoEscolher: () => { edicao.escolher(null); escolherRecomendadoNaFaixa(); },
            linha: <LinhaDoRecomendado aoEscolherModelo={() => setAEscolherModelo(true)} />,
          }}
        />

        {edicao.alterado && edicao.preset ? (
          <Button onPress={() => { if (edicao.atualizar()) avisarFeito('Preset updated'); }}>
            {`Update “${edicao.preset.nome}”`}
          </Button>
        ) : null}

        {velocidade}
        {aGuardar ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm, marginTop: ESP.xs }}>
            <View style={{ flex: 1 }}>
              <Field placeholder="Preset name" value={nome} onChangeText={setNome} autoFocus maxLength={30}
                onSubmitEditing={guardar} />
            </View>
            <Button onPress={guardar} disabled={!limparNome(nome)}>Save</Button>
            <Button secondary onPress={() => setAGuardar(false)}>Cancel</Button>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: ESP.xs }}>
            <EstadoDoAjuste guardado={naBaseRecomendada || lembrado}
              dica={naBaseRecomendada ? 'For every song without its own EQ' : lembrado ? 'Saved for this track' : 'Double-click a band to zero it'} />
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {!recomendadoNaFaixa && podeGuardarComoPreset(memoria, ganhos) && (
                <AccaoPequena rotulo="Save as preset" aoPremir={() => { setNome(''); setAGuardar(true); }} />
              )}
              <ReporEqualizador aoRepor={() => mudarGanhos(PLANO.slice())} />
            </View>
          </View>
        )}
        </>}
      </View>
    </View>
  );
}
