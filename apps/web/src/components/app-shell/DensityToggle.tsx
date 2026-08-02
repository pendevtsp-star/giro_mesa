"use client";

import { Rows3 } from "lucide-react";
import { useEffect, useState } from "react";

type Density = "comfortable" | "compact";

const storageKey = "giromesa_density";

export function DensityToggle() {
  const [density, setDensity] = useState<Density>("comfortable");

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "compact" || stored === "comfortable") setDensity(stored);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    window.localStorage.setItem(storageKey, density);
  }, [density]);

  const compact = density === "compact";
  return (
    <button
      className="gm-density-toggle"
      type="button"
      aria-pressed={compact}
      aria-label={compact ? "Usar densidade confortável" : "Usar densidade compacta"}
      title={compact ? "Densidade confortável" : "Densidade compacta"}
      onClick={() => setDensity(compact ? "comfortable" : "compact")}
    >
      <Rows3 size={15} aria-hidden="true" />
      <span>{compact ? "Compacta" : "Confortável"}</span>
    </button>
  );
}
