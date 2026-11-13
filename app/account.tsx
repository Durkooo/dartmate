import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button, Input, Label, PressableFeedback, TextField } from 'heroui-native';
import * as ImagePicker from 'expo-image-picker';
import { Plus } from 'lucide-react-native';
import { Page, Heading, Txt, LoadingRows, Avatar } from '@/components/DartsUI';
import { CameraPreview } from '@/components/CameraPreview';
import { FunctionsHttpError } from '@biltme/backend';
import { bilt } from '@/lib/bilt';
import { feedback, palette } from '@/lib/darts';
import { useHardwareKeyboard, useInputSettings } from '@/lib/scoreInput';
import { removeAvatar, uploadAvatar } from '@/lib/avatars';
import { playerError, usePlayers } from '@/lib/players';
import {
  loadCameraPrefs,
  saveCameraPrefs,
  type CameraDevice,
  type CameraPrefs,
  type Facing,
} from '@/lib/video';

function DevicePicker({
  devices,
  value,
  onChange,
}: {
  devices: CameraDevice[];
  value?: string;
  onChange: (device?: CameraDevice) => void;
}) {
  if (!devices.length) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        size="sm"
        variant={!value ? 'secondary' : 'tertiary'}
        onPress={() => onChange(undefined)}
      >
        <Button.Label>Automatická</Button.Label>
      </Button>
      {devices.map((d) => (
        <Button
          key={d.deviceId}
          size="sm"
          variant={value === d.deviceId ? 'secondary' : 'tertiary'}
          onPress={() => onChange(d)}
        >
          <Button.Label numberOfLines={1}>{d.label}</Button.Label>
        </Button>
      ))}
    </View>
  );
}

function FacingPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Facing;
  onChange: (f: Facing) => void;
}) {
  return (
    <View className="gap-2">
      <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>{label}</Txt>
      <View className="flex-row gap-2">
        {(
          [
            ['user', 'Predná'],
            ['environment', 'Zadná'],
          ] as const
        ).map(([f, name]) => (
          <Button
            key={f}
            className="flex-1"
            variant={value === f ? 'secondary' : 'tertiary'}
            onPress={() => onChange(f)}
          >
            <Button.Label>{name}</Button.Label>
          </Button>
        ))}
      </View>
    </View>
  );
}

/** Krúžok s fotkou (alebo písmenami) a plusom — ťuknutím si vyberieš fotku z galérie. */
function ProfilePhoto({
  nickname,
  userId,
  path,
  url,
  onChanged,
  onError,
}: {
  nickname: string;
  userId: string;
  path: string | null | undefined;
  url: string | undefined;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const size = 72;
  const pick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        allowsMultipleSelection: false,
      });
      const asset = !result.canceled ? result.assets[0] : undefined;
      if (!asset) return;
      await uploadAvatar(asset, userId, path);
      await onChanged();
      feedback.success();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Fotku sa nepodarilo nahrať.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await removeAvatar(path);
      await onChanged();
      feedback.selection();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Fotku sa nepodarilo odstrániť.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="flex-row items-center gap-4">
      <PressableFeedback
        onPress={() => void pick()}
        isDisabled={busy}
        accessibilityRole="button"
        accessibilityLabel={url ? 'Zmeniť profilovú fotku' : 'Pridať profilovú fotku'}
        style={{ width: size, height: size, opacity: busy ? 0.5 : 1 }}
      >
        <Avatar friend={{ name: nickname, color: 'blue', avatarUrl: url }} size={size} />
        <View
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: palette.ink,
            borderWidth: 2,
            borderColor: palette.white,
          }}
          className="items-center justify-center"
        >
          <Plus size={14} strokeWidth={3} color={palette.white} />
        </View>
      </PressableFeedback>
      <View className="flex-1 gap-1">
        <Heading>@{nickname}</Heading>
        {busy ? (
          <Txt className="text-muted text-[13px]">Ukladám fotku…</Txt>
        ) : url ? (
          <Button variant="ghost" size="sm" className="self-start" onPress={() => void remove()}>
            <Button.Label>Odstrániť fotku</Button.Label>
          </Button>
        ) : (
          <Txt className="text-muted text-[13px]">Ťukni na krúžok a pridaj si fotku.</Txt>
        )}
      </View>
    </View>
  );
}

