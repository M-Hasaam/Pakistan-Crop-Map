"use client";

import { useEffect, useMemo, useRef } from "react";
import * as am5 from "@amcharts/amcharts5";
import * as am5xy from "@amcharts/amcharts5/xy";
import * as am5percent from "@amcharts/amcharts5/percent";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";

type CropValue = number | null;

type DistrictRecord = {
    Year: string;
} & Record<string, CropValue | string>;

type CropsChartsProps = {
    province: string | null;
    district: string | null;
    record: DistrictRecord | null;
};

export default function CropsCharts({ province, district, record }: CropsChartsProps) {
    const barRef = useRef<HTMLDivElement | null>(null);
    const pieRef = useRef<HTMLDivElement | null>(null);

    const chartRows = useMemo(() => {
        if (!record) return [] as Array<{ crop: string; value: number }>;

        return Object.entries(record)
            .filter(([key]) => key !== "Year")
            .map(([crop, raw]) => ({
                crop,
                value: typeof raw === "number" ? raw : Number.NaN,
            }))
            .filter((item) => Number.isFinite(item.value));
    }, [record]);

    const pieRows = useMemo(
        () => chartRows.filter((row) => row.value > 0),
        [chartRows]
    );

    useEffect(() => {
        const barElement = barRef.current;
        const pieElement = pieRef.current;
        if (!barElement || !pieElement) return;

        am5.array.each(am5.registry.rootElements, (existingRoot) => {
            if (existingRoot.dom === barElement || existingRoot.dom === pieElement) {
                existingRoot.dispose();
            }
        });

        if (!chartRows.length) return;

        const barRoot = am5.Root.new(barElement);
        barRoot.setThemes([am5themes_Animated.new(barRoot)]);

        const barChart = barRoot.container.children.push(
            am5xy.XYChart.new(barRoot, {
                panX: false,
                panY: false,
                wheelX: "none",
                wheelY: "none",
                layout: barRoot.verticalLayout,
            })
        );

        const xAxis = barChart.xAxes.push(
            am5xy.CategoryAxis.new(barRoot, {
                categoryField: "crop",
                renderer: am5xy.AxisRendererX.new(barRoot, {
                    minGridDistance: 24,
                    cellStartLocation: 0.12,
                    cellEndLocation: 0.88,
                }),
            })
        );

        xAxis.get("renderer").labels.template.setAll({
            rotation: -45,
            centerY: am5.p50,
            centerX: am5.p100,
            paddingTop: 8,
            fontSize: 11,
        });

        const yAxis = barChart.yAxes.push(
            am5xy.ValueAxis.new(barRoot, {
                renderer: am5xy.AxisRendererY.new(barRoot, {}),
            })
        );

        const barSeries = barChart.series.push(
            am5xy.ColumnSeries.new(barRoot, {
                name: "Crop Value",
                xAxis,
                yAxis,
                valueYField: "value",
                categoryXField: "crop",
                tooltip: am5.Tooltip.new(barRoot, {
                    labelText: "{categoryX}: {valueY}",
                }),
            })
        );

        barSeries.columns.template.setAll({
            fill: am5.color(0x22c55e),
            stroke: am5.color(0x166534),
            strokeWidth: 1,
            cornerRadiusTL: 5,
            cornerRadiusTR: 5,
        });

        xAxis.data.setAll(chartRows);
        barSeries.data.setAll(chartRows);
        barSeries.appear(700);
        barChart.appear(700, 100);

        const pieRoot = am5.Root.new(pieElement);
        pieRoot.setThemes([am5themes_Animated.new(pieRoot)]);

        const pieChart = pieRoot.container.children.push(
            am5percent.PieChart.new(pieRoot, {
                layout: pieRoot.verticalLayout,
                innerRadius: am5.percent(50),
            })
        );

        const pieSeries = pieChart.series.push(
            am5percent.PieSeries.new(pieRoot, {
                valueField: "value",
                categoryField: "crop",
                legendLabelText: "{category}",
                legendValueText: "{value}",
            })
        );

        pieSeries.slices.template.setAll({
            tooltipText: "{category}: {value}",
            stroke: am5.color(0x0f172a),
            strokeWidth: 1,
        });

        pieSeries.labels.template.setAll({
            fontSize: 11,
        });

        const legend = pieChart.children.push(
            am5.Legend.new(pieRoot, {
                centerX: am5.p50,
                x: am5.p50,
                width: am5.percent(100),
                maxHeight: 190,
                verticalScrollbar: am5.Scrollbar.new(pieRoot, { orientation: "vertical" }),
            })
        );

        const pieData = pieRows.length ? pieRows : [{ crop: "No positive values", value: 1 }];
        pieSeries.data.setAll(pieData);
        legend.data.setAll(pieSeries.dataItems);

        pieSeries.appear(700);
        pieChart.appear(700, 100);

        return () => {
            barRoot.dispose();
            pieRoot.dispose();
        };
    }, [chartRows, pieRows]);

    return (
        <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-slate-100">
            <div className="mb-3">
                <h2 className="text-lg font-semibold">District Crop Insights</h2>
                <p className="text-sm text-slate-300">
                    {district && province
                        ? `${district}, ${province} (Year ${record?.Year ?? "2000-01"})`
                        : "Select a district on the map to view crop breakdown."}
                </p>
            </div>

            {district && province && record ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-2">
                        <h3 className="px-2 pt-2 text-sm font-medium text-slate-200">Bar Chart</h3>
                        <div ref={barRef} className="h-[340px] w-full" />
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-2">
                        <h3 className="px-2 pt-2 text-sm font-medium text-slate-200">Pie Chart</h3>
                        <div ref={pieRef} className="h-[340px] w-full" />
                    </div>
                </div>
            ) : (
                <div className="rounded-lg border border-dashed border-slate-600 bg-slate-950/40 p-6 text-sm text-slate-300">
                    No district selected yet.
                </div>
            )}
        </section>
    );
}
