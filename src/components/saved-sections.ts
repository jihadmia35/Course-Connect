'use client';
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
const KEY = 'seu-course-connect:saved:v1';
const EVENT = 'seu-saved-change';
const EMPTY: readonly string[] = [];
let previous: string | null = null;
let snapshot: readonly string[] = EMPTY;
function read(): readonly string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === previous) return snapshot;
    previous = raw;
    const parsed: unknown = JSON.parse(raw ?? '[]');
    snapshot = Array.isArray(parsed)
      ? [
          ...new Set(
            parsed.filter((id): id is string => typeof id === 'string' && id.length < 150),
          ),
        ].slice(0, 1000)
      : EMPTY;
  } catch {
    snapshot = EMPTY;
  }
  return snapshot;
}
function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) callback();
  };
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener('storage', onStorage);
  };
}
export function useSavedSections() {
  const ids = useSyncExternalStore(subscribe, read, () => EMPTY);
  function toggle(id: string) {
    const current = read();
    const exists = current.includes(id);
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify(exists ? current.filter((value) => value !== id) : [...current, id]),
      );
      window.dispatchEvent(new Event(EVENT));
      toast.success(exists ? 'Section removed from saved.' : 'Section saved on this device.');
    } catch {
      toast.error('This browser could not save your section. Allow local storage and try again.');
    }
  }
  return { ids, toggle };
}
