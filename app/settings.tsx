import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Button } from 'heroui-native';
import { Page, Heading, Txt } from '@/components/DartsUI';
import { CameraPreview } from '@/components/CameraPreview';
import { feedback } from '@/lib/darts';
import { useHardwareKeyboard, useInputSettings } from '@/lib/scoreInput';
import { usePlayers } from '@/lib/players';
import { getThemePref, setThemePref } from '@/lib/theme';
import { backupNow, restoreBackup, useBackup } from '@/lib/backup';
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

/** Vzhľad: svetlý, tmavý alebo podľa telefónu (po zmene sa appka znova načíta). */
function ThemeSettings() {
  const current = getThemePref();
  return (
    <View className="gap-3">
      <Txt className="text-[17px]" style={{ fontFamily: 'Inter_700Bold' }}>
        Vzhľad
      </Txt>
      <View className="flex-row gap-2">
        {(
          [
            ['light', 'Svetlý'],
            ['dark', 'Tmavý'],
            ['system', 'Ako mobil'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            className="flex-1 px-1"
            variant={current === value ? 'secondary' : 'tertiary'}
            onPress={() => {
              if (value === current) return;
              feedback.selection();
              setThemePref(value);
            }}
          >
            <Button.Label numberOfLines={1}>{label}</Button.Label>
          </Button>
        ))}
      </View>
      <Txt className="text-muted text-[12px]">
        „Ako mobil“ = podľa svetlého/tmavého režimu telefónu. Po zmene sa appka znova načíta.
      </Txt>
    </View>
  );
}

/** Záloha: lokálne zápasy, tréningy a rekordy na serveri pri tvojom účte. */
function BackupSettings() {
  const session = usePlayers((s) => s.session);
  const lastBackup = useBackup((s) => s.lastBackup);
  const problem = useBackup((s) => s.problem);
  const busy = useBackup((s) => s.busy);
  const [note, setNote] = useState('');
  return (
    <View className="gap-3">
      <Txt className="text-[17px]" style={{ fontFamily: 'Inter_700Bold' }}>
        Záloha
      </Txt>
      {!session ? (
        <Txt className="text-muted text-[13px] leading-5">
          Prihlás sa a offline zápasy, tréningy aj rekordy sa budú samy zálohovať k tvojmu účtu.
        </Txt>
      ) : (
        <>
          <Txt className="text-muted text-[13px] leading-5">
            Offline zápasy, história a rekordy tréningov, lokálni hráči a nastavenia sa samy
            zálohujú k tvojmu účtu. Na novom telefóne sa po prihlásení samy obnovia — záloha sa
            spojí s tým, čo je v telefóne, nič sa neprepíše.
          </Txt>
          <View className="bg-surface rounded-xl px-4 py-3">
            <Txt className="text-[13px]" style={{ fontFamily: 'Inter_600SemiBold' }}>
              {problem
                ? problem
                : lastBackup
                  ? `Posledná záloha: ${new Date(lastBackup).toLocaleString('sk-SK', {
                      day: 'numeric',
                      month: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : 'Záloha ešte neprebehla.'}
            </Txt>
            {!!note && <Txt className="text-muted mt-1 text-[12px]">{note}</Txt>}
          </View>
          <View className="flex-row gap-2">
            <Button
              className="flex-1 px-1"
              variant="secondary"
              isDisabled={busy}
              onPress={() => {
                setNote('');
                void backupNow().then((ok) => {
                  if (ok) {
                    setNote('Zálohované.');
                    feedback.success();
                  } else feedback.error();
                });
              }}
            >
              <Button.Label numberOfLines={1}>{busy ? 'Čakaj…' : 'Zálohovať teraz'}</Button.Label>
            </Button>
            <Button
              className="flex-1 px-1"
              variant="tertiary"
              isDisabled={busy}
              onPress={() => {
                setNote('');
                void restoreBackup().then((added) => {
                  if (added === null) {
                    feedback.error();
                    return;
                  }
                  setNote(
                    added
                      ? `Obnovené zo zálohy: pribudlo ${added} zápasov/tréningov.`
                      : 'Všetko zo zálohy už v telefóne je.',
                  );
                  feedback.success();
                });
              }}
            >
              <Button.Label numberOfLines={1}>Obnoviť zo zálohy</Button.Label>
            </Button>
          </View>
        </>
      )}
    </View>
  );
}

/** Nastavenia: všetko na jednom mieste (otvára sa z Môjho účtu). */
export default function SettingsScreen() {
  const session = usePlayers((s) => s.session);
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
  return (
    <Page fallbackHref="/account" fallbackLabel="Späť na môj účet">
      <Stack.Screen options={{ title: 'Nastavenia' }} />
      <View className="mt-3 gap-5">
        <Heading>Nastavenia</Heading>
        <ThemeSettings />
        <BackupSettings />
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
      </View>
    </Page>
  );
}
