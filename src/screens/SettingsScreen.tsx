import { Bell, Cake, Check, LogOut, Mail, Monitor, Moon, Phone, Sun, type LucideIcon } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorMessage } from '../components/ErrorMessage';
import { EdgeFade } from '../components/native/EdgeFade';
import { ListRow, ListSection, ListSeparator, listPageClassName, type TileColor } from '../components/native/List';
import { PhotoPicker } from '../components/PhotoPicker';
import { PrimaryButton } from '../components/PrimaryButton';
import { tabBarClearance } from '../components/TabBar';
import { Icon } from '../components/ui/icon';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { haptics } from '../lib/haptics';
import { fadeIn, fadeOut } from '../lib/motion';
import { isMaterial } from '../lib/platform';
import { cn } from '../lib/utils';
import { useThemeColors, useThemeContext, type ThemePreference } from '../theme/ThemeContext';
import type { PushStatus } from '../types/notification';
import type { ChatUser, PickedImage } from '../types/user';
import { translateFirebaseError } from '../utils/errors';
import { formatBirthDate, formatPhone } from '../utils/format';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; icon: LucideIcon; color: TileColor }> = [
  { value: 'system', label: 'Sistema', icon: Monitor, color: 'gray' },
  { value: 'light', label: 'Claro', icon: Sun, color: 'orange' },
  { value: 'dark', label: 'Escuro', icon: Moon, color: 'purple' },
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
  const colors = useThemeColors();
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

  const pushEnabled: boolean = status.state === 'registered' && status.enabled;

  const togglePush = useCallback(
    (enabled: boolean): void => {
      haptics.select();
      handleTogglePush(enabled);
    },
    [handleTogglePush],
  );

  const handleSignOut = useCallback((): void => {
    haptics.tap();
    void signOut();
  }, [signOut]);

  return (
    <View className={cn('flex-1', listPageClassName)}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6"
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: tabBarClearance(insets.bottom) }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isMaterial ? (
          <View className="h-16 justify-center px-4">
            <Text className="text-foreground text-[22px] font-semibold" accessibilityRole="header">
              Você
            </Text>
          </View>
        ) : (
          <Text className="text-foreground px-5 pt-2 text-[34px] font-bold tracking-tight" accessibilityRole="header">
            Você
          </Text>
        )}

        <View className="items-center px-5">
          <PhotoPicker
            name={me.name}
            uid={me.uid}
            photoUri={me.photoUrl}
            onPicked={handlePhoto}
            onError={setError}
            busy={uploading}
            label="Alterar foto"
          />
          <Text className="text-foreground mt-3 text-center text-[22px] font-semibold" numberOfLines={1}>
            {me.name}
          </Text>
          <Text className="text-muted-foreground mt-0.5 text-center text-[15px]" numberOfLines={1} selectable>
            {me.email}
          </Text>
        </View>

        {notice !== null || error !== null ? (
          <View className="gap-2 px-4">
            {notice !== null ? (
              <Animated.View entering={fadeIn} exiting={fadeOut} className="bg-success/10 rounded-2xl px-4 py-3">
                <Text className="text-success text-sm" accessibilityLiveRegion="polite">
                  {notice}
                </Text>
              </Animated.View>
            ) : null}
            {error !== null ? (
              <Animated.View entering={fadeIn} exiting={fadeOut}>
                <ErrorMessage message={error} onDismiss={() => setError(null)} />
              </Animated.View>
            ) : null}
          </View>
        ) : null}

        <ListSection
          title="Perfil"
          footer={
            nameChanged ? (
              <Animated.View entering={fadeIn} exiting={fadeOut} className="pt-2">
                <PrimaryButton label="Salvar nome" onPress={handleSaveName} loading={savingName} />
              </Animated.View>
            ) : undefined
          }
        >
          <NameRow value={name} onChangeText={setName} editable={!savingName} />
          <ListSeparator inset={16} />
          <ListRow icon={Mail} iconColor="blue" label="E-mail" value={me.email} />
          <ListSeparator />
          <ListRow
            icon={Phone}
            iconColor="green"
            label="Celular"
            value={me.phoneNumber.length > 0 ? formatPhone(me.phoneNumber) : 'Não informado'}
          />
          <ListSeparator />
          <ListRow
            icon={Cake}
            iconColor="pink"
            label="Nascimento"
            value={me.birthDate.length > 0 ? formatBirthDate(me.birthDate) : 'Não informado'}
          />
        </ListSection>

        <ListSection
          title="Notificações"
          footer={
            <View className="gap-2">
              <Text className="text-muted-foreground text-[13px] leading-[18px]">{describePush(status)}</Text>
              {status.state === 'denied' && Platform.OS !== 'web' ? (
                <PrimaryButton label="Abrir configurações" variant="secondary" onPress={openSystemSettings} />
              ) : null}
              {status.state === 'error' || status.state === 'no_token' || status.state === 'denied' ? (
                <PrimaryButton label="Tentar novamente" variant="ghost" onPress={retryRegistration} />
              ) : null}
            </View>
          }
        >
          <ListRow
            icon={Bell}
            iconColor="red"
            label="Notificações"
            trailing={
              <Switch
                value={pushEnabled}
                onValueChange={togglePush}
                disabled={status.state !== 'registered' || togglingPush}
                accessibilityLabel="Receber notificações neste aparelho"
                trackColor={
                  Platform.OS === 'android' ? { true: colors.primary, false: colors.input } : { true: colors.primary }
                }
                thumbColor={Platform.OS === 'android' ? '#ffffff' : undefined}
              />
            }
          />
        </ListSection>

        <ListSection title="Aparência">
          {THEME_OPTIONS.map((option, index) => {
            const selected: boolean = preference === option.value;
            return (
              <React.Fragment key={option.value}>
                {index > 0 ? <ListSeparator /> : null}
                <ListRow
                  icon={option.icon}
                  iconColor={option.color}
                  label={option.label}
                  onPress={() => {
                    if (!selected) {
                      haptics.select();
                      setPreference(option.value);
                    }
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Tema ${option.label}`}
                  trailing={<SelectionMark selected={selected} />}
                />
              </React.Fragment>
            );
          })}
        </ListSection>

        <ListSection>
          <ListRow
            icon={isMaterial ? LogOut : undefined}
            label="Sair da conta"
            destructive
            centered
            onPress={handleSignOut}
            disabled={loading}
            accessibilityLabel="Sair da conta"
            accessibilityState={{ disabled: loading, busy: loading }}
            trailing={loading ? <ActivityIndicator size="small" color={colors.destructive} /> : undefined}
          />
        </ListSection>
      </ScrollView>
      {/* iOS scroll-edge effect: content dissolves under the status bar. */}
      {isMaterial ? null : <EdgeFade height={insets.top + 12} color={colors.grouped} />}
    </View>
  );
};

/** iOS: a trailing checkmark. Android: a Material radio button. */
const SelectionMark: React.FC<{ selected: boolean }> = ({ selected }) =>
  isMaterial ? (
    <View
      className={cn(
        'size-5 items-center justify-center rounded-full border-2',
        selected ? 'border-primary' : 'border-muted-foreground',
      )}
    >
      {selected ? <View className="bg-primary size-2.5 rounded-full" /> : null}
    </View>
  ) : selected ? (
    <Icon as={Check} strokeWidth={2.5} className="text-primary size-5" />
  ) : null;

/** Inline editable name: iOS "label · value" row, Material label over an underlined field. */
const NameRow: React.FC<{ value: string; onChangeText: (value: string) => void; editable: boolean }> = ({
  value,
  onChangeText,
  editable,
}) => {
  const colors = useThemeColors();
  return isMaterial ? (
    <View className="px-4 py-2">
      <Text className="text-muted-foreground text-[12px]">Nome</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        autoCapitalize="words"
        accessibilityLabel="Nome"
        placeholderTextColor={colors.mutedForeground}
        className="text-foreground border-input h-11 border-b text-[16px]"
      />
    </View>
  ) : (
    <View className="min-h-[52px] flex-row items-center gap-3 px-4">
      <Text className="text-foreground text-[17px]">Nome</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        autoCapitalize="words"
        accessibilityLabel="Nome"
        placeholderTextColor={colors.mutedForeground}
        className="text-muted-foreground h-11 flex-1 text-right text-[17px] web:outline-none"
      />
    </View>
  );
};

export default SettingsScreen;
