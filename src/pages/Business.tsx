import { useState } from "react";
import {
  Plus,
  ArrowUpRight,
  Pencil,
  FileText,
  Printer,
  Truck,
  Wallet,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useStore } from "../lib/context";
import {
  DataTable,
  PageHeader,
  FormModal,
  Modal,
  Badge,
  type FormSpec,
  type Field,
} from "../components/ui";
import { money, decimal, qty, dateLabel, parseFixed, sum } from "../lib/money";
import { command } from "../lib/api";
import type { Row, Receipt } from "../lib/types";
import { ReceiptView } from "./POS";
import { options } from "./Catalog";
const paymentOptions = [
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];
export function Parties() {
  const { data: d, page, t, run, notify } = useStore();
  const [form, setForm] = useState<FormSpec | null>(null);
  const [statement, setStatement] = useState<Row | null>(null);
  const customer = page !== "suppliers";
  const debt = page === "debts";
  const rows = (customer ? d.customers : d.suppliers).filter(
    (r) => !debt || BigInt(r.balance ?? "0") > 0n,
  );
  const edit = (r?: Row) =>
    setForm({
      title: customer
        ? r
          ? "Edit customer"
          : "Add customer"
        : r
          ? "Edit supplier"
          : "Add supplier",
      fields: [
        { key: "name", label: "Name", required: true },
        { key: "phone", label: "Phone" },
        { key: "address", label: "Address", full: true },
        { key: "notes", label: "Notes", type: "textarea", full: true },
        ...(customer
          ? ([
              { key: "credit_limit", label: "Credit limit", type: "money" },
            ] as Field[])
          : []),
        ...(!r
          ? ([
              {
                key: "opening_balance",
                label: "Opening balance",
                type: "money",
              },
            ] as Field[])
          : []),
      ],
      initial: r
        ? {
            name: r.name ?? "",
            phone: r.phone ?? "",
            address: r.address ?? "",
            notes: r.notes ?? "",
            credit_limit: decimal(r.credit_limit),
          }
        : { credit_limit: "0", opening_balance: "0" },
      onSubmit: async (v) => {
        await run(customer ? "customer_save" : "supplier_save", {
          ...v,
          id: r?.id ?? "",
        });
      },
    });
  const pay = (r: Row) =>
    setForm({
      title: "Record payment",
      description: r.name ?? "",
      fields: [
        { key: "amount", label: "Amount", type: "money", required: true },
        {
          key: "method",
          label: "Payment method",
          type: "select",
          options: paymentOptions,
        },
      ],
      initial: { amount: decimal(r.balance) },
      onSubmit: async (v) => {
        await run(customer ? "customer_payment" : "supplier_payment", {
          ...v,
          id: r.id,
        });
        notify("Payment recorded");
      },
    });
  return (
    <>
      <PageHeader
        title={debt ? "Customer debts" : customer ? "Customers" : "Suppliers"}
        description={
          customer
            ? "Good relationships start with clear accounts."
            : "Your supply partners and purchasing balances."
        }
      >
        <button className="button" onClick={() => edit()}>
          <Plus size={16} />
          {t(customer ? "Add customer" : "Add supplier")}
        </button>
      </PageHeader>
      <div className="account-summary">
        <div>
          <span>{t(customer ? "Customers" : "Suppliers")}</span>
          <strong>{rows.length}</strong>
        </div>
        <div>
          <span>{t("Outstanding")}</span>
          <strong>
            {money(sum(rows, "balance"))} <small>AFN</small>
          </strong>
        </div>
      </div>
      <DataTable
        rows={rows}
        exportName={customer ? "customers" : "suppliers"}
        columns={[
          {
            key: "name",
            label: "Name",
            render: (r) => (
              <div className="name-cell">
                <span className="initial-avatar">
                  {r.name?.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <strong>{r.name}</strong>
                  <small>{r.address || "—"}</small>
                </div>
              </div>
            ),
          },
          { key: "phone", label: "Phone" },
          { key: "orders", label: customer ? "Transactions" : "Purchases" },
          {
            key: "balance",
            label: "Outstanding",
            render: (r) => (
              <strong
                className={
                  BigInt(r.balance ?? "0") > 0 ? "negative" : "positive"
                }
              >
                {money(r.balance)} AFN
              </strong>
            ),
          },
          ...(customer
            ? [
                {
                  key: "credit_limit",
                  label: "Credit limit",
                  render: (r: Row) => money(r.credit_limit),
                },
              ]
            : []),
          {
            key: "id",
            label: "Actions",
            render: (r) => (
              <div className="row-actions">
                <button
                  className="icon-button"
                  aria-label={t("Edit")}
                  onClick={() => edit(r)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={t("Statement")}
                  onClick={() => setStatement(r)}
                >
                  <FileText size={16} />
                </button>
                <button
                  className="button secondary small"
                  disabled={BigInt(r.balance ?? "0") <= 0n}
                  onClick={() => pay(r)}
                >
                  {t("Record payment")}
                  <ArrowUpRight size={13} />
                </button>
              </div>
            ),
          },
        ]}
      />
      {form && <FormModal spec={form} close={() => setForm(null)} />}{" "}
      {statement && (
        <Modal
          title={`${t("Statement")} · ${statement.name}`}
          close={() => setStatement(null)}
          wide
        >
          <div className="print-area">
            <div className="statement-header">
              <h2>{d.settings.store_name}</h2>
              <p>
                {statement.name} · {statement.phone}
              </p>
              <strong>
                {t("Outstanding")}: {money(statement.balance)} AFN
              </strong>
            </div>
            <DataTable
              rows={(customer ? d.customer_ledger : d.supplier_ledger).filter(
                (r) =>
                  r[customer ? "customer_id" : "supplier_id"] === statement.id,
              )}
              search={false}
              exportName="statement"
              columns={[
                {
                  key: "created_at",
                  label: "Date",
                  render: (r) => dateLabel(r.created_at),
                },
                { key: "kind", label: "Description" },
                { key: "sale_number", label: "Receipt" },
                {
                  key: "amount",
                  label: "Amount",
                  render: (r) => money(r.amount),
                },
              ]}
            />
          </div>
          <div className="modal-footer">
            <button className="button" onClick={() => window.print()}>
              <Printer size={16} />
              {t("Print")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function PurchaseForm({ close }: { close: () => void }) {
  const { data, t, run } = useStore();
  const [supplier, setSupplier] = useState(data.suppliers[0]?.id ?? "");
  const [invoice, setInvoice] = useState("");
  const [lines, setLines] = useState([
    {
      product_id: data.products[0]?.id ?? "",
      quantity: "1",
      cost: decimal(data.products[0]?.cost),
    },
  ]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={t("Create purchase order")} close={close} wide>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await run("purchase_save", {
              supplier_id: supplier,
              invoice,
              items: lines.map((l) => ({
                ...l,
                quantity: parseFixed(l.quantity, 3),
                cost: parseFixed(l.cost),
              })),
            });
            close();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label>
            {t("Supplier")}
            <select
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            >
              {data.suppliers.map((s) => (
                <option key={s.id} value={s.id ?? ""}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Invoice number")}
            <input
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
            />
          </label>
        </div>
        <div className="purchase-lines">
          {lines.map((line, i) => (
            <div key={i}>
              <label>
                {t("Product")}
                <select
                  value={line.product_id}
                  onChange={(e) =>
                    setLines(
                      lines.map((l, j) =>
                        i === j
                          ? {
                              ...l,
                              product_id: e.target.value,
                              cost: decimal(
                                data.products.find(
                                  (p) => p.id === e.target.value,
                                )?.cost,
                              ),
                            }
                          : l,
                      ),
                    )
                  }
                >
                  {data.products.map((p) => (
                    <option value={p.id ?? ""} key={p.id}>
                      {p.name} ({t(p.unit ?? "piece")})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Quantity")}
                <input
                  value={line.quantity}
                  onChange={(e) =>
                    setLines(
                      lines.map((l, j) =>
                        i === j ? { ...l, quantity: e.target.value } : l,
                      ),
                    )
                  }
                />
              </label>
              <label>
                {t("Cost")}
                <input
                  value={line.cost}
                  onChange={(e) =>
                    setLines(
                      lines.map((l, j) =>
                        i === j ? { ...l, cost: e.target.value } : l,
                      ),
                    )
                  }
                />
              </label>
              <button
                className="icon-button"
                type="button"
                aria-label="Remove line"
                disabled={lines.length === 1}
                onClick={() => setLines(lines.filter((_, j) => j !== i))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            className="text-button"
            type="button"
            onClick={() =>
              setLines([
                ...lines,
                {
                  product_id: data.products[0]?.id ?? "",
                  quantity: "1",
                  cost: decimal(data.products[0]?.cost),
                },
              ])
            }
          >
            <Plus size={15} />
            {t("Add product")}
          </button>
        </div>
        {error && <div className="error-box">{error}</div>}
        <div className="modal-footer">
          <button
            className="button"
            disabled={busy || !supplier || !lines.length}
          >
            {t("Create purchase order")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Purchases() {
  const { data: d, t, run } = useStore();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<FormSpec | null>(null);
  const purchase = d.purchases.find((p) => p.id === selected);
  return (
    <>
      <PageHeader
        title="Purchases"
        description="From purchase order to shelf, stay in control."
      >
        <button
          className="button"
          onClick={() => setAdding(true)}
          disabled={!d.suppliers.length || !d.products.length}
        >
          <Plus size={16} />
          {t("New purchase")}
        </button>
      </PageHeader>
      {(!d.suppliers.length || !d.products.length) && (
        <div className="notice-inline">
          {t("Add products and a supplier before creating a purchase order.")}
        </div>
      )}
      <DataTable
        rows={d.purchases}
        exportName="purchases"
        columns={[
          {
            key: "number",
            label: "Purchase orders",
            render: (r) => (
              <div className="name-cell">
                <span className="stat-icon purple">
                  <Truck size={18} />
                </span>
                <strong>{r.number}</strong>
              </div>
            ),
          },
          { key: "supplier", label: "Supplier" },
          { key: "invoice", label: "Invoice number" },
          {
            key: "created_at",
            label: "Date",
            render: (r) => dateLabel(r.created_at),
          },
          {
            key: "total",
            label: "Total",
            render: (r) => `${money(r.total)} AFN`,
          },
          {
            key: "status",
            label: "Status",
            render: (r) => (
              <Badge tone={r.status === "received" ? "green" : "amber"}>
                {t(
                  r.status === "received"
                    ? "Received"
                    : r.status === "partial"
                      ? "Partially received"
                      : "Ordered",
                )}
              </Badge>
            ),
          },
          {
            key: "id",
            label: "Actions",
            render: (r) => (
              <button
                className="button secondary small"
                onClick={() => setSelected(r.id)}
              >
                {t("View order")}
                <ArrowUpRight size={13} />
              </button>
            ),
          },
        ]}
      />
      {adding && <PurchaseForm close={() => setAdding(false)} />}{" "}
      {purchase && !form && (
        <Modal
          title={`${purchase.number} · ${purchase.supplier}`}
          close={() => setSelected(null)}
          wide
        >
          <DataTable
            search={false}
            rows={d.purchase_items.filter((i) => i.purchase_id === purchase.id)}
            columns={[
              { key: "name", label: "Product" },
              {
                key: "quantity",
                label: "Ordered",
                render: (r) => qty(r.quantity),
              },
              {
                key: "received",
                label: "Received",
                render: (r) => qty(r.received),
              },
              { key: "cost", label: "Cost", render: (r) => money(r.cost) },
              {
                key: "id",
                label: "Actions",
                render: (r) => (
                  <button
                    className="button secondary small"
                    disabled={r.quantity === r.received}
                    onClick={() =>
                      setForm({
                        title: "Receive delivery",
                        description: r.name ?? "",
                        fields: [
                          {
                            key: "quantity",
                            label: "Quantity",
                            type: "quantity",
                            required: true,
                          },
                          { key: "batch", label: "Batch", required: true },
                          {
                            key: "expires",
                            label: "Expiry date",
                            type: "date",
                          },
                        ],
                        initial: {
                          quantity: decimal(
                            (
                              BigInt(r.quantity ?? "0") -
                              BigInt(r.received ?? "0")
                            ).toString(),
                            3,
                          ),
                        },
                        onSubmit: async (v) => {
                          await run("purchase_receive", {
                            ...v,
                            item_id: r.id,
                          });
                        },
                      })
                    }
                  >
                    {t("Receive delivery")}
                  </button>
                ),
              },
            ]}
          />
          <div className="modal-body">
            <h3>{t("Received")}</h3>
            {d.purchase_receipts
              .filter((r) => r.purchase_id === purchase.id)
              .map((r) => (
                <div className="held-row" key={r.id}>
                  <div>
                    <strong>{r.name}</strong>
                    <small>
                      {r.batch} · {qty(r.quantity)} {t(r.unit ?? "piece")}
                    </small>
                  </div>
                  <button
                    className="button secondary small"
                    onClick={() =>
                      setForm({
                        title: "Supplier return",
                        description: r.name ?? "",
                        fields: [
                          {
                            key: "quantity",
                            label: "Quantity",
                            type: "quantity",
                            required: true,
                          },
                          { key: "reason", label: "Reason", required: true },
                        ],
                        onSubmit: async (v) => {
                          await run("supplier_return", {
                            ...v,
                            receipt_id: r.id,
                          });
                        },
                      })
                    }
                  >
                    <RotateCcw size={13} />
                    {t("Supplier return")}
                  </button>
                </div>
              ))}
          </div>
        </Modal>
      )}
      {form && <FormModal spec={form} close={() => setForm(null)} />}
    </>
  );
}
export function Sales() {
  const { data: d, t, page, run, notify, can } = useStore();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [form, setForm] = useState<FormSpec | null>(null);
  const [returnSale, setReturnSale] = useState<Receipt | null>(null);
  async function load(id: string, returns = false) {
    try {
      const r = await command<Receipt>("receipt", { id });
      if (returns) setReturnSale(r);
      else setReceipt(r);
    } catch (e) {
      notify(String(e), true);
    }
  }
  return (
    <>
      <PageHeader
        title={page === "returns" ? "Returns" : "Sales history"}
        description={
          page === "returns"
            ? "Handle returns carefully. Keep the original sale intact."
            : "Every transaction, with the details that matter."
        }
      />
      {page === "returns" && (
        <DataTable
          rows={d.returns}
          exportName="returns"
          columns={[
            { key: "receipt", label: "Receipt" },
            { key: "product", label: "Product" },
            {
              key: "quantity",
              label: "Quantity",
              render: (r) => qty(r.quantity),
            },
            { key: "amount", label: "Refunds", render: (r) => money(r.amount) },
            { key: "reason", label: "Reason" },
            {
              key: "created_at",
              label: "Date",
              render: (r) => dateLabel(r.created_at),
            },
          ]}
        />
      )}
      <DataTable
        rows={d.sales}
        exportName="sales"
        columns={[
          {
            key: "number",
            label: "Receipt",
            render: (r) => <strong>{r.number}</strong>,
          },
          {
            key: "created_at",
            label: "Date",
            render: (r) => dateLabel(r.created_at, "gregory", true),
          },
          {
            key: "customer",
            label: "Customer",
            render: (r) => t(r.customer ?? "Walk-in customer"),
          },
          { key: "cashier", label: "Cashier" },
          {
            key: "total",
            label: "Total",
            render: (r) => `${money(r.total)} AFN`,
          },
          {
            key: "debt",
            label: "Status",
            render: (r) => (
              <Badge
                tone={
                  BigInt(r.refunded ?? "0") > 0n
                    ? "amber"
                    : BigInt(r.debt ?? "0") > 0n
                      ? "blue"
                      : "green"
                }
              >
                {t(
                  BigInt(r.refunded ?? "0") > 0n
                    ? "Returned"
                    : BigInt(r.debt ?? "0") > 0n
                      ? "Credit"
                      : "Paid",
                )}
              </Badge>
            ),
          },
          {
            key: "id",
            label: "Actions",
            render: (r) => (
              <div className="row-actions">
                <button
                  className="icon-button"
                  aria-label={t("Receipt")}
                  onClick={() => void load(r.id ?? "")}
                >
                  <FileText size={16} />
                </button>
                {can("refund") && (
                  <button
                    className="button secondary small"
                    onClick={() => void load(r.id ?? "", true)}
                  >
                    {t("Return items")}
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />
      {receipt && (
        <ReceiptView receipt={receipt} close={() => setReceipt(null)} />
      )}{" "}
      {returnSale && !form && (
        <Modal
          title={`${t("Return items")} · ${returnSale.sale.number}`}
          close={() => setReturnSale(null)}
          wide
        >
          <DataTable
            search={false}
            rows={returnSale.items}
            columns={[
              { key: "name", label: "Product" },
              {
                key: "quantity",
                label: "Quantity",
                render: (r) => qty(r.quantity),
              },
              {
                key: "returned",
                label: "Returned",
                render: (r) => qty(r.returned),
              },
              {
                key: "id",
                label: "Actions",
                render: (r) => (
                  <button
                    className="button secondary small"
                    disabled={
                      BigInt(r.returned ?? "0") >= BigInt(r.quantity ?? "0")
                    }
                    onClick={() =>
                      setForm({
                        title: "Process return",
                        description: r.name ?? "",
                        fields: [
                          {
                            key: "quantity",
                            label: "Quantity",
                            type: "quantity",
                            required: true,
                          },
                          {
                            key: "reason",
                            label: "Refund reason",
                            required: true,
                          },
                          {
                            key: "method",
                            label: "Payment method",
                            type: "select",
                            options: paymentOptions,
                          },
                          {
                            key: "restock",
                            label: "Restock sellable goods",
                            type: "select",
                            options: [
                              { value: "true", label: "Yes" },
                              { value: "false", label: "No" },
                            ],
                          },
                        ],
                        initial: {
                          quantity: decimal(
                            (
                              BigInt(r.quantity ?? "0") -
                              BigInt(r.returned ?? "0")
                            ).toString(),
                            3,
                          ),
                        },
                        onSubmit: async (v) => {
                          await run("return", {
                            ...v,
                            item_id: r.id,
                            restock: v.restock === "true",
                          });
                          setReturnSale(null);
                          notify("Return recorded");
                        },
                      })
                    }
                  >
                    {t("Return items")}
                  </button>
                ),
              },
            ]}
          />
        </Modal>
      )}
      {form && <FormModal spec={form} close={() => setForm(null)} />}
    </>
  );
}
export function Finance() {
  const { data: d, t, page, run } = useStore();
  const [form, setForm] = useState<FormSpec | null>(null);
  const register = d.registers.find((r) => !r.closed_at);
  return (
    <>
      <PageHeader
        title={page === "expenses" ? "Expenses" : "Cash register"}
        description={
          page === "expenses"
            ? "Keep everyday costs visible and accounted for."
            : "Open, track, and reconcile your cash drawer."
        }
      >
        {page === "expenses" ? (
          <button
            className="button"
            onClick={() =>
              setForm({
                title: "Record expense",
                fields: [
                  {
                    key: "category",
                    label: "Category",
                    type: "select",
                    options: [
                      "Utilities",
                      "Rent",
                      "Transport",
                      "Wages",
                      "Maintenance",
                      "Other",
                    ].map((v) => ({ value: v, label: v })),
                  },
                  {
                    key: "amount",
                    label: "Amount",
                    type: "money",
                    required: true,
                  },
                  {
                    key: "description",
                    label: "Description",
                    required: true,
                    full: true,
                  },
                  {
                    key: "method",
                    label: "Payment method",
                    type: "select",
                    options: paymentOptions,
                  },
                ],
                onSubmit: async (v) => {
                  await run("expense", v);
                },
              })
            }
          >
            <Plus size={16} />
            {t("Record expense")}
          </button>
        ) : !register ? (
          <button
            className="button"
            onClick={() =>
              setForm({
                title: "Open register",
                fields: [
                  {
                    key: "opening",
                    label: "Opening cash",
                    type: "money",
                    required: true,
                  },
                ],
                initial: { opening: "0" },
                onSubmit: async (v) => {
                  await run("register_open", v);
                },
              })
            }
          >
            <Wallet size={17} />
            {t("Open register")}
          </button>
        ) : (
          <>
            <button
              className="button secondary"
              onClick={() =>
                setForm({
                  title: "Cash movement",
                  fields: [
                    {
                      key: "direction",
                      label: "Type",
                      type: "select",
                      options: [
                        { value: "deposit", label: "Deposit" },
                        { value: "withdrawal", label: "Withdrawal" },
                      ],
                    },
                    {
                      key: "amount",
                      label: "Amount",
                      type: "money",
                      required: true,
                    },
                    {
                      key: "reason",
                      label: "Reason",
                      required: true,
                      full: true,
                    },
                  ],
                  onSubmit: async (v) => {
                    await run("cash_move", v);
                  },
                })
              }
            >
              {t("Cash movement")}
            </button>
            <button
              className="button"
              onClick={() =>
                setForm({
                  title: "Close register",
                  description: `${t("Expected cash")}: ${money(register.current_expected)} AFN`,
                  fields: [
                    {
                      key: "counted",
                      label: "Counted cash",
                      type: "money",
                      required: true,
                    },
                    {
                      key: "notes",
                      label: "Notes",
                      type: "textarea",
                      full: true,
                    },
                  ],
                  onSubmit: async (v) => {
                    await run("register_close", { ...v, id: register.id });
                  },
                })
              }
            >
              {t("Close register")}
            </button>
          </>
        )}
      </PageHeader>
      {page === "expenses" ? (
        <DataTable
          rows={d.expenses}
          exportName="expenses"
          columns={[
            {
              key: "created_at",
              label: "Date",
              render: (r) => dateLabel(r.created_at),
            },
            { key: "category", label: "Category" },
            { key: "description", label: "Description" },
            {
              key: "amount",
              label: "Amount",
              render: (r) => `${money(r.amount)} AFN`,
            },
            {
              key: "method",
              label: "Payment method",
              render: (r) => t(r.method === "cash" ? "Cash" : "Other"),
            },
            { key: "actor", label: "Employee" },
          ]}
        />
      ) : (
        <>
          {register && (
            <div className="register-hero">
              <div className="stat-icon green">
                <Wallet size={27} />
              </div>
              <div>
                <Badge tone="green">{t("Open")}</Badge>
                <h2>
                  {money(register.current_expected)} <small>AFN</small>
                </h2>
                <p>
                  {t("Expected cash")} · {register.cashier}
                </p>
              </div>
              <div>
                <span>{t("Opening cash")}</span>
                <strong>{money(register.opening)} AFN</strong>
              </div>
              <div>
                <span>{t("Date")}</span>
                <strong>
                  {dateLabel(register.opened_at, "gregory", true)}
                </strong>
              </div>
            </div>
          )}
          <div className="section-title">
            <h2>{t("Cash movement")}</h2>
          </div>
          <DataTable
            rows={d.cash_movements.filter(
              (m) => !register || m.session_id === register.id,
            )}
            exportName="cash-movements"
            columns={[
              {
                key: "created_at",
                label: "Date",
                render: (r) => dateLabel(r.created_at, "gregory", true),
              },
              { key: "kind", label: "Description" },
              {
                key: "amount",
                label: "Amount",
                render: (r) => (
                  <strong
                    className={
                      BigInt(r.amount ?? "0") >= 0 ? "positive" : "negative"
                    }
                  >
                    {money(r.amount)} AFN
                  </strong>
                ),
              },
              { key: "actor", label: "Employee" },
            ]}
          />
          <div className="section-title">
            <h2>{t("Register history")}</h2>
          </div>
          <DataTable
            rows={d.registers}
            exportName="registers"
            columns={[
              {
                key: "opened_at",
                label: "Date",
                render: (r) => dateLabel(r.opened_at),
              },
              { key: "cashier", label: "Cashier" },
              {
                key: "opening",
                label: "Opening cash",
                render: (r) => money(r.opening),
              },
              {
                key: "expected",
                label: "Expected cash",
                render: (r) => money(r.expected ?? r.current_expected),
              },
              {
                key: "counted",
                label: "Counted cash",
                render: (r) => (r.counted ? money(r.counted) : "—"),
              },
              {
                key: "closed_at",
                label: "Status",
                render: (r) => (
                  <Badge tone={r.closed_at ? "neutral" : "green"}>
                    {t(r.closed_at ? "Closed" : "Open")}
                  </Badge>
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
