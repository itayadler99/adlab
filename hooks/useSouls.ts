"use client";

import { useEffect, useState } from "react";
import type { Soul } from "@/components/SoulIdPicker";

interface UseSoulsResult {
  souls: Soul[];
  apiReady: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSouls(): UseSoulsResult {
  const [souls, setSouls] = useState<Soul[]>([]);
  const [apiReady, setApiReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/souls")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { souls: Soul[]; apiReady: boolean }) => {
        if (cancelled) return;
        setSouls(data.souls ?? []);
        setApiReady(data.apiReady ?? false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  return {
    souls,
    apiReady,
    loading,
    error,
    refetch: () => setTick((t) => t + 1),
  };
}
