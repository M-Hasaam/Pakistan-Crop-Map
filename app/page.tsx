"use client";

import { useMemo, useState } from "react";
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

const dataset = cropsData as CropsDataset;

export default function Home() {
  const [selection, setSelection] = useState<DistrictSelection>({
    province: null,
    district: null,
  });

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
          <div className="grid grid-cols-2 gap-2 text-right text-sm">
            <div className="meta-chip">Year 2000-01</div>
            <div className="meta-chip">District Level</div>
            <div className="meta-chip">AMCharts Map</div>
            <div className="meta-chip">AMCharts Insights</div>
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
      </header>

      <section className="glass-card rise-in p-4 md:p-5">
        <PakistanMap onDistrictSelect={setSelection} />
      </section>

      <section className="rise-in">
        <CropsCharts
          province={selection.province}
          district={selection.district}
          record={districtRecord}
        />
      </section>
    </main>
  );
}