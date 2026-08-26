import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import { Avatar } from '../components/Avatar';
import { ErrorMessage } from '../components/ErrorMessage';
import { Icon } from '../components/Icon';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProviderBadge } from '../components/ProviderBadge';
import { tabBarClearance } from '../components/TabBar';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { useThemeContext, useThemedStyles } from '../theme/ThemeContext';
import type { ThemePreference } from '../theme/ThemeContext';
import { androidRipple, layout, radius, spacing, type Theme } from '../theme/theme';
import type { ChatUser } from '../types/user';
import { translateFirebaseError } from '../utils/errors';

export type SettingsScreenProps = {
  me: ChatUser;
  onSignOut: () => void;
};

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  description: string;
}> = [
  { value: 'system', label: 'Sistema', description: 'Acompanha o tema claro/escuro do aparelho' },
  { value: 'light', label: 'Claro', description: 'Sempre usar a aparência clara' },
  { value: 'dark', label: 'Escuro', description: 'Sempre usar a aparência escura' },
];

/** Shared aspect/quality so camera and gallery produce the same avatar. */
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.8,
};

type SettingsSheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

/** react-native-web animates on the JS thread; the native driver is iOS/Android only. */
const USE_NATIVE_DRIVER: boolean = Platform.OS !== 'web';

const SHEET_OPEN_MS = 280;
const SHEET_CLOSE_MS = 200;

/**
 * Bottom-sheet drawer shared by the account editors. A Modal (instead of the
 * native Alert/ActionSheet) keeps the exact same UI on iOS, Android and web,
 * and the KeyboardAvoidingView lifts the sheet above the keyboard when it
 * hosts a text input. The Modal itself doesn't animate ("none"); a single
 * driven progress value fades the dim layer while the sheet slides up from
 * below the screen edge, and plays the same motion in reverse on dismiss
 * (the Modal stays mounted until the exit animation finishes).
 */
