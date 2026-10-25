import { AdjustmentSyncStatus } from './AdjustmentSyncStatus';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { chaveDaFaixa, ePlano, PLANO } from '../lib/equalizer';
import {
  criarPreset, definirPresetDoAparelho, eAparelhoComPreset, limparNome, novoIdDePreset, podeGuardarComoPreset,
  presetDoAparelho, presetsVisiveis, resolverPresets,
} from '../lib/presetsDoEqualizador';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { useSaidaDeAudio } from '../state/carro';
import { escolherRecomendadoNaFaixa, useRecomendado, useRecomendadoNaFaixa } from '../state/recomendado';
import { EscolhaDoModelo, LinhaDoRecomendado } from './RecomendadoDoEq';
import { Toque } from './Toque';
import { ganhosEmVigor, segueABase, usePlayer } from '../state/player';
import { mudarPresets, usePresets } from '../state/presets';
import { colors, spacing, type } from '../theme';
import { BarraVelocidade } from './BarraVelocidade';
import { useVelocidadePresa } from '../hooks/useVelocidadePresa';
import { BottomSheet, BottomSheetGestureGuard, BottomSheetScrollView } from './BottomSheet';
import { BotaoGuardarPreset, Equalizador, ReporEqualizador } from './Equalizador';
import { Input } from './Input';
import { PillButton } from './PillButton';


/**
 * O equalizador no telemóvel: velocidade, perfis e as dez bandas.
 *
 * É o mesmo estado e os mesmos perfis do PC — só a apresentação muda. O que
 * aplica os ganhos aqui é o módulo nativo (`modules/duotone-audio`), e por
 * isso o painel diz a verdade quando ele não está: mostrar deslizadores
 * bonitos que não mexem no som seria pior do que não os mostrar.
 *
 * A forma é a das outras folhas do leitor (a fila, o Jam): um título, uma
 * legenda com o estado, e secções com o rótulo pequeno por cima. Tudo em
 * inglês, como o resto da app.
 *
 * Guardar como preset troca o conteúdo da folha em vez de abrir outra por
 * cima -- como o menu de uma música dentro da fila: duas folhas empilhadas no
 * iOS são uma apresentação por cima de outra, e é daí que vêm as janelas
 * órfãs que o `MenuFlutuante` descreve.
 */
