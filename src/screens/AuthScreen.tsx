import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Input } from '../components/Input';
import { PillButton } from '../components/PillButton';
import { SegmentedControl } from '../components/SegmentedControl';
import { useAuth } from '../state/auth';
import { colors, radii, spacing, type } from '../theme';

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const signIn = useAuth((s) => s.signIn);
  const signUp = useAuth((s) => s.signUp);

  const [mode, setMode] = useState(0); // 0 = sign in, 1 = sign up
  const [username, setUsername] = useState('');
  const [identifier, setIdentifier] = useState(''); // login: email OU username
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (mode === 0) {
      if (!identifier.trim() || !password) {
        setError('Fill in your email/username and password.');
        return;
      }
    } else if (!email.trim() || !password || !username.trim()) {
      setError('Fill in a username, email and password.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 0) {
        const err = await signIn(identifier, password);
        if (err) setError(err);
      } else {
        const err = await signUp(email, password, username);
        if (err) setError(err);
        else
          setInfo(
            'Account created. If email confirmation is enabled, check your inbox before signing in.'
          );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* blobs de gradiente no fundo */}
      <LinearGradient
        colors={['rgba(124,58,237,0.35)', 'rgba(124,58,237,0)']}
        style={[styles.blob, { top: -80, left: -100 }]}
      />
      <LinearGradient
        colors={['rgba(219,39,119,0.28)', 'rgba(219,39,119,0)']}
        style={[styles.blob, { top: 120, right: -120 }]}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingTop: insets.top + 84, paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <View style={styles.logoRow}>
              <View style={[styles.logoDot, { backgroundColor: colors.youtube }]} />
              <View style={[styles.logoDot, { backgroundColor: colors.spotify }]} />
            </View>
            <Text style={styles.wordmark}>Duotone</Text>
            <Text style={styles.tagline}>
              Your music. One library, your playlists.
            </Text>
          </View>

          <View style={styles.card}>
            <SegmentedControl
              options={['Sign in', 'Create account']}
              value={mode}
              onChange={(i) => {
                setMode(i);
                setError(null);
                setInfo(null);
              }}
            />

            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              {mode === 1 ? (
                <>
                  <Input
                    icon="at-outline"
                    placeholder="Username"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="username"
                  />
                  <Input
                    icon="mail-outline"
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoComplete="email"
                  />
                </>
              ) : (
                <Input
                  icon="person-outline"
                  placeholder="Email or username"
                  value={identifier}
                  onChangeText={setIdentifier}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="username"
                />
              )}
              <Input
                icon="lock-closed-outline"
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType={mode === 1 ? 'newPassword' : 'password'}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {info ? <Text style={styles.info}>{info}</Text> : null}

            <PillButton
              label={mode === 0 ? 'Sign in' : 'Create account'}
              onPress={submit}
              loading={loading}
              style={{ marginTop: spacing.lg }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  blob: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
  },
  body: {
    paddingHorizontal: spacing.xl,
    flexGrow: 1,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.md,
  },
  logoDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  wordmark: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  tagline: {
    ...type.caption,
    marginTop: 6,
  },
  card: {
    backgroundColor: 'rgba(20,20,28,0.85)',
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  error: {
    ...type.caption,
    color: colors.danger,
    marginTop: spacing.md,
  },
  info: {
    ...type.caption,
    color: colors.spotify,
    marginTop: spacing.md,
  },
});
