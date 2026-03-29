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
    themeMode?: "light" | "dark";
    province: string | null;
    district: string | null;
    record: DistrictRecord | null;
};

export default function CropsCharts({ themeMode = "light", province, district, record }: CropsChartsProps) {
    const barRef = useRef<HTMLDivElement | null>(null);
    const pieRef = useRef<HTMLDivElement | null>(null);
    const numFmt = useMemo(
        () =>
            new Intl.NumberFormat("en-PK", {
                maximumFractionDigits: 1,
            }),
        []
    );

    const chartRows = useMemo(() => {
        if (!record) return [] as Array<{ crop: string; value: number }>;

        return Object.entries(record)
            .filter(([key]) => key !== "Year")
            .map(([crop, raw]) => ({
                crop,
                value: typeof raw === "number" ? raw : Number.NaN,
            }))
            .filter((item) => Number.isFinite(item.value))
            .sort((a, b) => b.value - a.value);
    }, [record]);

    const pieRows = useMemo(
        () => chartRows.filter((row) => row.value > 0),
        [chartRows]
    );

    const summary = useMemo(() => {
        const positive = chartRows.filter((row) => row.value > 0);
        const total = positive.reduce((sum, row) => sum + row.value, 0);
        const topCrop = positive[0] ?? null;
        return {
            total,
            topCrop,
            availableCrops: chartRows.length,
        };
    }, [chartRows]);

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

        const colors =
            themeMode === "dark"
                ? {
                    yLabel: 0xbad0c1,
                    xLabel: 0xc9ddd0,
                    grid: 0x31433a,
                    barFill: 0x5ab47f,
                    barStroke: 0x449a6a,
                    pieStroke: 0x16201c,
                    pieLabel: 0xd7eadf,
                    legendLabel: 0xd8e9df,
                    legendValue: 0xaec4b8,
                    set: [0x5ab47f, 0xd6a35b, 0x74c091, 0x99b57c, 0xc48b46, 0x5d8f72, 0xe4bf82],
                }
                : {
                    yLabel: 0x405348,
                    xLabel: 0x33463b,
                    grid: 0xcfd4c4,
                    barFill: 0x2f7d4f,
                    barStroke: 0x1f5f3a,
                    pieStroke: 0xf9f8f2,
                    pieLabel: 0x2a3a2d,
                    legendLabel: 0x2a3a2d,
                    legendValue: 0x4d5f53,
                    set: [0x2f7d4f, 0xc78c3a, 0x4e8f69, 0x8ca36a, 0xa8793a, 0x50765b, 0xd0b575],
                };

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
            fill: am5.color(colors.xLabel),
        });

        const yAxis = barChart.yAxes.push(
            am5xy.ValueAxis.new(barRoot, {
                renderer: am5xy.AxisRendererY.new(barRoot, {}),
            })
        );

        xAxis.get("renderer").grid.template.setAll({
            strokeOpacity: 0.08,
        });

        yAxis.get("renderer").labels.template.setAll({
            fill: am5.color(colors.yLabel),
        });

        yAxis.get("renderer").grid.template.setAll({
            stroke: am5.color(colors.grid),
            strokeOpacity: 0.4,
        });

        const barSeries = barChart.series.push(
            am5xy.ColumnSeries.new(barRoot, {
                name: "Crop Value",
                xAxis,
                yAxis,
                valueYField: "value",
                categoryXField: "crop",
                tooltip: am5.Tooltip.new(barRoot, {
                    labelText: "{categoryX}: {valueY.formatNumber('#,###.0')}",
                }),
            })
        );

        barSeries.columns.template.setAll({
            fill: am5.color(colors.barFill),
            stroke: am5.color(colors.barStroke),
            strokeWidth: 1,
            cornerRadiusTL: 5,
            cornerRadiusTR: 5,
        });

        barChart.set("colors", am5.ColorSet.new(barRoot, {
            colors: colors.set.map((c) => am5.color(c)),
            passOptions: {
                lightness: 0,
                hue: 0,
            },
        }));

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
                legendValueText: "{value.formatNumber('#,###.0')}",
            })
        );

        pieSeries.slices.template.setAll({
            tooltipText: "{category}: {value.formatNumber('#,###.0')}",
            stroke: am5.color(colors.pieStroke),
            strokeWidth: 1,
        });

        pieSeries.labels.template.setAll({
            fontSize: 11,
            fill: am5.color(colors.pieLabel),
        });

        pieChart.set("colors", am5.ColorSet.new(pieRoot, {
            colors: colors.set.map((c) => am5.color(c)),
            passOptions: {
                lightness: 0,
                hue: 0,
            },
        }));

        const legend = pieChart.children.push(
            am5.Legend.new(pieRoot, {
                centerX: am5.p50,
                x: am5.p50,
                width: am5.percent(100),
                maxHeight: 190,
                verticalScrollbar: am5.Scrollbar.new(pieRoot, { orientation: "vertical" }),
            })
        );

        legend.labels.template.setAll({
            fill: am5.color(colors.legendLabel),
        });

        legend.valueLabels.template.setAll({
            fill: am5.color(colors.legendValue),
        });

        const pieData = pieRows.length ? pieRows : [{ crop: "No positive values", value: 1 }];
        pieSeries.data.setAll(pieData);
        legend.data.setAll(pieSeries.dataItems);

        pieSeries.appear(700);
        pieChart.appear(700, 100);

        return () => {
            barRoot.dispose();
            pieRoot.dispose();
        };
    }, [chartRows, pieRows, themeMode]);

    return (
        <section className="glass-card p-4 text-[var(--foreground)] md:p-5">
            <div className="mb-3">
                <h2 className="section-title text-2xl font-semibold">District Crop Insights</h2>
                <p className="text-sm text-[var(--muted)]">
                    {district && province
                        ? `${district}, ${province} (Year ${record?.Year ?? "2000-01"})`
                        : "Select a district on the map to view crop breakdown."}
                </p>
            </div>

            {district && province && record ? (
                <>
                    <div className="kpi-grid mb-4">
                        <article className="kpi-card">
                            <p className="soft-label">Total Crop Value</p>
                            <p className="kpi-value">{numFmt.format(summary.total)}</p>
                        </article>
                        <article className="kpi-card">
                            <p className="soft-label">Top Crop</p>
                            <p className="kpi-value">{summary.topCrop ? summary.topCrop.crop : "None"}</p>
                        </article>
                        <article className="kpi-card">
                            <p className="soft-label">Crops With Values</p>
                            <p className="kpi-value">{summary.availableCrops}</p>
                        </article>
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2">
                            <h3 className="px-2 pt-2 text-sm font-semibold text-[var(--foreground)]">Bar Chart</h3>
                            <div ref={barRef} className="h-[340px] w-full" />
                        </div>
                        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2">
                            <h3 className="px-2 pt-2 text-sm font-semibold text-[var(--foreground)]">Pie Chart</h3>
                            <div ref={pieRef} className="h-[340px] w-full" />
                        </div>
                    </div>
                </>
            ) : (
                <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
                    No district selected yet. Click a district on the map to unlock charts and crop insights.
                </div>
            )}
        </section>
    );
}
