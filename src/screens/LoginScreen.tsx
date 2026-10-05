import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthLayout } from '../components/AuthLayout';
import { ErrorMessage } from '../components/ErrorMessage';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { useThemedStyles } from '../theme/ThemeContext';
import { spacing, type Theme } from '../theme/theme';
import type { ScreenProps } from '../types/navigation';
import { isValidEmail } from '../utils/format';

export const LoginScreen: React.FC<ScreenProps<'Login'>> = ({ navigation }) => {
  const { loading, error, notice, signIn, resetPassword, clearError, clearNotice } = useAuth();
  const styles = useThemedStyles(createStyles);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);

  const resetErrors = useCallback((): void => {
    setLocalError(null);
    clearError();
    clearNotice();
  }, [clearError, clearNotice]);

  const handleSubmit = useCallback((): void => {
    resetErrors();
    if (!isValidEmail(email)) {
      setLocalError('Informe um e-mail válido.');
      return;
    }
    if (password.length === 0) {
      setLocalError('Informe sua senha.');
      return;
    }
    void signIn({ email, password });
  }, [email, password, resetErrors, signIn]);

  const handleForgot = useCallback((): void => {
    resetErrors();
    if (!isValidEmail(email)) {
      setLocalError('Digite seu e-mail acima para receber o link de redefinição.');
      return;
    }
    void resetPassword(email);
  }, [email, resetErrors, resetPassword]);

  const goToRegister = useCallback((): void => {
    resetErrors();
    navigation.navigate('Register');
  }, [navigation, resetErrors]);

  const displayedError: string | null = localError ?? error;

  return (
    <AuthLayout
      title="CP4 Chat"
      subtitle="Converse com pessoas e grupos em tempo real."
      footer={
        <View style={styles.footer}>
          <Text style={styles.footerText}>Ainda não tem conta?</Text>
          <Pressable onPress={goToRegister} disabled={loading} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.link}>Criar conta</Text>
          </Pressable>
        </View>
      }
    >
      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        placeholder="voce@exemplo.com"
        keyboardType="email-address"
        editable={!loading}
        returnKeyType="next"
      />
      <TextField
        label="Senha"
        value={password}
        onChangeText={setPassword}
        placeholder="Sua senha"
        secureTextEntry
        editable={!loading}
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />
      {displayedError !== null ? <ErrorMessage message={displayedError} onDismiss={resetErrors} /> : null}
      {notice !== null && displayedError === null ? <Text style={styles.notice}>{notice}</Text> : null}
      <PrimaryButton label="Entrar" onPress={handleSubmit} loading={loading} disabled={loading} />
      <PrimaryButton label="Esqueci minha senha" variant="ghost" onPress={handleForgot} disabled={loading} />
    </AuthLayout>
  );
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.xs,
      marginTop: spacing.lg,
    },
    footerText: { fontSize: 15, color: colors.muted },
    link: { fontSize: 15, fontWeight: '700', color: colors.primary },
    notice: { fontSize: 14, color: colors.success, textAlign: 'center' },
  });

export default LoginScreen;
