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

      const geoModule = await import("../data/Pakistan_Provices.json");
      const districtsModule = await import("../data/Pakistan_Districts.json");
      const pakistanGeoJSON =
        geoModule.default as FeatureCollection<Geometry, GeoJsonProperties>;
      const districtsGeoJSON =
        districtsModule.default as FeatureCollection<Geometry, GeoJsonProperties>;
      const provinceGeometryCollection: GeoJSON.GeometryCollection = {
        type: "GeometryCollection",
        geometries: pakistanGeoJSON.features
          .map((feature) => feature.geometry)
          .filter((geometry): geometry is GeoJSON.Geometry => Boolean(geometry)),
      };
      const provinceBounds = am5map.getGeoBounds(provinceGeometryCollection);

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
          projection: am5map.geoMercator(),
        })
      );

      const polygonSeries = chart.series.push(
        am5map.MapPolygonSeries.new(root, {
          geoJSON: pakistanGeoJSON,
          reverseGeodata: true,
        })
      );

      const districtSeries = chart.series.push(
        am5map.MapPolygonSeries.new(root, {
          geoJSON: districtsGeoJSON,
          reverseGeodata: true,
          affectsBounds: false,
        })
      );

      // Polygon styling
      polygonSeries.mapPolygons.template.setAll({
        fill: am5.color(0x74b266),
        stroke: am5.color(0xffffff),
        strokeWidth: 1,
        tooltipText: "{name}",
        interactive: true,
        cursorOverStyle: "pointer",
      });

      polygonSeries.mapPolygons.template.states.create("hover", {
        fill: am5.color(0x5e9454),
      });

      districtSeries.mapPolygons.template.setAll({
        fill: am5.color(0x000000),
        fillOpacity: 0,
        stroke: am5.color(0xffffff),
        strokeOpacity: 0.75,
        strokeWidth: 0.6,
        tooltipText: "{name}",
        interactive: true,
        cursorOverStyle: "pointer",
      });

      districtSeries.mapPolygons.template.states.create("hover", {
        fill: am5.color(0x5e9454),
        fillOpacity: 0.2,
        stroke: am5.color(0xffffff),
        strokeOpacity: 1,
        strokeWidth: 0.9,
      });

      polygonSeries.mapPolygons.template.events.on("click", (ev) => {
        const data = ev.target.dataItem?.dataContext as
          | { properties?: { name?: string; name_en?: string } }
          | undefined;

        const provinceName =
          data?.properties?.name_en ?? data?.properties?.name ?? "Unknown province";

        console.log("Province clicked:", provinceName);
      });

      districtSeries.mapPolygons.template.events.on("click", (ev) => {
        const data = ev.target.dataItem?.dataContext as
          | { properties?: { name?: string; name_en?: string } }
          | undefined;

        const districtName =
          data?.properties?.name_en ?? data?.properties?.name ?? "Unknown district";

        console.log("District clicked:", districtName);
      });

      // Fit the map to Pakistan bounds after polygons are ready
      polygonSeries.events.on("datavalidated", () => {
        if (provinceBounds) {
          chart.zoomToGeoBounds(provinceBounds, 0);
        }
      });
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