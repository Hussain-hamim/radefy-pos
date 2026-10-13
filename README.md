# Radefy POS

A local supermarket point of sale and management application. React 19 + TypeScript + Tauri 2; Rust owns business rules and a bundled SQLite database. No cloud account, remote database, subscription, runtime CDN, or application telemetry.

**Release status:** working implementation under local acceptance testing, version 0.1.0. See [verification](docs/verification.md) for actual platform and device evidence. An installer build alone does not verify a platform. Packages produced here are **unsigned and not notarized**.

**Windows installer:** [download the setup artifact](https://github.com/Hussain-hamim/radefy-pos/actions/runs/38450669137/artifacts/11841681878) from the successful private GitHub Actions run. It contains the x64 setup EXE with the WebView2 offline installer bundled; Windows automated tests, silent installation and native window startup passed. See the [Windows installation guide](docs/windows-installation.md).

## Run

Requirements for development: Node.js 22+, Rust stable, and the platform's [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). On macOS install Xcode Command Line Tools. On Windows install Visual Studio C++ Build Tools and WebView2 for development. Initial dependency installation and compilation use the internet; the installed desktop application does not.

```sh
npm ci
npm run desktop
```

The desktop app starts with **Open demo store** or **Set up my store**. Demo login: `owner` / `demo12345`. Real-store setup creates a new owner account and never copies demo records. Opening cash belongs to a register session; opening supplier/customer debts are entered when those accounts are created; opening inventory belongs to product registration.

For a clearly labeled browser demonstration backed by a separate local SQLite service:

```sh
npm run dev
```

Open `http://127.0.0.1:1430`. The browser adapter only permits the demo database and listens on loopback. The native build communicates directly with Rust through Tauri IPC and does not include the browser server. Ports 1430/1431 are used only for development.

## Implemented workflows

- Dashboard from saved transactions, date filters, stock/expiry alerts, payment mix and best sellers.
- Products, categories, images, Dari names, SKU and barcode aliases, carton multipliers, fractional weights, opening batches and expiry.
- Dedicated scanner input, repeated scans, persistent cart while navigating, held carts, exact Rust quotes, discounts, optional tax, cash/non-cash split and credit, change, receipt preview/reprint.
- FEFO stock allocation with actual lot costs; negative and expired stock rejection; counts with stale-stock checks and reasoned inventory movements.
- Suppliers, purchase orders, partial deliveries, invoice references, supplier payments and returns. Stock and supplier debt change on receipt.
- Customer credit limits, account histories, collections, debt-first returns, repeated partial returns, damaged/restockable distinction.
- Expenses, cash deposits/withdrawals, opening/closing register balances and immutable reconciliation.
- Owner/manager/cashier/inventory/accountant roles, configurable permissions, Argon2id passwords, audit history.
- English/Dari interface and RTL, AFN, Kabul business dates, Gregorian/Solar Hijri display option, local fonts.
- Date-filtered financial reports, product/category/payment/collection/cashier/purchase reports, current inventory/debt/expiry reports, table CSV export, transactional product CSV import with validation preview, printable reports, Code 128 and QR product labels.
- Separate real/demo SQLite files; manual and daily automatic backups; integrity/schema checks and recovery copy before restore; images included in the database.

Read [feature boundaries](docs/features.md) before relying on a workflow in a real store.

## Test and package

```sh
npm test
npm run test:rust
npm run build
```

macOS universal package (Apple Silicon and Intel):

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npx tauri build --target universal-apple-darwin --bundles app,dmg
```

Windows x64, from a Windows build host:

```powershell
npx tauri build --target x86_64-pc-windows-msvc --bundles nsis
```

The Windows configuration embeds the WebView2 offline installer. Build tools may download that runtime at package time. Output is under `src-tauri/target/<target>/release/bundle/`. The included GitHub Actions workflow builds unsigned packages on native runners; select Windows when manually dispatching it to generate the offline setup EXE. See [build and signing](docs/build-and-signing.md).

## Documentation

- [Windows setup and GitHub Actions](docs/windows-installation.md)
- [Owner and cashier guide](docs/user-guide.md)
- [Backup and recovery](docs/backup-recovery.md)
- [Architecture and data rules](docs/architecture.md)
- [Implemented, constrained and deferred features](docs/features.md)
- [Acceptance and test evidence](docs/verification.md)
- [Visual QA](design-qa.md)

## Source layout

`src/pages` contains application screens; `src/components` contains accessible dialogs/forms/tables; `src/lib` contains types, localization, exact formatting and the command adapter. `src-tauri/src` contains authorization, transactional business services, reports, image storage and backup routines. `src-tauri/migrations` contains versioned schema changes, `src-tauri/tests` contains temporary-database integration scenarios, and `src-tauri/src/demo.rs` seeds only the demonstration database.

Keep local databases and backups out of source control. Build caches, `.radefy-demo`, and generated packages are ignored. The original template's Sites packaging files remain in place, but this application is delivered as an offline desktop product.
