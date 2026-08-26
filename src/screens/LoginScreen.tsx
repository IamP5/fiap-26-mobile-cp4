import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ErrorMessage } from '../components/ErrorMessage';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextField } from '../components/TextField';
import { googleClientIds, googleNativeRedirectUri } from '../config/firebaseConfig';
import { useAuth } from '../hooks/useAuth';
import Constants, { ExecutionEnvironment } from 'expo-constants';

import { isAppleAuthAvailable } from '../services/authService';
import { useThemedStyles } from '../theme/ThemeContext';
import { interaction, maxFontScale, radius, spacing, type Theme } from '../theme/theme';
import { translateFirebaseError } from '../utils/errors';

WebBrowser.maybeCompleteAuthSession();

type LoginMode = 'signIn' | 'signUp';

type Styles = ReturnType<typeof createStyles>;

// Decorative app mark: a rounded-square tile with a white chat bubble, built
// from plain Views (same no-asset constraint as Icon.tsx).
const LogoMark: React.FC<{ styles: Styles }> = ({ styles }) => (
  <View style={styles.logoTile} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
    <View style={styles.logoBubble}>
      <View style={styles.logoDotsRow}>
        <View style={styles.logoDot} />
        <View style={styles.logoDot} />
        <View style={styles.logoDot} />
      </View>
    </View>
    <View style={styles.logoTail} />
  </View>
);

type ModeSwitchProps = {
  mode: LoginMode;
  disabled: boolean;
  onChange: (mode: LoginMode) => void;
  styles: Styles;
};

const MODE_LABELS: Record<LoginMode, string> = {
  signIn: 'Entrar',
  signUp: 'Criar conta',
};

