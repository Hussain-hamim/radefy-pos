export type Row = Record<string, string | null>;
export type Page =
  | "overview"
  | "pos"
  | "products"
  | "categories"
  | "inventory"
  | "movements"
  | "purchases"
  | "suppliers"
  | "customers"
  | "debts"
  | "sales"
  | "returns"
  | "expenses"
  | "register"
  | "reports"
  | "staff"
  | "settings";
export type TableKey =
  | "products"
  | "categories"
  | "barcodes"
  | "held"
  | "lots"
  | "movements"
  | "customers"
  | "customer_ledger"
  | "suppliers"
  | "supplier_ledger"
  | "purchases"
  | "purchase_items"
  | "purchase_receipts"
  | "returns"
  | "expenses"
  | "registers"
  | "cash_movements"
  | "users"
  | "permissions"
  | "audit"
  | "supplier_returns"
  | "sales"
  | "trend"
  | "best_sellers"
  | "payment_breakdown"
  | "cashier_report"
  | "category_report"
  | "collections";
export interface User {
  id: string;
  name: string;
  role: string;
  permissions: string[];
}
export type Snapshot = Record<TableKey, Row[]> & {
  mode: string;
  preview: boolean;
  user: User;
  settings: Record<string, string>;
  stats: Row;
  from: string;
  to: string;
};
export interface Status {
  mode: string;
  preview: boolean;
  user: User | null;
  real_exists: boolean;
  language: string;
}
export interface CartItem {
  product_id: string;
  quantity: string;
}
export interface Cart {
  items: CartItem[];
  discount: string;
  customer_id?: string;
  held_id?: string;
}
export interface Quote {
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  lines: Row[];
}
export interface Receipt {
  sale: Row;
  items: Row[];
  payments: Row[];
}
export type Payload = Record<string, unknown>;
export const value = (r: Row, key: string) => r[key] ?? "";
