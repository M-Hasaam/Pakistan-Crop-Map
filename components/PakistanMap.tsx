"use client";

import { useEffect, useRef, useState } from "react";
import * as am5 from "@amcharts/amcharts5";
import * as am5map from "@amcharts/amcharts5/map";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

type DistrictFeature = {
  properties?: { name?: string; name_en?: string };
  geometry: Geometry;
};

function signedRingArea(ring: Array<[number, number]>): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function normalizePolygonRings(
  rings: Array<Array<[number, number]>>
): Array<Array<[number, number]>> {
  return rings.map((ring, index) => {
    if (ring.length < 4) return ring;
    const isCCW = signedRingArea(ring) > 0;

    // AMCharts/d3 map fill expects outer rings clockwise and holes counterclockwise.
    const shouldBeCCW = index !== 0;
    const shouldReverse = shouldBeCCW ? !isCCW : isCCW;

    return shouldReverse ? [...ring].reverse() : ring;
  });
}

function normalizeGeometry(geometry: Geometry): Geometry {
  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: normalizePolygonRings(
        geometry.coordinates as Array<Array<[number, number]>>
      ),
    };
  }

  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((rings) =>
        normalizePolygonRings(rings as Array<Array<[number, number]>>)
      ),
    };
  }

  return geometry;
}

function pointInRing(point: [number, number], ring: Array<[number, number]>): boolean {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInDistrict(point: [number, number], feature: DistrictFeature): boolean {
  if (feature.geometry.type !== "Polygon") return false;

  const rings = feature.geometry.coordinates as Array<Array<[number, number]>>;
  if (!rings.length) return false;

  // First ring is shell; remaining rings are holes.
  if (!pointInRing(point, rings[0])) return false;

  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(point, rings[i])) return false;
  }

  return true;
}

