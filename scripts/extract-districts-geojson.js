const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const htmlPath = path.join(ROOT, "Pakistan-Digital-Map-master", "index.html");
const provincesPath = path.join(ROOT, "data", "Pakistan_Provices.json");
const outPath = path.join(ROOT, "data", "Pakistan_Districts.json");

const html = fs.readFileSync(htmlPath, "utf8");
const provinces = JSON.parse(fs.readFileSync(provincesPath, "utf8"));

function computeBboxFromGeoJSON(geojson) {
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;

    function walk(coords) {
        if (!Array.isArray(coords)) return;
        if (typeof coords[0] === "number" && typeof coords[1] === "number") {
            const lon = coords[0];
            const lat = coords[1];
            if (Number.isFinite(lon) && Number.isFinite(lat)) {
                minLon = Math.min(minLon, lon);
                minLat = Math.min(minLat, lat);
                maxLon = Math.max(maxLon, lon);
                maxLat = Math.max(maxLat, lat);
            }
            return;
        }

        for (const c of coords) walk(c);
    }

    for (const feature of geojson.features || []) {
        walk(feature.geometry && feature.geometry.coordinates);
    }

    return { minLon, minLat, maxLon, maxLat };
}

function tokenizePath(d) {
    const tokens = [];
    const re = /([a-zA-Z])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g;
    let m;

    while ((m = re.exec(d)) !== null) {
        if (m[1]) {
            tokens.push({ type: "cmd", value: m[1] });
        } else {
            tokens.push({ type: "num", value: Number(m[2]) });
        }
    }

    return tokens;
}

function parseSvgPathToRings(d) {
    const tokens = tokenizePath(d);
    let i = 0;
    let cmd = null;
    let cx = 0;
    let cy = 0;
    let sx = 0;
    let sy = 0;

    const rings = [];
    let ring = [];

    function readNum() {
        if (i >= tokens.length || tokens[i].type !== "num") return null;
        const v = tokens[i].value;
        i += 1;
        return v;
    }

    function ensureRing() {
        if (ring.length === 0) {
            ring = [];
            rings.push(ring);
        }
    }

    while (i < tokens.length) {
        if (tokens[i].type === "cmd") {
            cmd = tokens[i].value;
            i += 1;
        }

        if (!cmd) break;

        if (cmd === "M" || cmd === "m") {
            const x = readNum();
            const y = readNum();
            if (x == null || y == null) break;

            if (cmd === "m") {
                cx += x;
                cy += y;
            } else {
                cx = x;
                cy = y;
            }

            ring = [];
            rings.push(ring);
            ring.push([cx, cy]);
            sx = cx;
            sy = cy;

            // Additional coordinate pairs after M/m are implicit L/l
            while (i < tokens.length && tokens[i].type === "num") {
                const nx = readNum();
                const ny = readNum();
                if (nx == null || ny == null) break;

                if (cmd === "m") {
                    cx += nx;
                    cy += ny;
                } else {
                    cx = nx;
                    cy = ny;
                }

                ring.push([cx, cy]);
            }

            continue;
        }

        if (cmd === "L" || cmd === "l") {
            ensureRing();
            while (i < tokens.length && tokens[i].type === "num") {
                const x = readNum();
                const y = readNum();
                if (x == null || y == null) break;

                if (cmd === "l") {
                    cx += x;
                    cy += y;
                } else {
                    cx = x;
                    cy = y;
                }

                ring.push([cx, cy]);
            }
            continue;
        }

        if (cmd === "H" || cmd === "h") {
            ensureRing();
            while (i < tokens.length && tokens[i].type === "num") {
                const x = readNum();
                if (x == null) break;

                if (cmd === "h") {
                    cx += x;
                } else {
                    cx = x;
                }

                ring.push([cx, cy]);
            }
            continue;
        }

        if (cmd === "V" || cmd === "v") {
            ensureRing();
            while (i < tokens.length && tokens[i].type === "num") {
                const y = readNum();
                if (y == null) break;

                if (cmd === "v") {
                    cy += y;
                } else {
                    cy = y;
                }

                ring.push([cx, cy]);
            }
            continue;
        }

        if (cmd === "Z" || cmd === "z") {
            if (ring.length > 0) {
                const first = ring[0];
                const last = ring[ring.length - 1];
                if (first[0] !== last[0] || first[1] !== last[1]) {
                    ring.push([first[0], first[1]]);
                }
            }
            cx = sx;
            cy = sy;
            continue;
        }

        // Unsupported command in this source; skip its parameters conservatively.
        // This dataset uses only move/line/h/v/close commands.
        i += 1;
    }

    return rings.filter((r) => r.length >= 4);
}

function svgToGeo(point, bbox, viewBox, translate) {
    const x = point[0] + translate.x;
    const y = point[1] + translate.y;

    const lon = bbox.minLon + (x / viewBox.width) * (bbox.maxLon - bbox.minLon);
    const lat = bbox.maxLat - (y / viewBox.height) * (bbox.maxLat - bbox.minLat);

    return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
}

// Source viewBox and group translation from the supplied SVG
const viewBox = { width: 1628, height: 1544 };
const translate = { x: -27.1, y: -28.1 };
const bbox = computeBboxFromGeoJSON(provinces);

// Collect district paths (class="shape") and ignore border overlays
const pathRe = /<path\s+[^>]*class="shape"[^>]*>/gi;
const idRe = /\sid="([^"]+)"/i;
const dRe = /\sd="([^"]+)"/i;

const features = [];
let match;
while ((match = pathRe.exec(html)) !== null) {
    const tag = match[0];
    const idMatch = tag.match(idRe);
    const dMatch = tag.match(dRe);

    if (!idMatch || !dMatch) continue;

    const district = idMatch[1].trim();
    const d = dMatch[1].trim();

    const rings = parseSvgPathToRings(d);
    if (rings.length === 0) continue;

    const geoRings = rings.map((ring) => ring.map((pt) => svgToGeo(pt, bbox, viewBox, translate)));

    features.push({
        type: "Feature",
        properties: {
            name: district,
            name_en: district,
            source: "Pakistan-Digital-Map-master/index.html",
        },
        geometry: {
            type: "Polygon",
            coordinates: geoRings,
        },
    });
}

const out = {
    type: "FeatureCollection",
    name: "PakistanDistricts",
    features,
};

fs.writeFileSync(outPath, JSON.stringify(out));
console.log(`Wrote ${features.length} district features -> ${path.relative(ROOT, outPath)}`);
