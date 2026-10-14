import { useEffect, useRef, useState } from "react";
import {
  Barcode,
  Search,
  Plus,
  Minus,
  Trash2,
  Pause,
  ShoppingBasket,
  ArrowRight,
  Check,
  Printer,
  X,
  ReceiptText,
} from "lucide-react";
import { useStore } from "../lib/context";
import { command, AppError } from "../lib/api";
import { money, qty, parseFixed, decimal, dateLabel } from "../lib/money";
import type { CartItem, Quote, Receipt, Row } from "../lib/types";
import { ProductIcon } from "../components/ProductIcon";
import { CustomerPicker } from "../components/CustomerPicker";
import { Modal, Empty, Badge } from "../components/ui";
export function ReceiptView({
  receipt,
  close,
}: {
  receipt: Receipt;
  close: () => void;
}) {
  const { data, t } = useStore();
  return (
    <Modal title={t("Receipt")} close={close}>
      <div
        className={`receipt-paper print-area width-${data.settings.receipt_width}`}
      >
        {data.settings.logo ? (
          <img
            className="receipt-logo"
            src={data.settings.logo}
            alt={data.settings.store_name}
          />
        ) : (
          <ShoppingBasket size={26} />
        )}
        <h2>{data.settings.store_name}</h2>
        <p>
          {data.settings.address}
          <br />
          <bdi dir="ltr">{data.settings.phone}</bdi>
        </p>
        <div className="receipt-rule" />
        <p>
          <strong dir="ltr">{receipt.sale.number}</strong>
          <br />
          {dateLabel(
            receipt.sale.created_at,
            data.settings.date_calendar,
            true,
          )}
          <br />
          {t("Cashier")}: {receipt.sale.cashier}
          <br />
          {t("Customer")}: {receipt.sale.customer || t("Walk-in customer")}
        </p>
        <div className="receipt-rule" />
        {receipt.items.map((i) => (
          <div className="receipt-item" key={i.id}>
            <div>
              <strong>
                {data.settings.language === "fa" && i.name_dari
                  ? i.name_dari
                  : i.name}
              </strong>
              <small dir="ltr">
                {qty(i.quantity)} × {money(i.price)}
              </small>
            </div>
            <b>{money(i.total)}</b>
          </div>
        ))}
        <div className="receipt-rule" />
        {[
          ["Subtotal", receipt.sale.subtotal],
          ["Discount", receipt.sale.discount],
          ["Tax", receipt.sale.tax],
          ["Total", receipt.sale.total],
          ["Amount tendered", receipt.sale.tendered],
          ["Change", receipt.sale.change_due],
          ["Outstanding", receipt.sale.debt],
        ].map(([k, v]) => (
          <div
            className={k === "Total" ? "receipt-total" : "receipt-row"}
            key={k}
          >
            <span>{t(k ?? "")}</span>
            <strong dir="ltr">{money(v)} AFN</strong>
          </div>
        ))}
        <div className="receipt-rule" />
        {receipt.payments.map((p) => (
          <div className="receipt-row" key={p.id}>
            <span>{t(p.method === "cash" ? "Cash" : "Other")}</span>
            <strong dir="ltr">{money(p.amount)} AFN</strong>
          </div>
        ))}
        <p>{t(data.settings.receipt_footer)}</p>
        <small>{t("Powered by Radefy POS")}</small>
      </div>
      <div className="modal-footer no-print">
        <button className="button secondary" onClick={close}>
          {t("Close")}
        </button>
        <button className="button" onClick={() => window.print()}>
          <Printer size={16} />
          {t("Print receipt")}
        </button>
      </div>
    </Modal>
  );
}
export function POS() {
  const { data, t, run, notify, can, page } = useStore();
  const [recovery] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("radefy-pending-" + data.mode) || "null",
      ) as PendingSale | null;
    } catch {
      return null;
    }
  });
  const [uncertain, setUncertain] = useState(!!recovery);
  const [items, setItems] = useState<CartItem[]>(recovery?.items ?? []);
  const [search, setSearch] = useState("");
  const [scan, setScan] = useState("");
  const [category, setCategory] = useState("");
  const [discount, setDiscount] = useState(decimal(recovery?.discount ?? "0"));
  const [customer, setCustomer] = useState(recovery?.customer_id ?? "");
  const [cash, setCash] = useState<string | null>(
    recovery ? decimal(recovery.cash) : null,
  );
  const [other, setOther] = useState(decimal(recovery?.other ?? "0"));
  const [pending, setPending] = useState<PendingSale | null>(recovery);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState(false);
  const [heldId, setHeldId] = useState("");
  const [error, setError] = useState(
    recovery
      ? "A sale was interrupted. Retry to recover its result without charging twice."
      : "",
  );
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!recovery) return;
    let live = true;
    void command<Receipt | null>("request_status", {
      request_id: recovery.request_id,
    })
      .then((result) => {
        if (!live) return;
        if (result) {
          setReceipt(result);
          clear(false);
        } else {
          setUncertain(false);
          setPending(null);
          localStorage.removeItem("radefy-pending-" + data.mode);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (page === "pos") input.current?.focus();
  }, [page]);
  const register = data.registers.find((r) => !r.closed_at);
  const decimalOrNull = (text: string) => {
    try {
      return parseFixed(text || "0");
    } catch {
      return null;
    }
  };
  const discountMinor = decimalOrNull(discount);
  useEffect(() => {
    let current = true;
    setQuote(null);
    if (!items.length || discountMinor === null) return;
    void command<Quote>("quote", { items, discount: discountMinor })
      .then((q) => {
        if (current) {
          setQuote(q);
          setError("");
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [items, discountMinor]);
  function add(product: Row, amount = "1000") {
    if (busy || uncertain) return;
    const existing = items.find((i) => i.product_id === product.id);
    const amountNext = BigInt(existing?.quantity ?? "0") + BigInt(amount);
    if (amountNext > BigInt(product.available ?? "0")) {
      notify("Not enough available stock.", true);
      return;
    }
    setItems((old) =>
      existing
        ? old.map((i) =>
            i.product_id === product.id
              ? { ...i, quantity: amountNext.toString() }
              : i,
          )
        : [...old, { product_id: product.id ?? "", quantity: amount }],
    );
    setError("");
  }
  function change(productId: string, value: string) {
    if (busy || uncertain) return;
    try {
      const n = parseFixed(value, 3);
      setItems((old) =>
        BigInt(n) > 0n
          ? old.map((i) =>
              i.product_id === productId ? { ...i, quantity: n } : i,
            )
          : old.filter((i) => i.product_id !== productId),
      );
    } catch {
      notify("Enter a valid quantity.", true);
    }
  }
  function clear(focusScanner = true) {
    setUncertain(false);
    setPending(null);
    localStorage.removeItem("radefy-pending-" + data.mode);
    setItems([]);
    setCash(null);
    setDiscount("0");
    setOther("0");
    setCustomer("");
    setHeldId("");
    setError("");
    if (focusScanner) input.current?.focus();
  }
  async function complete() {
    if (!quote || busy) return;
    setBusy(true);
    setError("");
    try {
      const payload: PendingSale = pending ?? {
        request_id: crypto.randomUUID(),
        items,
        discount: discountMinor ?? "0",
        customer_id: customer,
        cash: parseFixed(cashValue || "0"),
        other: parseFixed(other || "0"),
        held_id: heldId,
      };
      localStorage.setItem(
        "radefy-pending-" + data.mode,
        JSON.stringify(payload),
      );
      setPending(payload);
      const result = await run<Receipt>("checkout", payload);
      setReceipt(result);
      clear(false);
      notify("Sale completed successfully");
    } catch (e) {
      const ambiguous =
        e instanceof AppError &&
        ["NETWORK", "WORKER", "STATE"].includes(e.code);
      setUncertain(ambiguous);
      if (!ambiguous) {
        setPending(null);
        localStorage.removeItem("radefy-pending-" + data.mode);
      }
      setError(
        ambiguous
          ? "The sale result is unknown. Retry the same sale to recover its receipt."
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setBusy(false);
    }
  }

  const otherMinor = decimalOrNull(other);
  const total = BigInt(quote?.total ?? "0");
  const remaining = total - BigInt(otherMinor ?? "0");
  // Until the cashier edits it, cash follows the quoted balance, including split payments.
  const cashValue =
    cash ?? decimal((remaining > 0n ? remaining : 0n).toString());
  const cashMinor = decimalOrNull(cashValue);
  const paid = BigInt(cashMinor ?? "0") + BigInt(otherMinor ?? "0");
  const changeDue = paid > total ? paid - total : 0n;
  const products = data.products.filter(
    (p) =>
      p.active === "1" &&
      (!category || p.category_id === category) &&
      `${p.name} ${p.name_dari} ${p.sku}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{t("Point of sale")}</h1>
          <p>{t("A good checkout makes a great impression.")}</p>
        </div>
        <button className="button secondary" onClick={() => setHeld(true)}>
          <Pause size={16} />
          {t("Held sales")}
          <span className="count-pill">{data.held.length}</span>
        </button>
      </div>
      <div className="pos-layout">
        <div className="pos-catalog">
          <form
            className="scan-field"
            onSubmit={(e) => {
              e.preventDefault();
              const code = data.barcodes.find((b) => b.code === scan.trim());
              const product = data.products.find(
                (p) =>
                  (p.id === code?.product_id || p.sku === scan.trim()) &&
                  p.active === "1",
              );
              if (product) {
                add(product, code?.multiplier ?? "1000");
                setScan("");
              } else {
                notify(
                  "Unknown barcode. Register this product in Products first.",
                  true,
                );
              }
              input.current?.focus();
            }}
          >
            <Barcode size={24} />
            <input
              ref={input}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              placeholder={t("Scan barcode and press Enter")}
              aria-label={t("Barcode")}
              disabled={busy || uncertain}
            />
            <kbd>↵</kbd>
          </form>
          <div className="pos-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search products, SKU or barcode…")}
            />
          </div>
          <div className="category-chips">
            <button
              className={!category ? "active" : ""}
              onClick={() => setCategory("")}
            >
              {t("All products")}
            </button>
            {data.categories.map((c) => (
              <button
                className={category === c.id ? "active" : ""}
                key={c.id}
                onClick={() => setCategory(c.id ?? "")}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="product-grid">
            {products.map((p) => (
              <button
                className="product-tile"
                disabled={busy || uncertain || BigInt(p.available ?? "0") <= 0n}
                key={p.id}
                onClick={() => add(p)}
              >
                <div className="product-tile-top">
                  {p.image ? (
                    <img className="product-photo" src={p.image} alt="" />
                  ) : (
                    <ProductIcon category={p.category_id} />
                  )}
                  <span
                    className={
                      BigInt(p.available ?? "0") <= BigInt(p.min_stock ?? "0")
                        ? "stock-low"
                        : ""
                    }
                  >
                    {qty(p.available)} {t(p.unit ?? "piece")}
                  </span>
                </div>
                <strong>
                  {data.settings.language === "fa" && p.name_dari
                    ? p.name_dari
                    : p.name}
                </strong>
                <small>{p.category}</small>
                <div>
                  <b>
                    {money(p.price)} <span>AFN</span>
                  </b>
                  <span className="add-product">
                    <Plus size={15} />
                  </span>
                </div>
              </button>
            ))}
          </div>
          {products.length === 0 && <Empty />}
        </div>
        <section className="panel cart-panel">
          <div className="panel-heading">
            <h2>
              {t("Current sale")}{" "}
              <span className="count-pill">{items.length}</span>
            </h2>
            <button
              className="icon-button"
              onClick={() => clear()}
              disabled={busy || uncertain || !items.length}
              aria-label={t("Clear cart")}
            >
              <Trash2 size={17} />
            </button>
          </div>
          <div className="cart-customer">
            <CustomerPicker
              value={customer}
              onChange={setCustomer}
              disabled={busy || uncertain}
            />
          </div>
          <div className="cart-items">
            {items.length ? (
              items.map((item) => {
                const p = data.products.find((p) => p.id === item.product_id)!;
                return (
                  <div className="cart-item" key={item.product_id}>
                    <ProductIcon category={p.category_id} small />
                    <div className="cart-item-name">
                      <strong>{p.name}</strong>
                      <small>
                        {money(p.price)} AFN / {t(p.unit ?? "piece")}
                      </small>
                      <div className="quantity-control">
                        <button
                          disabled={busy || uncertain}
                          aria-label={`Decrease ${p.name}`}
                          onClick={() =>
                            change(
                              item.product_id,
                              decimal(
                                (BigInt(item.quantity) > 1000n
                                  ? BigInt(item.quantity) - 1000n
                                  : 0n
                                ).toString(),
                                3,
                              ),
                            )
                          }
                        >
                          <Minus size={12} />
                        </button>
                        <QuantityInput
                          label={`${t("Quantity")} ${p.name}`}
                          quantity={item.quantity}
                          disabled={busy || uncertain}
                          commit={(value) => change(item.product_id, value)}
                        />
                        <button
                          disabled={busy || uncertain}
                          aria-label={`Increase ${p.name}`}
                          onClick={() => add(p)}
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="cart-item-price">
                      <strong>
                        {money(
                          quote?.lines.find(
                            (l) => l.product_id === item.product_id,
                          )?.total,
                        )}
                      </strong>
                      <button
                        className="icon-button"
                        disabled={busy || uncertain}
                        aria-label={`Remove ${p.name}`}
                        onClick={() =>
                          setItems(
                            items.filter(
                              (i) => i.product_id !== item.product_id,
                            ),
                          )
                        }
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="cart-empty">
                <ShoppingBasket size={45} strokeWidth={1.2} />
                <h3>{t("Cart is empty")}</h3>
                <p>{t("Scan a barcode or select a product to begin.")}</p>
              </div>
            )}
          </div>
          <div className="cart-summary">
            <div>
              <span>{t("Subtotal")}</span>
              <strong>{money(quote?.subtotal)} AFN</strong>
            </div>
            <div>
              <label htmlFor="discount">{t("Discount")}</label>
              <span className="money-input">
                <input
                  id="discount"
                  disabled={busy || uncertain || !can("discount")}
                  inputMode="decimal"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
                AFN
              </span>
            </div>
            <div>
              <span>{t("Tax")}</span>
              <strong>{money(quote?.tax)} AFN</strong>
            </div>
            <div className="cart-total">
              <span>{t("Amount due")}</span>
              <strong>
                {money(quote?.total)} <small>AFN</small>
              </strong>
            </div>
            <div className="payment-inputs">
              <label>
                {t("Cash received")}
                <input
                  inputMode="decimal"
                  disabled={busy || uncertain}
                  value={cashValue}
                  onChange={(e) => setCash(e.target.value)}
                />
              </label>
              <label>
                {t("Other payment")}
                <input
                  inputMode="decimal"
                  disabled={busy || uncertain}
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                />
              </label>
            </div>
            <button
              className="text-button exact-cash"
              disabled={busy || uncertain || !quote}
              onClick={() => setCash(null)}
            >
              {t("Use exact cash")}
            </button>
            <div>
              <span>
                {t(paid < total && customer ? "Outstanding" : "Change")}
              </span>
              <strong>
                {money(
                  (paid < total && customer
                    ? total - paid
                    : changeDue
                  ).toString(),
                )}{" "}
                AFN
              </strong>
            </div>
            {!register && (
              <p className="notice-inline">
                {t("Open the cash register before accepting cash.")}
              </p>
            )}
            {!customer && quote && paid < total && (
              <p className="notice-inline" role="status">
                {t("Walk-in sales must be paid in full.")}
              </p>
            )}
            {error && (
              <p className="error-box" role="alert">
                {t(error)}
              </p>
            )}
            <button
              className="button checkout-button"
              disabled={
                busy ||
                !quote ||
                !items.length ||
                cashMinor === null ||
                otherMinor === null ||
                (!customer && paid < total)
              }
              onClick={() => void complete()}
            >
              <Check size={18} />
              {t(busy ? "Saving…" : "Complete sale")}
              <ArrowRight size={17} />
            </button>
            <button
              className="button secondary hold-button"
              disabled={!items.length || busy || uncertain || !quote}
              onClick={async () => {
                setBusy(true);
                try {
                  await run("hold", {
                    id: heldId,
                    name: `Sale ${new Date().toLocaleTimeString()}`,
                    cart: {
                      items,
                      discount: discountMinor,
                      customer_id: customer,
                    },
                  });
                  clear();
                  notify("Sale held");
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Pause size={15} />
              {t("Hold sale")}
            </button>
          </div>
        </section>
      </div>
      {receipt && (
        <ReceiptView receipt={receipt} close={() => setReceipt(null)} />
      )}{" "}
      {held && (
        <Modal title={t("Held sales")} close={() => setHeld(false)}>
          <div className="modal-body">
            {items.length > 0 && (
              <p className="notice-inline">
                {t(
                  "Clear or hold the current cart before resuming another sale.",
                )}
              </p>
            )}
            {data.held.length ? (
              data.held.map((h) => (
                <div className="held-row" key={h.id}>
                  <ReceiptText size={20} />
                  <div>
                    <strong>{h.name}</strong>
                    <small>{dateLabel(h.created_at, "gregory", true)}</small>
                  </div>
                  <button
                    className="button secondary small"
                    disabled={items.length > 0}
                    onClick={() => {
                      try {
                        const cart = JSON.parse(h.payload ?? "{}") as {
                          items: CartItem[];
                          discount: string;
                          customer_id: string;
                        };
                        setItems(cart.items);
                        setDiscount(decimal(cart.discount));
                        setCustomer(cart.customer_id || "");
                        setCash(null);
                        setOther("0");
                        setHeldId(h.id ?? "");
                        setHeld(false);
                      } catch {
                        notify("Unable to open held cart.", true);
                      }
                    }}
                  >
                    {t("Resume")}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={t("Cancel")}
                    onClick={() => {
                      void run("hold_delete", { id: h.id }).catch((e) =>
                        notify(String(e), true),
                      );
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            ) : (
              <Empty />
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

interface PendingSale extends Record<string, unknown> {
  request_id: string;
  items: CartItem[];
  discount: string;
  customer_id: string;
  cash: string;
  other: string;
  held_id: string;
}
function QuantityInput({
  label,
  quantity,
  disabled,
  commit,
}: {
  label: string;
  quantity: string;
  disabled: boolean;
  commit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(qty(quantity));
  useEffect(() => setDraft(qty(quantity)), [quantity]);
  return (
    <input
      aria-label={label}
      value={draft}
      inputMode="decimal"
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        commit(draft);
        setDraft(qty(quantity));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
