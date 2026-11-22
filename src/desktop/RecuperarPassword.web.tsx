import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Field } from './ui.web';
import { styles } from './estilos.web';
import { COR, FONT } from './tokens.web';
import { useAuth } from '../state/auth';
import { erroDaPassword, limparCodigo } from '../lib/recuperacaoDaPassword';

/** Quanto se espera para pedir outro código (o Supabase limita os emails). */
const ESPERA_PARA_REENVIAR_S = 60;
const SEM_REDE = "Couldn't reach Duotone. Check your connection and try again.";

/**
 * Mudar a palavra-passe com um código por email, no PC (22/11,
 * `lib/recuperacaoDaPassword.ts`). Vive no cartão do início de sessão ("Forgot
 * password?") e num diálogo das Definições ("Reset password", com o email da
 * conta fixo). Dois passos: o email, e depois o código e a palavra-passe nova.
 * Quem chama mostra o título; aqui só o texto, os campos e as ações.
 */
export function RecuperarPassword({ emailInicial = '', emailFixo = false, aoVoltar, aoMudar, rotuloDoVoltar = 'Back to sign in' }: {
  emailInicial?: string;
  /** Nas Definições: o email é o da conta, e não se escreve. */
  emailFixo?: boolean;
  aoVoltar: () => void;
  /** A palavra-passe mudou (no início de sessão, a app já está a abrir). */
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
  // Sair a meio (fechar o diálogo, mudar de modo) não deixa a sessão do código no ar.
  useEffect(() => () => { void useAuth.getState().cancelarRecuperacao(); }, []);

  const pedir = async () => {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      const e = await useAuth.getState().pedirCodigoDeRecuperacao(email);
      if (e) setErro(e);
      else { setPasso('codigo'); setEspera(ESPERA_PARA_REENVIAR_S); }
    } catch { setErro(SEM_REDE); } finally { setOcupado(false); }
  };
  const mudar = async () => {
    if (ocupado) return;
    const invalida = erroDaPassword(nova, repetida);
    if (invalida) { setErro(invalida); return; }
    setOcupado(true);
    setErro(null);
    try {
      const e = await useAuth.getState().mudarPasswordComCodigo(email, codigo, nova);
      if (e) setErro(e);
      else aoMudar?.();
    } catch { setErro(SEM_REDE); } finally { setOcupado(false); }
  };
  const voltar = () => { void useAuth.getState().cancelarRecuperacao(); aoVoltar(); };

  if (passo === 'email') {
    return <View style={{ gap: 12 }}>
      <Text style={[styles.authBody, { marginTop: 0, marginBottom: 4 }]}>
        {emailFixo ? `We'll send a code to ${email} to choose a new password.` : "Enter the email of your account and we'll send you a code to choose a new password."}
      </Text>
      {emailFixo ? null : <Field icon="mail-outline" placeholder="Email" value={email} onChangeText={setEmail} onSubmitEditing={() => void pedir()}
        keyboardType="email-address" autoCapitalize="none" autoComplete="email" autoFocus />}
      {erro ? <Text style={styles.error}>{erro}</Text> : null}
      <Button onPress={() => void pedir()} ocupado={ocupado}>{ocupado ? 'Please wait…' : 'Send code'}</Button>
      <Text accessibilityRole="button" onPress={voltar} style={ligacao}>{rotuloDoVoltar}</Text>
    </View>;
  }
  return <View style={{ gap: 12 }}>
    <Text style={[styles.authBody, { marginTop: 0, marginBottom: 4 }]}>
      {`We sent a code to ${email}. It can take a minute; check your spam folder too.`}
    </Text>
    <Field icon="keypad-outline" placeholder="Code from the email" value={codigo} onChangeText={(t) => setCodigo(limparCodigo(t))}
      keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus />
    <Field icon="lock-closed-outline" placeholder="New password" value={nova} onChangeText={setNova} secureTextEntry autoComplete="new-password" />
    <Field icon="lock-closed-outline" placeholder="Repeat the new password" value={repetida} onChangeText={setRepetida} secureTextEntry
      autoComplete="new-password" onSubmitEditing={() => void mudar()} />
    {erro ? <Text style={styles.error}>{erro}</Text> : null}
    <Button onPress={() => void mudar()} ocupado={ocupado}>{ocupado ? 'Please wait…' : 'Change password'}</Button>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text accessibilityRole="button" accessibilityState={{ disabled: espera > 0 || ocupado }}
        onPress={espera > 0 || ocupado ? undefined : () => void pedir()} style={[ligacao, (espera > 0 || ocupado) && { color: COR.textoFraco, textDecorationLine: 'none' }]}>
        {espera > 0 ? `Send a new code in ${espera} s` : 'Send a new code'}
      </Text>
      <Text accessibilityRole="button" onPress={voltar} style={ligacao}>{rotuloDoVoltar}</Text>
    </View>
  </View>;
}

/** Uma ação de texto, como a ligação da privacidade do cartão. */
const ligacao = { fontFamily: FONT.body, color: COR.textoMedio, fontSize: 12, textDecorationLine: 'underline', cursor: 'pointer', alignSelf: 'center' } as any;

/** O "Forgot password?" do cartão do início de sessão. */
export const estiloDoEsqueci = { fontFamily: FONT.body, color: COR.textoMedio, fontSize: 12, alignSelf: 'flex-end', marginTop: -4, cursor: 'pointer' } as any;