export function EqualizadorSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const ganhos = usePlayer(ganhosEmVigor);
  const setEqGanhos = usePlayer((s) => s.setEqGanhos);
  const playbackRate = usePlayer((s) => s.playbackRate);
  const setPlaybackRate = usePlayer((s) => s.setPlaybackRate);
  const velocidadePresa = useVelocidadePresa();
  const eqAtivo = usePlayer((s) => s.eqAtivo);
  const current = usePlayer((s) => s.current);
  const ajustesPorFaixa = usePlayer((s) => s.ajustesPorFaixa);
  const carro = usePlayer((s) => s.carro);
  const memoria = usePresets((s) => s.memoria);
  const presets = useMemo(() => presetsVisiveis(memoria), [memoria]);
  // O auscultador ou a coluna ligada agora, a que se pode dar um preset (11/10).
  const saida = useSaidaDeAudio((s) => s.saida);
  const aparelho = saida && eAparelhoComPreset(saida, memoria) ? saida.nome.trim() : null;
  const doAparelho = aparelho ? presetDoAparelho(memoria, aparelho) : null;

  // O Recommended (25/10): escolhido na faixa, e se ela o segue como base.
  const recomendadoNaFaixa = useRecomendadoNaFaixa();
  const recomendadoLigado = useRecomendado((s) => s.ligado);
  const segue = usePlayer(segueABase);
  const naBaseRecomendada = recomendadoLigado && segue && !carro;

  const [aGuardar, setAGuardar] = useState(false);
  const [aEscolherDoAparelho, setAEscolherDoAparelho] = useState(false);
  const [aEscolherModelo, setAEscolherModelo] = useState(false);
  const [nome, setNome] = useState('');
  const fechar = () => { setAGuardar(false); setAEscolherDoAparelho(false); setAEscolherModelo(false); onClose(); };
  const guardar = () => {
    const limpo = limparNome(nome);
    if (!limpo) return;
    mudarPresets((m, agora) => criarPreset(m, novoIdDePreset(agora, Math.random()), limpo, ganhos, agora));
    hapticNotification();
    setAGuardar(false);
  };

  // Só se diz "guardado" quando há mesmo registo desta faixa — a mesma conta
  // que a página do PC faz. Sem registo, a faixa toca com o padrão das
  // Definições (`aoTocar` no lib/equalizer.ts), e é isso que se diz. No carro
  // manda o preset do carro, e é isso que se diz primeiro.
  const lembrado = !!current && !!ajustesPorFaixa[chaveDaFaixa(current)];
  const estado = carro?.onde === 'aparelho'
    ? { icone: 'headset-outline' as const, texto: `${carro.aparelho} · using `, destaque: carro.nome }
    : carro
    ? { icone: 'car-outline' as const, texto: 'In the car · using ', destaque: carro.nome }
    : !current
      ? { icone: 'musical-notes-outline' as const, texto: 'Nothing playing', destaque: null }
      : naBaseRecomendada
        ? { icone: 'options-outline' as const, texto: 'Using ', destaque: 'Recommended' }
      : lembrado
        ? { icone: 'checkmark-circle-outline' as const, texto: 'Saved for this song', destaque: null }
        : { icone: 'options-outline' as const, texto: 'Using your default sound', destaque: null };

  // O preset de um aparelho (11/10): o mesmo painel do carro, dentro desta folha.
  if (aEscolherDoAparelho && aparelho) {
    const escolhido = doAparelho?.id ?? null;
    const escolher = (id: string | null) => {
      hapticSelection();
      mudarPresets((m, agora) => definirPresetDoAparelho(m, aparelho, id, agora));
    };
    const linha = (id: string | null, nomeDaLinha: string, legenda: string | null) => {
      const on = escolhido === id;
      return (
        <Toque key={id ?? 'off'} acende accessibilityRole="radio" accessibilityState={{ checked: on }}
          onPress={() => escolher(id)} style={styles.opcao}>
          <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.text : colors.textTertiary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>{nomeDaLinha}</Text>
            {legenda ? <Text style={type.caption}>{legenda}</Text> : null}
          </View>
        </Toque>
      );
    };
    return (
      <BottomSheet visible={visible} onClose={fechar}>
        <Text accessibilityRole="header" numberOfLines={1} style={type.title}>{aparelho}</Text>
        <Text style={[type.caption, { marginTop: 2, marginBottom: spacing.md }]}>
          Used for every song while it's connected. Back to each song's EQ when it disconnects.
        </Text>
        <BottomSheetScrollView style={{ maxHeight: 380 }}>
          {linha(null, 'Off', "Keep each song's own EQ")}
          {resolverPresets(memoria).map((p) => linha(p.id, p.nome, p.daApp ? null : 'Yours'))}
        </BottomSheetScrollView>
        <View style={{ marginTop: spacing.md }}>
          <PillButton label="Done" variant="ghost" onPress={() => setAEscolherDoAparelho(false)} />
        </View>
      </BottomSheet>
    );
  }

  // Os auscultadores à mão, quando o nome da saída não diz o modelo (25/10).
  if (aEscolherModelo) {
    return (
      <BottomSheet visible={visible} onClose={fechar}>
        <EscolhaDoModelo aoFechar={() => setAEscolherModelo(false)} />
      </BottomSheet>
    );
  }

  if (aGuardar) {
    return (
      <BottomSheet visible={visible} onClose={fechar}>
        <Text accessibilityRole="header" style={type.title}>Save preset</Text>
        <Text style={[type.caption, { marginTop: 2, marginBottom: spacing.lg }]}>
          Adds this curve to your presets, on all your devices.
        </Text>
        <Input
          placeholder="Preset name"
          value={nome}
          onChangeText={setNome}
          autoFocus
          maxLength={30}
          returnKeyType="done"
          onSubmitEditing={guardar}
          onClear={() => setNome('')}
        />
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <PillButton label="Save" onPress={guardar} disabled={!limparNome(nome)} />
          <PillButton label="Cancel" variant="ghost" onPress={() => setAGuardar(false)} />
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={fechar}>
      <View style={styles.conteudo}>
        <View>
          <Text accessibilityRole="header" style={type.title}>Equalizer</Text>
          <View style={styles.estado}>
            <Ionicons name={estado.icone} size={14} color={colors.textSecondary} />
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              {estado.texto}
              {estado.destaque ? <Text style={{ color: colors.text }}>{estado.destaque}</Text> : null}
            </Text>
          </View>
        </View>

        {aparelho ? (
          <Toque
            acende
            accessibilityRole="button"
            accessibilityLabel={`Preset for ${aparelho}: ${doAparelho?.nome ?? 'Off'}`}
            onPress={() => { hapticSelection(); setAEscolherDoAparelho(true); }}
            style={styles.aparelho}
          >
            <Ionicons name="headset-outline" size={17} color={colors.text} />
            <Text numberOfLines={1} style={[type.body, { flex: 1, minWidth: 0 }]}>On {aparelho}</Text>
            <Text style={[type.caption, { color: doAparelho ? colors.text : colors.textSecondary }]}>{doAparelho?.nome ?? 'Off'}</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
          </Toque>
        ) : null}

        {velocidadePresa ? (
          // Numa Jam (ou a ouvir com um amigo) a velocidade não é a escolhida:
          // a barra fica parada no valor real, e diz porquê (18/10).
          <View>
            <View pointerEvents="none" style={{ opacity: 0.45 }}>
              <BarraVelocidade titulo="Speed" valor={velocidadePresa.ritmo} aoMudar={() => {}} />
            </View>
            <Text style={[type.caption, { color: colors.textSecondary }]}>{velocidadePresa.motivo}</Text>
          </View>
        ) : (
          <BarraVelocidade
            key={current ? chaveDaFaixa(current) : 'sem-faixa'}
            titulo="Speed"
            valor={playbackRate}
            aoMudar={(v) => setPlaybackRate(v)}
          />
        )}

        <View>
          <View style={styles.linhaDoTitulo}>
            <Text style={styles.titulo}>Presets</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              {!recomendadoNaFaixa && podeGuardarComoPreset(memoria, ganhos) && (
                <BotaoGuardarPreset aoGuardar={() => { setNome(''); setAGuardar(true); }} />
              )}
              <ReporEqualizador
                desativado={ePlano(ganhos)}
                aoRepor={() => setEqGanhos(PLANO.slice())}
              />
            </View>
          </View>
          <View style={{ marginTop: spacing.sm }}>
            <BottomSheetGestureGuard>
              <Equalizador
                ganhos={ganhos}
                aoMudar={(novo) => setEqGanhos(novo)}
                presets={presets}
                recomendado={{
                  escolhido: recomendadoNaFaixa,
                  aoEscolher: escolherRecomendadoNaFaixa,
                  linha: <LinhaDoRecomendado aoEscolherModelo={() => setAEscolherModelo(true)} />,
                }}
                moldura
                sangria={spacing.lg}
                // Dizer a verdade em vez de fingir.
                nota={eqAtivo ? undefined : 'Not available in this build'}
              />
            </BottomSheetGestureGuard>
          </View>
          <View style={{ marginTop: spacing.xs }}>
            {carro ? (
              // No carro nada disto se guarda na faixa: dizer que sincroniza
              // seria mentir sobre o que se está a mexer.
              <View style={styles.nota}>
                <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
                <Text style={styles.textoDaNota}>
                  {carro.onde === 'aparelho' ? `Changes last until ${carro.aparelho} disconnects` : 'Changes last until you leave the car'}
                </Text>
              </View>
            ) : naBaseRecomendada ? (
              // O Recommended é do aparelho, não da faixa: dizer "synced" era
              // mentir sobre onde ele vive.
              <View style={styles.nota}>
                <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
                <Text style={styles.textoDaNota}>For every song without its own EQ, on this iPhone</Text>
              </View>
            ) : <AdjustmentSyncStatus />}
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  conteudo: { gap: spacing.xl, paddingBottom: spacing.xs },
  estado: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  linhaDoTitulo: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // O rótulo das secções das folhas (o "IN THE SESSION" do Jam), igual ao
  // "Speed" que a barra desenha.
  titulo: { ...type.micro, letterSpacing: 1.4, fontWeight: '700', color: colors.textTertiary },
  // A mesma linha pequena do `AdjustmentSyncStatus`, que ela substitui no carro.
  nota: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 },
  textoDaNota: { fontSize: 11, color: colors.textTertiary },
  aparelho: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44,
    paddingHorizontal: spacing.md, borderRadius: 12, borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.06)', marginTop: -spacing.sm,
  },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
});
