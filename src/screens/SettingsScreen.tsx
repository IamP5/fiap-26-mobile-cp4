import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorMessage } from '../components/ErrorMessage';
import { PhotoPicker } from '../components/PhotoPicker';
import { PrimaryButton } from '../components/PrimaryButton';
import { tabBarClearance } from '../components/TabBar';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { useThemeContext, useThemedStyles, type ThemePreference } from '../theme/ThemeContext';
import { radius, spacing, type Theme } from '../theme/theme';
import type { PushStatus } from '../types/notification';
import type { ChatUser, PickedImage } from '../types/user';
import { translateFirebaseError } from '../utils/errors';
import { formatBirthDate, formatPhone } from '../utils/format';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
];

const describePush = (status: PushStatus): string => {
  switch (status.state) {
    case 'idle':
    case 'registering':
      return 'Registrando este aparelho...';
    case 'registered':
      return status.enabled
        ? 'Este aparelho recebe notificações das suas conversas.'
        : 'Notificações desativadas neste aparelho.';
    case 'unsupported':
      return status.reason;
    case 'denied':
      return 'Permissão de notificações negada. Ative nas configurações do aparelho para receber avisos de novas mensagens.';
    case 'no_token':
      return 'O aparelho não forneceu um token de notificação. Verifique a conexão e tente novamente.';
    case 'error':
      return status.message;
  }
};

export const SettingsScreen: React.FC<{ me: ChatUser }> = ({ me }) => {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { signOut, updateName, updatePhoto, loading, notice, clearNotice } = useAuth();
  const { status, setEnabled, retryRegistration } = useNotifications();
  const { preference, setPreference } = useThemeContext();
  const [name, setName] = useState<string>(me.name);
  const [savingName, setSavingName] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [togglingPush, setTogglingPush] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const nameChanged: boolean = useMemo(() => name.trim() !== me.name && name.trim().length > 0, [name, me.name]);

  const handleSaveName = useCallback((): void => {
    setError(null);
    setSavingName(true);
    updateName(name)
      .catch((saveError: unknown) => setError(translateFirebaseError(saveError)))
      .finally(() => setSavingName(false));
  }, [name, updateName]);

  const handlePhoto = useCallback(
    (image: PickedImage): void => {
      setError(null);
      clearNotice();
      setUploading(true);
      updatePhoto(image)
        .catch((uploadError: unknown) => setError(translateFirebaseError(uploadError)))
        .finally(() => setUploading(false));
    },
    [updatePhoto, clearNotice],
  );

  const handleTogglePush = useCallback(
    (enabled: boolean): void => {
      setError(null);
      setTogglingPush(true);
      setEnabled(enabled)
        .catch((toggleError: unknown) => setError(translateFirebaseError(toggleError)))
        .finally(() => setTogglingPush(false));
    },
    [setEnabled],
  );

  const openSystemSettings = useCallback((): void => {
    void Linking.openSettings().catch(() => undefined);
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: tabBarClearance(insets.bottom) }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.screenTitle}>Você</Text>

      <View style={styles.card}>
        <PhotoPicker
          name={me.name}
          uid={me.uid}
          photoUri={me.photoUrl}
          onPicked={handlePhoto}
          onError={setError}
          busy={uploading}
          label="Alterar foto"
        />
        <TextField label="Nome" value={name} onChangeText={setName} autoCapitalize="words" editable={!savingName} />
        {nameChanged ? (
          <PrimaryButton label="Salvar nome" onPress={handleSaveName} loading={savingName} />
        ) : null}
        <InfoRow label="E-mail" value={me.email} />
        <InfoRow label="Celular" value={me.phoneNumber.length > 0 ? formatPhone(me.phoneNumber) : 'Não informado'} />
        <InfoRow label="Nascimento" value={me.birthDate.length > 0 ? formatBirthDate(me.birthDate) : 'Não informado'} />
      </View>

      {notice !== null ? <Text style={styles.notice}>{notice}</Text> : null}
      {error !== null ? <ErrorMessage message={error} onDismiss={() => setError(null)} /> : null}

      <Text style={styles.sectionTitle}>Notificações</Text>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Receber notificações neste aparelho</Text>
          <Switch
            value={status.state === 'registered' && status.enabled}
            onValueChange={handleTogglePush}
            disabled={status.state !== 'registered' || togglingPush}
            accessibilityLabel="Receber notificações neste aparelho"
          />
        </View>
        <Text style={styles.hint}>{describePush(status)}</Text>
        {status.state === 'denied' && Platform.OS !== 'web' ? (
          <PrimaryButton label="Abrir configurações" variant="secondary" onPress={openSystemSettings} />
        ) : null}
        {status.state === 'error' || status.state === 'no_token' || status.state === 'denied' ? (
          <PrimaryButton label="Tentar novamente" variant="ghost" onPress={retryRegistration} />
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Aparência</Text>
      <View style={styles.segment} accessibilityRole="radiogroup">
        {THEME_OPTIONS.map((option) => {
          const active: boolean = preference === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setPreference(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Tema ${option.label}`}
              style={[styles.segmentItem, active ? styles.segmentItemActive : null]}
            >
              <Text style={[styles.segmentLabel, active ? styles.segmentLabelActive : null]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.logout}>
        <PrimaryButton label="Sair da conta" variant="danger" onPress={() => void signOut()} loading={loading} />
      </View>
    </ScrollView>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} selectable>
        {value}
      </Text>
    </View>
  );
};

const createStyles = ({ colors, typography, elevation }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: spacing.md, gap: spacing.sm },
    screenTitle: { ...typography.largeTitle, marginBottom: spacing.sm },
    sectionTitle: {
      marginTop: spacing.md,
      fontSize: 13,
      fontWeight: '700',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, ...elevation.card },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
    infoLabel: { fontSize: 14, color: colors.muted },
    infoValue: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'right' },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    switchLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
    hint: { fontSize: 13, lineHeight: 18, color: colors.muted },
    notice: { fontSize: 14, color: colors.success },
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceSunken,
      borderRadius: radius.pill,
      padding: spacing.xs,
    },
    segmentItem: { flex: 1, minHeight: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    segmentItemActive: { backgroundColor: colors.surface, ...elevation.card },
    segmentLabel: { fontSize: 14, fontWeight: '600', color: colors.muted },
    segmentLabelActive: { color: colors.primary },
    logout: { marginTop: spacing.lg },
  });

export default SettingsScreen;
