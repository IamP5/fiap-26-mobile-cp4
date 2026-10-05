import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { ScreenHeader } from '../components/ScreenHeader';
import { profileOrFallback, useDirectory } from '../contexts/DirectoryContext';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useThemedStyles } from '../theme/ThemeContext';
import { radius, spacing, type Theme } from '../theme/theme';
import type { ScreenProps } from '../types/navigation';
import type { ChatUser } from '../types/user';
import { formatBirthDate, formatPhone } from '../utils/format';

const orUnavailable = (value: string, format: (v: string) => string = (v) => v): string =>
  value.trim().length > 0 ? format(value) : 'Não informado';

const ProfileContent: React.FC<ScreenProps<'Profile'> & { me: ChatUser }> = ({ navigation, route, me }) => {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { byUid } = useDirectory();
  const { profile, loading, error, notShared, retry } = useProfile(route.params.uid, me);
  const preview = profileOrFallback(byUid, route.params.uid);

  const body = (): React.ReactElement => {
    if (loading) {
      return <Loading label="Carregando perfil..." />;
    }
    if (error !== null) {
      return (
        <View style={styles.padded}>
          <ErrorMessage message={error} onRetry={retry} />
        </View>
      );
    }
    if (notShared) {
      return (
        <EmptyState
          variant="contacts"
          title="Perfil indisponível"
          description="Os dados de cadastro só ficam visíveis para quem tem uma conversa ou um grupo em comum."
        />
      );
    }
    if (profile === null) {
      return <EmptyState title="Perfil não encontrado" description="Esta conta pode ter sido removida." />;
    }
    const rows: ReadonlyArray<{ label: string; value: string }> = [
      { label: 'E-mail', value: orUnavailable(profile.email) },
      { label: 'Celular', value: orUnavailable(profile.phoneNumber, formatPhone) },
      { label: 'Data de nascimento', value: orUnavailable(profile.birthDate, formatBirthDate) },
    ];
    return (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.hero}>
          <Avatar name={profile.name} uid={profile.uid} photoUrl={profile.photoUrl} size={120} />
          <Text style={styles.name}>{orUnavailable(profile.name)}</Text>
        </View>
        <View style={styles.card}>
          {rows.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.label}>{row.label}</Text>
              <Text style={styles.value} selectable>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={profile?.name ?? preview.name} subtitle="Perfil" onBack={navigation.goBack} />
      {body()}
    </View>
  );
};

/** Registration data of a user: allowed only for people who share a direct
 * conversation or a group with them (enforced by the API). */
export const ProfileScreen: React.FC<ScreenProps<'Profile'>> = (props) => {
  const { user } = useAuth();
  return user === null ? null : <ProfileContent {...props} me={user} />;
};

const createStyles = ({ colors, elevation }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, gap: spacing.lg },
    padded: { padding: spacing.md },
    hero: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
    name: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, ...elevation.card },
    row: { gap: 2 },
    label: { fontSize: 13, color: colors.muted },
    value: { fontSize: 16, fontWeight: '600', color: colors.text },
  });

export default ProfileScreen;
