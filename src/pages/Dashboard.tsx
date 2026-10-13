import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ShoppingBag,
  Package,
  ReceiptText,
  Wallet,
  Plus,
  Truck,
  Users,
  AlertTriangle,
  Clock,
  TrendingUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useStore } from "../lib/context";
import { money, qty, dateLabel } from "../lib/money";
import { Badge, Empty } from "../components/ui";
import { ProductIcon } from "../components/ProductIcon";
export function Dashboard() {
  const { data: d, t, setPage } = useStore();
  const stats = d.stats;
  const tiles = [
    {
      label: "Total sales",
      value: stats.sales,
      icon: ShoppingBag,
      color: "coral",
      note: "After discounts and returns",
    },
    {
      label: "Transactions",
      value: stats.transactions,
      icon: ReceiptText,
      color: "purple",
      note: "Completed sales",
      count: true,
    },
    {
      label: "Gross profit",
      value: stats.gross_profit,
      icon: Wallet,
      color: "blue",
      note: "Before operating expenses",
    },
    {
      label: "Inventory value",
      value: stats.inventory,
      icon: Package,
      color: "green",
      note: "At recorded purchase cost",
    },
  ];
  const trend = d.trend.map((r) => ({
    day: dateLabel(r.day),
    sales: Number(r.sales) / 100,
  }));
  const payments = d.payment_breakdown.map((r) => ({
    name: t(r.method === "cash" ? "Cash" : "Other"),
    value: Number(r.amount) / 100,
  }));
  const alerts = d.products.filter(
    (p) =>
      p.active === "1" &&
      BigInt(p.available ?? "0") <= BigInt(p.min_stock ?? "0"),
  );
  const last = d.sales.slice(0, 5);
  return (
    <>
      <div className="dashboard-tabs">
        <button className="active">{t("Store overview")}</button>
        <button onClick={() => setPage("reports")}>
          {t("Reports")}
          <ArrowUpRight size={13} />
        </button>
        <span>{t("All amounts in AFN")}</span>
      </div>
      <div className="stat-grid">
        {tiles.map(({ label, value, icon: Icon, color, note, count }) => (
          <div className="stat-card" key={label}>
            <div className={`stat-icon ${color}`}>
              <Icon size={23} strokeWidth={1.7} />
            </div>
            <div className="stat-content">
              <p>{t(label)}</p>
              <strong>{count ? (value ?? "0") : money(value)}</strong>
              <span>{t(note)}</span>
            </div>
            <ArrowUpRight className="stat-arrow" size={15} />
          </div>
        ))}
      </div>
      <div className="dashboard-main">
        <section className="panel revenue-panel">
          <div className="panel-heading">
            <div>
              <h2>{t("Sales overview")}</h2>
              <p>{t("Sales performance over time")}</p>
            </div>
            <span className="chart-legend">
              <i />
              {t("Net sales")}
            </span>
          </div>
          {trend.length ? (
            <div className="revenue-chart">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={1}
                minHeight={1}
              >
                <BarChart
                  data={trend}
                  margin={{ top: 20, right: 0, left: -15, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="0"
                    vertical={false}
                    stroke="#f0ede9"
                  />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={35}
                    tick={{ fill: "#9d9893", fontSize: 10 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#9d9893", fontSize: 10 }}
                    tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
                  />
                  <Tooltip
                    cursor={{ fill: "#faf4ef" }}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #eee5df",
                      fontSize: 12,
                    }}
                    formatter={(v) => [
                      `${Number(v).toLocaleString()} AFN`,
                      t("Net sales"),
                    ]}
                  />
                  <Bar
                    dataKey="sales"
                    fill="#e9826c"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={19}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty />
          )}
          <div className="chart-bottom">
            <span>
              {dateLabel(d.from)} — {dateLabel(d.to)}
            </span>
            <button className="text-button" onClick={() => setPage("reports")}>
              {t("View reports")}
              <ArrowRight size={13} />
            </button>
          </div>
        </section>
        <section className="panel payment-panel">
          <div className="panel-heading">
            <div>
              <h2>{t("Payment methods")}</h2>
              <p>{t("How your customers pay")}</p>
            </div>
            <Wallet size={17} />
          </div>
          <div className="donut-wrap">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={1}
              minHeight={1}
            >
              <PieChart>
                <Pie
                  data={payments.length ? payments : [{ name: "", value: 1 }]}
                  dataKey="value"
                  innerRadius={62}
                  outerRadius={80}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={payments.length > 1 ? 5 : 0}
                  stroke="none"
                >
                  {(payments.length ? payments : [{}]).map((_, i) => (
                    <Cell
                      key={i}
                      fill={
                        payments.length
                          ? ["#e9826c", "#ead5ac"][i % 2]
                          : "#f2eeea"
                      }
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <span>{t("Transactions")}</span>
              <strong>{stats.transactions ?? "0"}</strong>
            </div>
          </div>
          <div className="payment-legend">
            {payments.map((p, i) => (
              <div key={p.name}>
                <span>
                  <i style={{ background: ["#e9826c", "#ead5ac"][i] }} />
                  {p.name}
                </span>
                <strong>
                  {p.value.toLocaleString()} <small>AFN</small>
                </strong>
              </div>
            ))}
          </div>
        </section>
        <section className="quick-panel">
          <span className="eyebrow">{t("A GOOD DAY FOR BUSINESS")}</span>
          <h2>{t("Your next sale starts here.")}</h2>
          <p>{t("A smooth checkout. A happy customer.")}</p>
          <button className="button light" onClick={() => setPage("pos")}>
            <Plus size={17} />
            {t("New sale")}
            <ArrowRight size={15} />
          </button>
          <div className="quick-links">
            <button onClick={() => setPage("purchases")}>
              <Truck size={17} />
              {t("Purchases")}
              <ArrowUpRight size={14} />
            </button>
            <button onClick={() => setPage("customers")}>
              <Users size={17} />
              {t("Customers")}
              <ArrowUpRight size={14} />
            </button>
          </div>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel best-panel">
          <div className="panel-heading">
            <div>
              <h2>{t("Best-selling products")}</h2>
              <p>{t("The favorites in your store")}</p>
            </div>
            <TrendingUp size={18} />
          </div>
          {d.best_sellers.length ? (
            d.best_sellers.slice(0, 4).map((p, i) => (
              <div className="best-row" key={p.id}>
                <span className="rank">0{i + 1}</span>
                <ProductIcon category={p.category_id} small />
                <div>
                  <strong>{p.name}</strong>
                  <span>
                    {qty(p.quantity)} {t(p.unit ?? "piece")} {t("sold")}
                  </span>
                </div>
                <b>
                  {money(p.revenue)}
                  <small> AFN</small>
                </b>
              </div>
            ))
          ) : (
            <Empty />
          )}
          <button className="panel-link" onClick={() => setPage("products")}>
            {t("All products")}
            <ArrowRight size={14} />
          </button>
        </section>
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <h2>{t("Recent transactions")}</h2>
              <p>{t("Every checkout, accounted for")}</p>
            </div>
            <button className="text-button" onClick={() => setPage("sales")}>
              {t("View all")}
              <ArrowRight size={13} />
            </button>
          </div>
          {last.length ? (
            <table className="recent-table">
              <thead>
                <tr>
                  <th>{t("Receipt")}</th>
                  <th>{t("Customer")}</th>
                  <th>{t("Total")}</th>
                  <th>{t("Status")}</th>
                </tr>
              </thead>
              <tbody>
                {last.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.number}</strong>
                      <small>{dateLabel(s.created_at, "gregory", true)}</small>
                    </td>
                    <td>{t(s.customer ?? "Walk-in customer")}</td>
                    <td>
                      <strong>{money(s.total)}</strong>
                      <small>AFN</small>
                    </td>
                    <td>
                      <Badge
                        tone={BigInt(s.debt ?? "0") > 0n ? "amber" : "green"}
                      >
                        {t(BigInt(s.debt ?? "0") > 0n ? "Credit" : "Paid")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty />
          )}
        </section>
      </div>
      <div className="attention-strip">
        <div className="attention-title">
          <AlertTriangle size={20} />
          <strong>{t("A little attention goes a long way")}</strong>
        </div>
        <button onClick={() => setPage("inventory")}>
          <span className="status-dot coral-dot" />
          {stats.low_stock ?? "0"} {t("Low stock")}
          <ArrowRight size={14} />
        </button>
        <button onClick={() => setPage("inventory")}>
          <Clock size={15} />
          {stats.expiring ?? "0"} {t("Expiring soon")}
          <ArrowRight size={14} />
        </button>
        <button onClick={() => setPage("debts")}>
          <ArrowDownLeft size={15} />
          {money(stats.customer_debt)} AFN {t("Outstanding")}
          <ArrowRight size={14} />
        </button>
      </div>
      {alerts.length === 0 && d.products.length === 0 && (
        <p className="subtle">{t("Add your first product to get started.")}</p>
      )}
    </>
  );
}