/** Klávesnica: zadávanie skóre z pripojenej (Bluetooth) klávesnice. */
function KeyboardSettings() {
  const enabled = useInputSettings((s) => s.hardwareKeyboard);
  const setEnabled = useInputSettings((s) => s.setHardwareKeyboard);
  const [test, setTest] = useState('');
  useHardwareKeyboard(enabled, {
    digit: (d) => setTest((t) => (t + d).slice(-6)),
    backspace: () => setTest((t) => t.slice(0, -1)),
    clear: () => setTest(''),
    enter: () => setTest((t) => (t ? `${t} ✓` : t)),
  });
  return (
    <View className="mt-2 gap-3">
      <Txt className="text-[17px]" style={{ fontFamily: 'Inter_700Bold' }}>
        Klávesnica
      </Txt>
      <Txt className="text-muted text-[13px] leading-5">
        Skóre môžeš zadávať z klávesnice namiesto ťukania do mobilu. Klávesnicu najprv spáruj v
        telefóne: Nastavenia → Bluetooth (stačí aj malá numerická klávesnica). V zápase potom píšeš
        čísla, Enter = Zapísať, Backspace = zmazať číslicu, Esc = vymazať.
      </Txt>
      <View className="flex-row gap-2">
        {(
          [
            [false, 'Vypnutá'],
            [true, 'Zapnutá'],
          ] as const
        ).map(([v, label]) => (
          <Button
            key={label}
            className="flex-1"
            variant={enabled === v ? 'secondary' : 'tertiary'}
            onPress={() => {
              setEnabled(v);
              setTest('');
              feedback.selection();
            }}
          >
            <Button.Label>{label}</Button.Label>
          </Button>
        ))}
      </View>
      {enabled && (
        <View className="bg-surface items-center gap-1 rounded-xl p-4">
          <Txt className="text-muted text-[12px]">Vyskúšaj: stlač čísla na klávesnici</Txt>
          <Txt className="text-[28px]" style={{ fontFamily: 'Inter_700Bold' }}>
            {test || '–'}
          </Txt>
        </View>
      )}
    </View>
  );
}

