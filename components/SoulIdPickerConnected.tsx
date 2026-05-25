"use client";

import SoulIdPicker from "@/components/SoulIdPicker";
import { useSouls } from "@/hooks/useSouls";

interface Props {
  value: string | null;
  onChange: (soulId: string | null) => void;
  className?: string;
}

/**
 * Drop-in version of SoulIdPicker that fetches characters from /api/souls
 * automatically.  Use this in forms instead of the base component.
 */
export default function SoulIdPickerConnected({
  value,
  onChange,
  className,
}: Props) {
  const { souls, apiReady, loading, error } = useSouls();

  return (
    <SoulIdPicker
      value={value}
      onChange={onChange}
      className={className}
      souls={souls}
      apiReady={apiReady}
      loading={loading}
      error={error}
    />
  );
}
