import { createEmptyProduct, generateId, type ProductRow } from "./types";

export const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else current += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { result.push(current.trim()); current = ""; }
      else current += c;
    }
  }
  result.push(current.trim());
  return result;
};

export const parseCSVText = (text: string): ProductRow[] => {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, "_"));
  const productMap = new Map<string, ProductRow>();
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
    const name = row.name?.trim();
    if (!name) continue;
    if (!productMap.has(name)) {
      const p = createEmptyProduct();
      p.name = name;
      p.category = row.category || "";
      p.price = parseFloat(row.price) || 0;
      p.sale_price = parseFloat(row.sale_price) || null;
      p.stock = parseInt(row.stock) || 0;
      p.description = row.description || "";
      p.material = row.material || "";
      p.image_url = row.image_url || "";
      p.featured = row.featured?.toLowerCase() === "true";
      p.sizes = (row.sizes || "").replace(/;/g, ",");
      p.colors = (row.colors || "").replace(/;/g, ",");
      productMap.set(name, p);
    }
    if (row.variant_size || row.variant_color) {
      productMap.get(name)!.variants.push({
        id: generateId(),
        size: row.variant_size || "",
        color: row.variant_color || "",
        stock: parseInt(row.variant_stock) || 0,
        sku: row.variant_sku || "",
        price_adjustment: parseFloat(row.variant_price_adjustment) || 0,
        image_url: row.variant_image_url || "",
      });
    }
  }
  return Array.from(productMap.values());
};

export const downloadCSVTemplate = () => {
  const h = "name,category,price,sale_price,stock,featured,description,image_url,sizes,colors,material,variant_size,variant_color,variant_stock,variant_sku,variant_price_adjustment";
  const r = [
    '"Premium Borka","Borkas",2500,2200,50,true,"Description","","S; M; L","Black; White","Nida","S","Black",20,"SKU-001",0',
    '"Premium Borka","Borkas",2500,2200,50,true,"Description","","S; M; L","Black; White","Nida","M","Black",15,"SKU-002",0',
  ];
  const blob = new Blob(["\uFEFF" + [h, ...r].join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "bulk_products_template.csv";
  a.click();
};
