"use client";

import { useEffect, useRef, useState } from "react";
import * as am5 from "@amcharts/amcharts5";
import * as am5map from "@amcharts/amcharts5/map";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

type DistrictSelection = {
  province: "Punjab" | "Sindh" | "KPK" | "Balochistan" | null;
  district: string | null;
};

type PakistanMapProps = {
  onDistrictSelect?: (selection: DistrictSelection) => void;
};

type MapFeature = {
  id?: string | number;
  properties?: GeoJsonProperties;
  geometry: Geometry;
};

type DistrictFeature = MapFeature;
type ProvinceFeature = MapFeature;

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

function pointInPolygonRings(point: [number, number], rings: Array<Array<[number, number]>>): boolean {
  if (!rings.length) return false;

  // First ring is shell; remaining rings are holes.
  if (!pointInRing(point, rings[0])) return false;

  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(point, rings[i])) return false;
  }

  return true;
}

function pointInFeature(point: [number, number], feature: MapFeature): boolean {
  if (feature.geometry.type === "Polygon") {
    return pointInPolygonRings(
      point,
      feature.geometry.coordinates as Array<Array<[number, number]>>
    );
  }

  if (feature.geometry.type === "MultiPolygon") {
    const polygons = feature.geometry.coordinates as Array<Array<Array<[number, number]>>>;
    return polygons.some((polygon) => pointInPolygonRings(point, polygon));
  }

  return false;
}

function featureFirstPoint(feature: MapFeature): [number, number] | null {
  if (feature.geometry.type === "Polygon") {
    return (feature.geometry.coordinates as Array<Array<[number, number]>>)[0]?.[0] ?? null;
  }

  if (feature.geometry.type === "MultiPolygon") {
    return (
      (feature.geometry.coordinates as Array<Array<Array<[number, number]>>>)[0]?.[0]?.[0] ?? null
    );
  }

  return null;
}

function featureName(feature: MapFeature, fallback: string): string {
  const props = feature.properties ?? {};
  const nameEn = typeof props.name_en === "string" ? props.name_en : "";
  const name = typeof props.name === "string" ? props.name : "";
  return nameEn || name || fallback;
}

function normalizeProvinceNameForData(
  provinceName: string
): "Punjab" | "Sindh" | "KPK" | "Balochistan" | null {
  const value = provinceName.trim().toLowerCase();
  if (value === "punjab") return "Punjab";
  if (value === "sindh") return "Sindh";
  if (value === "balochistan") return "Balochistan";
  if (value === "khyber pakhtunkhwa" || value === "federally administered tribal areas") return "KPK";
  return null;
}

type GeoBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function padGeoBounds(bounds: GeoBounds, ratio: number): GeoBounds {
  const width = bounds.right - bounds.left;
  const height = bounds.top - bounds.bottom;

  return {
    left: bounds.left - width * ratio,
    right: bounds.right + width * ratio,
    top: bounds.top + height * ratio,
    bottom: bounds.bottom - height * ratio,
  };
}

function toFeatureCollection(
  features: MapFeature[]
): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features: features.map((feature) => ({
      type: "Feature",
      id: feature.id,
      properties: feature.properties ?? {},
      geometry: feature.geometry,
    })),
  };
}

function districtsInsideProvince(
  districts: DistrictFeature[],
  province: ProvinceFeature
): DistrictFeature[] {
  return districts.filter((district) => {
    const districtBounds = am5map.getGeoBounds(district.geometry as GeoJSON.Geometry);
    const centerPoint: [number, number] = [
      (districtBounds.left + districtBounds.right) / 2,
      (districtBounds.top + districtBounds.bottom) / 2,
    ];

    if (pointInFeature(centerPoint, province)) return true;

    const fallbackPoint = featureFirstPoint(district);
    return fallbackPoint ? pointInFeature(fallbackPoint, province) : false;
  });
}

