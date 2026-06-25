export const LOW_STOCK_THRESHOLD = 1;
export const PRODUCTS_PER_PAGE = 20;

export interface AdminProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  sale_price: number | null;
  stock: number;
  featured: boolean;
  image_url: string | null;
  description: string | null;
  sizes: string[] | null;
  colors: string[] | null;
  material: string | null;
  video_url: string | null;
}

export type AdminProductInput = Omit<AdminProduct, "id">;

export const emptyProduct: AdminProductInput = {
  name: "",
  category: "",
  price: 0,
  sale_price: null,
  stock: 0,
  featured: false,
  image_url: "",
  description: "",
  sizes: [],
  colors: [],
  material: "",
  video_url: "",
};
