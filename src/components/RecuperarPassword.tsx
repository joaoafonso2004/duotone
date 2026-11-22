import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Input } from './Input';
import { useAuth } from '../state/auth';
import { erroDaPassword, limparCodigo } from '../lib/recuperacaoDaPassword';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { colors, spacing } from '../theme';

/** Quanto se espera para pedir outro código (o Supabase limita os emails). */
const ESPERA_PARA_REENVIAR_S = 60;
const SEM_REDE = "Couldn't reach Duotone. Check your connection and try again.";

/**
 * Mudar a palavra-passe com um código por email, no iPhone (22/11,
 * `lib/recuperacaoDaPassword.ts`; o do PC é o `desktop/RecuperarPassword.web.tsx`).
 * No ecrã de entrada, no lugar do formulário ("Forgot password?"), e numa folha
 * das Definições ("Reset password", com o email da conta fixo). Com o aspeto do
 * ecrã de entrada: os mesmos campos e o mesmo botão claro.
 */
export function RecuperarPassword({ emailInicial = '', emailFixo = false, aoVoltar, aoMudar, rotuloDoVoltar = 'Back to sign in' }: {
  emailInicial?: string;
  emailFixo?: boolean;
  aoVoltar: () => void;
  aoMudar?: () => void;
  rotuloDoVoltar?: string;
}) {
  const [passo, setPasso] = useState<'email' | 'codigo'>('email');
  const [email, setEmail] = useState(emailFixo || emailInicial.includes('@') ? emailInicial : '');
  const [codigo, setCodigo] = useState('');
  const [nova, setNova] = useState('');
  const [repetida, setRepetida] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [espera, setEspera] = useState(0);
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);
  // Sair a meio não deixa a sessão do código no ar.
  useEffect(() => () => { void useAuth.getState().cancelarRecuperacao(); }, []);

  const pedir = async () => {
    if (ocupado) return;
    hapticSelection();
    setOcupado(true);
    setErro(null);
    try {
      const e = await useAuth.getState().pedirCodigoDeRecuperacao(email);
      if (e) { setErro(e); hapticNotification(); }
      else { setPasso('codigo'); setEspera(ESPERA_PARA_REENVIAR_S); }
    } catch { setErro(SEM_REDE); } finally { setOcupado(false); }
  };
  const mudar = async () => {
    if (ocupado) return;
    const invalida = erroDaPassword(nova, repetida);
    if (invalida) { setErro(invalida); hapticNotification(); return; }
    setOcupado(true);
    setErro(null);
    try {
      const e = await useAuth.getState().mudarPasswordComCodigo(email, codigo, nova);
      hapticNotification();
      if (e) setErro(e);
      else aoMudar?.();
    } catch { setErro(SEM_REDE); } finally { setOcupado(false); }
  };
  const voltar = () => { hapticSelection(); void useAuth.getState().cancelarRecuperacao(); aoVoltar(); };

  const botao = (texto: string, aoTocar: () => void) => <Pressable onPress={aoTocar} disabled={ocupado} accessibilityRole="button"
    style={({ pressed }) => [s.botao, pressed && { opacity: 0.8 }, ocupado && { opacity: 0.6 }]}>
    {ocupado ? <ActivityIndicator color={colors.bg} size="small" /> : <Text style={s.botaoTexto}>{texto}</Text>}
  </Pressable>;

  if (passo === 'email') {
    return <View style={s.caixa}>
      <Text style={s.texto}>
        {emailFixo ? `We'll send a code to ${email} to choose a new password.` : "Enter the email of your account and we'll send you a code to choose a new password."}
      </Text>
      {emailFixo ? null : <Input icon="mail-outline" placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
        keyboardType="email-address" textContentType="emailAddress" autoComplete="email" containerStyle={s.campo} onSubmitEditing={() => void pedir()} />}
      {erro ? <Text style={s.erro}>{erro}</Text> : null}
      {botao('Send code', () => void pedir())}
      <Pressable onPress={voltar} hitSlop={8} accessibilityRole="button" style={s.ligacao}><Text style={s.ligacaoTexto}>{rotuloDoVoltar}</Text></Pressable>
    </View>;
  }
  return <View style={s.caixa}>
    <Text style={s.texto}>{`We sent a code to ${email}. It can take a minute; check your spam folder too.`}</Text>
    <Input icon="keypad-outline" placeholder="Code from the email" value={codigo} onChangeText={(t) => setCodigo(limparCodigo(t))}
      keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" containerStyle={s.campo} />
    <Input icon="lock-closed-outline" placeholder="New password" value={nova} onChangeText={setNova} secureTextEntry
      textContentType="newPassword" autoComplete="new-password" containerStyle={s.campo} />
    <Input icon="lock-closed-outline" placeholder="Repeat the new password" value={repetida} onChangeText={setRepetida} secureTextEntry
      textContentType="newPassword" autoComplete="new-password" containerStyle={s.campo} onSubmitEditing={() => void mudar()} />
    {erro ? <Text style={s.erro}>{erro}</Text> : null}
    {botao('Change password', () => void mudar())}
    <View style={s.linha}>
      <Pressable onPress={espera > 0 || ocupado ? undefined : () => void pedir()} disabled={espera > 0 || ocupado} hitSlop={8} accessibilityRole="button">
        <Text style={[s.ligacaoTexto, (espera > 0 || ocupado) && s.apagado]}>{espera > 0 ? `Send a new code in ${espera} s` : 'Send a new code'}</Text>
      </Pressable>
      <Pressable onPress={voltar} hitSlop={8} accessibilityRole="button"><Text style={s.ligacaoTexto}>{rotuloDoVoltar}</Text></Pressable>
    </View>
  </View>;
}

const s = StyleSheet.create({
  caixa: { gap: spacing.md, marginTop: spacing.lg },
  texto: { fontSize: 14, lineHeight: 20, color: '#8E8E93' },
  campo: {
    backgroundColor: '#121217', borderRadius: 14, borderCurve: 'continuous', borderColor: '#242430', borderWidth: 1, paddingHorizontal: spacing.md,
  },
  erro: { fontSize: 13, color: colors.danger, textAlign: 'center' },
  botao: {
    backgroundColor: colors.text, borderRadius: 27, borderCurve: 'continuous', minHeight: 54,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm, width: '100%',
  },
  botaoTexto: { fontSize: 16, fontWeight: '700', color: colors.bg },
  linha: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  ligacao: { alignSelf: 'center', marginTop: spacing.xs },
  ligacaoTexto: { fontSize: 13, fontWeight: '500', color: '#8E8E93' },
  apagado: { color: colors.textTertiary },
});
