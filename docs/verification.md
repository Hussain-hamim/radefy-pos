# Acceptance evidence — 13 October 2026

Release candidate 0.1.0. This records observed results, not an assertion that every platform or physical device has passed acceptance. All synthetic workflow checks used isolated demonstration or temporary test databases. No real-store records were populated by the browser QA.

## Automated checks

- Rust: **20 integration scenarios passed**, against temporary SQLite databases, with the production services and transaction boundaries. Command: `cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features`.
- Frontend: **6 Vitest/React Testing Library tests passed**, covering exact numeric parsing/formatting and accessible validated forms/table behavior.
- TypeScript and Vite production build: passed. The offline bundle includes its fonts and assets. Vite reports a large-chunk advisory; initial-load performance on low-end store hardware is not yet benchmarked.
- Template packaging regression checks: **4 passed**. The retained Sites files do not provide a production supermarket backend.
- Generated Code 128 and QR PNGs were independently decoded using ZXing. Decoded identifiers were then entered through the actual scanner field and resolved correctly.

## Required scenarios

| # | Scenario | Evidence and result |
|---|---|---|
| 1 | Register product, scan barcode/generated label, repeat scan | Passed through browser UI + real Rust/SQLite demo adapter. Added QA lentils with 20 pieces, AFN 85.50 price, AFN 50 cost, manufacturer code and six-piece carton code. Both generated label formats decoded. Two manufacturer scans, one QR scan and one carton scan produced 9 pieces. Physical scanner untested. |
| 2 | Fractional quantities, cartons and rounding | Rust tests passed for 1.250 kg, half-up rounding, FEFO cost allocation, aliases and carton multipliers. UI carton example passed. |
| 3 | Checkout, receipt, payment/change, stock, cost, register | Native Apple Silicon app: two apple scans → 2 kg, AFN 240 total, AFN 300 tendered, AFN 60 change, saved receipt RD-000091. Browser QA: 9 lentil pieces → AFN 769.50 total, AFN 800 tendered, AFN 30.50 change, stock 20 → 11. Automated tests verify payment, costs and register ledger together. |
| 4 | Reject stock/expiry/amount/permission violations | Passed in Rust tests, including fractional pieces, insufficient stock, expired lots, changed request payload and cashier restrictions. Saved checkout retry results also redact cost data for the current employee. |
| 5 | Failure halfway through checkout | Test-only service fault after inventory allocation rolls back sale, items, allocations, payments, debt, cash and stock. Passed. Fault injection is not exposed by Tauri commands. |
| 6 | Lost response and retry | Persistent request ID returns the original checkout result exactly once, including after closing/reopening the service. No repeated stock deduction. Passed. Frontend keeps an unresolved checkout ID across reloads. |
| 7 | Partial supplier deliveries and balances | Passed: order alone changes neither stock nor debt; partial receipts create costed lots and supplier ledger entries; supplier returns reconcile cost. |
| 8 | Credit and partial collection | Passed: collections reduce receivables without another sale/revenue entry; credit limit enforced. |
| 9 | Repeated partial returns | Passed: cumulative rounding reconciles full totals, over-returns rejected, debt offset first, restockable/damaged handling, cash vs non-cash refund effects. |
| 10 | Register reconciliation | Passed: expected/count/variance recorded and closed register immutable; later cash operations require another open register. |
| 11 | Restart persistence | Passed: transactions, stock, credentials, unresolved checkout IDs and held carts persist. Reholding a resumed cart updates the existing hold. Completing it removes the hold. A second service cannot lock the same store. Native quit/relaunch preserved RD-000091. |
| 12 | Backup/restore, corrupt/incompatible rejection | Passed: backup API, media preservation, recovery backup, corrupt/incompatible schema rejection, daily backup idempotency, and migration 1 → 2 with pre-upgrade backup. |
| 13 | Dari layout and mixed-language receipts | Browser visual check passed: right-to-left shell/forms, Dari product name دال سرخ, Latin receipt ID/phone and AFN values. Receipt showed the same AFN 769.50/800/30.50 values. Fluent-Dari editorial review remains outstanding. |
| 14 | Install and operate with networking disabled | Application uses native IPC/SQLite and bundled assets; packaged macOS core workflows ran without the development service. **A process-level network-denial test prevented loopback access, but its GUI could not be attached for workflow verification. Host networking was not disabled**, so disconnected-install acceptance remains outstanding. |
| 15 | Windows/macOS printing and real scanners | macOS native receipt reprint opened the OS print dialog with a one-page preview. **No physical printer selected or scanner attached.** Windows printing, 58/80 mm paper output, scanner keystroke timing and actual device compatibility remain untested. |

