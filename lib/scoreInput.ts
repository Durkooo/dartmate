import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/* Zadávanie skóre bez ťukania: hlasom (rozpoznávanie reči v prehliadači) a
 * z pripojenej (Bluetooth) klávesnice. */

// ───────────── Slovenské čísla z reči → skóre ─────────────
const WORDS: Record<string, number> = {
  // slovensky
  nula: 0,
  nic: 0,
  jeden: 1,
  jedna: 1,
  jedno: 1,
  dva: 2,
  dve: 2,
  tri: 3,
  styri: 4,
  pat: 5,
  sest: 6,
  sedem: 7,
  osem: 8,
  devat: 9,
  desat: 10,
  jedenast: 11,
  dvanast: 12,
  trinast: 13,
  strnast: 14,
  patnast: 15,
  sestnast: 16,
  sedemnast: 17,
  osemnast: 18,
  devatnast: 19,
  dvadsat: 20,
  tridsat: 30,
  styridsat: 40,
  patdesiat: 50,
  sestdesiat: 60,
  sedemdesiat: 70,
  osemdesiat: 80,
  devatdesiat: 90,
  sto: 100,
  jednosto: 100,
  // česky (ak telefón slovenčinu nemá a použije češtinu)
  ctyri: 4,
  pet: 5,
  sedm: 7,
  osm: 8,
  devet: 9,
  deset: 10,
  jedenact: 11,
  dvanact: 12,
  trinact: 13,
  ctrnact: 14,
  patnact: 15,
  sestnact: 16,
  sedmnact: 17,
  osmnact: 18,
  devatenact: 19,
  dvacet: 20,
  tricet: 30,
  ctyricet: 40,
  padesat: 50,
  sedesat: 60,
  sedmdesat: 70,
  osmdesat: 80,
  devadesat: 90,
  // anglicky (posledná záloha)
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};
const KEYS = Object.keys(WORDS).sort((a, b) => b.length - a.length);
const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Jedno slovo → čísla, ktoré v ňom sú („stoosemdesiat“ → [100, 80]); null = nie je to číslo. */
function wordNumbers(word: string): number[] | null {
  let rest = word;
  const out: number[] = [];
  while (rest) {
    const key = KEYS.find((k) => rest.startsWith(k));
    if (!key) return null;
    out.push(WORDS[key]);
    rest = rest.slice(key.length);
  }
  return out.length ? out : null;
}
/** Najmenší rád čísla (100 → 100, 140 → 10, 145 → 1, 40 → 10, 7 → 1). */
const place = (n: number) => (n % 10 !== 0 ? 1 : n % 100 !== 0 ? 10 : 100);

/** Slová a číslice v reči → skóre. Zvládne „sto štyridsať“, „140“, „sto 40“, „100 40“,
 *  „stoosemdesiat“, „mám šesťdesiat“. Ostatné slová ignoruje; viac čísel = posledné.
 *  null = žiadne číslo. */
export function parseSpokenScore(text: string): number | null {
  const tokens = strip(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  // Postupnosť čísel v poradí, ako zazneli (slová môžu mať viac častí).
  const parts: number[] = [];
  const breaks: boolean[] = []; // true = pred touto časťou bolo nečíselné slovo
  let gap = false;
  for (const tok of tokens) {
    const nums = /^\d{1,3}$/.test(tok) ? [Number(tok)] : wordNumbers(tok);
    if (!nums) {
      gap = true;
      continue;
    }
    nums.forEach((n, i) => {
      parts.push(n);
      breaks.push(i === 0 ? gap : false);
    });
    gap = false;
  }
  if (!parts.length) return null;
  // Skladanie: 100 + 40 + 5, 100 + 80, 20 + 5… Nová skupina, keď číslo nesedí do rádu.
  const groups: number[] = [];
  let cur = parts[0];
  for (let i = 1; i < parts.length; i += 1) {
    const n = parts[i];
    if (!breaks[i] && n < place(cur) && cur + n <= 999) cur += n;
    else {
      groups.push(cur);
      cur = n;
    }
  }
  groups.push(cur);
  return groups[groups.length - 1];
}

/** Číslo, po ktorom môže ešte niečo nasledovať (sto… / sto dvadsať… / štyridsať…). */
export const mayContinue = (n: number) => n === 100 || (n % 10 === 0 && n >= 20 && n <= 170);

// ───────────── Hlasový vstup ─────────────
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};
function recognitionCtor(): (new () => Recognition) | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const C: unknown =
    Reflect.get(window, 'SpeechRecognition') ?? Reflect.get(window, 'webkitSpeechRecognition');
  // eslint-disable-next-line typescript/no-unsafe-type-assertion -- API prehliadača bez typov
  return typeof C === 'function' ? (C as new () => Recognition) : null;
}
export const voiceSupported = () => recognitionCtor() !== null;

