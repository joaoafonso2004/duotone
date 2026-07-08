import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Input } from '../components/Input';
import { useAuth } from '../state/auth';
import { hapticImpact, hapticNotification, hapticSelection } from '../lib/haptics';
import { colors, radii, spacing, type } from '../theme';

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const signIn = useAuth((s) => s.signIn);
  const signUp = useAuth((s) => s.signUp);

  const [mode, setMode] = useState(0); // 0 = sign in, 1 = sign up
  const [username, setUsername] = useState('');
  const [identifier, setIdentifier] = useState(''); // login: email OU username
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade-in animation for inputs
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const triggerShake = () => {
    hapticImpact();
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  };

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (mode === 0) {
      if (!identifier.trim() || !password) {
        setError('Preencha o seu e-mail/username e a palavra-passe.');
        triggerShake();
        return;
      }
    } else if (!email.trim() || !password || !username.trim()) {
      setError('Preencha o username, e-mail e palavra-passe.');
      triggerShake();
      return;
    }
    setLoading(true);
    try {
      if (mode === 0) {
        const err = await signIn(identifier, password);
        if (err) {
          setError(err);
          triggerShake();
        } else {
          hapticNotification();
        }
      } else {
        const err = await signUp(email, password, username);
        if (err) {
          setError(err);
          triggerShake();
        } else {
          hapticNotification();
          setInfo(
            'Conta criada. Se a confirmação de e-mail estiver ativa, verifique a sua caixa de entrada.'
          );
        }
      }
    } catch (e: any) {
      setError(e?.message ?? 'Ocorreu um erro.');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable onPress={Keyboard.dismiss} style={styles.root}>
      {/* Background Gradient */}
      <LinearGradient
        colors={['#0F0F12', '#0A0A0C']}
        style={StyleSheet.absoluteFill}
      />

      {/* Background interlocking circles brand image (full-screen layout) */}
      <Image
        source={require('../../assets/login_bg.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top, paddingBottom: insets.bottom + 30 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Spacer to push form below the header circles */}
          <View style={{ height: H * 0.35 }} />

          {/* Wordmark Duotone (Centered, small, subtle gray) */}
          <View style={styles.brand}>
            <Text style={styles.wordmark}>Duotone</Text>
          </View>

          {/* Form Container (Animated for fade-in & shake) */}
          <Animated.View
            style={[
              styles.formContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateX: shakeAnim }],
              },
            ]}
          >
            {/* Custom Tab Switcher matching the screenshot exactly */}
            <View style={styles.customTabs}>
              <Pressable
                onPress={() => {
                  hapticSelection();
                  setMode(0);
                  setError(null);
                  setInfo(null);
                }}
                style={[styles.tabButton, mode === 0 && styles.tabButtonActive]}
              >
                <Text style={[styles.tabText, mode === 0 && styles.tabTextActive]}>
                  Sign in
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  hapticSelection();
                  setMode(1);
                  setError(null);
                  setInfo(null);
                }}
                style={[styles.tabButton, mode === 1 && styles.tabButtonActive]}
              >
                <Text style={[styles.tabText, mode === 1 && styles.tabTextActive]}>
                  Create account
                </Text>
              </Pressable>
            </View>

            {/* Inputs Section */}
            <View style={styles.inputsWrap}>
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
                    containerStyle={styles.inputCustom}
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
                    containerStyle={styles.inputCustom}
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
                  containerStyle={styles.inputCustom}
                />
              )}
              <Input
                icon="lock-closed-outline"
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                textContentType={mode === 1 ? 'newPassword' : 'password'}
                containerStyle={[styles.inputCustom, error ? styles.inputError : null]}
                right={
                  <Pressable
                    onPress={() => {
                      hapticSelection();
                      setShowPassword(!showPassword);
                    }}
                    hitSlop={8}
                    style={styles.eyeBtn}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={colors.textTertiary}
                    />
                  </Pressable>
                }
              />
            </View>

            {mode === 0 && (
              <Pressable
                onPress={() => {
                  hapticSelection();
                }}
                style={styles.forgotBtn}
                hitSlop={6}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {info ? <Text style={styles.infoText}>{info}</Text> : null}

            {/* Premium off-white solid button at the bottom */}
            <Pressable
              onPress={submit}
              disabled={loading}
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && { opacity: 0.8 },
                loading && { opacity: 0.6 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {mode === 0 ? 'Sign in' : 'Create account'}
                </Text>
              )}
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },

  scrollContent: {
    paddingHorizontal: spacing.xl,
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  brand: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  wordmark: {
    fontSize: 26,
    fontWeight: '700',
    color: '#8E8E93',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  formContainer: {
    width: '100%',
  },
  customTabs: {
    flexDirection: 'row',
    backgroundColor: '#111116',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#242430',
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  tabButtonActive: {
    backgroundColor: '#202028',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  inputsWrap: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  inputCustom: {
    backgroundColor: '#121217',
    borderRadius: 14,
    borderColor: '#242430',
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  inputError: {
    borderColor: colors.danger,
  },
  eyeBtn: {
    paddingLeft: spacing.sm,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: spacing.md,
  },
  forgotText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 13,
    color: colors.spotify,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: '#E5E5EA',
    borderRadius: 27,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    width: '100%',
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
});
