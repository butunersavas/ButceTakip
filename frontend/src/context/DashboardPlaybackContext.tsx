import { createContext, useContext, useMemo, Dispatch, SetStateAction } from "react";

import usePersistentState from "../hooks/usePersistentState";

interface DashboardPlaybackContextValue {
  autoPlay: boolean;
  toggleAutoPlay: () => void;
  setAutoPlay: Dispatch<SetStateAction<boolean>>;
}

const DashboardPlaybackContext = createContext<DashboardPlaybackContextValue | undefined>(
  undefined
);

interface DashboardPlaybackProviderProps {
  children: React.ReactNode;
}

export function DashboardPlaybackProvider({ children }: DashboardPlaybackProviderProps) {
  const [autoPlay, setAutoPlayState] = usePersistentState<boolean>(
    "dashboard:autoPlay",
    true
  );

  const value = useMemo(
    () => ({
      autoPlay,
      toggleAutoPlay: () => setAutoPlayState((previous) => !previous),
      setAutoPlay: setAutoPlayState
    }),
    [autoPlay, setAutoPlayState]
  );

  return (
    <DashboardPlaybackContext.Provider value={value}>
      {children}
    </DashboardPlaybackContext.Provider>
  );
}

export function useDashboardPlayback() {
  const context = useContext(DashboardPlaybackContext);

  if (!context) {
    throw new Error("useDashboardPlayback yalnızca DashboardPlaybackProvider içinde kullanılabilir.");
  }

  return context;
}
