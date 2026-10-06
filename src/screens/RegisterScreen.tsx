import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AuthLayout } from '../components/AuthLayout';
import { ErrorMessage } from '../components/ErrorMessage';
import { PhotoPicker } from '../components/PhotoPicker';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import type { ScreenProps } from '../types/navigation';
import type { PickedImage } from '../types/user';
import { isValidEmail, maskDate, maskPhone, normalizePhone, parseBirthDate } from '../utils/format';
import { haptics } from '@/lib/haptics';
import { fadeOut, layout, riseIn } from '@/lib/motion';

type FieldErrors = Partial<Record<'name' | 'email' | 'phone' | 'birthDate' | 'password' | 'confirm', string>>;

const MIN_PASSWORD = 6;

export const RegisterScreen: React.FC<ScreenProps<'Register'>> = ({ navigation }) => {
  const { loading, error, signUp, clearError } = useAuth();
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [birthDate, setBirthDate] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirm, setConfirm] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handlePhoneChange = useCallback((value: string): void => setPhone(maskPhone(value)), []);
  const handleDateChange = useCallback((value: string): void => setBirthDate(maskDate(value)), []);

  const handleSubmit = useCallback((): void => {
    clearError();
    setFormError(null);
    const errors: FieldErrors = {};
    if (name.trim().length === 0) {
      errors.name = 'Informe seu nome.';
    } else if (name.trim().length > 80) {
      errors.name = 'Use no máximo 80 caracteres.';
    }
    if (!isValidEmail(email)) {
      errors.email = 'Informe um e-mail válido.';
    }
    const phoneNumber: string | null = normalizePhone(phone);
    if (phoneNumber === null) {
      errors.phone = 'Informe o celular com DDD, ex.: (11) 98765-4321.';
    }
    const parsedDate = parseBirthDate(birthDate);
    if (!parsedDate.ok) {
      errors.birthDate = parsedDate.error;
    }
    if (password.length < MIN_PASSWORD) {
      errors.password = `A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`;
    }
    if (confirm !== password) {
      errors.confirm = 'As senhas não coincidem.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || phoneNumber === null || !parsedDate.ok) {
      haptics.error();
      setFormError('Corrija os campos destacados.');
      return;
    }
    void signUp({ name, email, password, phoneNumber, birthDate: parsedDate.iso, photo });
  }, [name, email, phone, birthDate, password, confirm, photo, signUp, clearError]);

  const goBack = useCallback((): void => {
    clearError();
    navigation.goBack();
  }, [clearError, navigation]);

  const displayedError: string | null = error ?? formError;

  // Auth failures from the server get the same tactile cue as local ones.
  useEffect(() => {
    if (error !== null) {
      haptics.error();
    }
  }, [error]);

  return (
    <AuthLayout
      compactHeader
      title="Criar conta"
      subtitle="Preencha seus dados para começar a conversar."
      footer={
        <View className="mt-6 flex-row items-center justify-center gap-1.5">
          <Text className="text-muted-foreground text-[15px]">Já tem conta?</Text>
          <Pressable onPress={goBack} disabled={loading} accessibilityRole="button" hitSlop={8} className="active:opacity-70">
            <Text className="text-primary text-[15px] font-semibold">Entrar</Text>
          </Pressable>
        </View>
      }
    >
      <PhotoPicker
        name={name}
        uid={email.length > 0 ? email : 'novo-usuario'}
        photoUri={photo?.uri ?? ''}
        onPicked={setPhoto}
        onError={setFormError}
        disabled={loading}
        label={photo === null ? 'Adicionar foto de perfil' : 'Trocar foto'}
      />
      <TextField label="Nome" value={name} onChangeText={setName} placeholder="Seu nome completo" autoCapitalize="words" editable={!loading} error={fieldErrors.name} />
      <TextField label="E-mail" value={email} onChangeText={setEmail} placeholder="voce@exemplo.com" keyboardType="email-address" editable={!loading} error={fieldErrors.email} />
      <TextField label="Celular" value={phone} onChangeText={handlePhoneChange} placeholder="(11) 98765-4321" keyboardType="phone-pad" editable={!loading} error={fieldErrors.phone} />
      <TextField label="Data de nascimento" value={birthDate} onChangeText={handleDateChange} placeholder="DD/MM/AAAA" keyboardType="number-pad" editable={!loading} error={fieldErrors.birthDate} />
      <TextField label="Senha" value={password} onChangeText={setPassword} placeholder={`Mínimo de ${MIN_PASSWORD} caracteres`} secureTextEntry editable={!loading} error={fieldErrors.password} />
      <TextField label="Confirmar senha" value={confirm} onChangeText={setConfirm} placeholder="Repita a senha" secureTextEntry editable={!loading} error={fieldErrors.confirm} returnKeyType="go" onSubmitEditing={handleSubmit} />
      {displayedError !== null ? (
        <Animated.View key={displayedError} entering={riseIn} exiting={fadeOut} layout={layout}>
          <ErrorMessage message={displayedError} onDismiss={() => { clearError(); setFormError(null); }} />
        </Animated.View>
      ) : null}
      <Animated.View layout={layout}>
        <PrimaryButton label="Criar conta" onPress={handleSubmit} loading={loading} disabled={loading} />
      </Animated.View>
    </AuthLayout>
  );
};

export default RegisterScreen;