## Platform matrix

| Platform | Build | Native workflow smoke | Release verification |
|---|---|---|---|
| macOS Apple Silicon | Universal executable contains arm64 | Launch/demo checkout, restart/persistence, receipt history and native print-dialog checks passed | Core workflow smoke verified; physical peripherals and disconnected installation still outstanding |
| macOS Intel | Universal executable contains x86_64 | No Intel machine available | Built, not natively verified |
| Windows x64 | NSIS setup EXE built on GitHub's Windows runner; embedded WebView2 offline installer verified in the archive | Silent install succeeded and installed app created a native window | Build/install/startup smoke passed; full native workflows, disconnected installation and physical peripherals remain outstanding |

No signing/notarization credentials were supplied. The Windows EXE is unsigned; the macOS DMG is unsigned by a trusted developer identity and is not notarized. Platform builds must not be described as signed releases.

## Windows build evidence

[GitHub Actions run 38450669137](https://github.com/Hussain-hamim/radefy-pos/actions/runs/38450669137) completed successfully on 13 October 2026 UTC, building source commit `92b2574b62ec75ed3ce2e19e8431d0dbc060057f` in the private repository. Subsequent documentation-only commits do not change the packaged application.

- All **20 Rust integration scenarios** and **6 frontend tests** passed on the Windows runner.
- Tauri produced `Radefy POS_0.1.0_x64-setup.exe` (approximately **210.67 MiB**).
- The workflow required `offlineInstaller` configuration and inspected the resulting NSIS archive. It contains `MicrosoftEdgeWebView2RuntimeInstaller.exe` (**214,090,448 bytes**) alongside the app executable.
- Silent installation returned exit code 0. The installed `radefy-pos.exe` remained running and created a native window.
- The [installer artifact](https://github.com/Hussain-hamim/radefy-pos/actions/runs/38450669137/artifacts/11841681878) includes the EXE, SHA-256 checksum, source/build manifest, payload listing and smoke-test evidence. It expires on 12 November 2026; keep a downloaded copy.

The small verification files are also preserved in [`builds/windows-0.1.0/`](builds/windows-0.1.0/). Setup EXE SHA-256: `020f0c17090ca0b2fa63b2e8756c1cd262130b7db736fe14e0538c42142692d1` (calculated on the Windows runner). The local full-package transfer was stopped because it was unusually slow; the complete package remains available in the GitHub artifact. Its local byte-for-byte download verification was not completed.

This hosted-runner check does not establish that WebView2 was absent before installation, does not disable networking and does not exercise the Windows checkout UI or attached hardware. Those acceptance gaps remain explicit below.

## UI evidence

See `../design-qa.md` and `screenshots/` for source comparison, English/Dari dashboard, checkout, labels, receipt and native print dialog evidence. Tested create/save/search, label generation, repeated scanner entry, carton conversion, checkout, receipt reprint, language settings, navigation, and keyboard focus in dialogs.

During development, console checks exposed an empty label-image source and initial zero-size Recharts warnings while the hidden preview resized. The image now renders only after generation. Chart containers have minimum dimensions; transient hidden-preview resize warnings may still occur. No runtime exception blocked the verified workflows.

## Remaining release gates

- Run all Windows native application acceptance scenarios beyond the successful CI installation/window-startup smoke test.
- Smoke-test the universal app on real Intel hardware.
- Test installation and restart with networking disabled; verify bundled WebView2 on a Windows machine without an existing runtime.
- Test an actual keyboard barcode scanner and 58/80 mm printer drivers on each target OS, including Dari glyph output, paper dimensions and repeated reprints.
- Review Dari wording with a fluent local operator and conduct a pilot with a realistic large catalog.
- Set up trusted signing/notarization before public release.

Feature-level limits are separately enumerated in `features.md`; they are not concealed by passing automated tests.
