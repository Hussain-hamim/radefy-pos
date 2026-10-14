# Owner and cashier guide

## First use

Open **Demo store** to practice. Its sample products, customers and transactions stay separate from your real store. Demo credentials are `owner` / `demo12345`. Use the store selector to switch modes. Choose **Set up my store** in the desktop application for an empty store. Enter the business details, owner credentials, language and receipt width. Keep the owner's credentials somewhere secure; there is no cloud password-reset service.

Choose English or دری in Settings. Dari mirrors the layout while phone numbers, codes and identifiers remain left to right. Settings also control receipt width, logo, footer, calendar display and optional taxes. Displaying Solar Hijri dates does not change stored business dates or the Gregorian date-entry controls.

## Prepare the catalog and cash drawer

1. Create categories, then add products with a unique SKU, selling price, purchase cost and base unit. Pieces must be whole numbers. Kilograms/liters/meters permit up to three decimals.
2. Add barcode aliases. A carton barcode's multiplier is its quantity in base units: 12 pieces means 12, not a price multiplier. A 5 kg bag of a kilogram product means 5.
3. Choose **Add product** in Products or Inventory. Enter **Opening stock** beside the price/cost fields for quantity already on hand in the selected base unit (for example 12.5 kg). Leave 0 when none exists. Enter a batch/expiry if applicable; expiry-tracked products require a date. Later stock enters through received purchases or reasoned inventory counts.
4. Add suppliers/customers and any opening debt. Set customer credit limits.
5. In **Cash register**, open the register with the physical opening cash balance. All cash sales, refunds, payments and expenses use that session.

## Checkout

Focus **Barcode**, scan and send Enter. A keyboard-style scanner should use an Enter suffix. Repeating a registered barcode adds its unit/carton quantity. SKU and generated Code 128 labels work in the same input; the internal QR identifier works with a 2D keyboard scanner. An unknown identifier produces an error; authorized users can go to product registration.

Search or select a product to add it manually. Enter a measured weight directly in the quantity field and move focus to apply it. New sales select **Walk-in customer** automatically; a saved account is not needed for a fully paid sale. **Cash received** defaults to the exact quoted balance after any non-cash payment. Edit it to the amount actually received for change, or choose **Use exact cash** to reset it. A manually entered value stays unchanged when the cart changes. The backend calculates the final total, change, credit balance and actual available stock.

Click the customer control to search by name or phone. **Walk-in customer** remains available in that dialog even when a search has no matches. Choose **Add customer** to register a missing customer without leaving POS; the search text prefills the name or phone. Saving selects the new customer and preserves the cart. Customer creation requires the customer permission. For a credit sale, select a registered customer and explicitly enter the amount paid (0 if none); credit limits still apply. Walk-in sales require full payment. Completing or clearing a sale resets the next customer to Walk-in.

Choose **Complete sale**. A saved receipt is the confirmation of a posted sale. If the response is interrupted, the app retains the request ID and recovers or retries that same sale. Do not create another transaction to compensate for an uncertain response; reopen the app and check the recovered receipt or Sales history first.

The cart remains intact when navigating. **Hold** saves it in SQLite so another sale can be processed; resume from **Held carts**. Unsaved ordinary carts are not guaranteed after quitting; hold the cart first. Payment entry is rechecked when resuming.

## Receipts and labels

Use **Print receipt** after a sale, or open any receipt in **Sales history** to reprint without reposting it. Select the installed printer and its 58 mm or 80 mm paper definition in the OS dialog. Match Settings → Receipt width, use 100% scale and suitable margins, and turn off browser/driver headers and footers where available. Save as PDF through the OS dialog when needed.

Products → label action generates Code 128 from the product identifier and an internal QR alternative. Use a 2D scanner for QR; a basic 1D scanner will read only Code 128. Verify one printed label with the actual scanner before printing a batch. Direct ESC/POS commands, automatic cutting and cash-drawer opening are not implemented.

## Purchases and inventory

Create a purchase order with supplier, invoice reference, product quantities and costs. Creating an order does not add stock or debt. Open it and receive each delivered line with the actual batch/expiry. Partial delivery keeps the order partial. Use supplier returns only against a received lot with sufficient remaining stock. Record supplier payments from the supplier account.

Inventory shows physical stock, sellable stock and expiry. For a stocktake, choose a lot, enter the counted quantity and reason. If stock changed since the form opened, reload and recount instead of overwriting newer transactions. Movements explain every opening, receipt, sale, count and return. To dispose of expired/damaged stock, count the affected lot down with a clear reason.

## Customer debts and returns

Customer statements show opening debt, credit sales, collections and debt offsets. Collections record payment once and reduce outstanding debt without increasing revenue. Partial payments allocate against oldest remaining debt. Customer credit cannot exceed its configured limit.

For a return, find the original receipt, select a line and enter a quantity and reason. Choose whether goods are restockable. Expired items cannot be restocked. Choose cash or non-cash for any refund remaining after debt reduction. Repeated partial returns are allowed up to the original sold quantity. Completed records stay in the history.

## End of day

Record operating expenses using cash or non-cash. Use deposit/withdrawal for owner cash movements that are not sales or expenses. Close the register with physical counted cash and a note for any difference. Closing preserves expected cash and variance; open a new session for later cash movements.

Reports use the selected Kabul business-date range. Gross profit is net sales minus recorded stock costs; operating profit then subtracts expenses. Current debt and inventory reports show today's balances. CSV exports preserve source scaled integers for exactness: monetary fields are hundredths of AFN; quantity fields are thousandths of a base unit. Table display and printable reports use human-readable amounts.

## Staff and safety

Only the owner manages staff accounts and role permissions. Disable departing staff instead of deleting transaction history. The default cashier can sell, manage customer collections and operate finance/register screens; narrow role permissions to match your store's policy. Sign out when changing operators. Keep a daily backup on another device; see [backup and recovery](backup-recovery.md).
