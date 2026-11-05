import { useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button, Input, Label, TextField } from 'heroui-native';
import { Page, Heading, Txt, LoadingRows } from '@/components/DartsUI';
import { bilt } from '@/lib/bilt';
import { feedback } from '@/lib/darts';
import { playerError, usePlayers } from '@/lib/players';

export default function Account() {
  const ready = usePlayers((s) => s.ready);
  const session = usePlayers((s) => s.session);
  const profile = usePlayers((s) => s.profile);
  const loading = usePlayers((s) => s.loading);
  const remoteError = usePlayers((s) => s.error);
  const refresh = usePlayers((s) => s.refresh);
  const [email, setEmail] = useState('');
  const [sentEmail, setSentEmail] = useState('');
  const [code, setCode] = useState('');
  const [nick, setNick] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  const send = () =>
    run(async () => {
      const clean = (sentEmail || email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
        fail('Zadaj platný e-mail.');
        return;
      }
      const { error: e } = await bilt.auth.signInWithOtp({ email: clean });
      if (e) {
        fail(playerError(e));
        return;
      }
      setSentEmail(clean);
      setCode('');
      feedback.success();
    });
  const verify = () =>
    run(async () => {
      if (!/^\d{6}$/.test(code)) {
        fail('Zadaj 6-miestny kód z e-mailu.');
        return;
      }
      const { error: e } = await bilt.auth.verifyOtp({
        email: sentEmail,
        token: code,
        type: 'email',
      });
      if (e) {
        fail(playerError(e));
        return;
      }
      feedback.success();
    });
  const save = () =>
    run(async () => {
      if (!session) return;
      const nickname = nick.trim().replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9_]{3,24}$/.test(nickname)) {
        fail('Nick musí mať 3 až 24 znakov: písmená bez diakritiky, čísla alebo podčiarkovník.');
        return;
      }
      // Prezývka musí byť jedinečná — najprv overíme, či ju už niekto nemá.
      const { data: taken, error: checkError } = await bilt.rpc('find_player_by_nickname', {
        search_nickname: nickname,
      });
      if (checkError) {
        fail(playerError(checkError));
        return;
      }
      if (taken) {
        fail('Táto prezývka je už obsadená. Vyber si inú.');
        return;
      }
      const { error: e } = await bilt
        .from('player_profiles')
        .insert({ user_id: session.user.id, nickname });
      if (e) {
        // Súbeh: medzitým si nick zabral niekto iný (databáza to nepustí dvakrát).
        const code =
          typeof e === 'object' && e !== null && 'code' in e ? e.code : undefined;
        if (code === '23505') {
          fail('Táto prezývka je už obsadená. Vyber si inú.');
          return;
        }
        fail(playerError(e));
        return;
      }
      await refresh();
      if (usePlayers.getState().error) return;
      feedback.success();
      router.dismissTo('/friends');
    });
  return (
    <Page form fallbackHref="/friends" fallbackLabel="Späť k priateľom">
      <Stack.Screen options={{ title: 'Môj účet' }} />
      {!ready || (session && loading && !profile) ? (
        <LoadingRows />
      ) : (
        <View className="mt-3 gap-5">
          <Heading>
            {profile ? `@${profile.nickname}` : session ? 'Vyber si nick' : 'Prihlás sa'}
          </Heading>
          {!session ? (
            sentEmail ? (
              <>
                <Txt className="text-muted">Kód sme poslali na {sentEmail}.</Txt>
                <TextField isRequired>
                  <Label>Kód z e-mailu</Label>
                  <Input
                    value={code}
                    onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="6-miestny kód"
                    editable={!pending}
                  />
                </TextField>
                <Button isDisabled={pending} onPress={verify}>
                  <Button.Label>{pending ? 'Overujem…' : 'Overiť kód'}</Button.Label>
                </Button>
                <Button variant="outline" isDisabled={pending} onPress={send}>
                  <Button.Label>Poslať nový kód</Button.Label>
                </Button>
                <Button
                  variant="ghost"
                  isDisabled={pending}
                  onPress={() => {
                    setSentEmail('');
                    setCode('');
                    setError('');
                  }}
                >
                  <Button.Label>Zmeniť e-mail</Button.Label>
                </Button>
              </>
            ) : (
              <>
                <Txt className="text-muted">Prihlásenie aj vytvorenie účtu cez kód z e-mailu.</Txt>
                <TextField isRequired>
                  <Label>E-mail</Label>
                  <Input
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    placeholder="tvoj@email.sk"
                    editable={!pending}
                  />
                </TextField>
                <Button isDisabled={pending} onPress={send}>
                  <Button.Label>{pending ? 'Posielam…' : 'Poslať kód'}</Button.Label>
                </Button>
              </>
            )
          ) : profile ? (
            <>
              <Txt className="text-muted">Tento nick daj priateľom, aby ťa našli v aplikácii.</Txt>
              <Button variant="secondary" onPress={() => router.push('/statistics')}>
                <Button.Label>Moje štatistiky</Button.Label>
              </Button>
            </>
          ) : !remoteError ? (
            <>
              <TextField isRequired>
                <Label>Tvoj nick</Label>
                <Input
                  value={nick}
                  onChangeText={setNick}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={24}
                  placeholder="napr. martin_180"
                  editable={!pending}
                />
              </TextField>
              <Txt className="text-muted text-[13px]">
                3 až 24 znakov: písmená bez diakritiky, čísla alebo podčiarkovník. Nick bude
                viditeľný ostatným hráčom.
              </Txt>
              <Button isDisabled={pending} onPress={save}>
                <Button.Label>{pending ? 'Ukladám…' : 'Uložiť nick'}</Button.Label>
              </Button>
            </>
          ) : null}
          {!!(error || remoteError) && (
            <Txt accessibilityRole="alert" className="text-danger">
              {error || remoteError}
            </Txt>
          )}
          {!!remoteError && (
            <Button variant="outline" onPress={() => void refresh()} isDisabled={loading}>
              <Button.Label>Skúsiť znova</Button.Label>
            </Button>
          )}
          {!!session && (
            <>
              <Button
                variant="ghost"
                isDisabled={pending}
                onPress={() =>
                  run(async () => {
                    const { error: e } = await bilt.auth.signOut();
                    if (e) {
                      fail(playerError(e));
                      return;
                    }
                    setSentEmail('');
                    setCode('');
                    setConfirmDelete(false);
                    feedback.success();
                    router.dismissTo('/friends');
                  })
                }
              >
                <Button.Label>{pending ? 'Čakaj…' : 'Odhlásiť sa'}</Button.Label>
              </Button>
              {!confirmDelete ? (
                <Button
                  variant="ghost"
                  isDisabled={pending}
                  onPress={() => {
                    setConfirmDelete(true);
                    setError('');
                  }}
                >
                  <Button.Label className="text-danger">Odstrániť účet</Button.Label>
                </Button>
              ) : (
                <View className="gap-3">
                  <Txt className="text-danger text-[13px] leading-5">
                    Naozaj odstrániť účet{profile ? ` @${profile.nickname}` : ''}? Vymaže sa
                    profil, priatelia, zápasy aj správy. Túto akciu nemožno vrátiť.
                  </Txt>
                  <Button
                    variant="danger"
                    isDisabled={pending}
                    onPress={() =>
                      run(async () => {
                        const { error: e } = await bilt.rpc('delete_own_account');
                        if (e) {
                          fail(playerError(e));
                          return;
                        }
                        await bilt.auth.signOut();
                        setSentEmail('');
                        setCode('');
                        setConfirmDelete(false);
                        feedback.success();
                        router.dismissTo('/friends');
                      })
                    }
                  >
                    <Button.Label>{pending ? 'Mažem…' : 'Áno, odstrániť účet'}</Button.Label>
                  </Button>
                  <Button
                    variant="ghost"
                    isDisabled={pending}
                    onPress={() => {
                      setConfirmDelete(false);
                      setError('');
                    }}
                  >
                    <Button.Label>Zrušiť</Button.Label>
                  </Button>
                </View>
              )}
            </>
          )}
        </View>
      )}
    </Page>
  );
}
