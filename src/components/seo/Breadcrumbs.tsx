import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import StructuredData, { breadcrumbSchema } from "./StructuredData";

const routeNames: Record<string, string> = {
  shop: "Shop",
  collections: "Collections",

  about: "About Us",
  contact: "Contact",
  categories: "Categories",
  cart: "Cart",
  checkout: "Checkout",
  auth: "Login",
  profile: "My Account",
  product: "Product",
  p: "Product",
  wishlist: "Wishlist",
  blog: "Blog",
  track: "Order Tracking",
  faq: "FAQ",
  "return-policy": "Return Policy",
};

const Breadcrumbs = () => {
  const location = useLocation();
  const pathSegments = location.pathname.split("/").filter(Boolean);

  if (pathSegments.length === 0 || pathSegments[0] === "admin") return null;

  const items = [
    { name: "Home", url: "/" },
    ...pathSegments.map((seg, i) => ({
      name: routeNames[seg] || decodeURIComponent(seg),
      url: "/" + pathSegments.slice(0, i + 1).join("/"),
    })),
  ];

  return (
    <>
      <StructuredData data={breadcrumbSchema(items)} />
      <nav aria-label="Breadcrumb" className="container mx-auto px-4 pt-24 pb-2">
        <ol className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
          {items.map((item, i) => (
            <li key={item.url} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3" />}
              {i === items.length - 1 ? (
                <span className="text-foreground font-medium truncate max-w-[200px]">
                  {i === 0 && <Home className="w-3 h-3 inline mr-1" />}
                  {item.name}
                </span>
              ) : (
                <Link
                  to={item.url}
                  className="hover:text-primary transition-colors truncate max-w-[200px]"
                >
                  {i === 0 && <Home className="w-3 h-3 inline mr-1" />}
                  {item.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
};

export default Breadcrumbs;