export default function Account() {
  const ready = usePlayers((s) => s.ready);
  const session = usePlayers((s) => s.session);
  const profile = usePlayers((s) => s.profile);
  const myAvatarUrl = usePlayers((s) => s.myAvatarUrl);
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
  const [camPrefs, setCamPrefs] = useState<CameraPrefs>({ match: 'environment', call: 'user' });
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [previewFacing, setPreviewFacing] = useState<Facing | null>(null);
  const [previewDevice, setPreviewDevice] = useState<string | undefined>(undefined);
  useEffect(() => {
    void loadCameraPrefs().then(setCamPrefs);
  }, []);
  const updatePrefs = (next: CameraPrefs) => {
    setCamPrefs(next);
    void saveCameraPrefs(next);
    feedback.selection();
  };
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
      if (!/^[\p{L}\p{N} _.-]{3,24}$/u.test(nickname)) {
        fail(
          'Nick musí mať 3 až 24 znakov: písmená (aj s diakritikou), čísla, medzera, bodka, podčiarkovník alebo pomlčka.',
        );
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
      // find_player_by_nickname vracia ZOZNAM — voľný nick = prázdny zoznam (ten je truthy!).
      const isTaken = Array.isArray(taken) ? taken.length > 0 : !!taken;
      if (isTaken) {
        fail('Táto prezývka je už obsadená. Vyber si inú.');
        return;
      }
      const { error: e } = await bilt
        .from('player_profiles')
        .insert({ user_id: session.user.id, nickname });
      if (e) {
        // Súbeh: medzitým si nick zabral niekto iný (databáza to nepustí dvakrát).
        const errorCode = typeof e === 'object' && e !== null && 'code' in e ? e.code : undefined;
        if (errorCode === '23505') {
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
    <Page form fallbackHref="/" fallbackLabel="Späť domov">
      <Stack.Screen options={{ title: 'Môj účet' }} />
      {!ready || (session && loading && !profile) ? (
        <LoadingRows />
      ) : (
        <View className="mt-3 gap-5">
          {profile && session ? (
            <ProfilePhoto
              nickname={profile.nickname}
              userId={session.user.id}
              path={profile.avatar_path}
              url={myAvatarUrl}
              onChanged={refresh}
              onError={fail}
            />
          ) : (
            <Heading>{session ? 'Vyber si nick' : 'Prihlás sa'}</Heading>
          )}
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
                3 až 24 znakov: písmená (aj s diakritikou), čísla, medzera, bodka, podčiarkovník
                alebo pomlčka. Nick bude viditeľný ostatným hráčom.
              </Txt>
              <Button isDisabled={pending} onPress={save}>
                <Button.Label>{pending ? 'Ukladám…' : 'Uložiť nick'}</Button.Label>
              </Button>
            </>
          ) : null}
          <Button variant="secondary" onPress={() => router.push('/statistics')}>
            <Button.Label>Moje štatistiky</Button.Label>
          </Button>
          {/* NASTAVENIA: kamera a klávesnica */}
          <Heading className="mt-7 text-[22px]">Nastavenia</Heading>
          {!!session && (
            <View className="gap-4">
              <View>
                <Txt className="text-[17px]" style={{ fontFamily: 'Inter_700Bold' }}>
                  Kamera
                </Txt>
              </View>
              <FacingPicker
                label="Online zápas"
                value={camPrefs.match}
                onChange={(f) => updatePrefs({ ...camPrefs, match: f, matchDeviceId: undefined })}
              />
              <DevicePicker
                devices={devices}
                value={camPrefs.matchDeviceId}
                onChange={(d) =>
                  updatePrefs({
                    ...camPrefs,
                    match: d?.facing ?? camPrefs.match,
                    matchDeviceId: d?.deviceId,
                  })
                }
              />
              <FacingPicker
                label="Videohovor"
                value={camPrefs.call}
                onChange={(f) => updatePrefs({ ...camPrefs, call: f, callDeviceId: undefined })}
              />
              <DevicePicker
                devices={devices}
                value={camPrefs.callDeviceId}
                onChange={(d) =>
                  updatePrefs({
                    ...camPrefs,
                    call: d?.facing ?? camPrefs.call,
                    callDeviceId: d?.deviceId,
                  })
                }
              />
              {previewFacing ? (
                <View className="gap-2">
                  <View className="flex-row gap-2">
                    {(
                      [
                        ['user', 'Predná'],
                        ['environment', 'Zadná'],
                      ] as const
                    ).map(([f, name]) => (
                      <Button
                        key={f}
                        size="sm"
                        className="flex-1"
                        variant={previewFacing === f && !previewDevice ? 'secondary' : 'tertiary'}
                        onPress={() => {
                          setPreviewFacing(f);
                          setPreviewDevice(undefined);
                        }}
                      >
                        <Button.Label>{name}</Button.Label>
                      </Button>
                    ))}
                  </View>
                  {devices.length > 0 && (
                    <View className="flex-row flex-wrap gap-2">
                      {devices.map((d) => (
                        <Button
                          key={d.deviceId}
                          size="sm"
                          variant={previewDevice === d.deviceId ? 'secondary' : 'tertiary'}
                          onPress={() => {
                            setPreviewDevice(d.deviceId);
                            setPreviewFacing(d.facing);
                          }}
                        >
                          <Button.Label numberOfLines={1}>{d.label}</Button.Label>
                        </Button>
                      ))}
                    </View>
                  )}
                  <CameraPreview
                    key={`${previewFacing}-${previewDevice ?? 'auto'}`}
                    facing={previewFacing}
                    deviceId={previewDevice}
                    onDevices={setDevices}
                  />
                  <Button variant="ghost" size="sm" onPress={() => setPreviewFacing(null)}>
                    <Button.Label>Zavrieť náhľad</Button.Label>
                  </Button>
                </View>
              ) : (
                <Button
                  variant="secondary"
                  onPress={() => {
                    setPreviewDevice(undefined);
                    setPreviewFacing(camPrefs.match);
                  }}
                >
                  <Button.Label>Náhľad kamery</Button.Label>
                </Button>
              )}
            </View>
          )}
          <KeyboardSettings />
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
                    Naozaj odstrániť účet{profile ? ` @${profile.nickname}` : ''}? Vymaže sa profil,
                    priatelia, zápasy aj správy. Túto akciu nemožno vrátiť.
                  </Txt>
                  <Button
                    variant="danger"
                    isDisabled={pending}
                    onPress={() =>
                      run(async () => {
                        // Najprv profilovú fotku (pravidlá úložiska ju dovolia zmazať len majiteľovi).
                        if (profile?.avatar_path)
                          await removeAvatar(profile.avatar_path).catch(() => undefined);
                        // Mazanie beží ako Edge Function (vie zmazať aj auth účet).
                        const { error: e } = await bilt.functions.invoke('delete-own-account');
                        if (e) {
                          // Funkcia odpovedala chybou — ukáž aj jej vlastnú správu zo servera.
                          let message = e.message;
                          if (e instanceof FunctionsHttpError) {
                            try {
                              const result: unknown = await e.context.json();
                              if (
                                result &&
                                typeof result === 'object' &&
                                'message' in result &&
                                typeof result.message === 'string'
                              ) {
                                message = result.message;
                              }
                            } catch {
                              // Keep the SDK error if the response cannot be read.
                            }
                          }
                          fail(playerError({ message }));
                          return;
                        }
                        const { error: signOutError } = await bilt.auth.signOut({ scope: 'local' });
                        if (signOutError) {
                          setConfirmDelete(false);
                          fail(
                            `Účet bol odstránený, ale odhlásenie zlyhalo. ${signOutError.message}`,
                          );
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
