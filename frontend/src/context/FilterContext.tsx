import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";

interface FilterContextValue {
  year: number | null;
  setYear: Dispatch<SetStateAction<number | null>>;
  scenarioId: number | null;
  setScenarioId: Dispatch<SetStateAction<number | null>>;
}

const FilterContext = createContext<FilterContextValue | undefined>(undefined);

const YEAR_STORAGE_KEY = "butce_filters.year";
const SCENARIO_STORAGE_KEY = "butce_filters.scenario";

function getStoredNumber(key: string): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.localStorage.getItem(key);
  if (!stored) {
    return null;
  }
  const value = Number(stored);
  return Number.isFinite(value) ? value : null;
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number | null>(() => {
    const stored = getStoredNumber(YEAR_STORAGE_KEY);
    return stored ?? currentYear;
  });
  const [scenarioId, setScenarioId] = useState<number | null>(() => {
    const stored = getStoredNumber(SCENARIO_STORAGE_KEY);
    return stored;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (year === null) {
      window.localStorage.removeItem(YEAR_STORAGE_KEY);
    } else {
      window.localStorage.setItem(YEAR_STORAGE_KEY, String(year));
    }
  }, [year]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (scenarioId === null) {
      window.localStorage.removeItem(SCENARIO_STORAGE_KEY);
    } else {
      window.localStorage.setItem(SCENARIO_STORAGE_KEY, String(scenarioId));
    }
  }, [scenarioId]);

  const value = useMemo(
    () => ({ year, setYear, scenarioId, setScenarioId }),
    [year, scenarioId, setYear, setScenarioId]
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters(): FilterContextValue {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error("useFilters must be used within a FilterProvider");
  }
  return context;
}
