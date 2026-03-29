"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import cropsData from "../data/crops_2000_01.json";
import CropsCharts from "../components/CropsCharts";

const PakistanMap = dynamic(() => import("../components/PakistanMap"), {
  ssr: false,
});

type CropValue = number | null;

type DistrictRecord = {
  Year: string;
} & Record<string, CropValue | string>;

type CropsDataset = {
  ProvinceTotals: Record<string, number>;
  Districts: Record<string, Record<string, DistrictRecord>>;
};

type DistrictSelection = {
  province: "Punjab" | "Sindh" | "KPK" | "Balochistan" | null;
  district: string | null;
};

type ProvinceKey = Exclude<DistrictSelection["province"], null>;

const dataset = cropsData as CropsDataset;

export default function Home() {
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [quickDistrict, setQuickDistrict] = useState("");
  const [selection, setSelection] = useState<DistrictSelection>({
    province: null,
    district: null,
  });

  useEffect(() => {
    const root = document.documentElement;
    const saved = window.localStorage.getItem("theme-mode");
    if (saved === "light" || saved === "dark") {
      setThemeMode(saved);
      root.dataset.theme = saved;
      return;
    }

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = prefersDark ? "dark" : "light";
    setThemeMode(initial);
    root.dataset.theme = initial;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem("theme-mode", themeMode);
  }, [themeMode]);

  const districtRecord = useMemo(() => {
    if (!selection.province || !selection.district) return null;
    return dataset.Districts?.[selection.province]?.[selection.district] ?? null;
  }, [selection]);

  const totalDistricts = useMemo(
    () => Object.values(dataset.Districts).reduce((sum, provinceMap) => sum + Object.keys(provinceMap).length, 0),
    []
  );

  const hasSelectionData = useMemo(() => {
    if (!districtRecord) return false;
    return Object.entries(districtRecord).some(
      ([key, value]) => key !== "Year" && typeof value === "number" && Number.isFinite(value)
    );
  }, [districtRecord]);

  const districtOptions = useMemo(() => {
    const out: Array<{ province: ProvinceKey; district: string; id: string }> = [];
    for (const province of Object.keys(dataset.Districts) as Array<ProvinceKey>) {
      for (const district of Object.keys(dataset.Districts[province])) {
        out.push({ province, district, id: `${province}::${district}` });
      }
    }
    return out.sort((a, b) => a.district.localeCompare(b.district));
  }, []);

  const provinceTotals = useMemo(() => {
    const entries = Object.entries(dataset.ProvinceTotals)
      .filter(([name]) => name !== "Pakistan")
      .map(([name, value]) => ({ name, value }));
    const max = Math.max(...entries.map((x) => x.value), 1);
    return entries
      .sort((a, b) => b.value - a.value)
      .map((entry) => ({ ...entry, ratio: (entry.value / max) * 100 }));
  }, []);

  const applyQuickDistrict = () => {
    const match = districtOptions.find((item) => item.id === quickDistrict);
    if (!match) return;
    setSelection({ province: match.province, district: match.district });
  };

  return (
    <main className="shell space-y-5">
      <header className="glass-card rise-in p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <p className="meta-chip inline-flex">Agriculture Intelligence</p>
            <h1 className="section-title text-3xl font-semibold leading-tight md:text-5xl">
              Pakistan Crops Explorer
            </h1>
            <p className="max-w-2xl text-sm text-[var(--muted)] md:text-base">
              Select a province, then a district on the map to view crop values with dedicated charts.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              className="theme-toggle theme-toggle--switch"
              onClick={() => setThemeMode((v) => (v === "dark" ? "light" : "dark"))}
              aria-pressed={themeMode === "dark"}
              aria-label={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}
            >
              <span className="theme-toggle__label">{themeMode === "dark" ? "Dark" : "Light"}</span>
              <span className="theme-toggle__track" aria-hidden="true">
                <span className="theme-toggle__thumb">
                  {themeMode === "dark" ? (
                    <svg className="theme-toggle__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a7 7 0 0 0 9.7 9.7Z"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg className="theme-toggle__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="4.25" stroke="currentColor" strokeWidth="1.7" />
                      <path d="M12 2.5V5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      <path d="M12 19V21.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      <path d="M2.5 12H5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      <path d="M19 12H21.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    </svg>
                  )}
                </span>
              </span>
            </button>

            <div className="grid grid-cols-2 gap-2 text-right text-sm">
              <div className="meta-chip">Year 2000-01</div>
              <div className="meta-chip">District Level</div>
              <div className="meta-chip">AMCharts Map</div>
              <div className="meta-chip">AMCharts Insights</div>
            </div>
          </div>
        </div>

        <div className="kpi-grid mt-5">
          <article className="kpi-card">
            <p className="soft-label">Districts In Dataset</p>
            <p className="kpi-value">{totalDistricts}</p>
          </article>
          <article className="kpi-card">
            <p className="soft-label">Current Selection</p>
            <p className="kpi-value">{selection.district ?? "None"}</p>
          </article>
          <article className="kpi-card">
            <p className="soft-label">Selection Data</p>
            <p className="kpi-value">{hasSelectionData ? "Available" : "Waiting"}</p>
          </article>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className="kpi-card space-y-3">
            <p className="soft-label">Quick District Selector</p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="min-w-[260px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)]"
                value={quickDistrict}
                onChange={(e) => setQuickDistrict(e.target.value)}
              >
                <option value="">Choose district...</option>
                {districtOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.district} ({opt.province})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--surface-strong)]"
                onClick={applyQuickDistrict}
              >
                Show Data
              </button>
            </div>
          </article>

          <article className="kpi-card space-y-3">
            <p className="soft-label">Province Totals Snapshot</p>
            <div className="space-y-2">
              {provinceTotals.map((p) => (
                <div key={p.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                    <span>{p.name}</span>
                    <span>{p.value.toLocaleString("en-PK")}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--line)]/55">
                    <div
                      className="h-2 rounded-full bg-[var(--brand)]"
                      style={{ width: `${p.ratio}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </header>

      <section className="glass-card rise-in p-4 md:p-5">
        <PakistanMap onDistrictSelect={setSelection} themeMode={themeMode} />
      </section>

      <section className="rise-in">
        <CropsCharts
          themeMode={themeMode}
          province={selection.province}
          district={selection.district}
          record={districtRecord}
        />
      </section>
    </main>
  );
}