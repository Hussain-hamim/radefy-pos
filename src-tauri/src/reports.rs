use crate::db::*;
use serde_json::{json, Value};
impl Service {
    pub fn snapshot(&self, p: &Value) -> Result<Value> {
        let c = self.c()?;
        let a = self.actor()?;
        let can = |permission: &str| a.role == "owner" || a.permissions.contains(permission);
        let from = if s(p, "from").is_empty() {
            (chrono::Utc::now() + chrono::Duration::minutes(270) - chrono::Duration::days(29))
                .format("%Y-%m-%d")
                .to_string()
        } else {
            required(p, "from")?
        };
        let to = if s(p, "to").is_empty() {
            today()
        } else {
            required(p, "to")?
        };
        for d in [&from, &to] {
            chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d")
                .map_err(|_| err("VALIDATION", "Choose a valid date range."))?;
        }
        if from > to {
            return Err(err(
                "VALIDATION",
                "The start date must precede the end date.",
            ));
        }
        let days = (chrono::NaiveDate::parse_from_str(&to, "%Y-%m-%d").unwrap()
            - chrono::NaiveDate::parse_from_str(&from, "%Y-%m-%d").unwrap())
        .num_days();
        if days > 365 {
            return Err(err(
                "VALIDATION",
                "Choose a date range of at most 366 days.",
            ));
        }
        let mut settings = list(c, "SELECT key,value FROM settings", &[])?
            .into_iter()
            .map(|r| (s(&r, "key").to_string(), r["value"].clone()))
            .collect::<serde_json::Map<_, _>>();
        settings.insert("logo".into(), json!(self.read_media("store-logo")?));
        let mut products=list(c,"SELECT p.*,c.name category,COALESCE((SELECT sum(fixed_total(cost,quantity)) FROM lots WHERE product_id=p.id),0) valuation,COALESCE((SELECT sum(quantity) FROM lots WHERE product_id=p.id),0) stock,COALESCE((SELECT sum(quantity) FROM lots WHERE product_id=p.id AND (expires IS NULL OR expires>=?1)),0) available,(SELECT min(expires) FROM lots WHERE product_id=p.id AND quantity>0) next_expiry FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY p.name",&[&today()])?;
        for product in &mut products {
            product["image"] = json!(self.read_media(&format!("product:{}", s(product, "id")))?);
        }
        if !can("catalog") && !can("reports") && !can("inventory") && !can("purchase") {
            for product in &mut products {
                product.as_object_mut().unwrap().remove("cost");
                product.as_object_mut().unwrap().remove("valuation");
            }
        }
        let mut out = json!({"mode":self.mode,"preview":self.preview,"user":{"id":a.id,"name":a.name,"role":a.role,"permissions":a.permissions},"settings":settings,"products":products,"categories":list(c,"SELECT c.*, (SELECT count(*) FROM products WHERE category_id=c.id) products FROM categories c ORDER BY name",&[])?,"barcodes":list(c,"SELECT * FROM product_barcodes",&[])?,"held":if can("sell"){list(c,"SELECT * FROM held_carts ORDER BY created_at DESC",&[])?}else{vec![]},"from":from,"to":to});
        let queries:[(&str,&str,bool);17]=[
 ("lots","SELECT l.*,p.name,p.unit FROM lots l JOIN products p ON p.id=l.product_id ORDER BY l.received_at DESC",can("inventory")||can("purchase")||can("reports")),
 ("movements","SELECT m.*,p.name,p.unit,l.batch,u.name actor FROM inventory_movements m JOIN products p ON p.id=m.product_id JOIN lots l ON l.id=m.lot_id JOIN users u ON u.id=m.actor_id ORDER BY m.created_at DESC,m.rowid DESC",can("inventory")||can("reports")),
 ("customers","SELECT c.*,COALESCE((SELECT sum(amount) FROM customer_ledger WHERE customer_id=c.id),0) balance,(SELECT count(*) FROM sales WHERE customer_id=c.id) orders FROM customers c ORDER BY name",can("customers")||can("sell")||can("reports")),
 ("customer_ledger","SELECT l.*,c.name,s.number sale_number FROM customer_ledger l JOIN customers c ON c.id=l.customer_id LEFT JOIN sales s ON s.id=l.sale_id ORDER BY l.created_at DESC",can("customers")||can("reports")),
 ("suppliers","SELECT s.*,COALESCE((SELECT sum(amount) FROM supplier_ledger WHERE supplier_id=s.id),0) balance,(SELECT count(*) FROM purchases WHERE supplier_id=s.id) orders FROM suppliers s ORDER BY name",can("purchase")||can("finance")||can("reports")),
 ("supplier_ledger","SELECT l.*,s.name FROM supplier_ledger l JOIN suppliers s ON s.id=l.supplier_id ORDER BY l.created_at DESC",can("purchase")||can("finance")||can("reports")),
 ("purchases","SELECT p.*,s.name supplier,(SELECT sum(fixed_total(cost,quantity)) FROM purchase_items WHERE purchase_id=p.id) total FROM purchases p JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.created_at DESC",can("purchase")||can("reports")),
 ("purchase_items","SELECT i.*,p.name,p.unit FROM purchase_items i JOIN products p ON p.id=i.product_id",can("purchase")||can("reports")),
 ("purchase_receipts","SELECT r.*,p.name,p.unit,l.batch,l.quantity stock,COALESCE((SELECT sum(quantity) FROM supplier_returns WHERE receipt_id=r.id),0) returned FROM purchase_receipts r JOIN lots l ON l.id=r.lot_id JOIN products p ON p.id=l.product_id ORDER BY r.created_at DESC",can("purchase")||can("reports")),
 ("returns","SELECT r.*,s.number receipt,i.name product FROM returns r JOIN sales s ON s.id=r.sale_id JOIN sale_items i ON i.id=r.item_id ORDER BY r.created_at DESC",can("refund")||can("reports")),
 ("expenses","SELECT e.*,u.name actor FROM expenses e JOIN users u ON u.id=e.actor_id ORDER BY e.created_at DESC",can("finance")||can("reports")),
 ("registers","SELECT r.*,u.name cashier,r.opening+COALESCE((SELECT sum(amount) FROM cash_movements WHERE session_id=r.id),0) current_expected FROM register_sessions r JOIN users u ON u.id=r.opened_by ORDER BY r.opened_at DESC",can("finance")||can("sell")||can("reports")),
 ("cash_movements","SELECT m.*,u.name actor FROM cash_movements m JOIN users u ON u.id=m.actor_id ORDER BY m.created_at DESC,m.rowid DESC",can("finance")||can("reports")),
 ("users","SELECT id,name,username,role,active FROM users ORDER BY name",can("settings")),
 ("permissions","SELECT * FROM role_permissions ORDER BY role,permission",can("settings")),
 ("audit","SELECT a.*,u.name actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.rowid DESC LIMIT 500",can("settings")),
 ("supplier_returns","SELECT r.*,s.name supplier,p.name product FROM supplier_returns r JOIN suppliers s ON s.id=r.supplier_id JOIN lots l ON l.id=r.lot_id JOIN products p ON p.id=l.product_id ORDER BY r.created_at DESC",can("purchase"))];
        for (key, sql, allowed) in queries {
            out[key] = json!(if allowed { list(c, sql, &[])? } else { vec![] });
        }
        let mut sales = if can("sell") || can("reports") {
            list(c,"SELECT s.*,COALESCE(c.name,'Walk-in customer') customer,u.name cashier,COALESCE((SELECT sum(amount) FROM returns WHERE sale_id=s.id),0) refunded,COALESCE((SELECT sum(amount) FROM customer_ledger WHERE sale_id=s.id),0) debt,(SELECT count(*) FROM sale_items WHERE sale_id=s.id) items FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.cashier_id WHERE date(s.created_at,'+270 minutes') BETWEEN ?1 AND ?2 ORDER BY s.created_at DESC,s.rowid DESC",&[&from,&to])?
        } else {
            vec![]
        };
        if !can("reports") {
            for sale in &mut sales {
                sale.as_object_mut().unwrap().remove("cost");
            }
        }
        out["sales"] = json!(sales);
        if can("reports") {
            let sold=list(c,"SELECT COALESCE(sum(subtotal),0) gross_sales,COALESCE(sum(total-tax),0) net_sales,COALESCE(sum(total),0) receipts,COALESCE(sum(discount),0) discounts,COALESCE(sum(tax),0) tax,COALESCE(sum(cost),0) cogs,count(*) transactions FROM sales WHERE date(created_at,'+270 minutes') BETWEEN ?1 AND ?2",&[&from,&to])?.remove(0);
            let ret=list(c,"SELECT COALESCE(sum(amount),0) refunds,COALESCE(sum(net_amount),0) net_refunds,COALESCE(sum(cost_reversed),0) cost_reversed FROM returns WHERE date(created_at,'+270 minutes') BETWEEN ?1 AND ?2",&[&from,&to])?.remove(0);
            let expenses=scalar(c,"SELECT COALESCE(sum(amount),0) FROM expenses WHERE date(created_at,'+270 minutes') BETWEEN ?1 AND ?2",&[&from,&to])?;
            let net = integer(&sold, "net_sales")? - integer(&ret, "net_refunds")?;
            let cogs = integer(&sold, "cogs")? - integer(&ret, "cost_reversed")?;
            let stats = json!({"gross_sales":sold["gross_sales"],"sales":net.to_string(),"receipts":sold["receipts"],"transactions":sold["transactions"],"discounts":sold["discounts"],"tax":(integer(&sold,"tax")?-(integer(&ret,"refunds")?-integer(&ret,"net_refunds")?)).to_string(),"refunds":ret["refunds"],"cogs":cogs.to_string(),"gross_profit":(net-cogs).to_string(),"expenses":expenses.to_string(),"net_profit":(net-cogs-expenses).to_string(),"inventory":scalar(c,"SELECT COALESCE(sum(fixed_total(cost,quantity)),0) FROM lots",&[])?.to_string(),"low_stock":scalar(c,"SELECT count(*) FROM products p WHERE active=1 AND COALESCE((SELECT sum(quantity) FROM lots WHERE product_id=p.id AND (expires IS NULL OR expires>=?1)),0)<=min_stock",&[&today()])?.to_string(),"expiring":scalar(c,"SELECT count(*) FROM lots WHERE quantity>0 AND expires BETWEEN ?1 AND date(?1,'+30 days')",&[&today()])?.to_string(),"expired":scalar(c,"SELECT count(*) FROM lots WHERE quantity>0 AND expires<?1",&[&today()])?.to_string(),"customer_debt":scalar(c,"SELECT COALESCE(sum(amount),0) FROM customer_ledger",&[])?.to_string(),"supplier_debt":scalar(c,"SELECT COALESCE(sum(amount),0) FROM supplier_ledger",&[])?.to_string(),"items_sold":scalar(c,"SELECT COALESCE(sum(i.quantity),0) FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE date(s.created_at,'+270 minutes') BETWEEN ?1 AND ?2",&[&from,&to])?.to_string()});
            out["stats"] = stats;
            out["trend"]=json!(list(c,"WITH RECURSIVE dates(day) AS (SELECT date(?1) UNION ALL SELECT date(day,'+1 day') FROM dates WHERE day<date(?2)) SELECT day,COALESCE((SELECT sum(total-tax) FROM sales WHERE date(created_at,'+270 minutes')=day),0)-COALESCE((SELECT sum(net_amount) FROM returns WHERE date(created_at,'+270 minutes')=day),0) sales FROM dates LIMIT 366",&[&from,&to])?);
            out["best_sellers"]=json!(list(c,"SELECT p.id,p.name,p.category_id,p.unit,COALESCE((SELECT sum(i.quantity) FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE i.product_id=p.id AND date(s.created_at,'+270 minutes') BETWEEN ?1 AND ?2),0)-COALESCE((SELECT sum(r.quantity) FROM returns r JOIN sale_items i ON i.id=r.item_id WHERE i.product_id=p.id AND date(r.created_at,'+270 minutes') BETWEEN ?1 AND ?2),0) quantity,COALESCE((SELECT sum(i.total-i.tax) FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE i.product_id=p.id AND date(s.created_at,'+270 minutes') BETWEEN ?1 AND ?2),0)-COALESCE((SELECT sum(r.net_amount) FROM returns r JOIN sale_items i ON i.id=r.item_id WHERE i.product_id=p.id AND date(r.created_at,'+270 minutes') BETWEEN ?1 AND ?2),0) revenue FROM products p ORDER BY revenue DESC",&[&from,&to])?);
            out["category_report"]=json!(list(c,"SELECT COALESCE(c.name,'Uncategorized') name,COALESCE((SELECT sum(i.total-i.tax) FROM sale_items i JOIN sales s ON s.id=i.sale_id JOIN products p ON p.id=i.product_id WHERE p.category_id IS c.id AND date(s.created_at,'+270 minutes') BETWEEN ?1 AND ?2),0)-COALESCE((SELECT sum(r.net_amount) FROM returns r JOIN sale_items i ON i.id=r.item_id JOIN products p ON p.id=i.product_id WHERE p.category_id IS c.id AND date(r.created_at,'+270 minutes') BETWEEN ?1 AND ?2),0) revenue FROM (SELECT id,name FROM categories UNION ALL SELECT NULL,'Uncategorized') c ORDER BY revenue DESC",&[&from,&to])?);
            out["collections"]=json!(list(c,"SELECT p.*,c.name FROM customer_payments p JOIN customers c ON c.id=p.customer_id WHERE date(p.created_at,'+270 minutes') BETWEEN ?1 AND ?2 ORDER BY p.created_at DESC",&[&from,&to])?);
            out["payment_breakdown"]=json!(list(c,"SELECT method,sum(amount) amount FROM payments WHERE date(created_at,'+270 minutes') BETWEEN ?1 AND ?2 GROUP BY method",&[&from,&to])?);
            out["cashier_report"]=json!(list(c,"SELECT u.name,count(*) transactions,sum(s.total-s.tax) net_sales FROM sales s JOIN users u ON u.id=s.cashier_id WHERE date(s.created_at,'+270 minutes') BETWEEN ?1 AND ?2 GROUP BY u.id",&[&from,&to])?);
        } else {
            out["stats"] = json!({});
            out["trend"] = json!([]);
            out["best_sellers"] = json!([]);
            out["payment_breakdown"] = json!([]);
            out["cashier_report"] = json!([]);
            out["category_report"] = json!([]);
            out["collections"] = json!([]);
        }
        Ok(out)
    }
}
