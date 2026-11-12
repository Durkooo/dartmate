import { useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button, TextField, Input, Label } from 'heroui-native';
import type { Tables } from '@biltme/backend';
import { UserSearch } from 'lucide-react-native';
import { Page, Txt, Heading, LoadingRows, Empty } from '@/components/DartsUI';
import { palette, feedback } from '@/lib/darts';
import { bilt } from '@/lib/bilt';
import { announceFriendAdd } from '@/lib/online';
import { usePlayers, playerError } from '@/lib/players';

type FoundPlayer = Pick<Tables<'player_profiles'>, 'user_id' | 'nickname'>;
export default function NewFriend() {
  const session = usePlayers((s) => s.session);
  const profile = usePlayers((s) => s.profile);
  const ready = usePlayers((s) => s.ready);
  const loading = usePlayers((s) => s.loading);
  const friends = usePlayers((s) => s.friends);
  const remoteError = usePlayers((s) => s.error);
  const refresh = usePlayers((s) => s.refresh);
  const [nick, setNick] = useState('');
  const [found, setFound] = useState<FoundPlayer | null>(null);
  const [searched, setSearched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const fail = (message: string) => {
    setError(message);
    feedback.error();
  };
  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError('');
    try {
      await action();
    } catch (e) {
      fail(playerError({ message: e instanceof Error ? e.message : 'Pripojenie zlyhalo.' }));
    } finally {
      setPending(false);
    }
  };
  const search = () =>
    run(async () => {
      setFound(null);
      setSearched(false);
      const clean = nick.trim().replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9_]{3,24}$/.test(clean)) {
        fail('Zadaj celý nick hráča (3 až 24 znakov).');
        return;
      }
      if (clean === profile?.nickname) {
        fail('Toto je tvoj vlastný nick.');
        return;
      }
      const { data, error: e } = await bilt.rpc('find_player_by_nickname', {
        search_nickname: clean,
      });
      if (e) {
        fail(playerError(e));
        return;
      }
      const player = data?.[0];
      if (player && (!player.user_id || !player.nickname)) {
        fail('Výsledok vyhľadávania sa nepodarilo načítať. Skús znova.');
        return;
      }
      setFound(
        player?.user_id && player.nickname
          ? { user_id: player.user_id, nickname: player.nickname }
          : null,
      );
      setSearched(true);
    });
  const add = () =>
    run(async () => {
      if (!found || !session) return;
      const { error: e } = await bilt
        .from('player_friends')
        .insert({ owner_id: session.user.id, friend_id: found.user_id });
      if (e) {
        fail(e.code === '23505' ? 'Tohto hráča už máš medzi priateľmi.' : playerError(e));
        return;
      }
      await usePlayers.getState().refresh();
      if (usePlayers.getState().error) {
        setError(
          'Priateľ je pridaný, ale zoznam sa nepodarilo načítať. Otvor Priateľov a skús načítanie znova.',
        );
        return;
      }
      // Druhému príde správa + push, aby si ťa mohol pridať späť.
      if (profile?.nickname) {
        void announceFriendAdd(found.user_id, session.user.id, profile.nickname);
      }
      feedback.success();
      router.dismissTo('/friends');
    });
  const alreadyAdded = !!found && friends.some((f) => f.id === found.user_id);
  return (
    <Page form fallbackHref="/friends" fallbackLabel="Späť k priateľom">
      <Stack.Screen options={{ title: 'Pridať priateľa' }} />
      {!ready || loading ? (
        <LoadingRows />
      ) : remoteError ? (
        <View className="gap-4 py-6">
          <Txt className="text-danger" accessibilityRole="alert">
            {remoteError}
          </Txt>
          <Button variant="outline" onPress={() => void refresh()}>
            <Button.Label>Skúsiť znova</Button.Label>
          </Button>
        </View>
      ) : !profile ? (
        <Empty
          text={session ? 'Najprv si vyber svoj nick.' : 'Prihlás sa a nájdi hráčov podľa nicku.'}
          action={session ? 'Vybrať nick' : 'Prihlásiť sa'}
          onPress={() => router.push('/account')}
        />
      ) : (
        <View className="mt-4 gap-5">
          <UserSearch size={36} color={palette.ink} strokeWidth={1.8} />
          <TextField isRequired>
            <Label>Nick hráča</Label>
            <Input
              value={nick}
              onChangeText={(v) => {
                setNick(v);
                setFound(null);
                setSearched(false);
                setError('');
              }}
              editable={!pending}
              placeholder="napr. martin_180"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={25}
              onSubmitEditing={() => {
                if (!pending) void search();
              }}
            />
          </TextField>
          <Button isDisabled={pending} onPress={search}>
            <Button.Label>{pending ? 'Čakaj…' : 'Nájsť hráča'}</Button.Label>
          </Button>
          {!!error && (
            <Txt className="text-danger" accessibilityRole="alert">
              {error}
            </Txt>
          )}
          {found && (
            <View className="border-border gap-4 border-t pt-6">
              <Heading>@{found.nickname}</Heading>
              {alreadyAdded ? (
                <Txt className="text-muted">Tohto hráča už máš medzi priateľmi.</Txt>
              ) : (
                <Button isDisabled={pending} onPress={add}>
                  <Button.Label>{pending ? 'Pridávam…' : 'Pridať priateľa'}</Button.Label>
                </Button>
              )}
            </View>
          )}
          {searched && !found && (
            <Empty
              text="Hráča s týmto nickom sme nenašli."
              action="Vymazať hľadanie"
              onPress={() => {
                setNick('');
                setSearched(false);
              }}
            />
          )}
          <Txt className="text-muted text-[13px]">
            Priateľ musí mať v tejto aplikácii účet a nastavený nick. Pridanie ho uloží do tvojho
            zoznamu, nie automaticky do jeho.
          </Txt>
        </View>
      )}
    </Page>
  );
}
