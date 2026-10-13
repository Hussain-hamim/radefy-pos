import {
  Apple,
  Milk,
  Wheat,
  Coffee,
  Package,
  House,
  ShoppingBasket,
} from "lucide-react";
const icons = {
  produce: Apple,
  dairy: Milk,
  bakery: Wheat,
  pantry: Package,
  beverages: Coffee,
  household: House,
};
export function ProductIcon({
  category,
  small = false,
}: {
  category?: string | null;
  small?: boolean;
}) {
  const Icon = icons[category as keyof typeof icons] ?? ShoppingBasket;
  return (
    <span
      className={`product-icon ${category ?? "pantry"} ${small ? "small" : ""}`}
    >
      <Icon size={small ? 19 : 25} strokeWidth={1.5} />
    </span>
  );
}
