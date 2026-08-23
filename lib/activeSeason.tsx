"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { requireSeasonYear } from "./season";
import { APP_ENV, supabase } from "./supabase";

type ActiveSeasonContextValue = {
  seasonYear: number | null;
  isLoading: boolean;
  error: string | null;
};

const ActiveSeasonContext = createContext<ActiveSeasonContextValue | null>(null);

export function ActiveSeasonProvider({ children }: { children: React.ReactNode }) {
  const [seasonYear, setSeasonYear] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadActiveSeason() {
      const result = await supabase
        .from("app_settings")
        .select("season_year")
        .eq("environment", APP_ENV)
        .maybeSingle();
      if (!mounted) return;
      if (result.error || !result.data) {
        setSeasonYear(null);
        setError(result.error?.message ?? "No active season setting was found.");
        setIsLoading(false);
        return;
      }
      try {
        setSeasonYear(requireSeasonYear(result.data.season_year));
        setError(null);
      } catch (seasonError) {
        setSeasonYear(null);
        setError(seasonError instanceof Error ? seasonError.message : "Invalid season setting.");
      }
      setIsLoading(false);
    }
    void loadActiveSeason();
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(
    () => ({ seasonYear, isLoading, error }),
    [error, isLoading, seasonYear],
  );
  return <ActiveSeasonContext.Provider value={value}>{children}</ActiveSeasonContext.Provider>;
}

export function useActiveSeason(): ActiveSeasonContextValue {
  const context = useContext(ActiveSeasonContext);
  if (!context) throw new Error("useActiveSeason must be used inside ActiveSeasonProvider.");
  return context;
}

