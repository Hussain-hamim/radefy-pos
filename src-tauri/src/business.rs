use crate::db::*;
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};
use std::collections::HashSet;
#[derive(Clone)]
struct Line {
    product: Value,
    quantity: i64,
    subtotal: i64,
    discount: i64,
    tax: i64,
    total: i64,
}
impl Service {
    fn cart(&self, p: &Value) -> Result<Vec<Line>> {
        let items = p["items"]
            .as_array()
            .ok_or_else(|| err("VALIDATION", "Add products to the cart."))?;
        if items.is_empty() || items.len() > 300 {
            return Err(err(
                "VALIDATION",
                "A sale needs between 1 and 300 product lines.",
            ));
        }
        let mut out = vec![];
        let mut seen = HashSet::new();
        for item in items {
            let product_id = required(item, "product_id")?;
            if !seen.insert(product_id.clone()) {
                return Err(err("VALIDATION", "Combine duplicate product lines."));
            }
            let product = list(
                self.c()?,
                "SELECT * FROM products WHERE id=?1 AND active=1",
                &[&product_id],
            )?
            .into_iter()
            .next()
            .ok_or_else(|| err("NOT_FOUND", "Product is unavailable."))?;
            let quantity = positive(item, "quantity")?;
            if s(&product, "unit") == "piece" && quantity % 1000 != 0 {
                return Err(err(
                    "VALIDATION",
                    "Piece products require whole quantities.",
                ));
            }
            let price = integer(&product, "price")?;
            let subtotal = line_total(price, quantity)?;
            out.push(Line {
                product,
                quantity,
                subtotal,
                discount: 0,
                tax: 0,
                total: subtotal,
            });
        }
        let subtotal = out.iter().try_fold(0i64, |a, l| {
            a.checked_add(l.subtotal)
                .ok_or_else(|| err("OVERFLOW", "Sale total is too large."))
        })?;
        if subtotal > 1_000_000_000_000 {
            return Err(err("OVERFLOW", "Sale total exceeds supported limits."));
        }
        let discount = nonnegative(p, "discount")?;
        if discount > subtotal {
            return Err(err("VALIDATION", "Discount cannot exceed the subtotal."));
        }
        if discount > 0 {
            self.require("discount")?;
        }
        let mut cumulative_subtotal = 0i64;
        let mut allocated = 0i64;
        let tax_enabled = setting(self.c()?, "tax_enabled") == "1";
        for l in out.iter_mut() {
            cumulative_subtotal += l.subtotal;
            let cumulative_discount = if subtotal == 0 {
                0
            } else {
                ((discount as i128 * cumulative_subtotal as i128) / subtotal as i128) as i64
            };
            l.discount = cumulative_discount - allocated;
            allocated = cumulative_discount;
            l.tax = if tax_enabled {
                rounded(
                    (l.subtotal - l.discount) as i128 * integer(&l.product, "tax_bps")? as i128,
                    10000,
                )?
            } else {
                0
            };
            l.total = l.subtotal - l.discount + l.tax;
        }
        Ok(out)
    }
    pub fn quote(&self, p: &Value) -> Result<Value> {
        let lines = self.cart(p)?;
        Ok(
            json!({"subtotal":lines.iter().map(|l|l.subtotal).sum::<i64>().to_string(),"discount":lines.iter().map(|l|l.discount).sum::<i64>().to_string(),"tax":lines.iter().map(|l|l.tax).sum::<i64>().to_string(),"total":lines.iter().map(|l|l.total).sum::<i64>().to_string(),"lines":lines.iter().map(|l|json!({"product_id":l.product["id"],"quantity":l.quantity.to_string(),"subtotal":l.subtotal.to_string(),"discount":l.discount.to_string(),"tax":l.tax.to_string(),"total":l.total.to_string()})).collect::<Vec<_>>()}),
        )
    }
    pub fn cash(&self, amount: i64, kind: &str, source: &str) -> Result<()> {
        if amount == 0 {
            return Ok(());
        }
        let session: Option<String> = self
            .c()?
            .query_row(
                "SELECT id FROM register_sessions WHERE closed_at IS NULL",
                [],
                |r| r.get(0),
            )
            .optional()?;
        let session = session.ok_or_else(|| {
            err(
                "REGISTER_CLOSED",
                "Open a cash register before recording cash movements.",
            )
        })?;
        if amount < 0 {
            let expected=scalar(self.c()?,"SELECT opening+COALESCE((SELECT sum(amount) FROM cash_movements WHERE session_id=r.id),0) FROM register_sessions r WHERE id=?1",&[&session])?;
            if expected + amount < 0 {
                return Err(err("CASH", "The register does not have enough cash."));
            }
        }
        self.c()?.execute("INSERT INTO cash_movements(id,session_id,amount,kind,source_id,actor_id) VALUES(?1,?2,?3,?4,?5,?6)",params![id(),session,amount,kind,source,self.actor()?.id])?;
        Ok(())
    }
    pub fn checkout(&self, p: &Value) -> Result<Value> {
        let lines = self.cart(p)?;
        let total = lines.iter().map(|l| l.total).sum::<i64>();
        if total > 1_000_000_000_000 {
            return Err(err("OVERFLOW", "Sale total exceeds supported limits."));
        }
        let cash = nonnegative(p, "cash")?;
        let other = nonnegative(p, "other")?;
        if other > total {
            return Err(err(
                "VALIDATION",
                "Non-cash payment cannot exceed the total.",
            ));
        }
        let paid_cash = cash.min(total - other);
        let change = cash - paid_cash;
        let debt = total - paid_cash - other;
        let customer = if s(p, "customer_id").is_empty() {
            None
        } else {
            Some(required(p, "customer_id")?)
        };
        if debt > 0 {
            let customer = customer.as_ref().ok_or_else(|| {
                err(
                    "PAYMENT",
                    "Full payment or a registered credit customer is required.",
                )
            })?;
            let limit = scalar(
                self.c()?,
                "SELECT credit_limit FROM customers WHERE id=?1",
                &[customer],
            )?;
            let balance = scalar(
                self.c()?,
                "SELECT COALESCE(sum(amount),0) FROM customer_ledger WHERE customer_id=?1",
                &[customer],
            )?;
            if balance.checked_add(debt).is_none_or(|v| v > limit) {
                return Err(err(
                    "CREDIT_LIMIT",
                    "This sale exceeds the customer's credit limit.",
                ));
            }
        }
        let sale = id();
        let number = format!(
            "RD-{:06}",
            scalar(self.c()?, "SELECT count(*)+1 FROM sales", &[])?
        );
        let subtotal = lines.iter().map(|l| l.subtotal).sum::<i64>();
        let discount = lines.iter().map(|l| l.discount).sum::<i64>();
        let tax = lines.iter().map(|l| l.tax).sum::<i64>();
        self.c()?.execute("INSERT INTO sales(id,number,request_id,customer_id,cashier_id,subtotal,discount,tax,total,cost,tendered,change_due) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,0,?10,?11)",params![sale,number,s(p,"request_id"),customer,self.actor()?.id,subtotal,discount,tax,total,cash+other,change])?;
        let mut total_cost = 0i64;
        for l in lines {
            let product_id = s(&l.product, "id");
            let lots=list(self.c()?,"SELECT * FROM lots WHERE product_id=?1 AND quantity>0 AND (expires IS NULL OR expires>=?2) ORDER BY expires IS NULL,expires,received_at,id",&[&product_id,&today()])?;
            let available = lots
                .iter()
                .map(|lot| integer(lot, "quantity").unwrap_or(0))
                .sum::<i64>();
            if available < l.quantity {
                return Err(err(
                    "INSUFFICIENT_STOCK",
                    &format!("Not enough unexpired stock for {}.", s(&l.product, "name")),
                ));
            }
            let item = id();
            self.c()?.execute("INSERT INTO sale_items(id,sale_id,product_id,name,sku,unit,quantity,price,subtotal,discount,tax,total,cost,tax_bps) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,0,?13)",params![item,sale,product_id,s(&l.product,"name"),s(&l.product,"sku"),s(&l.product,"unit"),l.quantity,integer(&l.product,"price")?,l.subtotal,l.discount,l.tax,l.total,integer(&l.product,"tax_bps")?])?;
            self.c()?.execute(
                "UPDATE sale_items SET name_dari=?1 WHERE id=?2",
                params![s(&l.product, "name_dari"), item],
            )?;
            let mut left = l.quantity;
            let mut cost = 0;
            for lot in lots {
                if left == 0 {
                    break;
                }
                let qty = left.min(integer(&lot, "quantity")?);
                let allocated_cost = line_total(integer(&lot, "cost")?, qty)?;
                cost += allocated_cost;
                self.c()?.execute(
                    "UPDATE lots SET quantity=quantity-?1 WHERE id=?2 AND quantity>=?1",
                    params![qty, s(&lot, "id")],
                )?;
                self.c()?.execute("INSERT INTO sale_allocations(id,item_id,lot_id,quantity,cost) VALUES(?1,?2,?3,?4,?5)",params![id(),item,s(&lot,"id"),qty,allocated_cost])?;
                self.movement(product_id, s(&lot, "id"), -qty, "sale", &sale)?;
                left -= qty;
            }
            self.c()?.execute(
                "UPDATE sale_items SET cost=?1 WHERE id=?2",
                params![cost, item],
            )?;
            total_cost += cost;
        }
        if self.fail_checkout {
            return Err(err("SIMULATED", "Injected failure before checkout commit."));
        }
        self.c()?.execute(
            "UPDATE sales SET cost=?1 WHERE id=?2",
            params![total_cost, sale],
        )?;
        for (method, amount) in [("cash", paid_cash), ("other", other)] {
            if amount > 0 {
                self.c()?.execute(
                    "INSERT INTO payments(id,sale_id,method,amount) VALUES(?1,?2,?3,?4)",
                    params![id(), sale, method, amount],
                )?;
            }
        }
        self.cash(paid_cash, "sale", &sale)?;
        if debt > 0 {
            self.c()?.execute("INSERT INTO customer_ledger(id,customer_id,sale_id,amount,kind,source_id) VALUES(?1,?2,?3,?4,'sale',?3)",params![id(),customer,sale,debt])?;
        }
        if !s(p, "held_id").is_empty() {
            self.c()?
                .execute("DELETE FROM held_carts WHERE id=?1", [s(p, "held_id")])?;
        }
        self.receipt(&sale)
    }
    pub fn movement(
        &self,
        product: &str,
        lot: &str,
        quantity: i64,
        reason: &str,
        source: &str,
    ) -> Result<()> {
        self.c()?.execute("INSERT INTO inventory_movements(id,product_id,lot_id,quantity,reason,source_id,actor_id) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![id(),product,lot,quantity,reason,source,self.actor()?.id])?;
        Ok(())
    }
    pub fn receipt(&self, sale: &str) -> Result<Value> {
        let row=list(self.c()?,"SELECT s.*,u.name cashier,c.name customer,COALESCE((SELECT sum(amount) FROM customer_ledger WHERE sale_id=s.id),0) debt FROM sales s JOIN users u ON u.id=s.cashier_id LEFT JOIN customers c ON c.id=s.customer_id WHERE s.id=?1",&[&sale])?.into_iter().next().ok_or_else(||err("NOT_FOUND","Receipt not found."))?;
        let items=list(self.c()?,"SELECT i.*,COALESCE((SELECT sum(quantity) FROM returns WHERE item_id=i.id),0) returned FROM sale_items i WHERE sale_id=?1",&[&sale])?;
        let payments = list(
            self.c()?,
            "SELECT * FROM payments WHERE sale_id=?1",
            &[&sale],
        )?;
        Ok(self.redact_receipt(json!({"sale":row,"items":items,"payments":payments})))
    }
    pub(crate) fn redact_receipt(&self, mut receipt: Value) -> Value {
        if self.require("reports").is_err() && self.require("catalog").is_err() {
            if let Some(sale) = receipt["sale"].as_object_mut() {
                sale.remove("cost");
            }
            if let Some(items) = receipt["items"].as_array_mut() {
                for item in items {
                    if let Some(item) = item.as_object_mut() {
                        item.remove("cost");
                    }
                }
            }
        }
        receipt
    }
    pub fn return_sale(&self, p: &Value) -> Result<Value> {
        let item_id = required(p, "item_id")?;
        let qty = positive(p, "quantity")?;
        let reason = required(p, "reason")?;
        let restock = p["restock"].as_bool().unwrap_or(false);
        let item=list(self.c()?,"SELECT i.*,s.customer_id FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE i.id=?1",&[&item_id])?.into_iter().next().ok_or_else(||err("NOT_FOUND","Sale item not found."))?;
        let previous = scalar(
            self.c()?,
            "SELECT COALESCE(sum(quantity),0) FROM returns WHERE item_id=?1",
            &[&item_id],
        )?;
        let sold = integer(&item, "quantity")?;
        if qty > sold - previous {
            return Err(err(
                "VALIDATION",
                "Return quantity exceeds the remaining sold quantity.",
            ));
        }
        if s(&item, "unit") == "piece" && qty % 1000 != 0 {
            return Err(err("VALIDATION", "Return whole pieces."));
        }
        let prorate = |amount: i64| -> Result<i64> {
            Ok(
                rounded(amount as i128 * (previous + qty) as i128, sold as i128)?
                    - rounded(amount as i128 * previous as i128, sold as i128)?,
            )
        };
        let amount = prorate(integer(&item, "total")?)?;
        let net = prorate(integer(&item, "total")? - integer(&item, "tax")?)?;
        let sale = s(&item, "sale_id");
        let debt = scalar(
            self.c()?,
            "SELECT COALESCE(sum(amount),0) FROM customer_ledger WHERE sale_id=?1",
            &[&sale],
        )?
        .max(0);
        let offset = amount.min(debt);
        let refund = amount - offset;
        let refund_method = if s(p, "method").is_empty() {
            "cash"
        } else {
            s(p, "method")
        };
        if !["cash", "other"].contains(&refund_method) {
            return Err(err("VALIDATION", "Choose a refund method."));
        }
        let cash_refund = if refund_method == "cash" { refund } else { 0 };
        let other_refund = refund - cash_refund;
        let return_id = id();
        let allocations=list(self.c()?,"SELECT a.*,COALESCE((SELECT sum(quantity) FROM return_allocations WHERE allocation_id=a.id),0) returned,l.expires FROM sale_allocations a JOIN lots l ON l.id=a.lot_id WHERE a.item_id=?1 ORDER BY a.id",&[&item_id])?;
        let mut left = qty;
        let mut cost = 0;
        let mut changes = vec![];
        for a in allocations {
            let available = integer(&a, "quantity")? - integer(&a, "returned")?;
            let q = available.min(left);
            if q <= 0 {
                continue;
            }
            if restock && !s(&a, "expires").is_empty() && s(&a, "expires") < today().as_str() {
                return Err(err(
                    "EXPIRED",
                    "Expired stock cannot be restocked for sale.",
                ));
            }
            let aq = integer(&a, "quantity")?;
            let ar = integer(&a, "returned")?;
            let ac = integer(&a, "cost")?;
            cost += rounded(ac as i128 * (ar + q) as i128, aq as i128)?
                - rounded(ac as i128 * ar as i128, aq as i128)?;
            changes.push((a, q));
            left -= q;
            if left == 0 {
                break;
            }
        }
        if left != 0 {
            return Err(err("INTEGRITY", "Original stock allocation is incomplete."));
        }
        self.c()?.execute("INSERT INTO returns(id,sale_id,item_id,quantity,amount,net_amount,cost_reversed,debt_offset,cash_refund,restock,reason,actor_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",params![return_id,sale,item_id,qty,amount,net,if restock{cost}else{0},offset,cash_refund,restock,reason,self.actor()?.id])?;
        for (a, q) in changes {
            self.c()?.execute(
                "INSERT INTO return_allocations(return_id,allocation_id,quantity) VALUES(?1,?2,?3)",
                params![return_id, s(&a, "id"), q],
            )?;
            if restock {
                self.c()?.execute(
                    "UPDATE lots SET quantity=quantity+?1 WHERE id=?2",
                    params![q, s(&a, "lot_id")],
                )?;
                self.movement(
                    s(&item, "product_id"),
                    s(&a, "lot_id"),
                    q,
                    "return",
                    &return_id,
                )?;
            }
        }
        if offset > 0 {
            self.c()?.execute("INSERT INTO customer_ledger(id,customer_id,sale_id,amount,kind,source_id) VALUES(?1,?2,?3,?4,'return',?5)",params![id(),s(&item,"customer_id"),sale,-offset,return_id])?;
        }
        self.c()?.execute(
            "UPDATE returns SET other_refund=?1 WHERE id=?2",
            params![other_refund, return_id],
        )?;
        self.cash(-cash_refund, "refund", &return_id)?;
        Ok(
            json!({"id":return_id,"amount":amount.to_string(),"cash_refund":cash_refund.to_string(),"other_refund":other_refund.to_string(),"debt_offset":offset.to_string()}),
        )
    }
}