export default function PakistanMap({ onDistrictSelect }: PakistanMapProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<am5.Root | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const onDistrictSelectRef = useRef(onDistrictSelect);
  const [selectedProvince, setSelectedProvince] = useState("None");
  const [selectedDistrict, setSelectedDistrict] = useState("None");

  useEffect(() => {
    onDistrictSelectRef.current = onDistrictSelect;
  }, [onDistrictSelect]);

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
      const provincesModule = await import("../data/Pakistan_Provices.json");
      const rawDistrictsGeoJSON =
        districtsModule.default as FeatureCollection<Geometry, GeoJsonProperties>;
      const rawProvincesGeoJSON =
        provincesModule.default as FeatureCollection<Geometry, GeoJsonProperties>;
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
      const provincesGeoJSON: FeatureCollection<Geometry, GeoJsonProperties> = {
        type: "FeatureCollection",
        features: rawProvincesGeoJSON.features.map((feature, index) => {
          const props = feature.properties ?? {};
          const provinceName =
            (typeof props.name_en === "string" && props.name_en) ||
            (typeof props.name === "string" && props.name) ||
            `Province-${index + 1}`;

          return {
            ...feature,
            id: String(index + 1),
            geometry: normalizeGeometry(feature.geometry),
            properties: {
              ...props,
              name: provinceName,
              name_en: provinceName,
            },
          };
        }),
      };
      const districtFeatures = districtsGeoJSON.features as DistrictFeature[];
      const provinceFeatures = provincesGeoJSON.features as ProvinceFeature[];
      const districtGeometryCollection: GeoJSON.GeometryCollection = {
        type: "GeometryCollection",
        geometries: districtsGeoJSON.features
          .map((feature) => feature.geometry)
          .filter((geometry): geometry is GeoJSON.Geometry => Boolean(geometry)),
      };
      const districtBounds = am5map.getGeoBounds(districtGeometryCollection);
      const paddedDistrictBounds = padGeoBounds(districtBounds, 0.28);
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
          homeZoomLevel: 1,
          minZoomLevel: 0.5,
          maxZoomLevel: 32,
          projection: am5map.geoMercator(),
        })
      );

      chart.chartContainer.set(
        "background",
        am5.Rectangle.new(root, {
          fill: am5.color(0xf6f3e7),
          fillOpacity: 1,
        })
      );

      const provinceSeries = chart.series.push(
        am5map.MapPolygonSeries.new(root, {
          geoJSON: provincesGeoJSON,
          interactive: true,
        })
      );

      const districtSeries = chart.series.push(
        am5map.MapPolygonSeries.new(root, {
          geoJSON: emptyGeoJSON,
          interactive: true,
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
      let activeProvinceKey: DistrictSelection["province"] = null;
      let isProvinceDrilled = false;
      let visibleDistrictFeatures: DistrictFeature[] = [];

      provinceSeries.mapPolygons.template.setAll({
        fill: am5.color(0x000000),
        fillOpacity: 0,
        stroke: am5.color(0x3f7b56),
        strokeOpacity: 0.95,
        strokeWidth: 1.2,
        interactive: true,
      });

      districtSeries.mapPolygons.template.setAll({
        fill: am5.color(0x000000),
        fillOpacity: 0,
        stroke: am5.color(0x4a8961),
        strokeOpacity: 0.85,
        strokeWidth: 0.65,
        tooltipText: "",
        interactive: true,
      });

      hoverSeries.mapPolygons.template.setAll({
        fill: am5.color(0xc8b266),
        fillOpacity: 0.28,
        stroke: am5.color(0x946d2a),
        strokeOpacity: 0.95,
        strokeWidth: 1.8,
        interactive: false,
      });

      activeSeries.mapPolygons.template.setAll({
        fill: am5.color(0x2f7d4f),
        fillOpacity: 0.92,
        stroke: am5.color(0x1f5f3a),
        strokeOpacity: 1,
        strokeWidth: 1.2,
        interactive: false,
      });

      const setNationalMode = () => {
        isProvinceDrilled = false;
        activeDistrict = null;
        activeProvinceKey = null;
        hoveredDistrict = null;
        setSelectedProvince("None");
        setSelectedDistrict("None");
        onDistrictSelectRef.current?.({ province: null, district: null });
        visibleDistrictFeatures = [];
        provinceSeries.set("geoJSON", provincesGeoJSON);
        districtSeries.set("geoJSON", emptyGeoJSON);
        hoverSeries.set("geoJSON", emptyGeoJSON);
        activeSeries.set("geoJSON", emptyGeoJSON);
        // Temporarily disable camera movement while debugging disappearing districts.
      };

      const setProvinceMode = (province: ProvinceFeature) => {
        isProvinceDrilled = true;
        const provinceDistricts = districtsInsideProvince(districtFeatures, province);
        const provinceName = featureName(province, "Unknown province");

        activeDistrict = null;
        hoveredDistrict = null;
        activeProvinceKey = normalizeProvinceNameForData(provinceName);
        setSelectedDistrict("None");
        setSelectedProvince(provinceName);
        onDistrictSelectRef.current?.({ province: activeProvinceKey, district: null });
        visibleDistrictFeatures = provinceDistricts;

        provinceSeries.set("geoJSON", emptyGeoJSON);
        districtSeries.set("geoJSON", toFeatureCollection(provinceDistricts));
        hoverSeries.set("geoJSON", emptyGeoJSON);
        activeSeries.set("geoJSON", emptyGeoJSON);
        // Temporarily disable camera movement while debugging disappearing districts.
      };

      resetViewRef.current = setNationalMode;

      provinceSeries.mapPolygons.template.events.on("click", (ev) => {
        if (isProvinceDrilled) return;

        const localPoint = chart.seriesContainer.toLocal(ev.point);
        const geoPoint = chart.invert(localPoint);
        if (!Number.isFinite(geoPoint.longitude) || !Number.isFinite(geoPoint.latitude)) return;

        const clickPoint: [number, number] = [geoPoint.longitude, geoPoint.latitude];
        const selectedProvince = provinceFeatures.find((province) =>
          pointInFeature(clickPoint, province)
        );
        if (!selectedProvince) return;
        setProvinceMode(selectedProvince);
      });

      const findDistrictAtPoint = (ev: { point: am5.IPoint }): DistrictFeature | null => {
        if (!isProvinceDrilled || !visibleDistrictFeatures.length) return null;

        const localPoint = chart.seriesContainer.toLocal(ev.point);
        const geoPoint = chart.invert(localPoint);
        if (!Number.isFinite(geoPoint.longitude) || !Number.isFinite(geoPoint.latitude)) {
          return null;
        }

        const clickPoint: [number, number] = [geoPoint.longitude, geoPoint.latitude];
        return visibleDistrictFeatures.find((feature) => pointInFeature(clickPoint, feature)) ?? null;
      };

      chart.chartContainer.events.on("click", (ev) => {
        const selectedDistrict = findDistrictAtPoint(ev);
        if (!selectedDistrict) return;

        const districtName = featureName(selectedDistrict, "Unknown district");
        activeDistrict = districtName;
        setSelectedDistrict(districtName);
        onDistrictSelectRef.current?.({
          province: activeProvinceKey,
          district: districtName,
        });
        activeSeries.set("geoJSON", toFeatureCollection([selectedDistrict]));
        if (hoveredDistrict === districtName) {
          hoverSeries.set("geoJSON", emptyGeoJSON);
        }
      });

      chart.chartContainer.events.on("globalpointermove", (ev) => {
        if (!isProvinceDrilled) return;

        const hovered = findDistrictAtPoint(ev);
        const districtName = hovered ? featureName(hovered, "Unknown district") : null;
        if (districtName === hoveredDistrict || districtName === activeDistrict) return;

        hoveredDistrict = districtName;
        hoverSeries.set("geoJSON", hovered ? toFeatureCollection([hovered]) : emptyGeoJSON);
      });

      chart.chartContainer.events.on("pointerout", () => {
        hoveredDistrict = null;
        hoverSeries.set("geoJSON", emptyGeoJSON);
      });

      const fitToPakistan = () => {
        if (!isMounted || hasFitted) return;
        hasFitted = true;
        setNationalMode();
      };

      // Fit once after data validation; repeated calls can over-zoom.
      provinceSeries.events.on("datavalidated", fitToPakistan);
    };

    initChart().catch(console.error);

    return () => {
      isMounted = false;
      resetViewRef.current = null;
      rootRef.current?.dispose();
      rootRef.current = null;
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)]">
          <span className="font-semibold">Selected province:</span>
          <span>{selectedProvince}</span>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)]">
          <span className="font-semibold">Selected district:</span>
          <span>{selectedDistrict}</span>
        </div>
        {selectedProvince !== "None" && (
          <button
            type="button"
            onClick={() => resetViewRef.current?.()}
            className="rounded-full border border-[var(--brand)] bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]"
          >
            Back to provinces
          </button>
        )}
      </div>
      <div
        ref={chartRef}
        className="w-full min-h-[560px] rounded-xl border border-[var(--line)] overflow-hidden md:min-h-[700px]"
      />
    </div>
  );
}