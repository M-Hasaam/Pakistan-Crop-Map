const fs = require("fs");

const CROPS = [
    "Wheat",
    "Rice",
    "Maize",
    "Bajra",
    "Jowar",
    "Barley",
    "Sugarcane",
    "Cotton",
    "Sunhemp",
    "Jute",
    "Tobacco",
    "Sugarbeet",
    "Guarseed",
];

const PROVINCES = ["Punjab", "Sindh", "KPK", "Balochistan", "Pakistan"];
const TARGET_YEAR = "2000-01";

const SPECIAL_HEADER_SPLITS = {
    "Gujranwala Hafizabad": ["Gujranwala", "Hafizabad"],
    "MultanLodhran": ["Multan", "Lodhran"],
    "Rahimyar Bahawal Khan nagar": ["Rahimyar Khan", "Bahawalnagar"],
    "Musa Khail Barkhan": ["Musakhel", "Barkhan"],
    "Killa SaifullaMh usa Khail Barkhan": ["Killa Saifullah", "Musakhel", "Barkhan"],
    "Dera Bughti Ziarat": ["Dera Bugti", "Ziarat"],
};

const DISTRICT_ALIASES = {
    abbotabad: "Abbotabad",
    abbottabad: "Abbotabad",
    sheikhupura: "Shaikhupura",
    sheikhu: "Shaikhupura",
    sheikhupurasahib: "Shaikhupura",
    nankanasahib: "Nankana Sahab",
    nankanasahab: "Nankana Sahab",
    mbdin: "Mandi Bahauddin",
    mandibahudin: "Mandi Bahauddin",
    nferoze: "Naushahro Firoze",
    nausheroferoze: "Naushahro Firoze",
    naushahrofiroze: "Naushahro Firoze",
    mgarh: "Muzaffargarh",
    dghan: "Dera Ghazi Khan",
    deraghazikhan: "Dera Ghazi Khan",
    diikhan: "Dera Ismail Khan",
    dikhan: "Dera Ismail Khan",
    deraismailkhan: "Dera Ismail Khan",
    derabughti: "Dera Bugti",
    killaabdullah: "Killa Abdullah",
    killasaifullah: "Killa Saifullah",
    tobateksingh: "Toba Tek Singh",
    ksikot: "Qambar Shahdatkot",
    kskot: "Qambar Shahdatkot",
    qambarshahdadkot: "Qambar Shahdatkot",
    qambarshahdatkot: "Qambar Shahdatkot",
    lakkimarwa: "Lakki Marwat",
    bajour: "Bajur",
    panjgoor: "Panjgur",
    panjgur: "Panjgur",
    umarkot: "Umerkot",
    mirpurkhas: "Mirpur Khas",
    northwaziristan: "North Waziristan",
    southwaziristan: "South Waziristan",
};

function cleanText(value) {
    if (value === null || value === undefined) return "";
    let out = String(value)
        .replace(/\ufeff/g, " ")
        .replace(/\xa0/g, " ")
        .replace(/["']/g, " ");
    out = out.replace(/\s+/g, " ").trim();
    return out;
}

function normalizeDistrictKey(value) {
    const text = cleanText(value)
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
    return text;
}

function titleWithSpaces(name) {
    return cleanText(String(name).replace(/_/g, " "));
}

function pointInRing(point, ring) {
    const [px, py] = point;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];

        const intersects = (yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-12) + xi;
        if (intersects) inside = !inside;
    }
    return inside;
}

function pointInPolygon(point, rings) {
    if (!rings.length) return false;
    if (!pointInRing(point, rings[0])) return false;
    for (let i = 1; i < rings.length; i++) {
        if (pointInRing(point, rings[i])) return false;
    }
    return true;
}