const SettingsSheet: React.FC<SettingsSheetProps> = ({
  visible,
  title,
  onClose,
  children,
}: SettingsSheetProps) => {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const windowHeight = useWindowDimensions().height;
  const progress = useRef(new Animated.Value(0)).current;
  const visibleRef = useRef<boolean>(visible);
  const [mounted, setMounted] = useState<boolean>(visible);
  const [sheetHeight, setSheetHeight] = useState<number>(0);

  visibleRef.current = visible;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: SHEET_OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
      return;
    }
    // Unmount based on the latest visibility, not the `finished` flag: a
    // callback from an interrupted exit must not tear down a reopening sheet.
    const unmountIfStillClosed = (): void => {
      if (!visibleRef.current) {
        setMounted(false);
      }
    };
    Animated.timing(progress, {
      toValue: 0,
      duration: SHEET_CLOSE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(unmountIfStillClosed);
    // react-native-web doesn't reliably invoke the completion callback, which
    // would leave an invisible Modal mounted over the screen — back it up with
    // a timer scheduled just past the animation's end.
    const fallback = setTimeout(unmountIfStillClosed, SHEET_CLOSE_MS + 100);
    return (): void => {
      clearTimeout(fallback);
    };
  }, [visible, progress]);

  const handleSheetLayout = useCallback((event: LayoutChangeEvent): void => {
    setSheetHeight(event.nativeEvent.layout.height);
  }, []);

  if (!mounted) {
    return null;
  }

  // Until the first layout pass reports the sheet's real height, start the
  // slide from a full screen below so the sheet is never visible too early.
  const hiddenOffset: number = sheetHeight > 0 ? sheetHeight : windowHeight;
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [hiddenOffset, 0],
  });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.sheetFlex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* The dismiss layer is a SIBLING behind the sheet (not a wrapper):
            nested Pressables would render nested <button> elements on web,
            which is invalid HTML. */}
        <View style={styles.sheetBackdrop}>
          <Animated.View pointerEvents="none" style={[styles.sheetDim, { opacity: progress }]} />
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            onPress={onClose}
          />
          <Animated.View
            onLayout={handleSheetLayout}
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + spacing.md, transform: [{ translateY }] },
            ]}
          >
            <Text style={styles.sheetTitle}>{title}</Text>
            {children}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ me, onSignOut }) => {
  const styles = useThemedStyles(createStyles);
  const { theme, preference, setPreference } = useThemeContext();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { updateName, syncPhoto, updatePhoto } = useAuth();

  const [nameSheetOpen, setNameSheetOpen] = useState<boolean>(false);
  const [nameDraft, setNameDraft] = useState<string>(me.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState<boolean>(false);
  const [updatingPhoto, setUpdatingPhoto] = useState<boolean>(false);
  const [photoMenuOpen, setPhotoMenuOpen] = useState<boolean>(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);

  const busy: boolean = savingName || updatingPhoto;

  const handleStartEditName = useCallback((): void => {
    setNameDraft(me.name);
    setNameError(null);
    setAccountError(null);
    setPhotoNotice(null);
    setNameSheetOpen(true);
  }, [me.name]);

  const handleCancelEditName = useCallback((): void => {
    setNameSheetOpen(false);
    setNameError(null);
  }, []);

  const handleNameDraftChange = useCallback((value: string): void => {
    setNameDraft(value);
    setNameError(null);
  }, []);

  const handleSaveName = useCallback((): void => {
    const trimmed: string = nameDraft.trim();
    if (trimmed.length === 0) {
      setNameError('Informe um nome válido.');
      return;
    }
    setSavingName(true);
    setNameError(null);
    updateName(trimmed)
      .then((): void => {
        setNameSheetOpen(false);
      })
      .catch((error: unknown): void => {
        setNameError(translateFirebaseError(error));
      })
      .finally((): void => {
        setSavingName(false);
      });
  }, [nameDraft, updateName]);

  const handleOpenPhotoMenu = useCallback((): void => {
    setAccountError(null);
    setPhotoNotice(null);
    setPhotoMenuOpen(true);
  }, []);

  const handleClosePhotoMenu = useCallback((): void => {
    setPhotoMenuOpen(false);
  }, []);

  const uploadPickedPhoto = useCallback(
    (result: ImagePicker.ImagePickerResult): void => {
      const asset: ImagePicker.ImagePickerAsset | undefined = result.canceled
        ? undefined
        : result.assets[0];
      if (asset === undefined) {
        return;
      }
      setUpdatingPhoto(true);
      setAccountError(null);
      setPhotoNotice(null);
      updatePhoto(asset.uri, asset.mimeType ?? null)
        .then((): void => {
          setPhotoNotice('Foto de perfil atualizada.');
        })
        .catch((error: unknown): void => {
          setAccountError(translateFirebaseError(error));
        })
        .finally((): void => {
          setUpdatingPhoto(false);
        });
    },
    [updatePhoto],
  );

  const handleTakePhoto = useCallback((): void => {
    setPhotoMenuOpen(false);
    void (async (): Promise<void> => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setAccountError(
          'Permissão da câmera negada. Autorize o acesso à câmera nos ajustes do aparelho.',
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
      uploadPickedPhoto(result);
    })().catch((error: unknown): void => {
      setAccountError(translateFirebaseError(error));
    });
  }, [uploadPickedPhoto]);

  const handlePickFromLibrary = useCallback((): void => {
    setPhotoMenuOpen(false);
    void (async (): Promise<void> => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setAccountError(
          'Permissão da galeria negada. Autorize o acesso às fotos nos ajustes do aparelho.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      uploadPickedPhoto(result);
    })().catch((error: unknown): void => {
      setAccountError(translateFirebaseError(error));
    });
  }, [uploadPickedPhoto]);

  const handleSyncPhoto = useCallback((): void => {
    setPhotoMenuOpen(false);
    setUpdatingPhoto(true);
    setAccountError(null);
    setPhotoNotice(null);
    syncPhoto()
      .then((): void => {
        setPhotoNotice('Foto atualizada a partir da sua conta do provedor.');
      })
      .catch((error: unknown): void => {
        setAccountError(translateFirebaseError(error));
      })
      .finally((): void => {
        setUpdatingPhoto(false);
      });
  }, [syncPhoto]);

  // Google is the only provider that serves profile pictures, so only Google
  // accounts get the extra "re-import from provider" option in the menu.
  const providerHasPhoto: boolean = me.provider === 'google';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* No title bar: the floating tab bar already names this destination,
          so the profile header is the first thing on screen. */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarClearance(insets.bottom) + spacing.md }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* WhatsApp-style profile header: big photo + identity. */}
        <View style={styles.profileCard}>
          <Avatar name={me.name} uid={me.uid} photoUrl={me.photoUrl} size={layout.avatar.xl} />
          <Text style={styles.profileName} numberOfLines={2}>
            {me.name}
          </Text>
          {me.email !== null ? (
            <Text style={styles.profileEmail} numberOfLines={1}>
              {me.email}
            </Text>
          ) : null}
          <View style={styles.profileBadge}>
            <ProviderBadge provider={me.provider} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Conta</Text>
        <View style={styles.sectionCard}>
          <Pressable
            onPress={handleStartEditName}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Alterar nome"
            android_ripple={androidRipple(colors.ripple)}
            style={({ pressed }: { pressed: boolean }) => [
              styles.row,
              pressed ? styles.rowPressed : null,
            ]}
          >
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Alterar nome</Text>
              <Text style={styles.rowSubtitle} numberOfLines={1}>
                {me.name}
              </Text>
            </View>
            {savingName ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Icon name="chevron-right" color={colors.muted} size={16} />
            )}
          </Pressable>

          <View style={styles.rowSeparator} />

          <Pressable
            onPress={handleOpenPhotoMenu}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Atualizar foto de perfil"
            android_ripple={androidRipple(colors.ripple)}
            style={({ pressed }: { pressed: boolean }) => [
              styles.row,
              pressed ? styles.rowPressed : null,
            ]}
          >
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Atualizar foto</Text>
              <Text style={styles.rowSubtitle} numberOfLines={2}>
                Enviar uma nova foto ou tirar uma com a câmera
              </Text>
            </View>
            {updatingPhoto ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Icon name="chevron-right" color={colors.muted} size={16} />
            )}
          </Pressable>

          {photoNotice !== null ? <Text style={styles.notice}>{photoNotice}</Text> : null}
          {accountError !== null ? (
            <View style={styles.errorWrap}>
              <ErrorMessage message={accountError} onDismiss={() => setAccountError(null)} />
            </View>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Aparência</Text>
        <View style={styles.sectionCard}>
          {THEME_OPTIONS.map((option, index) => {
            const selected: boolean = preference === option.value;
            return (
              <React.Fragment key={option.value}>
                {index > 0 ? <View style={styles.rowSeparator} /> : null}
                <Pressable
                  onPress={() => setPreference(option.value)}
                  accessibilityRole="radio"
                  accessibilityLabel={`Tema ${option.label}`}
                  accessibilityState={{ selected }}
                  android_ripple={androidRipple(colors.ripple)}
                  style={({ pressed }: { pressed: boolean }) => [
                    styles.row,
                    pressed ? styles.rowPressed : null,
                  ]}
                >
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{option.label}</Text>
                    <Text style={styles.rowSubtitle} numberOfLines={2}>
                      {option.description}
                    </Text>
                  </View>
                  <View style={[styles.radioOuter, selected ? styles.radioOuterSelected : null]}>
                    {selected ? <View style={styles.radioInner} /> : null}
                  </View>
                </Pressable>
              </React.Fragment>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Sessão</Text>
        <View style={styles.sectionCard}>
          <Pressable
            onPress={onSignOut}
            accessibilityRole="button"
            accessibilityLabel="Sair da conta"
            android_ripple={androidRipple(colors.ripple)}
            style={({ pressed }: { pressed: boolean }) => [
              styles.row,
              pressed ? styles.rowPressed : null,
            ]}
          >
            <View style={styles.rowBody}>
              <Text style={styles.signOutLabel}>Sair da conta</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      <SettingsSheet
        visible={photoMenuOpen}
        title="Atualizar foto de perfil"
        onClose={handleClosePhotoMenu}
      >
        <Pressable
          onPress={handleTakePhoto}
          accessibilityRole="button"
          accessibilityLabel="Tirar foto com a câmera"
          android_ripple={androidRipple(colors.ripple)}
          style={({ pressed }: { pressed: boolean }) => [
            styles.sheetOption,
            pressed ? styles.rowPressed : null,
          ]}
        >
          <Text style={styles.sheetOptionLabel}>Tirar foto</Text>
          <Text style={styles.sheetOptionHint}>Usar a câmera do aparelho</Text>
        </Pressable>

        <View style={styles.rowSeparator} />

        <Pressable
          onPress={handlePickFromLibrary}
          accessibilityRole="button"
          accessibilityLabel="Escolher foto da galeria"
          android_ripple={androidRipple(colors.ripple)}
          style={({ pressed }: { pressed: boolean }) => [
            styles.sheetOption,
            pressed ? styles.rowPressed : null,
          ]}
        >
          <Text style={styles.sheetOptionLabel}>Escolher da galeria</Text>
          <Text style={styles.sheetOptionHint}>Enviar uma imagem existente</Text>
        </Pressable>

        {providerHasPhoto ? (
          <>
            <View style={styles.rowSeparator} />
            <Pressable
              onPress={handleSyncPhoto}
              accessibilityRole="button"
              accessibilityLabel="Importar foto da conta Google"
              android_ripple={androidRipple(colors.ripple)}
              style={({ pressed }: { pressed: boolean }) => [
                styles.sheetOption,
                pressed ? styles.rowPressed : null,
              ]}
            >
              <Text style={styles.sheetOptionLabel}>Usar foto do Google</Text>
              <Text style={styles.sheetOptionHint}>
                Importar a foto atual da sua conta Google
              </Text>
            </Pressable>
          </>
        ) : null}

        <View style={styles.sheetCancelWrap}>
          <PrimaryButton label="Cancelar" variant="ghost" onPress={handleClosePhotoMenu} />
        </View>
      </SettingsSheet>

      <SettingsSheet visible={nameSheetOpen} title="Alterar nome" onClose={handleCancelEditName}>
        <View style={styles.nameEditor}>
          <TextField
            label="Nome"
            value={nameDraft}
            onChangeText={handleNameDraftChange}
            placeholder="Seu nome"
            autoCapitalize="words"
            editable={!savingName}
            error={nameError ?? undefined}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSaveName}
          />
          <View style={styles.nameEditorActions}>
            <View style={styles.nameEditorAction}>
              <PrimaryButton
                label="Cancelar"
                variant="ghost"
                onPress={handleCancelEditName}
                disabled={savingName}
              />
            </View>
            <View style={styles.nameEditorAction}>
              <PrimaryButton
                label="Salvar"
                onPress={handleSaveName}
                loading={savingName}
                disabled={savingName}
              />
            </View>
          </View>
        </View>
      </SettingsSheet>
    </View>
  );
};

const createStyles = ({ colors, elevation }: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    profileCard: {
      alignItems: 'center',
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
    },
    profileName: {
      marginTop: spacing.md,
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    profileEmail: {
      marginTop: spacing.xs,
      fontSize: 14,
      color: colors.muted,
    },
    profileBadge: {
      marginTop: spacing.sm,
    },
    sectionTitle: {
      paddingHorizontal: spacing.md + spacing.sm,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: colors.muted,
      textTransform: 'uppercase',
    },
    sectionCard: {
      marginHorizontal: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      overflow: 'hidden',
      ...elevation.card,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + spacing.xs,
    },
    rowPressed: {
      backgroundColor: colors.surfaceSunken,
    },
    rowBody: {
      flex: 1,
      marginRight: spacing.sm,
    },
    rowTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    rowSubtitle: {
      marginTop: 2,
      fontSize: 13,
      color: colors.muted,
    },
    rowSeparator: {
      height: layout.hairline,
      backgroundColor: colors.separator,
      marginLeft: spacing.md,
    },
    nameEditor: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    nameEditorActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    nameEditorAction: {
      minWidth: 110,
    },
    radioOuter: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOuterSelected: {
      borderColor: colors.primary,
    },
    radioInner: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.primary,
    },
    notice: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm + spacing.xs,
      fontSize: 13,
      color: colors.primary,
    },
    errorWrap: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    signOutLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.dangerText,
      textAlign: 'center',
    },
    sheetFlex: {
      flex: 1,
    },
    sheetBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheetDim: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: colors.overlay,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingTop: spacing.md,
      ...elevation.card,
    },
    sheetTitle: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: colors.muted,
    },
    sheetOption: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + spacing.xs,
      minHeight: 56,
      justifyContent: 'center',
    },
    sheetOptionLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    sheetOptionHint: {
      marginTop: 2,
      fontSize: 13,
      color: colors.muted,
    },
    sheetCancelWrap: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
  });

export default SettingsScreen;