export default function PakistanMap() {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<am5.Root | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState("None");

  useEffect(() => {
    let isMounted = true;
    let hasFitted = false;

    const initChart = async () => {
      const chartElement = chartRef.current;
      if (!chartElement) return;

      // Dispose any existing root (React Strict Mode can run twice)
      am5.array.each(am5.registry.rootElements, (existingRoot) => {
        if (existingRoot.dom === chartElement) {
          existingRoot.dispose();
        }
      });

      const districtsModule = await import("../data/Pakistan_Districts.json");
      const rawDistrictsGeoJSON =
        districtsModule.default as FeatureCollection<Geometry, GeoJsonProperties>;
      const districtsGeoJSON: FeatureCollection<Geometry, GeoJsonProperties> = {
        type: "FeatureCollection",
        features: rawDistrictsGeoJSON.features.map((feature, index) => {
          const props = feature.properties ?? {};
          const nameEn =
            (typeof props.name_en === "string" && props.name_en) ||
            (typeof props.name === "string" && props.name) ||
            `District-${index + 1}`;

          return {
            ...feature,
            id: String(nameEn),
            geometry: normalizeGeometry(feature.geometry),
            properties: {
              ...props,
              name: nameEn,
              name_en: nameEn,
            },
          };
        }),
      };
      const emptyGeoJSON: FeatureCollection<Geometry, GeoJsonProperties> = {
        type: "FeatureCollection",
        features: [],
      };

      if (!isMounted || !chartRef.current) return;

      const root = am5.Root.new(chartRef.current);
      rootRef.current = root;

      root.setThemes([am5themes_Animated.new(root)]);

      const chart = root.container.children.push(
        am5map.MapChart.new(root, {
          panX: "none",
          panY: "none",
          wheelX: "none",
          wheelY: "none",
          maxPanOut: 0,
          homeGeoPoint: { longitude: 69.35, latitude: 30.4 },
          homeZoomLevel: 11,
          minZoomLevel: 4,
          maxZoomLevel: 32,
          projection: am5map.geoMercator(),
        })
      );

      chart.chartContainer.set(
        "background",
        am5.Rectangle.new(root, {
          fill: am5.color(0x000000),
          fillOpacity: 1,
        })
      );

      const districtSeries = chart.series.push(
        am5map.MapPolygonSeries.new(root, {
          geoJSON: districtsGeoJSON,
          interactive: false,
        })
      );

      const hoverSeries = chart.series.push(
        am5map.MapPolygonSeries.new(root, {
          geoJSON: emptyGeoJSON,
          interactive: false,
        })
      );

      const activeSeries = chart.series.push(
        am5map.MapPolygonSeries.new(root, {
          geoJSON: emptyGeoJSON,
          interactive: false,
        })
      );

      let hoveredDistrict: string | null = null;
      let activeDistrict: string | null = null;

      districtSeries.mapPolygons.template.setAll({
        fill: am5.color(0x111111),
        fillOpacity: 0,
        stroke: am5.color(0x9de0ae),
        strokeOpacity: 0.95,
        strokeWidth: 1,
        tooltipText: "",
        interactive: false,
      });

      hoverSeries.mapPolygons.template.setAll({
        fill: am5.color(0xb7f5a7),
        fillOpacity: 0,
        stroke: am5.color(0xb7f5a7),
        strokeOpacity: 0.95,
        strokeWidth: 1.8,
        interactive: false,
      });

      activeSeries.mapPolygons.template.setAll({
        fill: am5.color(0x2563eb),
        fillOpacity: 0.92,
        stroke: am5.color(0x9de0ae),
        strokeOpacity: 0.95,
        strokeWidth: 1,
        interactive: false,
      });

      const findDistrictAtPoint = (ev: { point: am5.IPoint }) => {
        const localPoint = chart.seriesContainer.toLocal(ev.point);
        const geoPoint = chart.invert(localPoint);
        if (!Number.isFinite(geoPoint.longitude) || !Number.isFinite(geoPoint.latitude)) {
          return null;
        }

        const clickPoint: [number, number] = [geoPoint.longitude, geoPoint.latitude];
        return (districtsGeoJSON.features as DistrictFeature[]).find((feature) =>
          pointInDistrict(clickPoint, feature)
        );
      };

      const asGeoJson = (feature: DistrictFeature | null): FeatureCollection<Geometry, GeoJsonProperties> => ({
        type: "FeatureCollection",
        features: feature ? [{ type: "Feature", properties: feature.properties ?? {}, geometry: feature.geometry }] : [],
      });

      chart.chartContainer.events.on("click", (ev) => {
        const selected = findDistrictAtPoint(ev);

        if (!selected) return;

        const districtName =
          selected.properties?.name_en ?? selected.properties?.name ?? "Unknown district";

        activeDistrict = districtName;
        activeSeries.set("geoJSON", asGeoJson(selected));
        if (hoveredDistrict === districtName) {
          hoverSeries.set("geoJSON", emptyGeoJSON);
        }
        setSelectedDistrict(districtName);

        console.log("District clicked:", districtName);
      });

      chart.chartContainer.events.on("globalpointermove", (ev) => {
        const hovered = findDistrictAtPoint(ev);
        const districtName = hovered?.properties?.name_en ?? hovered?.properties?.name ?? null;
        if (districtName === hoveredDistrict || districtName === activeDistrict) return;

        hoveredDistrict = districtName;
        hoverSeries.set("geoJSON", asGeoJson(hovered ?? null));
      });

      chart.chartContainer.events.on("pointerout", () => {
        hoveredDistrict = null;
        hoverSeries.set("geoJSON", emptyGeoJSON);
      });

      const fitToPakistan = () => {
        if (!isMounted || hasFitted) return;
        hasFitted = true;

        chart.goHome(0);
        chart.zoomToGeoPoint({ longitude: 69.35, latitude: 30.4 }, 11, true, 0);
      };

      // Fit once after data validation; repeated calls can over-zoom.
      districtSeries.events.on("datavalidated", fitToPakistan);
    };

    initChart().catch(console.error);

    return () => {
      isMounted = false;
      rootRef.current?.dispose();
      rootRef.current = null;
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="inline-flex items-center gap-2 rounded-md border border-slate-500 bg-slate-900 px-3 py-2 text-sm text-slate-100">
        <span className="font-semibold">Selected district:</span>
        <span>{selectedDistrict}</span>
      </div>
      <div ref={chartRef} className="w-full min-h-[420px] md:min-h-[520px] rounded-md overflow-hidden" />
    </div>
  );
}