import { useState, useEffect, useRef } from "react";
import {
  Plus,
  SlidersHorizontal,
  Pencil,
  Upload,
  Tag,
  Printer,
  Package,
  ArrowRight,
} from "lucide-react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { useStore, type StoreContext } from "../lib/context";
import {
  Badge,
  DataTable,
  FormModal,
  Modal,
  PageHeader,
  type FormSpec,
  type Field,
} from "../components/ui";
import { ProductIcon } from "../components/ProductIcon";
import { decimal, money, qty, dateLabel } from "../lib/money";
import { command } from "../lib/api";
import type { Row } from "../lib/types";
export const options = (rows: Row[], label = "name") =>
  rows.map((r) => ({ value: r.id ?? "", label: r[label] ?? "" }));
export function productForm(ctx: StoreContext, product?: Row): FormSpec {
  const { data, run } = ctx;
  const code = data.barcodes.find(
    (b) =>
      b.product_id === product?.id &&
      b.multiplier === "1000" &&
      !b.code?.startsWith("radefy:"),
  );
  const pack = data.barcodes.find(
    (b) => b.product_id === product?.id && b.multiplier !== "1000",
  );
  return {
    title: product ? "Edit product" : "Add product",
    description: "Keep your catalog accurate and your checkout quick.",
    fields: [
      { key: "name", label: "Product name", required: true },
      { key: "name_dari", label: "Dari name" },
      { key: "image", label: "Product image", type: "image", full: true },
      { key: "sku", label: "SKU", required: true },
      {
        key: "barcode",
        label: "Barcode",
        hint: "Scan the manufacturer barcode here.",
      },
      {
        key: "category_id",
        label: "Category",
        type: "select",
        options: [
          { value: "", label: "Uncategorized" },
          ...options(data.categories),
        ],
      },
      {
        key: "unit",
        label: "Unit",
        type: "select",
        options: ["piece", "kg", "liter", "meter"].map((v) => ({
          value: v,
          label: v,
        })),
      },
      { key: "price", label: "Selling price", type: "money", required: true },
      { key: "cost", label: "Purchase cost", type: "money", required: true },
      { key: "min_stock", label: "Minimum stock", type: "quantity" },
      { key: "tax_bps", label: "Tax rate (%)", type: "money" },
      {
        key: "track_expiry",
        label: "Track expiry",
        type: "select",
        options: [
          { value: "0", label: "No" },
          { value: "1", label: "Yes" },
        ],
      },
      {
        key: "active",
        label: "Status",
        type: "select",
        options: [
          { value: "1", label: "Active" },
          { value: "0", label: "Inactive" },
        ],
      },
      { key: "pack_barcode", label: "Pack barcode" },
      { key: "pack_size", label: "Pieces per pack", type: "quantity" },
      ...(!product
        ? ([
            { key: "opening_stock", label: "Opening stock", type: "quantity" },
            { key: "batch", label: "Batch" },
            { key: "expires", label: "Expiry date", type: "date" },
          ] as Field[])
        : []),
    ],
    initial: product
      ? {
          ...Object.fromEntries(
            Object.entries(product).map(([k, v]) => [k, v ?? ""]),
          ),
          barcode: code?.code ?? "",
          pack_barcode: pack?.code ?? "",
          pack_size: pack ? decimal(pack.multiplier, 3) : "",
          price: decimal(product.price),
          cost: decimal(product.cost),
          min_stock: decimal(product.min_stock, 3),
          tax_bps: decimal(product.tax_bps),
        }
      : {
          sku: "RD-" + Date.now().toString().slice(-7),
          min_stock: "5",
          tax_bps: "0",
          price: "",
          cost: "",
        },
    onSubmit: async (v) => {
      const barcodes = [
        ...(v.barcode ? [{ code: v.barcode, multiplier: "1000" }] : []),
        ...(v.pack_barcode
          ? [{ code: v.pack_barcode, multiplier: v.pack_size }]
          : []),
        ...(product
          ? [{ code: "radefy:" + product.id, multiplier: "1000" }]
          : []),
      ];
      await run("product_save", { ...v, id: product?.id ?? "", barcodes });
    },
  };
}
function Labels({ close }: { close: () => void }) {
  const { data, t } = useStore();
  const [selected, setSelected] = useState(data.products[0]?.id ?? "");
  const [count, setCount] = useState(1);
  const [kind, setKind] = useState("barcode");
  const canvas = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState("");
  const product = data.products.find((p) => p.id === selected);
  useEffect(() => {
    if (!product || !canvas.current) return;
    const code =
      data.barcodes.find(
        (b) => b.product_id === selected && b.multiplier === "1000",
      )?.code ??
      product.sku ??
      "";
    if (kind === "qr") {
      void QRCode.toDataURL("radefy:" + selected, {
        width: 160,
        margin: 1,
      }).then(setImage);
    } else {
      JsBarcode(canvas.current, code, {
        format: "CODE128",
        width: 2,
        height: 48,
        displayValue: true,
        fontSize: 12,
        margin: 4,
      });
      setImage(canvas.current.toDataURL());
    }
  }, [selected, kind, product, data.barcodes]);
  return (
    <Modal title={t("Print labels")} close={close} wide>
      <div className="form-grid no-print">
        <label>
          {t("Product")}
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {data.products.map((p) => (
              <option key={p.id} value={p.id ?? ""}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Quantity")}
          <input
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) =>
              setCount(Math.min(100, Math.max(1, Number(e.target.value))))
            }
          />
        </label>
        <label>
          {t("Format")}
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="barcode">Code 128</option>
            <option value="qr">QR</option>
          </select>
        </label>
      </div>
      <canvas ref={canvas} hidden />
      <div className="label-grid print-area">
        {Array.from({ length: count }, (_, i) => (
          <div className="product-label" key={i}>
            <strong>{product?.name}</strong>
            <b>{money(product?.price)} AFN</b>
            {image && <img src={image} alt={t("Barcode")} />}
            <small>{product?.sku}</small>
          </div>
        ))}
      </div>
      <div className="modal-footer no-print">
        <button
          className="button"
          onClick={() => window.print()}
          disabled={!product}
        >
          <Printer size={16} />
          {t("Print labels")}
        </button>
      </div>
    </Modal>
  );
}
function Import({ close }: { close: () => void }) {
  const { t, run, notify } = useStore();
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<{
    rows: Row[];
    errors: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title={t("Import CSV")}
      description={t(
        "Columns: name, sku, unit, price, cost, barcode. Price and cost are AFN minor units (100 = 1 AFN).",
      )}
      close={close}
    >
      <div className="modal-body">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              const text = await file.text();
              setCsv(text);
              setPreview(await command("import_preview", { csv: text }));
              setError("");
            } catch (err) {
              setError(String(err));
            } finally {
              setBusy(false);
            }
          }}
        />
        {error && <div className="error-box">{error}</div>}
        {preview && (
          <>
            <p>
              {preview.rows.length} {t("Products")}
            </p>
            {preview.errors.map((e) => (
              <p key={e} className="field-error">
                {e}
              </p>
            ))}
            <ul>
              {preview.rows.slice(0, 6).map((p) => (
                <li key={p.sku}>
                  {p.sku} · {p.name}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="modal-footer">
        <button
          className="button"
          disabled={
            busy ||
            !preview ||
            preview.errors.length > 0 ||
            preview.rows.length === 0
          }
          onClick={async () => {
            setBusy(true);
            try {
              await run("import_commit", { csv });
              notify("Import completed");
              close();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("Import CSV")}
        </button>
      </div>
    </Modal>
  );
}
export function Catalog() {
  const ctx = useStore();
  const { data: d, t, page, run } = ctx;
  const [form, setForm] = useState<FormSpec | null>(null);
  const [category, setCategory] = useState("");
  const [labels, setLabels] = useState(false);
  const [importing, setImport] = useState(false);
  const rows = d.products.filter(
    (p) => !category || p.category_id === category,
  );
  if (page === "categories")
    return (
      <>
        <PageHeader
          title="Categories"
          description="A well-organized catalog makes everything easier."
        >
          <button
            className="button"
            onClick={() =>
              setForm({
                title: "Add category",
                fields: [
                  { key: "name", label: "Category name", required: true },
                ],
                onSubmit: async (v) => {
                  await run("category_save", v);
                },
              })
            }
          >
            <Plus size={16} />
            {t("Add category")}
          </button>
        </PageHeader>
        <DataTable
          rows={d.categories}
          columns={[
            {
              key: "name",
              label: "Category",
              render: (r) => (
                <div className="name-cell">
                  <ProductIcon category={r.id} small />
                  <strong>{r.name}</strong>
                </div>
              ),
            },
            { key: "products", label: "Products" },
            {
              key: "id",
              label: "Actions",
              render: (r) => (
                <button
                  className="icon-button"
                  aria-label={t("Edit")}
                  onClick={() =>
                    setForm({
                      title: "Edit category",
                      fields: [
                        { key: "name", label: "Category name", required: true },
                      ],
                      initial: { name: r.name ?? "" },
                      onSubmit: async (v) => {
                        await run("category_save", { ...v, id: r.id });
                      },
                    })
                  }
                >
                  <Pencil size={15} />
                </button>
              ),
            },
          ]}
        />
        {form && <FormModal spec={form} close={() => setForm(null)} />}
      </>
    );
  return (
    <>
      <PageHeader
        title="Products"
        description="Everything on your shelves, in one place."
      >
        <button className="button secondary" onClick={() => setLabels(true)}>
          <Tag size={16} />
          {t("Print labels")}
        </button>
        <button className="button" onClick={() => setForm(productForm(ctx))}>
          <Plus size={17} />
          {t("Add product")}
        </button>
      </PageHeader>
      <div className="mini-stat-grid">
        <div className="mini-stat">
          <Package />
          <span>
            {t("All products")}
            <strong>{d.products.length}</strong>
          </span>
        </div>
        <div className="mini-stat">
          <Tag />
          <span>
            {t("Categories")}
            <strong>{d.categories.length}</strong>
          </span>
        </div>
        <div className="mini-stat">
          <SlidersHorizontal />
          <span>
            {t("Low stock")}
            <strong>
              {
                d.products.filter(
                  (p) =>
                    BigInt(p.available ?? "0") <= BigInt(p.min_stock ?? "0"),
                ).length
              }
            </strong>
          </span>
        </div>
      </div>
      <DataTable
        rows={rows}
        exportName="products"
        toolbar={
          <>
            <select
              className="compact-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">{t("All categories")}</option>
              {d.categories.map((c) => (
                <option key={c.id} value={c.id ?? ""}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              className="button secondary small"
              onClick={() => setImport(true)}
            >
              <Upload size={14} />
              {t("Import CSV")}
            </button>
          </>
        }
        columns={[
          {
            key: "name",
            label: "Product",
            render: (r) => (
              <div className="name-cell">
                {r.image ? (
                  <img className="product-photo" src={r.image} alt="" />
                ) : (
                  <ProductIcon category={r.category_id} />
                )}
                <div>
                  <strong>
                    {d.settings.language === "fa" && r.name_dari
                      ? r.name_dari
                      : r.name}
                  </strong>
                  <small>
                    {r.sku} · {t(r.unit ?? "piece")}
                  </small>
                </div>
              </div>
            ),
          },
          { key: "category", label: "Category" },
          {
            key: "price",
            label: "Price",
            render: (r) => (
              <strong>
                {money(r.price)} <small>AFN</small>
              </strong>
            ),
          },
          { key: "cost", label: "Cost", render: (r) => money(r.cost) },
          {
            key: "stock",
            label: "Stock",
            render: (r) => `${qty(r.stock)} ${t(r.unit ?? "piece")}`,
          },
          {
            key: "active",
            label: "Status",
            render: (r) => (
              <Badge
                tone={
                  r.active === "0"
                    ? "neutral"
                    : BigInt(r.available ?? "0") === 0n
                      ? "red"
                      : BigInt(r.available ?? "0") <= BigInt(r.min_stock ?? "0")
                        ? "amber"
                        : "green"
                }
              >
                {t(
                  r.active === "0"
                    ? "Inactive"
                    : BigInt(r.available ?? "0") === 0n
                      ? "Out of stock"
                      : BigInt(r.available ?? "0") <= BigInt(r.min_stock ?? "0")
                        ? "Low stock"
                        : "In stock",
                )}
              </Badge>
            ),
          },
          {
            key: "id",
            label: "Actions",
            render: (r) => (
              <button
                className="icon-button"
                aria-label={`${t("Edit")} ${r.name}`}
                onClick={() => setForm(productForm(ctx, r))}
              >
                <Pencil size={16} />
              </button>
            ),
          },
        ]}
      />
      {form && <FormModal spec={form} close={() => setForm(null)} />}{" "}
      {labels && <Labels close={() => setLabels(false)} />}{" "}
      {importing && <Import close={() => setImport(false)} />}
    </>
  );
}
export function Inventory() {
  const { data: d, page, t, run } = useStore();
  const [form, setForm] = useState<FormSpec | null>(null);
  const [filter, setFilter] = useState("all");
  const today = new Date().toISOString().slice(0, 10);
  const rows = d.lots.filter(
    (l) =>
      filter === "all" ||
      (filter === "expired" && !!l.expires && l.expires < today) ||
      (filter === "low" && BigInt(l.quantity ?? "0") <= 10000n),
  );
  return (
    <>
      <PageHeader
        title={page === "movements" ? "Stock movements" : "Inventory"}
        description={
          page === "movements"
            ? "A clear record of every item in and out."
            : "Know what is available, what is running low, and what expires next."
        }
      />
      {page === "movements" ? (
        <DataTable
          rows={d.movements}
          exportName="stock-movements"
          columns={[
            {
              key: "created_at",
              label: "Date",
              render: (r) => dateLabel(r.created_at),
            },
            { key: "name", label: "Product" },
            { key: "batch", label: "Batch" },
            {
              key: "quantity",
              label: "Quantity",
              render: (r) => (
                <span
                  className={
                    BigInt(r.quantity ?? "0") > 0 ? "positive" : "negative"
                  }
                >
                  {BigInt(r.quantity ?? "0") > 0 ? "+" : ""}
                  {qty(r.quantity)}
                </span>
              ),
            },
            { key: "reason", label: "Reason" },
            { key: "actor", label: "Employee" },
          ]}
        />
      ) : (
        <>
          <div className="filter-tabs">
            {[
              ["all", "All"],
              ["low", "Low stock"],
              ["expired", "Expired"],
            ].map(([v, l]) => (
              <button
                className={filter === v ? "active" : ""}
                key={v}
                onClick={() => setFilter(v)}
              >
                {t(l)}
              </button>
            ))}
          </div>
          <DataTable
            rows={rows}
            exportName="inventory"
            columns={[
              {
                key: "name",
                label: "Product",
                render: (r) => <strong>{r.name}</strong>,
              },
              { key: "batch", label: "Batch" },
              {
                key: "quantity",
                label: "On hand",
                render: (r) => `${qty(r.quantity)} ${t(r.unit ?? "piece")}`,
              },
              { key: "cost", label: "Cost", render: (r) => money(r.cost) },
              {
                key: "expires",
                label: "Expiry date",
                render: (r) =>
                  r.expires ? (
                    <Badge tone={r.expires < today ? "red" : "amber"}>
                      {dateLabel(r.expires)}
                    </Badge>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "id",
                label: "Actions",
                render: (r) => (
                  <button
                    className="button secondary small"
                    onClick={() =>
                      setForm({
                        title: "Count stock",
                        description: r.name ?? "",
                        fields: [
                          {
                            key: "counted",
                            label: "Counted quantity",
                            type: "quantity",
                            required: true,
                          },
                          { key: "reason", label: "Reason", required: true },
                        ],
                        initial: { counted: decimal(r.quantity, 3) },
                        onSubmit: async (v) => {
                          await run("stock_adjust", {
                            ...v,
                            lot_id: r.id,
                            expected: r.quantity,
                          });
                        },
                      })
                    }
                  >
                    {t("Count stock")}
                    <ArrowRight size={13} />
                  </button>
                ),
              },
            ]}
          />
        </>
      )}
      {form && <FormModal spec={form} close={() => setForm(null)} />}
    </>
  );
}
