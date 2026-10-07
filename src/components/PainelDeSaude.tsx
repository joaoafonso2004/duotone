import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { lerPainelDeSaude, type PainelDeSaude as Painel } from '../api/painelDeSaude';
import { haQuantoTempo } from '../lib/social';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { useTheme } from '../state/theme';
import { BottomSheet, BottomSheetScrollView } from './BottomSheet';
import { colors, radii, spacing, type } from '../theme';

/** Os períodos que se podem ver. */
const PERIODOS = [1, 7, 30] as const;

/**
 * O painel de saúde (7/10), só na conta do João (api/painelDeSaude.ts): quem
 * usa a app e em que versão, as falhas das músicas, o tempo até ao som, os
 * crashes e os erros, e cada aparelho. É o `app_events` agregado no servidor
 * (supabase/painel-de-saude.sql) -- os problemas dos amigos sem lhes pedir o
 * relatório. Abre das Definições, numa folha (no PC, um diálogo).
 */
export function PainelDeSaude({ visivel, aoFechar }: { visivel: boolean; aoFechar: () => void }) {
  const tema = useTheme((s) => s.theme);
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(7);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aLer, setALer] = useState(false);

  useEffect(() => {
    if (!visivel) return;
    let vivo = true;
    setALer(true); setErro(null);
    lerPainelDeSaude(dias)
      .then((p) => { if (vivo) setPainel(p); })
      .catch((e) => { if (vivo) setErro(mensagemDeErro(e, 'Could not read the app health.')); })
      .finally(() => { if (vivo) setALer(false); });
    return () => { vivo = false; };
  }, [visivel, dias]);

  const segundos = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  return (
    <BottomSheet visible={visivel} onClose={aoFechar} titulo="App health">
      <View style={estilos.periodos}>
        {PERIODOS.map((d) => (
          <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: d === dias }} onPress={() => setDias(d)}
            style={[estilos.periodo, d === dias && { backgroundColor: tema.color, borderColor: tema.color }]}>
            <Text style={[estilos.periodoTexto, d === dias && { color: '#fff' }]}>{d === 1 ? '24 h' : `${d} days`}</Text>
          </Pressable>
        ))}
        {aLer ? <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginLeft: 'auto' }} /> : null}
      </View>
      {erro ? <Text style={[type.caption, { color: colors.danger }]}>{erro}</Text> : null}
      {painel ? (
        <BottomSheetScrollView style={{ maxHeight: 520 }}>
          <View style={estilos.numeros}>
            <Numero valor={painel.pessoas} rotulo="people" />
            <Numero valor={painel.eventos} rotulo="events" />
            <Numero valor={painel.versoes.reduce((s, v) => s + v.crashes + v.bloqueios, 0)} rotulo="crashes" alerta />
            <Numero valor={painel.falhas.reduce((s, f) => s + f.n, 0)} rotulo="failed songs" alerta />
          </View>

          <Seccao titulo="Versions">
            {painel.versoes.map((v) => (
              <Linha key={`${v.plataforma}${v.versao}`} icone={v.plataforma === 'web' ? 'desktop-outline' : 'phone-portrait-outline'}
                principal={`${v.plataforma === 'web' ? 'Windows' : 'iPhone'} ${v.versao}`}
                secundario={`${v.pessoas} ${v.pessoas === 1 ? 'person' : 'people'}`}
                direita={[v.crashes + v.bloqueios ? `${v.crashes + v.bloqueios} crash` : '', v.erros ? `${v.erros} err` : '', v.falhas ? `${v.falhas} fail` : '']
                  .filter(Boolean).join(' · ') || 'OK'} />
            ))}
          </Seccao>

          <Seccao titulo="Time to first sound">
            {painel.som.length ? painel.som.map((s) => (
              <Linha key={s.origem} icone="play-outline" principal={s.origem} secundario={`${s.n} starts`}
                direita={`${segundos(s.mediana)} · 90% ${segundos(s.p90)}`} />
            )) : <Vazio />}
          </Seccao>

          <Seccao titulo="Failed songs">
            {painel.falhas.length ? painel.falhas.map((f) => (
              <Linha key={f.tipo} icone="alert-circle-outline" principal={f.tipo} direita={String(f.n)} />
            )) : <Vazio />}
          </Seccao>

          <Seccao titulo="Crashes and errors">
            {painel.erros.length ? painel.erros.map((e, i) => (
              <Linha key={`${e.nome}${e.tipo}${i}`} icone="bug-outline" principal={`${e.nome} · ${e.tipo}`}
                secundario={[e.mensagem, e.versao].filter(Boolean).join(' · ')} direita={`${e.n} · ${e.pessoas}p`} />
            )) : <Vazio />}
          </Seccao>

          <Seccao titulo="Devices">
            {painel.aparelhos.map((a, i) => (
              <Linha key={`${a.nome}${a.plataforma}${i}`} icone={a.plataforma === 'web' ? 'desktop-outline' : 'phone-portrait-outline'}
                principal={a.nome} secundario={`${a.versao ?? '?'} · ${haQuantoTempo(a.ultimo)}${a.cpuAtras !== null ? ` · CPU behind ${a.cpuAtras}%` : ''}`}
                direita={[a.crashes ? `${a.crashes} crash` : '', a.falhas ? `${a.falhas} fail` : ''].filter(Boolean).join(' · ') || 'OK'} />
            ))}
          </Seccao>
        </BottomSheetScrollView>
      ) : null}
    </BottomSheet>
  );
}

function Numero({ valor, rotulo, alerta = false }: { valor: number; rotulo: string; alerta?: boolean }) {
  return (
    <View style={estilos.numero}>
      <Text style={[estilos.numeroValor, alerta && valor > 0 && { color: colors.danger }]}>{valor.toLocaleString()}</Text>
      <Text style={type.caption}>{rotulo}</Text>
    </View>
  );
}

function Seccao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={[type.micro, { color: colors.textSecondary, marginBottom: spacing.xs }]}>{titulo.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Linha({ icone, principal, secundario, direita }: {
  icone: keyof typeof Ionicons.glyphMap; principal: string; secundario?: string; direita?: string;
}) {
  return (
    <View style={estilos.linha}>
      <Ionicons name={icone} size={18} color={colors.textSecondary} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>{principal}</Text>
        {secundario ? <Text numberOfLines={2} style={type.caption}>{secundario}</Text> : null}
      </View>
      {direita ? <Text style={[type.caption, { fontVariant: ['tabular-nums'] }]}>{direita}</Text> : null}
    </View>
  );
}

function Vazio() {
  return <Text style={[type.caption, { paddingVertical: spacing.xs }]}>Nothing in this period.</Text>;
}

const estilos = StyleSheet.create({
  periodos: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  periodo: { paddingHorizontal: 14, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, justifyContent: 'center' },
  periodoTexto: { ...type.caption, fontWeight: '700', color: colors.text },
  numeros: { flexDirection: 'row', gap: spacing.sm },
  numero: { flex: 1, padding: spacing.md, borderRadius: radii.md, borderCurve: 'continuous', backgroundColor: colors.surface },
  numeroValor: { fontSize: 22, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8 },
});
