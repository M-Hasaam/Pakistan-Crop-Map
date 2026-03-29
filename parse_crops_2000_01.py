import csv
import json

CROPS = [
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
]

PROVINCES = ["Punjab", "Sindh", "KPK", "Balochistan", "Pakistan"]
TARGET_YEAR = "2000-01"


def clean_text(value):
    if value is None:
        return ""
    value = str(value).replace("\ufeff", " ").replace("\xa0", " ")
    value = value.replace('"', " ").replace("'", " ")
    value = " ".join(value.split())
    return value.strip()


def detect_crop(line_upper):
    for crop in CROPS:
        if crop.upper() in line_upper:
            return crop
    return None


def detect_province(line_upper):
    if "PUNJAB" in line_upper:
        return "Punjab"
    if "SINDH" in line_upper or "SIND" in line_upper:
        return "Sindh"
    if "KHYBER" in line_upper or "KPK" in line_upper:
        return "KPK"
    if "BALOCH" in line_upper or "BALUCH" in line_upper:
        return "Balochistan"
    return None


def is_numeric_token(token):
    token = clean_text(token)
    if not token:
        return False
    if token.startswith("-"):
        token = token[1:]
    if token.count(".") > 1:
        return False
    token = token.replace(".", "", 1)
    return token.isdigit()


def parse_value(value):
    raw = clean_text(value)
    if not raw:
        return None

    upper = raw.upper().replace(" ", "")
    if upper in {"N.G.", "N.G", "NG", "NOTGROWN", "NOT-GROWN"}:
        return 0.0

    # Keep only the first numeric token if OCR glued content.
    parts = raw.replace(",", " ").split()
    for part in parts:
        part = part.strip()
        if is_numeric_token(part):
            return float(part)

    return None


def split_packed_numeric_cell(cell):
    text = clean_text(cell)
    if not text:
        return [""]

    # If letters exist, treat as a normal single token.
    if any(ch.isalpha() for ch in text):
        return [text]

    parts = text.replace(",", " ").split()
    if len(parts) >= 2 and all(is_numeric_token(p) for p in parts):
        return parts

    return [text]


def split_header_cell(cell):
    text = clean_text(cell)
    if not text:
        return [""]

    # OCR often uses double spaces between merged district names.
    chunks = [clean_text(x) for x in text.split("  ") if clean_text(x)]
    if len(chunks) > 1:
        return chunks

    return [text]


def merge_header_row(header_parts, row, start_idx=1):
    col = 0
    for raw in row[start_idx:]:
        cell = clean_text(raw)
        if not cell:
            col += 1
            continue

        pieces = split_header_cell(cell)
        for piece in pieces:
            while len(header_parts) <= col:
                header_parts.append("")
            if piece:
                if header_parts[col]:
                    header_parts[col] = clean_text(header_parts[col] + " " + piece)
                else:
                    header_parts[col] = piece
            col += 1


def normalize_district_name(name):
    name = clean_text(name)
    if not name:
        return ""

    replacements = {
        "Islamaba d": "Islamabad",
        "C hakwal": "Chakwal",
        "Te k Singh": "Tek Singh",
        "Te k  Singh": "Tek Singh",
        "Toba Te k Singh": "Toba Tek Singh",
        "M.B. Din": "M.B. Din",
        "D.I.Khan": "D.I. Khan",
        "N. Feroze": "N. Feroze",
        "K.S.Kot": "K.S. Kot",
    }

    return replacements.get(name, name)


def main():
    source_path = "data/crops.csv"
    output_path = "data/crops_2000_01.json"

    province_by_crop = {crop: {p: None for p in PROVINCES} for crop in CROPS}
    districts = {"Punjab": {}, "Sindh": {}, "KPK": {}, "Balochistan": {}}

    current_crop = None
    current_mode = None  # 'province' | 'district'
    current_province = None
    district_header_parts = []

    with open(source_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)

        for row in reader:
            cleaned_row = [clean_text(c) for c in row]
            joined = " ".join(c for c in cleaned_row if c)
            joined_upper = joined.upper()
            first_cell = cleaned_row[0] if cleaned_row else ""

            if not joined:
                continue

            found_crop = detect_crop(joined_upper)
            if found_crop and "AREA" in joined_upper and "PRODUCTION" in joined_upper:
                current_crop = found_crop

            found_province = detect_province(joined_upper)
            if found_province:
                current_province = found_province

            is_district_section = (
                "DISTRICT-WISE AREA" in joined_upper
                or "TRICT-WISE AREA" in joined_upper
                or "T-WISE AREA" in joined_upper
                or "CT-WISE AREA" in joined_upper
                or "RICT-WISE AREA" in joined_upper
            )

            is_province_section = (
                "AREA" in joined_upper
                and "PRODUCTION" in joined_upper
                and "PAKISTAN" in joined_upper
                and "DISTRICT" not in joined_upper
                and "TRICT" not in joined_upper
                and "T-WISE" not in joined_upper
            )

            if is_province_section:
                current_mode = "province"
                district_header_parts = []
                continue

            if is_district_section:
                current_mode = "district"
                district_header_parts = []
                continue

            if first_cell.upper().startswith("DISTRICT/"):
                current_mode = "district"
                merge_header_row(district_header_parts, cleaned_row, start_idx=1)
                continue

            if first_cell.upper().startswith("YEAR") and current_mode == "district":
                merge_header_row(district_header_parts, cleaned_row, start_idx=1)
                continue

            if first_cell != TARGET_YEAR:
                continue

            if not current_crop:
                continue

            if current_mode == "province":
                values = []
                for cell in cleaned_row[1:]:
                    values.extend(split_packed_numeric_cell(cell))

                for i, prov in enumerate(PROVINCES):
                    value = parse_value(values[i]) if i < len(values) else None
                    province_by_crop[current_crop][prov] = value
                continue

            if current_mode == "district" and current_province in districts:
                values = []
                for cell in cleaned_row[1:]:
                    values.extend(split_packed_numeric_cell(cell))

                max_len = max(len(district_header_parts), len(values))
                if len(district_header_parts) < max_len:
                    district_header_parts.extend([""] * (max_len - len(district_header_parts)))
                if len(values) < max_len:
                    values.extend([""] * (max_len - len(values)))

                for idx in range(max_len):
                    district_name = normalize_district_name(district_header_parts[idx])
                    if not district_name:
                        continue
                    if district_name.upper() in {"YEAR", "DISTRICT/", "PROVINCE/"}:
                        continue

                    district_map = districts[current_province]
                    if district_name not in district_map:
                        district_map[district_name] = {"Year": TARGET_YEAR}

                    district_map[district_name][current_crop] = parse_value(values[idx])

    # Fill missing crop keys for each district.
    for province_name, district_map in districts.items():
        for district_name, record in district_map.items():
            record["Year"] = TARGET_YEAR
            for crop in CROPS:
                if crop not in record:
                    record[crop] = None

    # ProvinceTotals are aggregated over all listed crops for 2000-01.
    province_totals = {p: 0.0 for p in PROVINCES}
    for crop in CROPS:
        for prov in PROVINCES:
            value = province_by_crop[crop].get(prov)
            if isinstance(value, (int, float)):
                province_totals[prov] += float(value)

    result = {
        "ProvinceTotals": province_totals,
        "Districts": districts,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(f"Wrote: {output_path}")


if __name__ == "__main__":
    main()
