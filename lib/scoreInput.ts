import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/* Zadávanie skóre bez ťukania: hlasom (rozpoznávanie reči v prehliadači) a
 * z pripojenej (Bluetooth) klávesnice. */

// ───────────── Slovenské čísla z reči → skóre ─────────────
const WORDS: Record<string, number> = {
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
};
const KEYS = Object.keys(WORDS).sort((a, b) => b.length - a.length);
const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** „sto štyridsať“, „140“, „stoosemdesiat“, „dvadsaťpäť“ → číslo; null = nerozumel. */
export function parseSpokenScore(text: string): number | null {
  const t = strip(text).trim();
  const digits = t.match(/\d{1,3}/);
  if (digits) return Number(digits[0]);
  let rest = t.replace(/[^a-z]/g, '');
  if (!rest) return null;
  let sum = 0;
  let found = false;
  while (rest) {
    const key = KEYS.find((k) => rest.startsWith(k));
    if (!key) return null; // iné slová (napr. „podaj mi pivo“) → nič
    sum += WORDS[key];
    rest = rest.slice(key.length);
    found = true;
  }
  return found ? sum : null;
}

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
  const cb = useRef({ onScore, onUnclear });
  useEffect(() => {
    cb.current = { onScore, onUnclear };
  }, [onScore, onUnclear]);
  useEffect(() => {
    const Ctor = recognitionCtor();
    if (!enabled || !Ctor) return undefined;
    let stopped = false;
    const rec = new Ctor();
    rec.lang = 'sk-SK';
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.onresult = (e: unknown) => {
      const results = e as {
        results: ArrayLike<
          ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }
        >;
        resultIndex: number;
      };
      for (let i = results.resultIndex; i < results.results.length; i += 1) {
        const r = results.results[i];
        if (!r.isFinal) continue;
        let heard = '';
        let value: number | null = null;
        for (let a = 0; a < r.length && value === null; a += 1) {
          heard = r[a].transcript;
          value = parseSpokenScore(heard);
        }
        if (value === null) cb.current.onUnclear(r[0]?.transcript ?? '');
        else cb.current.onScore(value, heard);
      }
    };
    rec.onerror = (e: unknown) => {
      const raw: unknown = typeof e === 'object' && e !== null ? Reflect.get(e, 'error') : '';
      const code = typeof raw === 'string' ? raw : '';
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
      try {
        rec.abort();
      } catch {
        // nič
      }
      setListening(false);
    };
  }, [enabled]);
  return { listening: enabled && listening, error };
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
