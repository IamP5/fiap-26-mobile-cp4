import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AuthLayout } from '../components/AuthLayout';
import { ErrorMessage } from '../components/ErrorMessage';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import type { ScreenProps } from '../types/navigation';
import { isValidEmail } from '../utils/format';
import { haptics } from '@/lib/haptics';
import { fadeOut, layout, riseIn } from '@/lib/motion';

export const LoginScreen: React.FC<ScreenProps<'Login'>> = ({ navigation }) => {
  const { loading, error, notice, signIn, resetPassword, clearError, clearNotice } = useAuth();
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
      haptics.error();
      setLocalError('Informe um e-mail válido.');
      return;
    }
    if (password.length === 0) {
      haptics.error();
      setLocalError('Informe sua senha.');
      return;
    }
    void signIn({ email, password });
  }, [email, password, resetErrors, signIn]);

  const handleForgot = useCallback((): void => {
    resetErrors();
    if (!isValidEmail(email)) {
      haptics.error();
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

  // Auth failures from the server get the same tactile cue as local ones.
  useEffect(() => {
    if (error !== null) {
      haptics.error();
    }
  }, [error]);

  return (
    <AuthLayout
      title="CP4 Chat"
      subtitle="Converse com pessoas e grupos em tempo real."
      footer={
        <View className="mt-6 flex-row items-center justify-center gap-1.5">
          <Text className="text-muted-foreground text-[15px]">Ainda não tem conta?</Text>
          <Pressable onPress={goToRegister} disabled={loading} accessibilityRole="button" hitSlop={8} className="active:opacity-70">
            <Text className="text-primary text-[15px] font-semibold">Criar conta</Text>
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
      {displayedError !== null ? (
        <Animated.View key={displayedError} entering={riseIn} exiting={fadeOut} layout={layout}>
          <ErrorMessage message={displayedError} onDismiss={resetErrors} />
        </Animated.View>
      ) : null}
      {notice !== null && displayedError === null ? (
        <Animated.View
          key={notice}
          entering={riseIn}
          exiting={fadeOut}
          layout={layout}
          className="border-success/30 bg-success/10 rounded-lg border px-3 py-2.5"
          accessibilityLiveRegion="polite"
        >
          <Text className="text-success text-center text-sm">{notice}</Text>
        </Animated.View>
      ) : null}
      <Animated.View layout={layout} className="gap-2">
        <PrimaryButton label="Entrar" onPress={handleSubmit} loading={loading} disabled={loading} />
        <PrimaryButton label="Esqueci minha senha" variant="ghost" onPress={handleForgot} disabled={loading} />
      </Animated.View>
    </AuthLayout>
  );
};

export default LoginScreen;
