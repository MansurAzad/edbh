import productAbaya from "@/assets/product-abaya-1.jpg";
import productHijab from "@/assets/product-hijab-1.jpg";
import productBorka from "@/assets/product-borka-1.jpg";
import productKaftan from "@/assets/product-kaftan-1.jpg";
import productScarf from "@/assets/product-scarf-1.jpg";
import productFabric from "@/assets/product-fabric-1.jpg";

export interface Product {
  id: string;
  name: string;
  price: number;
  sale_price: number | null;
  image_url: string | null;
  category: string;
  sizes: string[] | null;
  colors: string[] | null;
  description?: string | null;
  stock?: number | null;
  slug?: string | null;
  material?: string | null;
  video_url?: string | null;
  // Standardized catalogue fields (optional on the shared frontend type — the
  // admin `AdminProduct` type in `productHelpers.ts` is the source of truth).
  sku?: string | null;
  subcategory?: string | null;
  fabric?: string | null;
  work_type?: string | null;
  part?: string | null;
  hijab_included?: boolean | null;
  inner_included?: boolean | null;
  image_alt_text?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
}

export interface RatingSummary {
  avg: number;
  count: number;
}

// Keys match actual DB category values: "Borka", "Abaya", "Hijab", "Kaftan", "Scarf", "Fabric"
export const categoryImages: Record<string, string> = {
  Borka: productBorka,
  Abaya: productAbaya,
  Hijab: productHijab,
  Kaftan: productKaftan,
  Scarf: productScarf,
  Fabric: productFabric,
};

export const getProductImage = (product: Pick<Product, "image_url" | "category">): string => {
  if (product.image_url && product.image_url !== "/placeholder.svg") return product.image_url;
  return categoryImages[product.category] || productAbaya;
};

export const defaultFallbackImage = productAbaya;
