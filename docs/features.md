# Feature boundaries — 0.1.0

All visible navigation destinations have implemented database-backed workflows. This is still a first release: deployment acceptance requires the platform/device checks in `verification.md`.

| Area | Implemented | Boundary or remaining work |
|---|---|---|
| Accounts | Empty-store setup, sign-in, role permissions, staff activation, audit | No cloud/password-reset service; owner must preserve access. Audit UI shows the latest 500 events; all events remain in SQLite. |
| Catalog | Categories, active/inactive products, local images, multiple codes and carton multipliers, four base units | Carton conversion becomes base quantity at cart entry; original scanned packaging label is not separately retained on each sale line. No supplier-specific price lists. |
| Checkout | Rust quotes, cash/non-cash split, change, customer credit, holds, request recovery, receipts | Non-cash is a recorded payment category; no payment-terminal/card-processing integration. Weighted goods use manual quantity input. |
| Inventory | Opening lots, FEFO costing, expiry rejection, counts, movement history | Single store/location. Product base unit cannot change after stock moves. No multi-warehouse transfers. |
| Purchasing | Orders, invoice reference, partial receipts, received-goods debt, payments and returns | No order amendment/cancellation workflow or supplier cash-refund collection; overpaid supplier returns remain account credits. |
| Returns | Linked partial/full quantity returns, prorated refunds/discounts, debt offset, restock/damaged handling | One sale line per return operation. No receiptless returns. |
| Finance | Register opening/closing, variance, expenses, deposits/withdrawals, customer/supplier ledgers | One shared register; no payroll, bank-feed reconciliation or double-entry accounting. Completed expenses cannot be amended/reversed in the UI yet. |
| Reports | Financial totals, refunds/discounts/costs/profit, expenses, products/categories, payments, collections, purchases, current inventory/expiry/debts, cashier activity/register variances | Transaction ranges limited to 366 days per request. Current stock/debts are not historical as-of balances. Cashier activity shows sales before later returns; financial totals include returns by return date. Large-store load tests are outstanding. |
| CSV | Validated product import preview, duplicate detection, atomic import; table/report export | Exported raw numeric columns use scaled integers; see guide. Import creates products only, not arbitrary transaction history. |
| Localization | English/Dari navigation, forms, receipts, core errors; RTL; local fonts; optional Solar Hijri display | Native OS dialogs follow OS language. Technical filesystem/database diagnostics may retain English detail. Independent fluent-Dari wording review remains recommended. |
| Backup | SQLite online backup, daily rotation, upgrade/recovery backup, validated restore with logout, media included | No off-device automatic copying or encryption. App must be running for automatic backups. |
| Distribution | Tauri configuration, local assets, macOS universal packaging, Windows x64 NSIS CI configuration with offline WebView2 | Signing/notarization credentials not supplied; builds unsigned. Native Windows and Intel-hardware verification outstanding. |

Explicitly deferred per the approved scope: multi-computer synchronization, remote backend/cloud login, USD, Pashto, payroll, full double-entry accounts, scale integration, camera scanning, direct ESC/POS, automatic paper cutting and cash-drawer hardware control.
