import { Cake, Mail, Phone, type LucideIcon } from 'lucide-react-native';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { ScreenHeader } from '../components/ScreenHeader';
import { ListRow, ListSection, ListSeparator, listPageClassName, type TileColor } from '../components/native/List';
import { profileOrFallback, useDirectory } from '../contexts/DirectoryContext';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { fadeIn, heroEnter } from '../lib/motion';
import { cn } from '../lib/utils';
import type { ScreenProps } from '../types/navigation';
import type { ChatUser } from '../types/user';
import { formatBirthDate, formatPhone } from '../utils/format';

const orUnavailable = (value: string, format: (v: string) => string = (v) => v): string =>
  value.trim().length > 0 ? format(value) : 'Não informado';

const ProfileContent: React.FC<ScreenProps<'Profile'> & { me: ChatUser }> = ({ navigation, route, me }) => {
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
        <Animated.View entering={fadeIn} className="p-4">
          <ErrorMessage message={error} onRetry={retry} />
        </Animated.View>
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
    const rows: ReadonlyArray<{ label: string; value: string; icon: LucideIcon; color: TileColor }> = [
      { label: 'E-mail', value: orUnavailable(profile.email), icon: Mail, color: 'blue' },
      { label: 'Celular', value: orUnavailable(profile.phoneNumber, formatPhone), icon: Phone, color: 'green' },
      { label: 'Nascimento', value: orUnavailable(profile.birthDate, formatBirthDate), icon: Cake, color: 'pink' },
    ];
    return (
      <ScrollView
        contentContainerClassName="gap-6 pt-6"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={heroEnter} className="items-center px-5">
          <Avatar name={profile.name} uid={profile.uid} photoUrl={profile.photoUrl} size={104} />
          <Text className="text-foreground mt-3 text-center text-[24px] font-semibold">
            {orUnavailable(profile.name)}
          </Text>
        </Animated.View>
        <ListSection title="Informações">
          {rows.map((row, index) => (
            <React.Fragment key={row.label}>
              {index > 0 ? <ListSeparator /> : null}
              <ListRow icon={row.icon} iconColor={row.color} label={row.label} value={row.value} />
            </React.Fragment>
          ))}
        </ListSection>
      </ScrollView>
    );
  };

  return (
    <View className={cn('flex-1', listPageClassName)}>
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

export default ProfileScreen;