function pointInFeature(point, feature) {
    const geom = feature && feature.geometry;
    if (!geom) return false;

    if (geom.type === "Polygon") {
        return pointInPolygon(point, geom.coordinates || []);
    }

    if (geom.type === "MultiPolygon") {
        for (const poly of geom.coordinates || []) {
            if (pointInPolygon(point, poly || [])) return true;
        }
    }

    return false;
}

function featureCenter(feature) {
    const geom = feature && feature.geometry;
    if (!geom) return null;

    const points = [];
    if (geom.type === "Polygon") {
        for (const ring of geom.coordinates || []) for (const p of ring || []) points.push(p);
    } else if (geom.type === "MultiPolygon") {
        for (const poly of geom.coordinates || []) {
            for (const ring of poly || []) for (const p of ring || []) points.push(p);
        }
    }

    if (!points.length) return null;
    let sx = 0;
    let sy = 0;
    for (const [x, y] of points) {
        sx += x;
        sy += y;
    }
    return [sx / points.length, sy / points.length];
}

function normalizeProvinceForOutput(name) {
    const n = cleanText(name).toLowerCase();
    if (n === "punjab") return "Punjab";
    if (n === "sindh") return "Sindh";
    if (n === "balochistan") return "Balochistan";
    if (n === "khyber pakhtunkhwa" || n === "federally administered tribal areas") return "KPK";
    if (n === "islamabad capital territory") return "Punjab";
    return null;
}

function buildDistrictProvinceMap() {
    const districtGeo = JSON.parse(fs.readFileSync("data/Pakistan_Districts.json", "utf8"));
    const provinceGeo = JSON.parse(fs.readFileSync("data/Pakistan_Provices.json", "utf8"));
    const map = new Map();

    for (const districtFeature of districtGeo.features || []) {
        const props = districtFeature.properties || {};
        const districtName = titleWithSpaces(props.name_en || props.name || "");
        if (!districtName) continue;

        const center = featureCenter(districtFeature);
        if (!center) continue;

        let outputProvince = null;
        for (const provinceFeature of provinceGeo.features || []) {
            if (!pointInFeature(center, provinceFeature)) continue;
            const pName = titleWithSpaces(
                (provinceFeature.properties && (provinceFeature.properties.name_en || provinceFeature.properties.name)) || ""
            );
            outputProvince = normalizeProvinceForOutput(pName);
            if (outputProvince) break;
        }

        if (outputProvince) map.set(districtName, outputProvince);
    }

    return map;
}

function buildDistrictLookup() {
    const path = "data/Pakistan_Districts.json";
    const geo = JSON.parse(fs.readFileSync(path, "utf8"));
    const lookup = new Map();

    for (const feature of geo.features || []) {
        const props = feature.properties || {};
        const rawName = props.name_en || props.name;
        if (!rawName) continue;
        const canonical = titleWithSpaces(rawName);
        lookup.set(normalizeDistrictKey(canonical), canonical);
    }

    for (const aliasKey of Object.keys(DISTRICT_ALIASES)) {
        const canonical = DISTRICT_ALIASES[aliasKey];
        lookup.set(normalizeDistrictKey(aliasKey), canonical);
    }

    return lookup;
}