// Segmented control in place of the old "Não tenho conta" ghost toggle: both
// destinations stay visible, and the active segment reads as a raised pill.
const ModeSwitch: React.FC<ModeSwitchProps> = ({ mode, disabled, onChange, styles }) => (
  <View style={styles.segment} accessibilityRole="tablist">
    {(['signIn', 'signUp'] as const).map((value: LoginMode) => {
      const active: boolean = mode === value;
      return (
        <Pressable
          key={value}
          onPress={() => onChange(value)}
          disabled={disabled || active}
          accessibilityRole="tab"
          accessibilityLabel={MODE_LABELS[value]}
          accessibilityState={{ selected: active, disabled }}
          style={({ pressed }: { pressed: boolean }) => [
            styles.segmentItem,
            active ? styles.segmentItemActive : null,
            pressed && !active ? styles.segmentItemPressed : null,
          ]}
        >
          <Text
            style={[styles.segmentLabel, active ? styles.segmentLabelActive : null]}
            numberOfLines={1}
            maxFontSizeMultiplier={maxFontScale.chrome}
          >
            {MODE_LABELS[value]}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

const resolveGoogleClientId = (): string | undefined => {
  if (Platform.OS === 'ios') {
    return googleClientIds.iosClientId ?? googleClientIds.expoClientId ?? googleClientIds.webClientId;
  }
  if (Platform.OS === 'android') {
    return (
      googleClientIds.androidClientId ?? googleClientIds.expoClientId ?? googleClientIds.webClientId
    );
  }
  return googleClientIds.webClientId ?? googleClientIds.expoClientId;
};

const GOOGLE_CLIENT_ID: string | undefined = resolveGoogleClientId();

/**
 * expo-auth-session only honours a custom native redirect scheme in standalone /
 * bare builds; inside Expo Go it falls back to the `exp://` development URL,
 * which Google's OAuth 2.0 policy rejects with `Error 400: invalid_request`.
 * Google sign-in therefore requires a development build on iOS/Android.
 */
const IS_EXPO_GO: boolean =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const GOOGLE_NATIVE_REDIRECT_URI: string | undefined =
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? googleNativeRedirectUri(Platform.OS)
    : undefined;

const GOOGLE_EXPO_GO_MESSAGE =
  'Login com Google indisponível no Expo Go: o Google bloqueia o redirecionamento "exp://" usado pelo ' +
  'Expo Go. Rode o app em um development build (npx expo run:ios / npx expo run:android) ou use a ' +
  'versão web para entrar com o Google.';

const GOOGLE_NOT_CONFIGURED_MESSAGE =
  'Login com Google indisponível: o Client ID do Google não está configurado para esta plataforma. ' +
  'Defina EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (e os IDs de iOS/Android) antes de usar esta opção.';

/**
 * The native Apple sheet has no cancel API, and when the Apple ID
 * authentication fails inside the sheet (common on the iOS Simulator, where
 * Apple's server rejects the account sign-in), `signInAsync` sometimes never
 * settles — which would leave `providerBusy` on and the whole form disabled
 * forever. After this deadline the form is released with an explanation; a
 * late success is still processed normally.
 */
const APPLE_WATCHDOG_MS = 75000;

const APPLE_STUCK_MESSAGE =
  'O login com a Apple não respondeu. No Simulador do iOS o Login com Apple costuma falhar; ' +
  'tente novamente em um aparelho físico ou entre com e-mail/senha.';

const APPLE_FAILED_MESSAGE =
  'Não foi possível concluir o login com a Apple. Tente novamente ou use e-mail/senha.';

const readErrorCode = (error: unknown): string | null => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code: unknown = error.code;
    return typeof code === 'string' ? code : null;
  }
  return null;
};

type GoogleAuthButtonProps = {
  disabled: boolean;
  busy: boolean;
  onStart: () => void;
  onSettled: () => void;
  onIdToken: (idToken: string) => void;
  onFailure: (message: string) => void;
};

type GoogleAuthResponse = ReturnType<typeof Google.useIdTokenAuthRequest>[1];

type GoogleWebButtonProps = {
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
};

/**
 * On the web the Firebase popup handler is used instead of expo-auth-session:
 * its redirect URI is already authorized for this Firebase project, while an
 * auth-session redirect would need every dev host registered on the OAuth client.
 */
const GoogleWebButton: React.FC<GoogleWebButtonProps> = ({ disabled, busy, onPress }) => (
  <PrimaryButton
    label="Continuar com Google"
    variant="google"
    onPress={onPress}
    loading={busy}
    disabled={disabled}
  />
);

const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({
  disabled,
  busy,
  onStart,
  onSettled,
  onIdToken,
  onFailure,
}) => {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    iosClientId: googleClientIds.iosClientId,
    androidClientId: googleClientIds.androidClientId,
    webClientId: googleClientIds.webClientId,
    redirectUri: GOOGLE_NATIVE_REDIRECT_URI,
  });

  // Each response object is handled once, so a re-render can never trigger a
  // second sign-in with the same token.
  const handledResponseRef = useRef<GoogleAuthResponse>(null);

  useEffect(() => {
    if (response === null || handledResponseRef.current === response) {
      return;
    }
    handledResponseRef.current = response;

    if (response.type === 'success') {
      const idToken: string | undefined = response.params.id_token;
      if (typeof idToken === 'string' && idToken.length > 0) {
        onIdToken(idToken);
      } else {
        onFailure('Não foi possível obter o token de identificação do Google. Tente novamente.');
      }
      onSettled();
      return;
    }

    if (response.type === 'error') {
      onFailure('Falha na autenticação com o Google. Tente novamente.');
      onSettled();
      return;
    }

    if (response.type === 'opened') {
      // Web redirect flow: the browser took over, the request is still running.
      return;
    }

    // 'cancel' | 'dismiss' | 'locked': the user backed out, so release the form.
    onSettled();
  }, [response, onIdToken, onFailure, onSettled]);

  const handlePress = useCallback((): void => {
    // The whole browser round-trip is covered by the busy flag: without it the
    // form would stay enabled and a second tap (or an email sign-in) could race
    // this one.
    onStart();
    void promptAsync().catch((): void => {
      onFailure('Não foi possível abrir o login do Google. Tente novamente.');
      onSettled();
    });
  }, [promptAsync, onStart, onSettled, onFailure]);

  return (
    <PrimaryButton
      label="Continuar com Google"
      variant="google"
      onPress={handlePress}
      loading={busy}
      disabled={disabled || request === null}
    />
  );
};

export const LoginScreen: React.FC = () => {
  const {
    loading,
    error,
    signIn,
    signUp,
    signInWithGoogle,
    signInWithGoogleOnWeb,
    signInWithApple,
    clearError,
  } = useAuth();

  const styles = useThemedStyles(createStyles);
  const [mode, setMode] = useState<LoginMode>('signIn');
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState<boolean>(false);
  const [providerBusy, setProviderBusy] = useState<boolean>(false);
  const [googleBusy, setGoogleBusy] = useState<boolean>(false);

  const googleConfigured = useMemo<boolean>(
    () => typeof GOOGLE_CLIENT_ID === 'string' && GOOGLE_CLIENT_ID.length > 0,
    [],
  );

  useEffect(() => {
    let active = true;
    if (Platform.OS !== 'ios') {
      return () => {
        active = false;
      };
    }
    isAppleAuthAvailable()
      .then((available: boolean) => {
        if (active) {
          setAppleAvailable(available);
        }
      })
      .catch(() => {
        if (active) {
          setAppleAvailable(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const busy = loading || providerBusy || googleBusy;

  const resetErrors = useCallback((): void => {
    setLocalError(null);
    clearError();
  }, [clearError]);

  const handleGoogleWebPress = useCallback((): void => {
    resetErrors();
    setGoogleBusy(true);
    void signInWithGoogleOnWeb().finally((): void => {
      setGoogleBusy(false);
    });
  }, [resetErrors, signInWithGoogleOnWeb]);

  const handleModeChange = useCallback(
    (next: LoginMode): void => {
      resetErrors();
      setMode(next);
    },
    [resetErrors],
  );

  const handleSubmit = useCallback((): void => {
    resetErrors();
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();

    if (trimmedEmail.length === 0 || password.length === 0) {
      setLocalError('Informe e-mail e senha para continuar.');
      return;
    }
    if (mode === 'signUp' && trimmedName.length === 0) {
      setLocalError('Informe seu nome para criar a conta.');
      return;
    }
    if (mode === 'signUp' && password.length < 6) {
      setLocalError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (mode === 'signIn') {
      void signIn({ email: trimmedEmail, password });
      return;
    }
    void signUp({ name: trimmedName, email: trimmedEmail, password });
  }, [email, mode, name, password, resetErrors, signIn, signUp]);

  const handleGoogleToken = useCallback(
    (idToken: string): void => {
      resetErrors();
      void signInWithGoogle(idToken);
    },
    [resetErrors, signInWithGoogle],
  );

  const handleGoogleStart = useCallback((): void => {
    resetErrors();
    setGoogleBusy(true);
  }, [resetErrors]);

  const handleGoogleSettled = useCallback((): void => {
    setGoogleBusy(false);
  }, []);

  const handleProviderFailure = useCallback(
    (message: string): void => {
      clearError();
      setLocalError(message);
    },
    [clearError],
  );

  const handleGoogleExpoGo = useCallback((): void => {
    resetErrors();
    setLocalError(GOOGLE_EXPO_GO_MESSAGE);
  }, [resetErrors]);

  const handleGoogleUnavailable = useCallback((): void => {
    clearError();
    setLocalError(GOOGLE_NOT_CONFIGURED_MESSAGE);
  }, [clearError]);

  const handleApplePress = useCallback((): void => {
    const run = async (): Promise<void> => {
      resetErrors();
      setProviderBusy(true);
      const watchdog = setTimeout((): void => {
        setProviderBusy(false);
        setLocalError(APPLE_STUCK_MESSAGE);
      }, APPLE_WATCHDOG_MS);
      try {
        const rawNonce = Crypto.randomUUID();
        const hashedNonce = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          rawNonce,
        );
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
          nonce: hashedNonce,
        });
        const identityToken = credential.identityToken;
        if (typeof identityToken !== 'string' || identityToken.length === 0) {
          setLocalError('A Apple não retornou um token de identificação. Tente novamente.');
          return;
        }
        const parts = [credential.fullName?.givenName, credential.fullName?.familyName].filter(
          (part): part is string => typeof part === 'string' && part.trim().length > 0,
        );
        const fullName = parts.length > 0 ? parts.join(' ') : null;
        await signInWithApple(identityToken, rawNonce, fullName);
      } catch (appleError: unknown) {
        const code = readErrorCode(appleError);
        if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
          return;
        }
        // Native ASAuthorization failures (the sheet itself errored out, e.g.
        // the Simulator's Apple ID auth rejecting the account) carry
        // ERR_REQUEST_* codes with unhelpful raw messages.
        if (code !== null && code.startsWith('ERR_REQUEST')) {
          setLocalError(APPLE_FAILED_MESSAGE);
          return;
        }
        setLocalError(translateFirebaseError(appleError));
      } finally {
        clearTimeout(watchdog);
        setProviderBusy(false);
      }
    };
    void run();
  }, [resetErrors, signInWithApple]);

  const displayedError = localError ?? error;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <LogoMark styles={styles} />
          <Text style={styles.title}>CP4 Chat</Text>
          <Text style={styles.subtitle}>
            {mode === 'signIn'
              ? 'Converse com seus contatos de forma simples e rápida.'
              : 'Crie sua conta para começar a conversar.'}
          </Text>
        </View>

        <View style={styles.card}>
          <ModeSwitch mode={mode} disabled={busy} onChange={handleModeChange} styles={styles} />

          {mode === 'signUp' ? (
            <TextField
              label="Nome"
              value={name}
              onChangeText={setName}
              placeholder="Seu nome"
              autoCapitalize="words"
              editable={!busy}
            />
          ) : null}

          <TextField
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            placeholder="voce@exemplo.com"
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!busy}
          />

          <TextField
            label="Senha"
            value={password}
            onChangeText={setPassword}
            placeholder="Mínimo de 6 caracteres"
            secureTextEntry
            autoCapitalize="none"
            editable={!busy}
          />

          {displayedError !== null ? (
            <ErrorMessage message={displayedError} onDismiss={resetErrors} />
          ) : null}

          <PrimaryButton
            label={mode === 'signIn' ? 'Entrar' : 'Criar conta'}
            onPress={handleSubmit}
            loading={busy}
            disabled={busy}
          />
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerLabel}>ou</Text>
          <View style={styles.divider} />
        </View>

        <View style={styles.providers}>
          {Platform.OS === 'web' ? (
            <GoogleWebButton
              disabled={busy}
              busy={googleBusy}
              onPress={handleGoogleWebPress}
            />
          ) : IS_EXPO_GO ? (
            <PrimaryButton
              label="Continuar com Google"
              variant="google"
              onPress={handleGoogleExpoGo}
              disabled={busy}
            />
          ) : googleConfigured ? (
            <GoogleAuthButton
              disabled={busy}
              busy={googleBusy}
              onStart={handleGoogleStart}
              onSettled={handleGoogleSettled}
              onIdToken={handleGoogleToken}
              onFailure={handleProviderFailure}
            />
          ) : (
            <PrimaryButton
              label="Continuar com Google"
              variant="google"
              onPress={handleGoogleUnavailable}
              disabled={busy}
            />
          )}

          {Platform.OS === 'ios' && appleAvailable ? (
            <PrimaryButton
              label="Continuar com Apple"
              variant="apple"
              onPress={handleApplePress}
              loading={providerBusy}
              disabled={busy}
            />
          ) : null}
        </View>

        <Text style={styles.hint}>
          Regra do app: contas de e-mail/senha só conversam com contas Google ou Apple, e vice-versa.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = ({ colors, elevation }: Theme) => StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logoTile: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...elevation.raised,
  },
  logoBubble: {
    width: 34,
    height: 26,
    borderRadius: radius.md,
    // Deliberately the always-white token (not onPrimary/textOnBubbleMine,
    // which vary per scheme): the tile is primary-with-white-bubble in both.
    backgroundColor: colors.avatarText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoDotsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  logoDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  logoTail: {
    width: 10,
    height: 10,
    backgroundColor: colors.avatarText,
    borderBottomLeftRadius: 2,
    marginTop: -7,
    marginRight: 22,
    transform: [{ rotate: '45deg' }],
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 300,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...elevation.raised,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    padding: spacing.xs,
    marginBottom: spacing.xs,
  },
  segmentItem: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemActive: {
    backgroundColor: colors.surface,
    ...elevation.card,
  },
  segmentItemPressed: {
    opacity: interaction.pressedOpacity,
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
  segmentLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerLabel: {
    marginHorizontal: spacing.sm,
    color: colors.muted,
    fontSize: 13,
  },
  providers: {
    gap: spacing.sm,
  },
  hint: {
    marginTop: spacing.lg,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
});
