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

  return (
    <main className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Pakistan Crops Dashboard</h1>
      <PakistanMap onDistrictSelect={setSelection} />
      <CropsCharts
        province={selection.province}
        district={selection.district}
        record={districtRecord}
      />
    </main>
  );
}