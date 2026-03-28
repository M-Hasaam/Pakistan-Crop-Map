"use client";

import { useEffect, useRef } from "react";
import * as am5 from "@amcharts/amcharts5";
import * as am5map from "@amcharts/amcharts5/map";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

export default function PakistanMap() {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<am5.Root | null>(null);

  useEffect(() => {
    let isMounted = true;

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
            properties: {
              ...props,
              name: nameEn,
              name_en: nameEn,
            },
          };
        }),
      };

      const districtBounds = districtsGeoJSON.features.reduce(
        (acc, feature) => {
          const geometry = feature.geometry;
          if (!geometry) return acc;

          const polygons =
            geometry.type === "Polygon"
              ? [geometry.coordinates]
              : geometry.type === "MultiPolygon"
                ? geometry.coordinates
                : [];

          polygons.forEach((polygon) => {
            polygon.forEach((ring) => {
              ring.forEach(([longitude, latitude]) => {
                acc.left = Math.min(acc.left, longitude);
                acc.right = Math.max(acc.right, longitude);
                acc.bottom = Math.min(acc.bottom, latitude);
                acc.top = Math.max(acc.top, latitude);
              });
            });
          });

          return acc;
        },
        {
          left: Number.POSITIVE_INFINITY,
          right: Number.NEGATIVE_INFINITY,
          top: Number.NEGATIVE_INFINITY,
          bottom: Number.POSITIVE_INFINITY,
        }
      );

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
          minZoomLevel: 1,
          maxZoomLevel: 32,
          projection: am5map.geoMercator(),
        })
      );

      const districtSeries = chart.series.push(
        am5map.MapPolygonSeries.new(root, {
          geoJSON: districtsGeoJSON,
          interactive: true,
        })
      );

      districtSeries.mapPolygons.template.setAll({
        fill: am5.color(0x74b266),
        // Keep interior hit-testing reliable without visibly flood-filling the canvas.
        fillOpacity: 0.001,
        stroke: am5.color(0x2f6b2e),
        strokeOpacity: 0.95,
        strokeWidth: 1,
        tooltipText: "{name}",
        interactive: true,
        cursorOverStyle: "pointer",
      });

      districtSeries.mapPolygons.template.states.create("hover", {
        fill: am5.color(0x5e9454),
        fillOpacity: 0.45,
        stroke: am5.color(0x1f4f1e),
        strokeOpacity: 1,
        strokeWidth: 1.2,
      });

      districtSeries.mapPolygons.template.states.create("active", {
        fill: am5.color(0x3f7f3d),
        fillOpacity: 0.62,
        stroke: am5.color(0x173c16),
        strokeOpacity: 1,
        strokeWidth: 1.35,
      });

      districtSeries.mapPolygons.template.events.on("click", (ev) => {
        districtSeries.mapPolygons.each((polygon) => {
          polygon.set("active", false);
        });
        ev.target.set("active", true);

        const dataItem = ev.target.dataItem as
          | {
            dataContext?: {
              name?: string;
              name_en?: string;
              properties?: { name?: string; name_en?: string };
            };
          }
          | undefined;

        const districtName =
          dataItem?.dataContext?.name ??
          dataItem?.dataContext?.name_en ??
          dataItem?.dataContext?.properties?.name ??
          dataItem?.dataContext?.properties?.name_en ??
          "Unknown district";

        console.log("District clicked:", districtName);
      });

      const fitToPakistan = () => {
        if (!isMounted) return;

        chart.zoomToGeoBounds(districtBounds, 0);
      };

      // Ensure fit runs regardless of validation/render timing order.
      districtSeries.events.on("datavalidated", fitToPakistan);
      setTimeout(fitToPakistan, 0);
      setTimeout(fitToPakistan, 120);
      setTimeout(fitToPakistan, 400);
    };

    initChart().catch(console.error);

    return () => {
      isMounted = false;
      rootRef.current?.dispose();
      rootRef.current = null;
    };
  }, []);

  return <div ref={chartRef} className="w-full min-h-[420px] md:min-h-[520px]" />;
}