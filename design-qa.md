# Radefy POS visual QA

**Final result: passed**

This result applies to the implemented interface and the supermarket adaptation of the supplied reference. It does not certify physical printing, Windows, disconnected installation, or full release acceptance; those remain explicit in `docs/verification.md`.

## Source and comparison evidence

- Source visual truth: `/var/folders/sp/33j8nyh535jb846k8yn2zh9h0000gn/T/codex-clipboard-7c9415a4-78ba-4149-8382-75047444f0fd.png`, copied to `docs/screenshots/reference.png`.
- Source dimensions: 736 × 532 pixels, with the application cropped from x=49, y=44 to x=687, y=489 (638 × 445). The outer gray presentation canvas is excluded.
- Implementation: the running React interface at `http://127.0.0.1:1430`, using its explicitly labeled Rust/SQLite demo adapter. English owner session, last 30 days, demo transactions after workflow QA.
- CSS viewport: 1280 × 900. Browser zoom initially produced a reported DPR of approximately 0.90. Its screenshot renderer returned 1422 × 1000 pixels with a blank strip outside the 1280 × 900 rendered application area. The application area was cropped, not stretched, to make `docs/screenshots/dashboard-en-normalized.png`.
- Full-view combined input: `docs/screenshots/reference-comparison.png`. The source and application were placed together in one image and opened together. Both panels are 638 pixels wide; the implementation is downsampled from its actual 1280 × 900 content to 638 × 449. The four-pixel height difference is retained.
- Focused comparison input: `docs/screenshots/metrics-comparison.png`. Actual metric regions are shown together. The low-resolution reference region is enlarged 2×; the implementation region retains actual pixel scale. No generated/reconstructed screenshot content was used.
- Native corroboration: `docs/screenshots/native-dashboard.png` (2560 × 1454 Retina capture, corresponding to a 1280 × 727 window including native chrome) and `native-print-dialog.png`.

The source shows restaurant management and 12 monthly bars. The approved product requires supermarket management, a configurable date range, additional navigation, stock alerts, real transaction data, and AFN. These intentional changes are separated from fidelity defects below.

## Findings and fix history

1. **[P2, resolved] Middle dashboard row was too tall at laptop widths.** The initial combined evidence in `reference-comparison-before.png` showed a 324px chart/action row and pushed the lower cards farther down than the reference's compact arrangement. Reduced the revenue chart from 220px to 175px, the payment-chart container to 160px, and compacted the action card at laptop widths. The row now measures approximately 279px. `reference-comparison.png` is the revised combined comparison; metrics and lower cards align more closely with the reference's density. The larger number of operational rows remains scrollable by design.
2. **[P2, resolved] Checkout actions initially fell below the minimum supported window.** At 1000 × 700 CSS pixels, the cart extended to y≈880. Added a short-window cart layout with a bounded height, scrollable line area and reduced payment spacing. The revised live check measured the Complete sale button at y≈450–492 and Hold sale at y≈499–535, with no horizontal overflow. Evidence: `docs/screenshots/checkout-small.jpg`, including the focused payment input and both actions.
3. **[P2, resolved] Receipt phone number inherited RTL direction.** The Dari receipt initially reordered the groups in the phone number. Isolated the phone with `bdi dir=ltr`, and isolated receipt identifiers, quantity expressions and AFN values. The post-fix live DOM and screenshot show `+93 700 123 456` in its correct order. Evidence: `docs/screenshots/receipt-fa.jpg` (the screenshot captures the upper receipt region; full totals were separately verified through the DOM and checkout result).
4. **[P2, resolved] Scanner focus competed with the receipt dialog after checkout.** Clearing a successful cart no longer focuses the scanner behind the newly opened modal. The browser accessibility tree now exposes the Receipt dialog and focuses Close immediately after checkout. Native independent reprint was verified through Sales history.
5. **[P3] Reference typography cannot be identified precisely from the small raster.** Bundled Nunito Sans provides the rounded Latin appearance and Vazirmatn provides consistent Dari shaping. This is a deliberate, documented type choice; no remote font dependency remains.

No actionable P0/P1/P2 visual issue remains in the inspected states. This is an adaptation of the reference's visual language, not a literal restaurant screenshot replica.

## Required fidelity surfaces

| Surface | Result |
|---|---|
| Fonts and typography | Rounded local Latin type, consistent heading/metric hierarchy, readable numeric values, local Dari font and RTL shaping. The focused metric comparison verifies labels, weights and spacing. Unusually long store/product names still warrant pilot-data review. |
| Spacing and layout rhythm | Compact left sidebar/right main layout in English, mirrored in Dari; four metrics; aligned white chart/list cards; thin dividers, small radii and restrained shadows. Laptop chart density corrected. Sidebar scrolls independently and collapses at narrower widths. |
| Colors and tokens | Warm off-white canvas, white cards, coral active state/actions/chart, restrained pastel metric icons, green positive status. Secondary text was darkened during implementation to improve readability. Status includes text and does not depend solely on color. |
| Image quality and assets | Supplied restaurant logo/food photography/upgrade illustration intentionally excluded because the approved brief changes brand and domain. Radefy uses locally bundled Lucide UI icons and an original text wordmark, not traced replacement artwork. Products can use locally stored actual images; demo products use category icons, clearly not photographs. Barcode/QR images were decoded successfully. |
| Copy and content | Restaurant metrics replaced by sales, transactions, actual gross profit and inventory valuation. Records and charts come from SQLite. Demo/offline state is explicit. English/Dari forms and receipts were inspected. No subscription/upgrade prompt or invented growth percentage was retained. |

## Other inspected states

- English and Dari dashboard, including no horizontal overflow at 1280 × 900 CSS pixels (`dashboard-en-normalized.png`, `dashboard-fa.jpg`).
- Product creation with decimal price, opening stock, Dari name, manufacturer barcode and carton alias.
- Product table search, generated Code 128/QR labels and actual scanner-field entry (`product-label.jpg`).
- Cart empty/filled, repeated scan, six-piece carton scan, tender/change and completed receipt (`checkout-en.jpg`, `checkout-small.jpg`).
- Dari mixed-name receipt with numeric/telephone isolation (`receipt-fa.jpg`).
- Radix modal focus, explicit labels, keyboard scanner submission and visible focused input state.
- Native macOS receipt history/reprint and OS print preview (`native-receipt.png`, `native-print-dialog.png`).

Browser console was checked. An initial empty image-source error was fixed by rendering the label only once generated. Recharts can emit zero-size warnings when the hidden preview is resized; rendered charts were visually verified. No runtime exception blocked the verified flows. Temporary viewport overrides were reset after QA.

## Implementation checklist

- [x] Open source and running implementation and compare in the same combined image.
- [x] Inspect a focused region as well as the complete composition.
- [x] Fix laptop density, short-window checkout and RTL receipt issues; capture post-fix evidence.
- [x] Verify core interactions against actual local database-backed commands.
- [x] Record expected product differences and remaining platform/device acceptance gates.

final result: passed
