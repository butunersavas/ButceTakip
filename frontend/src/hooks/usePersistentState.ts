import { Dispatch, SetStateAction, useEffect, useState } from "react";

function readValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const storedValue = window.localStorage.getItem(key);
    if (storedValue === null) {
      return fallback;
    }
    return JSON.parse(storedValue) as T;
  } catch (error) {
    console.warn(`Yerel depolama okunamadı: ${key}`, error);
    return fallback;
  }
}

function writeValue<T>(key: string, value: T): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    console.warn(`Yerel depolama güncellenemedi: ${key}`, error);
  }
}

export default function usePersistentState<T>(
  key: string,
  defaultValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => readValue(key, defaultValue));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(key);
    if (stored === null) {
      writeValue(key, defaultValue);
      setState(defaultValue);
    }
  }, [defaultValue, key]);

  useEffect(() => {
    writeValue(key, state);
  }, [key, state]);

  return [state, setState];
}
