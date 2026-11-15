import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BottomSheet } from './BottomSheet';
import { ICONE_DA_CENA } from './PecaDaGaveta';
import { mudarGaveta, useGaveta } from '../state/gaveta';
import {
  ICONES_DA_CENA, juntar, mudarCena, proximaEscolha, rotuloDaVelocidade, type Cena, type DefinicoesDaCena,
} from '../lib/gaveta';
import { avisarInfo } from '../lib/avisoDeRemocao';
import { hapticSelection } from '../lib/haptics';
import { colors, radii } from '../theme';

type Linha = { chave: keyof DefinicoesDaCena; nome: string; icone: React.ComponentProps<typeof Ionicons>['name'] };
const LINHAS: readonly Linha[] = [
  { chave: 'privado', nome: 'Private listening', icone: 'eye-off-outline' },
  { chave: 'temporizador', nome: 'Sleep timer', icone: 'moon-outline' },
  { chave: 'velocidade', nome: 'Speed', icone: 'speedometer-outline' },
  { chave: 'shuffle', nome: 'Shuffle', icone: 'shuffle' },
];

/** O valor de uma definição como a folha o escreve; `undefined` é deixar como está. */
function valorDe(chave: keyof DefinicoesDaCena, v: DefinicoesDaCena[keyof DefinicoesDaCena]): string {
  if (v === undefined) return 'Leave as is';
  switch (chave) {
    case 'privado': return v ? 'On' : 'Off';
    case 'temporizador': return v === 'fim' ? 'End of song' : v === 0 ? 'Off' : (v as number) % 60 === 0 ? `${(v as number) / 60} h` : `${v} min`;
    case 'velocidade': return rotuloDaVelocidade(v as number);
    case 'shuffle': return v === 'off' ? 'Off' : v === 'on' ? 'On' : 'Smart';
  }
}

/**
 * O editor de uma cena (6.0.4, a maquete "Editor de cenas"): o nome, o ícone e
 * o que ela muda. Cada linha avança uma escolha por toque, e "Leave as is" é
 * não lhe mexer. Guardar põe a cena na peça (ou numa peça nova).
 */
export function FolhaDaCena() {
  const aEditar = useGaveta((s) => s.cenaAEditar);
  const [cena, setCena] = useState<Cena | null>(aEditar?.cena ?? null);
  useEffect(() => { setCena(aEditar?.cena ?? null); }, [aEditar]);
  const fechar = () => useGaveta.setState({ cenaAEditar: null });

  const guardar = () => {
    if (!aEditar || !cena) return;
    const limpa = { ...cena, nome: cena.nome.trim() || 'Scene' };
    const g = useGaveta.getState().gaveta;
    if (!g) return;
    if (aEditar.pecaId) {
      const pecaId = aEditar.pecaId;
      mudarGaveta((x) => mudarCena(x, x.ativo, pecaId, limpa));
    } else {
      const r = juntar(g, g.ativo, { tipo: 'cena', cena: limpa });
      if (r.motivo === 'cheia') { avisarInfo('This space is full', 'Remove a tile to make room.'); return; }
      mudarGaveta(() => r.gaveta);
    }
    hapticSelection();
    fechar();
  };

  return (
    <BottomSheet visible={!!aEditar} onClose={fechar} titulo={aEditar?.pecaId ? 'Edit scene' : 'New scene'} detentes={[0.75, 1]}>
      {cena ? (
        <View style={{ gap: 16, paddingBottom: 24 }}>
          <View style={styles.cabeca}>
            <View style={styles.iconeGrande}>
              <Ionicons name={ICONE_DA_CENA[cena.icone]} size={26} color="#060608" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rotulo}>Name</Text>
              <TextInput
                value={cena.nome}
                onChangeText={(nome) => setCena({ ...cena, nome })}
                maxLength={24}
                placeholder="Scene name"
                placeholderTextColor={colors.textTertiary}
                selectionColor={colors.text}
                returnKeyType="done"
                style={styles.nome}
              />
            </View>
          </View>

          <View accessibilityRole="radiogroup" style={styles.icones}>
            {ICONES_DA_CENA.map((i) => (
              <Pressable key={i} accessibilityRole="radio" accessibilityState={{ selected: i === cena.icone }}
                accessibilityLabel={`Icon ${ICONES_DA_CENA.indexOf(i) + 1}`}
                onPress={() => { hapticSelection(); setCena({ ...cena, icone: i }); }}
                style={[styles.icone, i === cena.icone && styles.iconeEscolhido]}>
                <Ionicons name={ICONE_DA_CENA[i]} size={18} color={i === cena.icone ? colors.text : colors.textSecondary} />
              </Pressable>
            ))}
          </View>

          <View>
            <Text style={styles.seccao}>WHEN YOU TAP IT</Text>
            <View style={styles.caixa}>
              {LINHAS.map((l, n) => {
                const v = cena.definicoes[l.chave];
                return (
                  <Pressable key={l.chave} accessibilityRole="button"
                    accessibilityLabel={`${l.nome}, ${valorDe(l.chave, v)}`}
                    onPress={() => {
                      hapticSelection();
                      const proximo = proximaEscolha(l.chave, v as never);
                      const definicoes = { ...cena.definicoes };
                      if (proximo === undefined) delete definicoes[l.chave];
                      else (definicoes as Record<string, unknown>)[l.chave] = proximo;
                      setCena({ ...cena, definicoes });
                    }}
                    style={[styles.linha, n > 0 && styles.linhaComFio]}>
                    <Ionicons name={l.icone} size={18} color={colors.text} />
                    <Text style={styles.linhaNome}>{l.nome}</Text>
                    <Text style={[styles.valor, v === undefined && styles.valorDeixar]}>{valorDe(l.chave, v)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.nota}>Tap a row to change it. Tap the scene again in your drawer and everything goes back as it was.</Text>
          </View>

          <Pressable accessibilityRole="button" onPress={guardar}
            style={({ pressed }) => [styles.guardar, pressed && { opacity: 0.8 }]}>
            <Text style={styles.guardarTexto}>Save</Text>
          </Pressable>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  cabeca: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#121216', borderRadius: radii.lg, padding: 14 },
  iconeGrande: { width: 52, height: 52, borderRadius: radii.lg, backgroundColor: '#E9EAEE', alignItems: 'center', justifyContent: 'center' },
  rotulo: { color: colors.textSecondary, fontSize: 12 },
  nome: { color: colors.text, fontSize: 22, fontWeight: '800', padding: 0, marginTop: 2 },
  icones: { flexDirection: 'row', gap: 8 },
  icone: { width: 40, height: 40, borderRadius: radii.md, backgroundColor: '#16161B', alignItems: 'center', justifyContent: 'center' },
  iconeEscolhido: { backgroundColor: '#2B2D33', borderWidth: 2, borderColor: '#E9EAEE' },
  seccao: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.9, marginBottom: 6 },
  caixa: { backgroundColor: '#121216', borderRadius: radii.lg, paddingHorizontal: 14 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50 },
  linhaComFio: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(233,234,238,0.08)' },
  linhaNome: { flex: 1, color: colors.text, fontSize: 15 },
  valor: { color: colors.text, fontSize: 14, fontWeight: '700' },
  valorDeixar: { color: colors.textSecondary, fontWeight: '500' },
  nota: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 8 },
  guardar: { height: 50, borderRadius: radii.xl, backgroundColor: '#E9EAEE', alignItems: 'center', justifyContent: 'center' },
  guardarTexto: { color: '#060608', fontSize: 15, fontWeight: '700' },
});
