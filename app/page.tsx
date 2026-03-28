"use client";

import dynamic from "next/dynamic";

const PakistanMap = dynamic(() => import("../components/PakistanMap"), {
  ssr: false,
});

export default function Home() {
  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4">
        Pakistan Crops Map 🌾
      </h1>
      <PakistanMap />
    </main>
  );
}