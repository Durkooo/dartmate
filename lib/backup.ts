import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { bilt } from '@/lib/bilt';
import { useDarts, type Game } from '@/lib/darts';
import { useExtraGames, type GameRecords, type TrainingEntry } from '@/lib/games';
import { usePlayers } from '@/lib/players';
import { useInputSettings } from '@/lib/scoreInput';

/* Záloha lokálnych dát k účtu na serveri (funkcie save_my_backup / get_my_backup).
 * Obnovenie dáta SPÁJA (nič sa neprepíše): zápasy a tréningy podľa id, rekordy
 * berie lepšie z oboch. Vďaka tomu sa dá appka používať na viacerých telefónoch. */

const CAMERA_PREFS_KEY = 'dartmate:camera-prefs';
type Backup = {
  v: 1;
  savedAt: string;
  darts: { friends: unknown[]; messages: unknown[]; history: Game[] };
  extra: { records: GameRecords; trainingHistory: TrainingEntry[] };
  settings: { hardwareKeyboard: boolean; camera: unknown };
};

type BackupState = {
  /** Posledná úspešná záloha (ISO) alebo null. */
  lastBackup: string | null;
  /** Stav: null = OK; text = chyba / server ešte nie je pripravený. */
  problem: string | null;
  busy: boolean;
};
export const useBackup = create<BackupState>(() => ({
  lastBackup: null,
  problem: null,
  busy: false,
}));

const missing = (m: string) => /function|schema cache|not find|does not exist/i.test(m);

async function collect(): Promise<Backup> {
  const d = useDarts.getState();
  const x = useExtraGames.getState();
  let camera: unknown = null;
  try {
    const raw = await AsyncStorage.getItem(CAMERA_PREFS_KEY);
    camera = raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    camera = null;
  }
  return {
    v: 1,
    savedAt: new Date().toISOString(),
    darts: { friends: d.friends, messages: d.messages, history: d.history },
    extra: { records: x.records, trainingHistory: x.trainingHistory ?? [] },
    settings: { hardwareKeyboard: useInputSettings.getState().hardwareKeyboard, camera },
  };
}

export async function backupNow(): Promise<boolean> {
  if (!usePlayers.getState().session) return false;
  useBackup.setState({ busy: true });
  try {
    const data = await collect();
    const { error } = await bilt.rpc('save_my_backup', { backup: data });
    if (error) {
      useBackup.setState({
        problem: missing(error.message)
          ? 'Záloha sa na serveri ešte pripravuje.'
          : `Zálohu sa nepodarilo uložiť: ${error.message}`,
      });
      return false;
    }
    useBackup.setState({ lastBackup: data.savedAt, problem: null });
    return true;
  } catch (e) {
    useBackup.setState({
      problem: `Zálohu sa nepodarilo uložiť: ${e instanceof Error ? e.message : String(e)}`,
    });
    return false;
  } finally {
    useBackup.setState({ busy: false });
  }
}

const field = (o: unknown, k: string): unknown =>
  typeof o === 'object' && o !== null ? Reflect.get(o, k) : undefined;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
function unionById<T>(local: T[], remote: unknown[]): T[] {
  const ids = new Set(local.map((e) => String(field(e, 'id'))));
  const extra = remote.filter((e) => {
    const id = field(e, 'id');
    return (typeof id === 'string' || typeof id === 'number') && !ids.has(String(id));
  });
  // eslint-disable-next-line typescript/no-unsafe-type-assertion -- dáta zo zálohy tejto appky
  return [...local, ...(extra as T[])];
}
const best = (a: unknown, b: unknown, lower = false): number | null => {
  const x = typeof a === 'number' ? a : null;
  const y = typeof b === 'number' ? b : null;
  if (x === null) return y;
  if (y === null) return x;
  return lower ? Math.min(x, y) : Math.max(x, y);
};

