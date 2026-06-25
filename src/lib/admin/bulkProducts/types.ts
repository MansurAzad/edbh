export interface VariantRow {
  id: string;
  size: string;
  color: string;
  stock: number;
  sku: string;
  price_adjustment: number;
  image_url: string;
  _dbId?: string;
}

export interface ProductRow {
  id: string;
  name: string;
  category: string;
  price: number;
  sale_price: number | null;
  stock: number;
  description: string;
  material: string;
  sizes: string;
  colors: string;
  featured: boolean;
  image_url: string;
  variants: VariantRow[];
  expanded: boolean;
  _dbId?: string;
  _dirty?: boolean;
}

export interface SubmitResults {
  success: number;
  failed: number;
  variants: number;
  errors: string[];
}

export const generateId = () => Math.random().toString(36).slice(2, 10);

export const createEmptyProduct = (): ProductRow => ({
  id: generateId(),
  name: "", category: "", price: 0, sale_price: null, stock: 0,
  description: "", material: "", sizes: "", colors: "",
  featured: false, image_url: "", variants: [], expanded: false,
});

export const createEmptyVariant = (): VariantRow => ({
  id: generateId(), size: "", color: "", stock: 0, sku: "", price_adjustment: 0, image_url: "",
});

export const COMMON_SIZES = ['50"', '52"', '54"', '56"', '58"', '60"', "S", "M", "L", "XL", "XXL", "Free Size"];
export const COMMON_COLORS = ["Black", "White", "Navy", "Maroon", "Grey", "Beige", "Brown", "Red", "Green", "Blue", "Purple", "Pink"];
export const COMMON_MATERIALS = ["Nida", "Zoom", "Jorjet", "Chiffon", "Silk", "Cotton", "Linen", "Crepe", "Satin"];
export const BATCH_SIZE = 25;
export const EDIT_PAGE_SIZE = 20;
