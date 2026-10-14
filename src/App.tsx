import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ShoppingBasket,
  Package,
  Tags,
  Boxes,
  ArrowLeftRight,
  Truck,
  ContactRound,
  Users,
  WalletCards,
  ReceiptText,
  RotateCcw,
  Coins,
  Wallet,
  ChartNoAxesCombined,
  Settings as SettingsIcon,
  ShieldCheck,
  Search,
  Bell,
  ChevronDown,
  Plus,
  CalendarDays,
  ArrowUpRight,
  Menu,
  LogOut,
  ChevronsUpDown,
  HardDrive,
  LoaderCircle,
  X,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { command, mutate, desktop } from "./lib/api";
import type { Status, Snapshot, Page, Payload } from "./lib/types";
import { translate } from "./lib/i18n";
import { Store } from "./lib/context";
import { Dashboard } from "./pages/Dashboard";
import { Catalog, Inventory } from "./pages/Catalog";
import { POS } from "./pages/POS";
import { Parties, Purchases, Sales, Finance } from "./pages/Business";
import { Reports, Staff, Settings } from "./pages/Admin";
import { today } from "./lib/money";
const nav = [
  {
    group: "WORKSPACE",
    items: [
      {
        id: "overview",
        label: "Overview",
        icon: LayoutDashboard,
        permission: "reports",
      },
      {
        id: "pos",
        label: "Point of sale",
        icon: ShoppingBasket,
        permission: "sell",
      },
      {
        id: "sales",
        label: "Sales history",
        icon: ReceiptText,
        permission: "sell",
      },
    ],
  },
  {
    group: "MANAGEMENT",
    items: [
      {
        id: "products",
        label: "Products",
        icon: Package,
        permission: "catalog",
      },
      {
        id: "categories",
        label: "Categories",
        icon: Tags,
        permission: "catalog",
      },
      {
        id: "inventory",
        label: "Inventory",
        icon: Boxes,
        permission: "inventory",
      },
      {
        id: "movements",
        label: "Stock movements",
        icon: ArrowLeftRight,
        permission: "inventory",
      },
      {
        id: "purchases",
        label: "Purchases",
        icon: Truck,
        permission: "purchase",
      },
      {
        id: "suppliers",
        label: "Suppliers",
        icon: ContactRound,
        permission: "purchase",
      },
      {
        id: "customers",
        label: "Customers",
        icon: Users,
        permission: "customers",
      },
      {
        id: "debts",
        label: "Customer debts",
        icon: WalletCards,
        permission: "customers",
      },
    ],
  },
  {
    group: "BUSINESS",
    items: [
      {
        id: "returns",
        label: "Returns",
        icon: RotateCcw,
        permission: "refund",
      },
      { id: "expenses", label: "Expenses", icon: Coins, permission: "finance" },
      {
        id: "register",
        label: "Cash register",
        icon: Wallet,
        permission: "finance",
      },
      {
        id: "reports",
        label: "Reports",
        icon: ChartNoAxesCombined,
        permission: "reports",
      },
    ],
  },
  {
    group: "SYSTEM",
    items: [
      {
        id: "staff",
        label: "Staff & access",
        icon: ShieldCheck,
        permission: "settings",
      },
      {
        id: "settings",
        label: "Settings",
        icon: SettingsIcon,
        permission: "settings",
      },
    ],
  },
];
export function App() {
  const client = useQueryClient();
  const [status, setStatus] = useState<Status | null>(null);
  const [gate, setGate] = useState<"choose" | "login" | "setup" | null>(null);
  const [startError, setStartError] = useState("");
  const [starting, setStarting] = useState(false);
  const [page, setPage] = useState<Page>("overview");
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [collapsed, setCollapsed] = useState(false);
  const [profile, setProfile] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [dates, setDates] = useState({ from: "", to: "" });
  const [draftDates, setDraftDates] = useState({ from: "", to: today() });
  const notify = useCallback(
    (text: string, error = false) => setToast({ text, error }),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);
  const refreshStatus = useCallback(async () => {
    const s = await command<Status>("status");
    setStatus(s);
    if (s.user) {
      setGate(null);
      setPage(
        s.user.role === "owner" || s.user.permissions.includes("reports")
          ? "overview"
          : s.user.permissions.includes("sell")
            ? "pos"
            : s.user.permissions.includes("catalog")
              ? "products"
              : "register",
      );
    } else {
      setGate(s.mode ? "login" : "choose");
    }
  }, []);
  useEffect(() => {
    void command<Status>("status")
      .then(async (s) => {
        if (!desktop && !s.user) {
          await command("open_store", { mode: "demo" });
        }
        await refreshStatus();
      })
      .catch((e) => setStartError(e.message));
  }, [refreshStatus]);
  const query = useQuery({
    queryKey: ["store", status?.mode, dates],
    queryFn: () => command<Snapshot>("snapshot", dates),
    enabled: !!status?.user,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const refresh = useCallback(async () => {
    await client.invalidateQueries({ queryKey: ["store"] });
  }, [client]);
  const run = useCallback(
    async <T,>(action: string, payload: Payload = {}): Promise<T> => {
      const result = await mutate<T>(action, payload);
      await refresh();
      return result;
    },
    [refresh],
  );
  const data = query.data;
  const language = data?.settings.language ?? status?.language ?? "en";
  const t = useCallback(
    (text: string) => translate(language, text),
    [language],
  );
  const can = useCallback(
    (p: string) =>
      data?.user.role === "owner" || !!data?.user.permissions.includes(p),
    [data?.user],
  );
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    document.documentElement.dir = language === "fa" ? "rtl" : "ltr";
    document.documentElement.lang = language === "fa" ? "fa-AF" : "en";
  }, [language]);
  async function openStore(mode: string) {
    setStarting(true);
    setStartError("");
    try {
      const r = await command<{ needs_setup: boolean }>("open_store", { mode });
      if (r.needs_setup) {
        setGate("setup");
        setStatus(await command<Status>("status"));
      } else {
        await refreshStatus();
      }
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }
  if (!status || gate || !data) {
    return (
      <div className="welcome">
        <div className="welcome-brand">
          <span className="logo-mark">
            <ShoppingBasket size={30} />
          </span>
          <span>
            radefy<span className="brand-dot">.</span>
            <small>SUPERMARKET MANAGER</small>
          </span>
        </div>
        <div className="welcome-card">
          {!gate && !startError ? (
            <>
              <LoaderCircle size={32} className="spin" />
              <h1>
                {query.error
                  ? "Unable to open your store"
                  : "Getting your store ready…"}
              </h1>
              {query.error && (
                <>
                  <p className="error-box">{query.error.message}</p>
                  <button className="button" onClick={() => void refresh()}>
                    Try again
                  </button>
                </>
              )}
            </>
          ) : gate === "choose" || (startError && !status) ? (
            <>
              <span className="eyebrow">YOUR STORE, IN ORDER</span>
              <h1>
                One store.
                <br />
                Everything together.
              </h1>
              <p>
                From your first sale to the end of the day.
                <br />
                Simple, reliable, and completely offline.
              </p>
              <button
                className="button welcome-primary"
                disabled={starting}
                onClick={() => void openStore("demo")}
              >
                Open demo store
                <ArrowRight size={18} />
              </button>
              <button
                className="button secondary welcome-primary"
                disabled={starting}
                onClick={() => void openStore("real")}
              >
                {status?.real_exists ? "Open my store" : "Set up my store"}
                <ArrowUpRight size={17} />
              </button>
              <small className="welcome-note">
                <ShieldCheck size={14} />
                Demo and real-store data stay separate.
              </small>
            </>
          ) : (
            <AccessForm
              language={language}
              setup={gate === "setup"}
              submit={async (v) => {
                await command(gate === "setup" ? "setup" : "login", v);
                await refreshStatus();
              }}
              back={() => setGate("choose")}
            />
          )}{" "}
          {startError && (
            <div className="error-box">
              {startError}
              <button
                className="text-button"
                onClick={() => {
                  setStartError("");
                  void refreshStatus().catch((e) => setStartError(e.message));
                }}
              >
                Try again
              </button>
            </div>
          )}
        </div>
        <div className="welcome-footer">
          <HardDrive size={14} />
          Local SQLite · No internet required
        </div>
      </div>
    );
  }
  const current = nav.flatMap((g) => g.items).find((i) => i.id === page);
  const results = globalSearch
    ? nav
        .flatMap((g) => g.items)
        .filter(
          (i) =>
            can(i.permission) &&
            t(i.label).toLowerCase().includes(globalSearch.toLowerCase()),
        )
    : [];
  const content =
    page === "overview" ? (
      <Dashboard />
    ) : page === "pos" ? null : page === "products" || page === "categories" ? (
      <Catalog />
    ) : page === "inventory" || page === "movements" ? (
      <Inventory />
    ) : page === "purchases" ? (
      <Purchases />
    ) : page === "customers" || page === "suppliers" || page === "debts" ? (
      <Parties />
    ) : page === "sales" || page === "returns" ? (
      <Sales />
    ) : page === "expenses" || page === "register" ? (
      <Finance />
    ) : page === "reports" ? (
      <Reports />
    ) : page === "staff" ? (
      <Staff />
    ) : (
      <Settings
        onRestored={() => {
          client.clear();
          void refreshStatus();
        }}
      />
    );
  return (
    <Store.Provider
      value={{ data, page, setPage, t, refresh, notify, run, can }}
    >
      <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
        <aside className="sidebar">
          <button
            className="brand"
            onClick={() => setPage(can("reports") ? "overview" : "pos")}
          >
            <span className="logo-mark">
              <ShoppingBasket size={29} />
            </span>
            <span className="brand-word">
              radefy<span className="brand-dot">.</span>
              <small>SUPERMARKET MANAGER</small>
            </span>
          </button>
          <button className="store-switch" onClick={() => setProfile(!profile)}>
            <span className="store-icon">
              <ShoppingBasket size={17} />
            </span>
            <span>
              <strong>{data.settings.store_name}</strong>
              <small>
                {data.mode === "demo" ? t("Demo store") : t("Your store")}
              </small>
            </span>
            <ChevronsUpDown size={14} />
          </button>
          <nav>
            {nav.map((group) => (
              <div className="nav-group" key={group.group}>
                {group.items.some((i) => can(i.permission)) && (
                  <p>{t(group.group)}</p>
                )}
                {group.items
                  .filter((i) => can(i.permission))
                  .map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      className={`nav-item ${page === id ? "active" : ""}`}
                      onClick={() => {
                        setPage(id as Page);
                        setProfile(false);
                      }}
                      title={t(label)}
                    >
                      <Icon size={17} strokeWidth={1.7} />
                      <span>{t(label)}</span>
                      {id === "inventory" &&
                        Number(data.stats.low_stock) > 0 && (
                          <b>{data.stats.low_stock}</b>
                        )}
                    </button>
                  ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className="offline-status">
              <span className="connection-dot" />
              <strong>{t("Works offline")}</strong>
              <ShieldCheck size={15} />
            </div>
            <p>{t("Your data. Your device. Always.")}</p>
            <small>Radefy POS · v0.1.1</small>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <button
              className="icon-button menu-toggle"
              aria-label="Toggle sidebar"
              onClick={() => setCollapsed(!collapsed)}
            >
              <Menu size={20} />
            </button>
            <div className="global-search">
              <Search size={17} />
              <input
                id="global-search"
                placeholder={t("Search anything…")}
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
              />
              <kbd>⌘ K</kbd>
              {globalSearch && (
                <div className="search-results">
                  {results.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setPage(r.id as Page);
                        setGlobalSearch("");
                      }}
                    >
                      {t(r.label)}
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                  {!results.length && <span>{t("No matching pages")}</span>}
                </div>
              )}
            </div>
            <div className="topbar-right">
              <span className="local-indicator">
                <HardDrive size={13} />
                {t(data.mode === "demo" ? "Demo store" : "Local database")}
              </span>
              <button
                className="notification-button"
                aria-label={t("Stock alerts")}
                onClick={() => setPage(can("inventory") ? "inventory" : "pos")}
              >
                <Bell size={20} />
                {Number(data.stats.low_stock) > 0 && <i />}
              </button>
              <div className="topbar-divider" />
              <button
                className="user-button"
                onClick={() => setProfile(!profile)}
              >
                <span className="user-avatar">
                  {data.user.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span>
                  <strong>{data.user.name}</strong>
                  <small>{t(data.user.role)}</small>
                </span>
                <ChevronDown size={14} />
              </button>
            </div>
            {profile && (
              <div className="profile-menu">
                <strong>{data.settings.store_name}</strong>
                <button
                  onClick={async () => {
                    await command("logout");
                    client.clear();
                    setProfile(false);
                    await refreshStatus();
                  }}
                >
                  <LogOut size={16} />
                  {t("Sign out")}
                </button>
                <button
                  onClick={async () => {
                    await command("logout");
                    client.clear();
                    setStatus(null);
                    setProfile(false);
                    setGate("choose");
                    setStatus(await command("status"));
                  }}
                >
                  <ArrowLeftRight size={16} />
                  {t("Switch store")}
                </button>
              </div>
            )}
          </header>
          <main className={`main-content ${page === "pos" ? "pos-main" : ""}`}>
            {page === "overview" && (
              <div className="page-heading">
                <div>
                  <div className="welcome-eyebrow">
                    {t("YOUR DAILY PICTURE")}
                  </div>
                  <h1>
                    {t(
                      "Good " +
                        (new Date().getHours() < 12
                          ? "morning"
                          : new Date().getHours() < 18
                            ? "afternoon"
                            : "evening"),
                    )}
                    , {data.user.name.split(" ")[0]}
                    <span className="greeting-dot">.</span>
                  </h1>
                  <p>{t("Here’s what’s happening in your store.")}</p>
                </div>
                <div className="heading-actions">
                  <button
                    className="button secondary"
                    onClick={() => setDateOpen(!dateOpen)}
                  >
                    <CalendarDays size={15} />
                    {dates.from
                      ? `${dates.from} — ${dates.to}`
                      : t("Last 30 days")}
                    <ChevronDown size={13} />
                  </button>
                  <button className="button" onClick={() => setPage("pos")}>
                    <Plus size={16} />
                    {t("New sale")}
                  </button>
                </div>
              </div>
            )}
            {page !== "overview" &&
              ["reports", "sales", "returns"].includes(page) && (
                <div className="date-filter-bar">
                  <button
                    className="button secondary small"
                    onClick={() => setDateOpen(!dateOpen)}
                  >
                    <CalendarDays size={14} />
                    {dates.from
                      ? `${dates.from} — ${dates.to}`
                      : t("Last 30 days")}
                    <ChevronDown size={13} />
                  </button>
                </div>
              )}
            {dateOpen && (
              <form
                className="date-popover"
                onSubmit={(e) => {
                  e.preventDefault();
                  setDates(draftDates);
                  setDateOpen(false);
                }}
              >
                <label>
                  {t("From")}
                  <input
                    type="date"
                    required
                    value={draftDates.from}
                    onChange={(e) =>
                      setDraftDates({ ...draftDates, from: e.target.value })
                    }
                  />
                </label>
                <label>
                  {t("To")}
                  <input
                    type="date"
                    required
                    value={draftDates.to}
                    onChange={(e) =>
                      setDraftDates({ ...draftDates, to: e.target.value })
                    }
                  />
                </label>
                <button className="button small">{t("Apply filters")}</button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setDates({ from: "", to: "" });
                    setDateOpen(false);
                  }}
                >
                  {t("Last 30 days")}
                </button>
              </form>
            )}
            {query.error && (
              <div className="error-box" role="alert">
                {query.error.message}
              </div>
            )}
            {can("sell") && (
              <div hidden={page !== "pos"}>
                <POS key={data.mode} />
              </div>
            )}
            {current && can(current.permission) ? (
              content
            ) : (
              <div className="error-box">
                {t("Your account does not have permission for this page.")}
              </div>
            )}
            <footer className="main-footer">
              <span>{t("Your store, in order.")}</span>
              <span>
                <span className="connection-dot" />
                {t("Local database")} · SQLite
              </span>
            </footer>
          </main>
        </div>
        {toast && (
          <div
            className={`toast ${toast.error ? "error" : ""}`}
            role={toast.error ? "alert" : "status"}
          >
            {toast.error ? (
              <AlertCircle size={19} />
            ) : (
              <CheckCircle2 size={19} />
            )}
            <span>{t(toast.text)}</span>
            <button aria-label="Close" onClick={() => setToast(null)}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </Store.Provider>
  );
}
function AccessForm({
  setup,
  submit,
  back,
  language,
}: {
  language: string;
  setup: boolean;
  submit: (v: Record<string, string>) => Promise<void>;
  back: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({
    language,
    receipt_width: "80",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = (text: string) => translate(values.language ?? language, text);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await submit(values);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1>{t(setup ? "Welcome to your store." : "Welcome back.")}</h1>
      <p>
        {t(
          setup
            ? "A few details, then you’re ready to go."
            : "Sign in to your local store.",
        )}
      </p>
      <div className="access-fields">
        {(setup
          ? ["store_name", "name", "address", "phone", "username", "password"]
          : ["username", "password"]
        ).map((key) => (
          <label key={key}>
            {t(
              (
                {
                  store_name: "Store name",
                  name: "Owner name",
                  address: "Address",
                  phone: "Phone",
                  username: "Username",
                  password: "Password",
                } as Record<string, string>
              )[key],
            )}
            <input
              autoComplete={
                key === "password"
                  ? setup
                    ? "new-password"
                    : "current-password"
                  : key === "username"
                    ? "username"
                    : "off"
              }
              required={["name", "store_name", "username", "password"].includes(
                key,
              )}
              type={key === "password" ? "password" : "text"}
              minLength={key === "password" && setup ? 8 : undefined}
              value={values[key] ?? ""}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          </label>
        ))}
        {setup && (
          <label>
            {t("Language")}
            <select
              value={values.language}
              onChange={(e) =>
                setValues({ ...values, language: e.target.value })
              }
            >
              <option value="en">English</option>
              <option value="fa">دری</option>
            </select>
          </label>
        )}
      </div>
      {error && <div className="error-box">{error}</div>}
      <button className="button welcome-primary" disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={17} /> : null}
        {t(setup ? "Save and continue" : "Sign in")}
        <ArrowRight size={17} />
      </button>
      <button className="text-button" type="button" onClick={back}>
        {t("Back to store selection")}
      </button>
    </form>
  );
}