/** Počúva nepretržite, kým je `enabled`; každé rozpoznané (finálne) skóre pošle do onScore. */
export function useVoiceScore(
  enabled: boolean,
  onScore: (n: number, heard: string) => void,
  onUnclear: (heard: string) => void,
) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  /** Čo rozpoznávač práve počuje (aj priebežne) — zobrazí sa hráčovi. */
  const [heard, setHeard] = useState('');
  const cb = useRef({ onScore, onUnclear });
  useEffect(() => {
    cb.current = { onScore, onUnclear };
  }, [onScore, onUnclear]);
  useEffect(() => {
    const Ctor = recognitionCtor();
    if (!enabled || !Ctor) return undefined;
    let stopped = false;
    const rec = new Ctor();
    // Slovenčina; ak ju telefón nepodporuje, skúsime češtinu a potom angličtinu.
    const LANGS = ['sk-SK', 'cs-CZ', 'en-US'];
    let langIndex = 0;
    rec.lang = LANGS[langIndex];
    rec.continuous = true;
    // Čiastočné výsledky: platné číslo prijmeme, keď sa 0,8 s nezmení — nemusíme
    // čakať, kým prehliadač vyhodnotí koniec vety (na iPhone aj 1–2 s).
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    // Kým sa číslo nezmení: krátko pri „hotových“ číslach (60, 140, 45),
    // dlhšie pri tých, za ktorými môže ešte niečo prísť („sto…“, „sto dvadsať…“).
    const STABLE_MS = 600;
    const STABLE_PREFIX_MS = 1400;
    const accepted = new Set<number>();
    let interimTimer: ReturnType<typeof setTimeout> | undefined;
    let interimFor = -1;
    let interimValue: number | null = null;
    const accept = (index: number, value: number, heard: string) => {
      if (accepted.has(index)) return;
      accepted.add(index);
      cb.current.onScore(value, heard);
    };
    rec.onresult = (e: unknown) => {
      const results = e as {
        results: ArrayLike<
          ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }
        >;
        resultIndex: number;
      };
      for (let i = results.resultIndex; i < results.results.length; i += 1) {
        const r = results.results[i];
        let heard = '';
        let value: number | null = null;
        for (let a = 0; a < r.length && value === null; a += 1) {
          heard = r[a].transcript;
          value = parseSpokenScore(heard);
        }
        setHeard(r[0]?.transcript ?? heard);
        if (r.isFinal) {
          if (interimFor === i) clearTimeout(interimTimer);
          if (accepted.has(i)) continue;
          if (value === null) {
            accepted.add(i);
            cb.current.onUnclear(r[0]?.transcript ?? '');
          } else accept(i, value, heard);
        } else if (value !== null && !accepted.has(i)) {
          // Čiastočný text: čakáme, či sa číslo ešte nezmení („sto…“ → „sto štyridsať“).
          if (interimFor !== i || interimValue !== value) {
            clearTimeout(interimTimer);
            interimFor = i;
            interimValue = value;
            const v = value;
            const h = heard;
            interimTimer = setTimeout(
              () => accept(i, v, h),
              mayContinue(v) ? STABLE_PREFIX_MS : STABLE_MS,
            );
          }
        }
      }
    };
    rec.onerror = (e: unknown) => {
      const raw: unknown = typeof e === 'object' && e !== null ? Reflect.get(e, 'error') : '';
      const code = typeof raw === 'string' ? raw : '';
      if (code === 'language-not-supported' && langIndex < LANGS.length - 1) {
        langIndex += 1;
        rec.lang = LANGS[langIndex];
        return; // onend reštartuje s ďalším jazykom
      }
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        stopped = true;
        setError('Mikrofón nie je povolený. Povoľ ho v prehliadači.');
      } else if (code === 'network') setError('Rozpoznávanie reči potrebuje internet.');
    };
    rec.onend = () => {
      setListening(false);
      // Prehliadač po chvíli ticha počúvanie ukončí — znova ho zapneme.
      if (!stopped)
        setTimeout(() => {
          if (stopped) return;
          try {
            rec.start();
          } catch {
            // už beží
          }
        }, 250);
    };
    rec.onstart = () => {
      // Nové počúvanie číslujú výsledky odznova.
      accepted.clear();
      interimFor = -1;
      interimValue = null;
      setListening(true);
      setError('');
    };
    try {
      rec.start();
    } catch {
      // Chyba sa ukáže cez onerror; bez nej len nepočúva.
    }
    return () => {
      stopped = true;
      clearTimeout(interimTimer);
      try {
        rec.abort();
      } catch {
        // nič
      }
      setListening(false);
    };
  }, [enabled]);
  return { listening: enabled && listening, error, heard: enabled ? heard : '' };
}

/** Hlasový režim si zápas pamätá, kým beží (aj po odchode z obrazovky a návrate). */
const voiceByMatch = new Map<string, boolean>();
export function useVoiceMode(matchKey: string) {
  const [on, setOn] = useState(() => voiceByMatch.get(matchKey) ?? false);
  const set = (v: boolean) => {
    voiceByMatch.set(matchKey, v);
    setOn(v);
  };
  return [on, set] as const;
}

// ───────────── Nastavenia (klávesnica) ─────────────
type InputSettings = {
  hardwareKeyboard: boolean;
  setHardwareKeyboard: (v: boolean) => void;
};
export const useInputSettings = create<InputSettings>()(
  persist(
    (set) => ({
      hardwareKeyboard: false,
      setHardwareKeyboard: (hardwareKeyboard) => set({ hardwareKeyboard }),
    }),
    {
      name: 'dartmate:input-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ hardwareKeyboard: s.hardwareKeyboard }),
    },
  ),
);

/** Zadávanie skóre z pripojenej klávesnice: číslice, Backspace, Enter, Esc. */
export function useHardwareKeyboard(
  enabled: boolean,
  handlers: {
    digit: (d: string) => void;
    backspace: () => void;
    enter: () => void;
    clear: () => void;
  },
) {
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  }, [handlers]);
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      // Keď píšeš do textového poľa (napr. chat), klávesnica patrí poľu.
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) h.current.digit(e.key);
      else if (e.key === 'Backspace') h.current.backspace();
      else if (e.key === 'Enter' || e.key === 'NumpadEnter') h.current.enter();
      else if (e.key === 'Escape') h.current.clear();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

/** Klikne na tlačidlo podľa id (Enter z klávesnice = ťuknutie na „Zapísať“). */
export function clickById(id: string) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const el = document.getElementById(id);
  if (el instanceof HTMLElement && el.getAttribute('aria-disabled') !== 'true') el.click();
}