function parseCsvLine(line) {
    const cells = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (ch === '"') {
            const next = line[i + 1];
            if (inQuotes && next === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (ch === "," && !inQuotes) {
            cells.push(current);
            current = "";
            continue;
        }

        current += ch;
    }

    cells.push(current);
    return cells;
}

function parseCsv(text) {
    const lines = text.split(/\r?\n/);
    return lines.map((line) => parseCsvLine(line));
}

function detectCrop(lineUpper) {
    for (const crop of CROPS) {
        if (lineUpper.includes(crop.toUpperCase())) return crop;
    }
    return null;
}

function detectProvince(lineUpper) {
    if (lineUpper.includes("PUNJAB")) return "Punjab";
    if (lineUpper.includes("SINDH") || lineUpper.includes("SIND")) return "Sindh";
    if (lineUpper.includes("KHYBER") || lineUpper.includes("KPK")) return "KPK";
    if (lineUpper.includes("BALOCH") || lineUpper.includes("BALUCH")) return "Balochistan";
    return null;
}

function isNumericToken(token) {
    let t = cleanText(token);
    if (!t) return false;
    if (t.startsWith("-")) t = t.slice(1);
    if ((t.match(/\./g) || []).length > 1) return false;
    t = t.replace(".", "");
    return /^\d+$/.test(t);
}

function parseValue(value) {
    const raw = cleanText(value);
    if (!raw) return null;

    const upper = raw.toUpperCase().replace(/\s+/g, "");
    if (["N.G.", "N.G", "NG", "NOTGROWN", "NOT-GROWN"].includes(upper)) return 0;

    const parts = raw.replace(/,/g, " ").split(/\s+/).filter(Boolean);
    for (const part of parts) {
        if (isNumericToken(part)) return Number(part);
    }
    return null;
}

function splitPackedNumericCell(cell) {
    const text = cleanText(cell);
    if (!text) return [""];

    if (/[A-Za-z]/.test(text)) return [text];

    const parts = text.replace(/,/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && parts.every(isNumericToken)) return parts;

    return [text];
}

function splitHeaderCell(cell) {
    const text = cleanText(cell);
    if (!text) return [""];

    if (SPECIAL_HEADER_SPLITS[text]) return SPECIAL_HEADER_SPLITS[text];

    const chunks = text
        .split(/\s{2,}/)
        .map((x) => cleanText(x))
        .filter(Boolean);

    if (chunks.length > 1) return chunks;
    return [text];
}

function mergeHeaderRow(headerParts, row, startIdx = 1) {
    let col = 0;
    for (const raw of row.slice(startIdx)) {
        const cell = cleanText(raw);
        if (!cell) {
            col += 1;
            continue;
        }

        const pieces = splitHeaderCell(cell);
        for (const piece of pieces) {
            while (headerParts.length <= col) headerParts.push("");
            if (piece) {
                headerParts[col] = headerParts[col]
                    ? cleanText(`${headerParts[col]} ${piece}`)
                    : piece;
            }
            col += 1;
        }
    }
}

function normalizeDistrictName(name) {
    const value = cleanText(name).replace(/_/g, " ");
    if (!value) return "";

    const replacements = {
        "Islamaba d": "Islamabad",
        "C hakwal": "Chakwal",
        "Te k Singh": "Tek Singh",
        "Te k  Singh": "Tek Singh",
        "Toba Te k Singh": "Toba Tek Singh",
        "K.S.Kot": "K.S. Kot",
        "D.I.Khan": "D.I. Khan",
        "N. Feroze": "N. Feroze",
    };

    return replacements[value] || value;
}

function main() {
    const sourcePath = "data/crops.csv";
    const outputPath = "data/crops_2000_01.json";

    const csvText = fs.readFileSync(sourcePath, "utf8");
    const rows = parseCsv(csvText);
    const districtLookup = buildDistrictLookup();
    const districtProvinceMap = buildDistrictProvinceMap();

    const provinceByCrop = {};
    for (const crop of CROPS) {
        provinceByCrop[crop] = {};
        for (const p of PROVINCES) provinceByCrop[crop][p] = null;
    }

    const districts = {
        Punjab: {},
        Sindh: {},
        KPK: {},
        Balochistan: {},
    };

    let currentCrop = null;
    let currentMode = null; // province | district
    let currentProvince = null;
    let districtHeaderParts = [];

    for (const row of rows) {
        const cleanedRow = row.map((c) => cleanText(c));
        const joined = cleanedRow.filter(Boolean).join(" ");
        const joinedUpper = joined.toUpperCase();
        const firstCell = cleanedRow[0] || "";

        if (!joined) continue;

        const foundCrop = detectCrop(joinedUpper);
        if (foundCrop && joinedUpper.includes("AREA") && joinedUpper.includes("PRODUCTION")) {
            currentCrop = foundCrop;
        }

        const foundProvince = detectProvince(joinedUpper);
        if (foundProvince) currentProvince = foundProvince;

        const isDistrictSection =
            joinedUpper.includes("DISTRICT-WISE AREA") ||
            joinedUpper.includes("TRICT-WISE AREA") ||
            joinedUpper.includes("T-WISE AREA") ||
            joinedUpper.includes("CT-WISE AREA") ||
            joinedUpper.includes("RICT-WISE AREA");

        const isProvinceSection =
            joinedUpper.includes("AREA") &&
            joinedUpper.includes("PRODUCTION") &&
            joinedUpper.includes("PAKISTAN") &&
            !joinedUpper.includes("DISTRICT") &&
            !joinedUpper.includes("TRICT") &&
            !joinedUpper.includes("T-WISE");

        if (isProvinceSection) {
            currentMode = "province";
            districtHeaderParts = [];
            continue;
        }

        if (isDistrictSection) {
            currentMode = "district";
            districtHeaderParts = [];
            continue;
        }

        if (firstCell.toUpperCase().startsWith("DISTRICT/")) {
            currentMode = "district";
            mergeHeaderRow(districtHeaderParts, cleanedRow, 1);
            continue;
        }

        if (firstCell.toUpperCase().startsWith("YEAR") && currentMode === "district") {
            mergeHeaderRow(districtHeaderParts, cleanedRow, 1);
            continue;
        }

        if (firstCell !== TARGET_YEAR) continue;
        if (!currentCrop) continue;

        if (currentMode === "province") {
            const values = [];
            for (const cell of cleanedRow.slice(1)) values.push(...splitPackedNumericCell(cell));

            for (let i = 0; i < PROVINCES.length; i++) {
                const value = i < values.length ? parseValue(values[i]) : null;
                provinceByCrop[currentCrop][PROVINCES[i]] = value;
            }
            continue;
        }

        if (currentMode === "district" && currentProvince && districts[currentProvince]) {
            const values = [];
            for (const cell of cleanedRow.slice(1)) values.push(...splitPackedNumericCell(cell));

            const maxLen = Math.max(districtHeaderParts.length, values.length);
            while (districtHeaderParts.length < maxLen) districtHeaderParts.push("");
            while (values.length < maxLen) values.push("");

            for (let i = 0; i < maxLen; i++) {
                const rawDistrict = normalizeDistrictName(districtHeaderParts[i]);
                const districtName = districtLookup.get(normalizeDistrictKey(rawDistrict)) || "";
                if (!districtName) continue;
                if (["YEAR", "DISTRICT/", "PROVINCE/"].includes(districtName.toUpperCase())) continue;
                const expectedProvince = districtProvinceMap.get(districtName);
                if (expectedProvince && expectedProvince !== currentProvince) continue;

                const districtMap = districts[currentProvince];
                if (!districtMap[districtName]) districtMap[districtName] = { Year: TARGET_YEAR };

                districtMap[districtName][currentCrop] = parseValue(values[i]);
            }
        }
    }

    for (const provinceName of Object.keys(districts)) {
        const districtMap = districts[provinceName];
        for (const districtName of Object.keys(districtMap)) {
            const record = districtMap[districtName];
            record.Year = TARGET_YEAR;
            for (const crop of CROPS) {
                if (!(crop in record)) record[crop] = null;
            }
        }
    }

    const provinceTotals = {};
    for (const p of PROVINCES) provinceTotals[p] = 0;

    for (const crop of CROPS) {
        for (const p of PROVINCES) {
            const value = provinceByCrop[crop][p];
            if (typeof value === "number" && Number.isFinite(value)) {
                provinceTotals[p] += value;
            }
        }
    }

    const result = {
        ProvinceTotals: provinceTotals,
        Districts: districts,
    };

    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");
    console.log(`Wrote: ${outputPath}`);
}

main();
