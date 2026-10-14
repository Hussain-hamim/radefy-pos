import { useState } from "react";
import { version } from "../../package.json";
import {
  Plus,
  ShieldCheck,
  Database,
  Download,
  Upload,
  CheckCircle2,
  Pencil,
  Printer,
  Save,
  FolderClock,
  LockKeyhole,
} from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readLocalImage } from "../lib/images";
import { useStore } from "../lib/context";
import {
  PageHeader,
  DataTable,
  FormModal,
  Modal,
  Badge,
  type FormSpec,
  type Column,
} from "../components/ui";
import { money, qty, dateLabel, businessDate } from "../lib/money";
import { command, desktop } from "../lib/api";
import type { Row } from "../lib/types";
export function Reports() {
  const { data: d, t } = useStore();
  const [tab, setTab] = useState("financial");
  const tabs = [
    "financial",
    "products",
    "categories",
    "payments",
    "collections",
    "inventory",
    "expiry",
    "customers",
    "suppliers",
    "cashiers",
    "purchases",
    "adjustments",
  ];
  const cols: { [key: string]: Column[] } = {
    categories: [
      { key: "name", label: "Category" },
      { key: "revenue", label: "Net sales", render: (r) => money(r.revenue) },
    ],
    collections: [
      { key: "name", label: "Customer" },
      { key: "amount", label: "Amount", render: (r) => money(r.amount) },
      { key: "method", label: "Payment method" },
      {
        key: "created_at",
        label: "Date",
        render: (r) => dateLabel(r.created_at),
      },
    ],
    expiry: [
      { key: "name", label: "Product" },
      { key: "batch", label: "Batch" },
      { key: "quantity", label: "Stock", render: (r) => qty(r.quantity) },
      {
        key: "expires",
        label: "Expiry date",
        render: (r) => dateLabel(r.expires),
      },
    ],
    products: [
      { key: "name", label: "Product" },
      { key: "quantity", label: "Quantity", render: (r) => qty(r.quantity) },
      { key: "revenue", label: "Sales", render: (r) => money(r.revenue) },
    ],
    payments: [
      { key: "method", label: "Payment method" },
      { key: "amount", label: "Amount", render: (r) => money(r.amount) },
    ],
    inventory: [
      { key: "name", label: "Product" },
      { key: "stock", label: "Stock", render: (r) => qty(r.stock) },
      { key: "available", label: "Available", render: (r) => qty(r.available) },
      {
        key: "valuation",
        label: "Inventory value",
        render: (r) => money(r.valuation),
      },
      {
        key: "next_expiry",
        label: "Expiry date",
        render: (r) => dateLabel(r.next_expiry),
      },
    ],
    customers: [
      { key: "name", label: "Customer" },
      { key: "balance", label: "Outstanding", render: (r) => money(r.balance) },
      { key: "orders", label: "Transactions" },
    ],
    suppliers: [
      { key: "name", label: "Supplier" },
      { key: "balance", label: "Outstanding", render: (r) => money(r.balance) },
      { key: "orders", label: "Purchases" },
    ],
    cashiers: [
      { key: "name", label: "Cashier" },
      { key: "transactions", label: "Transactions" },
      { key: "net_sales", label: "Sales", render: (r) => money(r.net_sales) },
    ],
    purchases: [
      { key: "number", label: "Purchase orders" },
      { key: "supplier", label: "Supplier" },
      { key: "total", label: "Total", render: (r) => money(r.total) },
      { key: "status", label: "Status" },
    ],
    adjustments: [
      { key: "name", label: "Product" },
      { key: "quantity", label: "Quantity", render: (r) => qty(r.quantity) },
      { key: "reason", label: "Reason" },
      {
        key: "created_at",
        label: "Date",
        render: (r) => dateLabel(r.created_at),
      },
    ],
  };
  const rows: Record<string, Row[]> = {
    categories: d.category_report,
    collections: d.collections,
    expiry: d.lots
      .filter((r) => !!r.expires && BigInt(r.quantity ?? "0") > 0n)
      .sort((a, b) => (a.expires ?? "").localeCompare(b.expires ?? "")),
    products: d.best_sellers,
    payments: d.payment_breakdown,
    inventory: d.products,
    customers: d.customers,
    suppliers: d.suppliers,
    cashiers: d.cashier_report,
    purchases: d.purchases.filter(
      (r) =>
        businessDate(r.created_at) >= d.from &&
        businessDate(r.created_at) <= d.to,
    ),
    adjustments: d.movements.filter(
      (r) =>
        r.reason?.startsWith("count:") &&
        businessDate(r.created_at) >= d.from &&
        businessDate(r.created_at) <= d.to,
    ),
  };
  const metrics = [
    ["gross_sales", "Gross sales"],
    ["discounts", "Discounts"],
    ["refunds", "Refunds"],
    ["sales", "Net sales"],
    ["tax", "Tax"],
    ["cogs", "Cost of goods sold"],
    ["gross_profit", "Gross profit"],
    ["expenses", "Expenses"],
    ["net_profit", "Operating profit"],
  ];
  return (
    <>
      <PageHeader
        title="Reports"
        description="Make confident decisions with a clear view of your store."
      >
        <button className="button secondary" onClick={() => window.print()}>
          <Printer size={16} />
          {t("Print report")}
        </button>
      </PageHeader>
      <div className="filter-tabs report-tabs no-print">
        {tabs.map((v) => (
          <button
            key={v}
            className={tab === v ? "active" : ""}
            onClick={() => setTab(v)}
          >
            {t(v[0].toUpperCase() + v.slice(1))}
          </button>
        ))}
      </div>
      <div className="print-area">
        <div className="print-heading">
          <h2>
            {d.settings.store_name} · {t("Reports")}
          </h2>
          <p>
            {dateLabel(d.from)} — {dateLabel(d.to)}
          </p>
        </div>
        {tab === "financial" ? (
          <>
            <div className="report-grid">
              {[
                ["sales", "Net sales", "coral"],
                ["gross_profit", "Gross profit", "green"],
                ["expenses", "Expenses", "purple"],
                ["net_profit", "Operating profit", "blue"],
              ].map(([key, label, color]) => (
                <div className={`report-stat ${color}`} key={key}>
                  <span>{t(label)}</span>
                  <strong>
                    {money(d.stats[key])}
                    <small> AFN</small>
                  </strong>
                  <p>
                    {dateLabel(d.from)} — {dateLabel(d.to)}
                  </p>
                </div>
              ))}
            </div>
            <DataTable
              search={false}
              exportName="financial-report"
              rows={metrics.map(([key, label]) => ({
                name: t(label),
                amount: d.stats[key] ?? "0",
              }))}
              columns={[
                { key: "name", label: "Description" },
                {
                  key: "amount",
                  label: "Amount",
                  render: (r) => <strong>{money(r.amount)} AFN</strong>,
                },
              ]}
            />
            <p className="report-note">
              {t(
                "Net sales exclude tax. Operating profit is gross profit less recorded expenses. Stock and account balances show their current position.",
              )}
            </p>
          </>
        ) : (
          <DataTable
            rows={rows[tab] ?? []}
            columns={cols[tab] ?? []}
            exportName={`${tab}-report`}
          />
        )}
      </div>
    </>
  );
}
export function Staff() {
  const { data: d, t, run } = useStore();
  const [form, setForm] = useState<FormSpec | null>(null);
  const [permissions, setPermissions] = useState(false);
  const [role, setRole] = useState("manager");
  const [selected, setSelected] = useState<string[]>(
    d.permissions
      .filter((p) => p.role === "manager")
      .map((p) => p.permission ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const edit = (r?: Row) =>
    setForm({
      title: r ? "Edit employee" : "Add employee",
      fields: [
        { key: "name", label: "Name", required: true },
        { key: "username", label: "Username", required: true },
        {
          key: "password",
          label: "Password",
          type: "password",
          required: !r,
          hint: r
            ? "Leave blank to keep the current password."
            : "At least 8 characters.",
        },
        {
          key: "role",
          label: "Role",
          type: "select",
          options: [
            "owner",
            "manager",
            "cashier",
            "inventory",
            "accountant",
          ].map((v) => ({ value: v, label: v })),
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
      ],
      initial: r
        ? {
            name: r.name ?? "",
            username: r.username ?? "",
            role: r.role ?? "",
            active: r.active ?? "1",
          }
        : { role: "cashier" },
      onSubmit: async (v) => {
        await run("user_save", { ...v, id: r?.id ?? "" });
      },
    });
  return (
    <>
      <PageHeader
        title="Staff & access"
        description="The right access for every member of your team."
      >
        <button
          className="button secondary"
          onClick={() => setPermissions(true)}
        >
          <LockKeyhole size={16} />
          {t("Permissions")}
        </button>
        <button className="button" onClick={() => edit()}>
          <Plus size={16} />
          {t("Add employee")}
        </button>
      </PageHeader>
      <DataTable
        rows={d.users}
        columns={[
          {
            key: "name",
            label: "Employee",
            render: (r) => (
              <div className="name-cell">
                <span className="initial-avatar">
                  {r.name?.slice(0, 2).toUpperCase()}
                </span>
                <strong>{r.name}</strong>
              </div>
            ),
          },
          { key: "username", label: "Username" },
          { key: "role", label: "Role", render: (r) => t(r.role ?? "") },
          {
            key: "active",
            label: "Status",
            render: (r) => (
              <Badge tone={r.active === "1" ? "green" : "neutral"}>
                {t(r.active === "1" ? "Active" : "Inactive")}
              </Badge>
            ),
          },
          {
            key: "id",
            label: "Actions",
            render: (r) => (
              <button
                className="icon-button"
                aria-label={t("Edit")}
                onClick={() => edit(r)}
              >
                <Pencil size={15} />
              </button>
            ),
          },
        ]}
      />
      <div className="section-title">
        <h2>{t("Audit log")}</h2>
        <p className="muted">{t("Latest 500 audit entries")}</p>
      </div>
      <DataTable
        rows={d.audit}
        exportName="audit"
        columns={[
          {
            key: "created_at",
            label: "Date",
            render: (r) => dateLabel(r.created_at, "gregory", true),
          },
          { key: "actor", label: "Employee" },
          { key: "action", label: "Actions" },
          {
            key: "detail",
            label: "Description",
            render: (r) => (
              <span className="truncate" title={r.detail ?? ""}>
                {r.detail}
              </span>
            ),
          },
        ]}
      />
      {form && <FormModal spec={form} close={() => setForm(null)} />}{" "}
      {permissions && (
        <Modal title={t("Permissions")} close={() => setPermissions(false)}>
          <div className="modal-body">
            <label>
              {t("Role")}
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setSelected(
                    d.permissions
                      .filter((p) => p.role === e.target.value)
                      .map((p) => p.permission ?? ""),
                  );
                }}
              >
                {["manager", "cashier", "inventory", "accountant"].map((v) => (
                  <option value={v} key={v}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </label>
            <div className="permission-grid">
              {[
                "sell",
                "discount",
                "catalog",
                "inventory",
                "purchase",
                "customers",
                "finance",
                "refund",
                "reports",
              ].map((v) => (
                <label key={v}>
                  <input
                    type="checkbox"
                    checked={selected.includes(v)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, v]
                          : selected.filter((p) => p !== v),
                      )
                    }
                  />
                  {t(v)}
                </label>
              ))}
            </div>
            {error && <p className="error-box">{error}</p>}
          </div>
          <div className="modal-footer">
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await run("permissions_save", {
                    role,
                    permissions: selected,
                  });
                  setPermissions(false);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Save changes")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Settings({ onRestored }: { onRestored: () => void }) {
  const { data: d, t, run, notify, refresh } = useStore();
  const [values, setValues] = useState(d.settings);
  const [busy, setBusy] = useState(false);
  const [path, setPath] = useState("");
  const [restorePath, setRestorePath] = useState("");
  const [error, setError] = useState("");
  const update = (key: string, value: string) =>
    setValues({ ...values, [key]: value });
  async function backup() {
    setBusy(true);
    try {
      const path = desktop
        ? await save({
            title: t("Create backup"),
            defaultPath: `radefy-backup-${new Date().toISOString().slice(0, 10)}.sqlite`,
            filters: [{ name: "SQLite backup", extensions: ["sqlite"] }],
          })
        : "";
      if (desktop && !path) return;
      const r = await command<{ path: string }>("backup", { path });
      setPath(r.path);
      await refresh();
      notify("Backup created successfully");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Settings"
        description="Make Radefy feel at home in your store."
      />
      <div className="settings-grid">
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await run("settings_save", values);
              notify("Settings saved");
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="panel-heading">
            <div>
              <h2>{t("Store details")}</h2>
              <p>{t("Your identity on every receipt")}</p>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div className="form-grid">
            <label className="full">
              {t("Store logo")}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  try {
                    const file = e.target.files?.[0];
                    if (file) update("logo", await readLocalImage(file));
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                }}
              />
              {values.logo && (
                <img
                  className="product-photo"
                  src={values.logo}
                  alt={t("Store logo")}
                />
              )}
            </label>
            {[
              ["store_name", "Store name"],
              ["phone", "Phone"],
              ["address", "Address"],
            ].map(([key, label]) => (
              <label key={key} className={key === "address" ? "full" : ""}>
                {t(label)}
                <input
                  value={values[key] ?? ""}
                  onChange={(e) => update(key, e.target.value)}
                  required={key === "store_name"}
                />
              </label>
            ))}
            <label>
              {t("Language")}
              <select
                value={values.language}
                onChange={(e) => update("language", e.target.value)}
              >
                <option value="en">English</option>
                <option value="fa">دری</option>
              </select>
            </label>
            <label>
              {t("Receipt width")}
              <select
                value={values.receipt_width}
                onChange={(e) => update("receipt_width", e.target.value)}
              >
                <option value="80">80 mm</option>
                <option value="58">58 mm</option>
              </select>
            </label>
            <label>
              {t("Date calendar")}
              <select
                value={values.date_calendar}
                onChange={(e) => update("date_calendar", e.target.value)}
              >
                <option value="gregory">Gregorian</option>
                <option value="persian">Solar Hijri / هجری خورشیدی</option>
              </select>
            </label>
            <label>
              {t("Enable product taxes")}
              <select
                value={values.tax_enabled}
                onChange={(e) => update("tax_enabled", e.target.value)}
              >
                <option value="0">{t("No")}</option>
                <option value="1">{t("Yes")}</option>
              </select>
            </label>
            <label className="full">
              {t("Receipt footer")}
              <textarea
                rows={3}
                value={values.receipt_footer ?? ""}
                onChange={(e) => update("receipt_footer", e.target.value)}
              />
            </label>
          </div>
          <div className="modal-footer">
            <button className="button" disabled={busy}>
              <Save size={16} />
              {t("Save settings")}
            </button>
          </div>
        </form>
        <div>
          <section className="panel backup-panel">
            <div className="panel-heading">
              <div>
                <h2>{t("Database & backups")}</h2>
                <p>{t("Back up your store regularly.")}</p>
              </div>
              <Database size={20} />
            </div>
            <div className="database-card">
              <span className="stat-icon green">
                <ShieldCheck size={23} />
              </span>
              <div>
                <strong>{t("Your data stays with you")}</strong>
                <p>{t("Stored locally. Available offline.")}</p>
              </div>
              <Badge tone="green">SQLite</Badge>
            </div>
            {d.settings.automatic_backup_error && (
              <p className="form-error" role="alert">
                {t("Automatic backup failed")}:{" "}
                {d.settings.automatic_backup_error}
              </p>
            )}
            <div className="backup-meta">
              <FolderClock size={18} />
              <div>
                <strong>{t("Last automatic backup")}</strong>
                <p>
                  {d.settings.last_automatic_backup
                    ? dateLabel(
                        d.settings.last_automatic_backup,
                        "gregory",
                        true,
                      )
                    : t("No backup yet")}
                </p>
              </div>
            </div>
            <div className="backup-meta">
              <FolderClock size={18} />
              <div>
                <strong>{t("Last manual backup")}</strong>
                <p>
                  {d.settings.last_backup
                    ? dateLabel(d.settings.last_backup, "gregory", true)
                    : t("No backup yet")}
                </p>
              </div>
            </div>
            <button
              className="button full-width"
              disabled={busy}
              onClick={() => void backup()}
            >
              <Download size={16} />
              {t("Create backup")}
            </button>
            <button
              className="button secondary full-width"
              disabled={busy || !desktop}
              title={
                !desktop ? "Available in the desktop application" : undefined
              }
              onClick={async () => {
                const selected = await open({
                  multiple: false,
                  filters: [{ name: "Radefy backup", extensions: ["sqlite"] }],
                });
                if (selected) setRestorePath(selected);
              }}
            >
              <Upload size={16} />
              {t("Restore backup")}
            </button>
            <button
              className="text-button integrity-button"
              onClick={async () => {
                try {
                  const result = await command<{ result: string }>("integrity");
                  notify(
                    result.result === "ok"
                      ? "Database integrity verified"
                      : result.result,
                  );
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              <CheckCircle2 size={15} />
              {t("Check integrity")}
            </button>
            {path && <p className="file-path">{path}</p>}
            <p className="subtle">
              {t(
                "Automatic daily backups are kept for 14 days while the desktop app is open.",
              )}
            </p>
          </section>
          <div className="version-note">
            Radefy POS <Badge>v{version}</Badge>
            <span>{t("Works offline")} · AFN · Asia/Kabul</span>
          </div>
        </div>
      </div>
      {error && (
        <div role="alert" className="error-box">
          {error}
        </div>
      )}
      {restorePath && (
        <Modal
          title={t("Restore backup")}
          description={t(
            "This replaces the current store. A recovery backup will be saved first. You will need to sign in again.",
          )}
          close={() => setRestorePath("")}
        >
          <div className="modal-body">
            <p className="file-path">{restorePath}</p>
          </div>
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={() => setRestorePath("")}
            >
              {t("Cancel")}
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await command("restore", { path: restorePath });
                  onRestored();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                  setRestorePath("");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Restore backup")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