/** Stiahne zálohu a spojí ju s dátami v telefóne. Vráti počet pridaných položiek. */
export async function restoreBackup(): Promise<number | null> {
  if (!usePlayers.getState().session) return null;
  useBackup.setState({ busy: true });
  try {
    const { data, error } = await bilt.rpc('get_my_backup');
    if (error) {
      useBackup.setState({
        problem: missing(error.message)
          ? 'Záloha sa na serveri ešte pripravuje.'
          : `Zálohu sa nepodarilo načítať: ${error.message}`,
      });
      return null;
    }
    const row: unknown = Array.isArray(data) ? data[0] : data;
    const backup = field(row, 'data');
    if (!backup) return 0;
    const darts = field(backup, 'darts');
    const extra = field(backup, 'extra');
    const d = useDarts.getState();
    const history = unionById(d.history, arr(field(darts, 'history')));
    const friends = unionById(d.friends, arr(field(darts, 'friends')));
    const messages = unionById(d.messages, arr(field(darts, 'messages')));
    const x = useExtraGames.getState();
    const trainingHistory = unionById(x.trainingHistory ?? [], arr(field(extra, 'trainingHistory')))
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, 300);
    const r = field(extra, 'records');
    const lr = x.records;
    const records: GameRecords = {
      cricketPlayed: Math.max(lr.cricketPlayed, Number(field(r, 'cricketPlayed') ?? 0)),
      cricketWins: Math.max(lr.cricketWins, Number(field(r, 'cricketWins') ?? 0)),
      clockBest: best(lr.clockBest, field(r, 'clockBest'), true),
      bobsBest: best(lr.bobsBest, field(r, 'bobsBest')),
      c121Best: best(lr.c121Best, field(r, 'c121Best')),
      highscoreBest: best(lr.highscoreBest, field(r, 'highscoreBest')),
      finishBest: best(lr.finishBest, field(r, 'finishBest')),
      rcBest: best(lr.rcBest, field(r, 'rcBest')),
      bullBest: best(lr.bullBest, field(r, 'bullBest')),
    };
    const added =
      history.length -
      d.history.length +
      (trainingHistory.length - (x.trainingHistory ?? []).length);
    history.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    useDarts.setState({ history, friends, messages });
    useExtraGames.setState({ trainingHistory, records });
    const settings = field(backup, 'settings');
    const kb = field(settings, 'hardwareKeyboard');
    if (typeof kb === 'boolean' && kb && !useInputSettings.getState().hardwareKeyboard)
      useInputSettings.getState().setHardwareKeyboard(true);
    const cam = field(settings, 'camera');
    if (cam) {
      const existing = await AsyncStorage.getItem(CAMERA_PREFS_KEY).catch(() => null);
      if (!existing)
        await AsyncStorage.setItem(CAMERA_PREFS_KEY, JSON.stringify(cam)).catch(() => undefined);
    }
    const at = field(row, 'updated_at');
    useBackup.setState({
      problem: null,
      lastBackup: typeof at === 'string' ? at : useBackup.getState().lastBackup,
    });
    return Math.max(0, added);
  } catch (e) {
    useBackup.setState({
      problem: `Zálohu sa nepodarilo načítať: ${e instanceof Error ? e.message : String(e)}`,
    });
    return null;
  } finally {
    useBackup.setState({ busy: false });
  }
}

/** Po prihlásení: raz spojí zálohu so zariadením, potom pri každej zmene dát
 *  (zápas, tréning, rekord…) zálohuje do 15 s. */
export function useAutoBackup() {
  const userId = usePlayers((s) => s.session?.user.id);
  const dartsReady = useDarts((s) => s.hydrated);
  const extraReady = useExtraGames((s) => s.hydrated);
  useEffect(() => {
    if (!userId || !dartsReady || !extraReady) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (active) void backupNow();
      }, 15000);
    };
    let unsubs: (() => void)[] = [];
    void restoreBackup().then(() => {
      if (!active) return;
      // Po spojení hneď zálohujeme (aby server mal aj to, čo bolo len v telefóne).
      void backupNow();
      unsubs = [
        useDarts.subscribe((s, prev) => {
          if (s.history !== prev.history || s.friends !== prev.friends) schedule();
        }),
        useExtraGames.subscribe((s, prev) => {
          if (s.records !== prev.records || s.trainingHistory !== prev.trainingHistory) schedule();
        }),
      ];
    });
    return () => {
      active = false;
      clearTimeout(timer);
      unsubs.forEach((u) => u());
    };
  }, [userId, dartsReady, extraReady]);
}
