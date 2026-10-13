use crate::db::*;
use rusqlite::params;
use serde_json::{json, Value};
impl Service {
    pub fn category_save(&self, p: &Value) -> Result<Value> {
        let cid = if s(p, "id").is_empty() {
            id()
        } else {
            required(p, "id")?
        };
        self.c()?.execute("INSERT INTO categories(id,name) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET name=excluded.name",params![cid,required(p,"name")?])?;
        Ok(json!({"id":cid}))
    }
    pub fn product_save(&self, p: &Value) -> Result<Value> {
        let pid = if s(p, "id").is_empty() {
            id()
        } else {
            required(p, "id")?
        };
        let exists = scalar(
            self.c()?,
            "SELECT count(*) FROM products WHERE id=?1",
            &[&pid],
        )? > 0;
        let unit = required(p, "unit")?;
        if !["piece", "kg", "liter", "meter"].contains(&unit.as_str()) {
            return Err(err("VALIDATION", "Choose a supported base unit."));
        }
        let category = if s(p, "category_id").is_empty() {
            None
        } else {
            Some(s(p, "category_id"))
        };
        let sku = required(p, "sku")?;
        if sku.starts_with("radefy:") {
            return Err(err(
                "VALIDATION",
                "This identifier prefix is reserved for internal labels.",
            ));
        }
        if scalar(
            self.c()?,
            "SELECT count(*) FROM product_barcodes WHERE code=?1 AND product_id<>?2",
            &[&sku, &pid],
        )? > 0
        {
            return Err(err(
                "VALIDATION",
                "This SKU is already used as another product's barcode.",
            ));
        }
        required(p, "price")?;
        required(p, "cost")?;
        let price = nonnegative(p, "price")?;
        let cost = nonnegative(p, "cost")?;
        let min = nonnegative(p, "min_stock")?;
        let tax = nonnegative(p, "tax_bps")?;
        if tax > 10000 {
            return Err(err("VALIDATION", "Tax cannot exceed 100%."));
        }
        if exists {
            let old_unit: String =
                self.c()?
                    .query_row("SELECT unit FROM products WHERE id=?1", [&pid], |r| {
                        r.get(0)
                    })?;
            if old_unit != unit
                && scalar(
                    self.c()?,
                    "SELECT count(*) FROM inventory_movements WHERE product_id=?1",
                    &[&pid],
                )? > 0
            {
                return Err(err(
                    "VALIDATION",
                    "A product's base unit cannot change after stock movements.",
                ));
            }
        }
        self.c()?.execute("INSERT INTO products(id,name,name_dari,sku,category_id,unit,price,cost,min_stock,tax_bps,track_expiry,active) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12) ON CONFLICT(id) DO UPDATE SET name=excluded.name,name_dari=excluded.name_dari,sku=excluded.sku,category_id=excluded.category_id,unit=excluded.unit,price=excluded.price,cost=excluded.cost,min_stock=excluded.min_stock,tax_bps=excluded.tax_bps,track_expiry=excluded.track_expiry,active=excluded.active",params![pid,required(p,"name")?,s(p,"name_dari"),sku,category,unit,price,cost,min,tax,if s(p,"track_expiry")=="1"{1}else{0},if s(p,"active")=="0"{0}else{1}])?;
        if let Some(codes) = p["barcodes"].as_array() {
            self.c()?
                .execute("DELETE FROM product_barcodes WHERE product_id=?1", [&pid])?;
            for b in codes {
                let code = required(b, "code")?;
                if (code.starts_with("radefy:") && code != format!("radefy:{pid}"))
                    || scalar(
                        self.c()?,
                        "SELECT count(*) FROM products WHERE sku=?1 AND id<>?2",
                        &[&code, &pid],
                    )? > 0
                {
                    return Err(err(
                        "VALIDATION",
                        "This barcode is already used by another product.",
                    ));
                }
                let mult = positive(b, "multiplier")?;
                if mult % 1000 != 0 && unit == "piece" {
                    return Err(err("VALIDATION", "Pack sizes must contain whole pieces."));
                }
                self.c()?.execute(
                    "INSERT INTO product_barcodes(code,product_id,multiplier) VALUES(?1,?2,?3)",
                    params![code, pid, mult],
                )?;
            }
        }
        self.c()?.execute(
            "INSERT OR IGNORE INTO product_barcodes(code,product_id,multiplier) VALUES(?1,?2,1000)",
            params![format!("radefy:{pid}"), pid],
        )?;
        let opening = nonnegative(p, "opening_stock")?;
        if !exists && opening > 0 {
            self.require("inventory")?;
            self.add_lot(
                &pid,
                opening,
                cost,
                s(p, "batch"),
                s(p, "expires"),
                "opening",
                &pid,
            )?;
        }
        if let Some(image) = p.get("image").and_then(Value::as_str) {
            self.save_media(&format!("product:{pid}"), image)?;
        }
        Ok(json!({"id":pid}))
    }
    pub fn add_lot(
        &self,
        product: &str,
        quantity: i64,
        cost: i64,
        batch: &str,
        expires: &str,
        reason: &str,
        source: &str,
    ) -> Result<String> {
        let product_row = list(
            self.c()?,
            "SELECT unit,track_expiry FROM products WHERE id=?1",
            &[&product],
        )?
        .into_iter()
        .next()
        .ok_or_else(|| err("NOT_FOUND", "Product not found."))?;
        if s(&product_row, "unit") == "piece" && quantity % 1000 != 0 {
            return Err(err(
                "VALIDATION",
                "Piece products require whole stock quantities.",
            ));
        }
        if s(&product_row, "track_expiry") == "1" && expires.is_empty() {
            return Err(err(
                "VALIDATION",
                "An expiry date is required for this product.",
            ));
        }
        let expiry = if expires.is_empty() {
            None
        } else {
            chrono::NaiveDate::parse_from_str(expires, "%Y-%m-%d")
                .map_err(|_| err("VALIDATION", "Use a valid expiry date."))?;
            Some(expires)
        };
        line_total(cost, quantity)?;
        let lot = id();
        self.c()?.execute(
            "INSERT INTO lots(id,product_id,batch,expires,quantity,cost) VALUES(?1,?2,?3,?4,?5,?6)",
            params![
                lot,
                product,
                if batch.is_empty() { "OPENING" } else { batch },
                expiry,
                quantity,
                cost
            ],
        )?;
        self.movement(product, &lot, quantity, reason, source)?;
        Ok(lot)
    }
    pub fn stock_adjust(&self, p: &Value) -> Result<Value> {
        let lot = required(p, "lot_id")?;
        let reason = required(p, "reason")?;
        let count = nonnegative(p, "counted")?;
        let rows = list(
            self.c()?,
            "SELECT l.*,p.unit FROM lots l JOIN products p ON p.id=l.product_id WHERE l.id=?1",
            &[&lot],
        )?;
        let l = rows
            .first()
            .ok_or_else(|| err("NOT_FOUND", "Lot not found."))?;
        let expected = nonnegative(p, "expected")?;
        let current = integer(l, "quantity")?;
        if expected != current {
            return Err(err(
                "CONFLICT",
                "Stock changed while counting. Refresh and count again.",
            ));
        }
        if s(l, "unit") == "piece" && count % 1000 != 0 {
            return Err(err("VALIDATION", "Count whole pieces."));
        }
        self.c()?.execute("INSERT INTO stock_counts(id,lot_id,expected,counted,reason,actor_id) VALUES(?1,?2,?3,?4,?5,?6)",params![id(),lot,expected,count,reason,self.actor()?.id])?;
        line_total(integer(l, "cost")?, count)?;
        let difference = count - current;
        if difference == 0 {
            return Err(err(
                "VALIDATION",
                "Count matches current stock; no adjustment is needed.",
            ));
        }
        self.c()?.execute(
            "UPDATE lots SET quantity=?1 WHERE id=?2",
            params![count, lot],
        )?;
        self.movement(
            s(l, "product_id"),
            &lot,
            difference,
            &format!("count: {reason}"),
            s(p, "request_id"),
        )?;
        Ok(json!({"id":lot,"difference":difference.to_string()}))
    }
    pub fn party_save(&self, action: &str, p: &Value) -> Result<Value> {
        let party = if s(p, "id").is_empty() {
            id()
        } else {
            required(p, "id")?
        };
        let name = required(p, "name")?;
        let phone = s(p, "phone");
        let address = s(p, "address");
        let notes = s(p, "notes");
        if action == "customer_save" {
            self.c()?.execute("INSERT INTO customers(id,name,phone,address,notes,credit_limit) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone,address=excluded.address,notes=excluded.notes,credit_limit=excluded.credit_limit",params![party,name,phone,address,notes,nonnegative(p,"credit_limit")?])?;
        } else {
            self.c()?.execute("INSERT INTO suppliers(id,name,phone,address,notes) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone,address=excluded.address,notes=excluded.notes",params![party,name,phone,address,notes])?;
        }
        if s(p, "id").is_empty() {
            let opening = nonnegative(p, "opening_balance")?;
            if opening > 0 {
                self.require("finance")?;
                if action == "customer_save" {
                    self.c()?.execute("INSERT INTO customer_ledger(id,customer_id,amount,kind) VALUES(?1,?2,?3,'opening')",params![id(),party,opening])?;
                } else {
                    self.c()?.execute("INSERT INTO supplier_ledger(id,supplier_id,amount,kind) VALUES(?1,?2,?3,'opening')",params![id(),party,opening])?;
                }
            }
        }
        Ok(json!({"id":party}))
    }
    pub fn party_payment(&self, action: &str, p: &Value) -> Result<Value> {
        let party = required(p, "id")?;
        let amount = positive(p, "amount")?;
        let payment = id();
        let customer = action == "customer_payment";
        let balance = if customer {
            scalar(
                self.c()?,
                "SELECT COALESCE(sum(amount),0) FROM customer_ledger WHERE customer_id=?1",
                &[&party],
            )?
        } else {
            scalar(
                self.c()?,
                "SELECT COALESCE(sum(amount),0) FROM supplier_ledger WHERE supplier_id=?1",
                &[&party],
            )?
        };
        if amount > balance {
            return Err(err(
                "VALIDATION",
                "Payment exceeds the outstanding balance.",
            ));
        }
        let method = required(p, "method")?;
        if !["cash", "other"].contains(&method.as_str()) {
            return Err(err("VALIDATION", "Choose cash or other payment."));
        }
        if customer {
            self.c()?.execute("INSERT INTO customer_payments(id,customer_id,amount,method,actor_id) VALUES(?1,?2,?3,?4,?5)",params![payment,party,amount,method,self.actor()?.id])?;
        } else {
            self.c()?.execute("INSERT INTO supplier_payments(id,supplier_id,amount,method,actor_id) VALUES(?1,?2,?3,?4,?5)",params![payment,party,amount,method,self.actor()?.id])?;
        }
        if customer {
            let balances=list(self.c()?,"SELECT sale_id,sum(amount) balance FROM customer_ledger WHERE customer_id=?1 GROUP BY sale_id HAVING sum(amount)>0 ORDER BY min(created_at),sale_id",&[&party])?;
            let mut remaining = amount;
            for b in balances {
                let n = remaining.min(integer(&b, "balance")?);
                if n <= 0 {
                    break;
                }
                let sale = b["sale_id"].as_str();
                self.c()?.execute("INSERT INTO customer_ledger(id,customer_id,sale_id,amount,kind,source_id) VALUES(?1,?2,?3,?4,'payment',?5)",params![id(),party,sale,-n,payment])?;
                remaining -= n;
            }
        } else {
            self.c()?.execute("INSERT INTO supplier_ledger(id,supplier_id,amount,kind,source_id) VALUES(?1,?2,?3,'payment',?4)",params![id(),party,-amount,payment])?;
        }
        if method == "cash" {
            self.cash(
                if customer { amount } else { -amount },
                if customer {
                    "collection"
                } else {
                    "supplier payment"
                },
                &payment,
            )?;
        }
        Ok(json!({"id":payment,"amount":amount.to_string()}))
    }
    pub fn purchase_save(&self, p: &Value) -> Result<Value> {
        let purchase = id();
        let supplier = required(p, "supplier_id")?;
        let items = p["items"]
            .as_array()
            .filter(|a| !a.is_empty())
            .ok_or_else(|| err("VALIDATION", "Add at least one purchase line."))?;
        let number = format!(
            "PO-{:05}",
            scalar(self.c()?, "SELECT count(*)+1 FROM purchases", &[])?
        );
        self.c()?.execute(
            "INSERT INTO purchases(id,number,supplier_id,invoice) VALUES(?1,?2,?3,?4)",
            params![purchase, number, supplier, s(p, "invoice")],
        )?;
        for line in items {
            let product = required(line, "product_id")?;
            let quantity = positive(line, "quantity")?;
            let unit: String =
                self.c()?
                    .query_row("SELECT unit FROM products WHERE id=?1", [&product], |r| {
                        r.get(0)
                    })?;
            if unit == "piece" && quantity % 1000 != 0 {
                return Err(err("VALIDATION", "Order whole pieces."));
            }
            self.c()?.execute("INSERT INTO purchase_items(id,purchase_id,product_id,quantity,cost) VALUES(?1,?2,?3,?4,?5)",params![id(),purchase,product,quantity,nonnegative(line,"cost")?])?;
        }
        Ok(json!({"id":purchase,"number":number}))
    }
    pub fn purchase_receive(&self, p: &Value) -> Result<Value> {
        let item = required(p, "item_id")?;
        let row=list(self.c()?,"SELECT i.*,p.supplier_id FROM purchase_items i JOIN purchases p ON p.id=i.purchase_id WHERE i.id=?1",&[&item])?.into_iter().next().ok_or_else(||err("NOT_FOUND","Purchase line not found."))?;
        let quantity = positive(p, "quantity")?;
        if quantity > integer(&row, "quantity")? - integer(&row, "received")? {
            return Err(err(
                "VALIDATION",
                "Delivery exceeds the outstanding order quantity.",
            ));
        }
        let receipt = id();
        let purchase = s(&row, "purchase_id");
        let cost = integer(&row, "cost")?;
        let lot = self.add_lot(
            s(&row, "product_id"),
            quantity,
            cost,
            s(p, "batch"),
            s(p, "expires"),
            "purchase",
            &receipt,
        )?;
        let total = line_total(cost, quantity)?;
        self.c()?.execute("INSERT INTO purchase_receipts(id,purchase_id,item_id,lot_id,quantity,total,request_id) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![receipt,purchase,item,lot,quantity,total,s(p,"request_id")])?;
        self.c()?.execute(
            "UPDATE purchase_items SET received=received+?1 WHERE id=?2",
            params![quantity, item],
        )?;
        let remaining = scalar(
            self.c()?,
            "SELECT sum(quantity-received) FROM purchase_items WHERE purchase_id=?1",
            &[&purchase],
        )?;
        self.c()?.execute(
            "UPDATE purchases SET status=?1 WHERE id=?2",
            params![
                if remaining == 0 {
                    "received"
                } else {
                    "partial"
                },
                purchase
            ],
        )?;
        if total > 0 {
            self.c()?.execute("INSERT INTO supplier_ledger(id,supplier_id,amount,kind,source_id) VALUES(?1,?2,?3,'purchase',?4)",params![id(),s(&row,"supplier_id"),total,receipt])?;
        }
        self.c()?.execute(
            "UPDATE products SET cost=?1 WHERE id=?2",
            params![cost, s(&row, "product_id")],
        )?;
        Ok(json!({"id":receipt,"lot_id":lot,"total":total.to_string()}))
    }
    pub fn supplier_return(&self, p: &Value) -> Result<Value> {
        let receipt = required(p, "receipt_id")?;
        let quantity = positive(p, "quantity")?;
        let reason = required(p, "reason")?;
        let row=list(self.c()?,"SELECT r.*,p.supplier_id,l.product_id,l.quantity stock,l.cost,pr.unit FROM purchase_receipts r JOIN purchases p ON p.id=r.purchase_id JOIN lots l ON l.id=r.lot_id JOIN products pr ON pr.id=l.product_id WHERE r.id=?1",&[&receipt])?.into_iter().next().ok_or_else(||err("NOT_FOUND","Receipt not found."))?;
        let returned = scalar(
            self.c()?,
            "SELECT COALESCE(sum(quantity),0) FROM supplier_returns WHERE receipt_id=?1",
            &[&receipt],
        )?;
        if quantity > integer(&row, "quantity")? - returned || quantity > integer(&row, "stock")? {
            return Err(err(
                "VALIDATION",
                "Return exceeds received or available stock.",
            ));
        }
        if s(&row, "unit") == "piece" && quantity % 1000 != 0 {
            return Err(err("VALIDATION", "Return whole pieces."));
        }
        let total = integer(&row, "total")?;
        let original_qty = integer(&row, "quantity")?;
        let amount = rounded(
            total as i128 * (returned + quantity) as i128,
            original_qty as i128,
        )? - rounded(total as i128 * returned as i128, original_qty as i128)?;
        let ret = id();
        self.c()?.execute("INSERT INTO supplier_returns(id,supplier_id,receipt_id,lot_id,quantity,amount,reason) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![ret,s(&row,"supplier_id"),receipt,s(&row,"lot_id"),quantity,amount,reason])?;
        self.c()?.execute(
            "UPDATE lots SET quantity=quantity-?1 WHERE id=?2",
            params![quantity, s(&row, "lot_id")],
        )?;
        self.movement(
            s(&row, "product_id"),
            s(&row, "lot_id"),
            -quantity,
            "supplier return",
            &ret,
        )?;
        if amount > 0 {
            self.c()?.execute("INSERT INTO supplier_ledger(id,supplier_id,amount,kind,source_id) VALUES(?1,?2,?3,'return',?4)",params![id(),s(&row,"supplier_id"),-amount,ret])?;
        }
        Ok(json!({"id":ret,"amount":amount.to_string()}))
    }
    pub fn expense(&self, p: &Value) -> Result<Value> {
        let expense = id();
        let amount = positive(p, "amount")?;
        let method = required(p, "method")?;
        if !["cash", "other"].contains(&method.as_str()) {
            return Err(err("VALIDATION", "Choose a payment method."));
        }
        self.c()?.execute("INSERT INTO expenses(id,category,description,amount,method,actor_id) VALUES(?1,?2,?3,?4,?5,?6)",params![expense,required(p,"category")?,required(p,"description")?,amount,method,self.actor()?.id])?;
        if method == "cash" {
            self.cash(-amount, "expense", &expense)?;
        }
        Ok(json!({"id":expense}))
    }
    pub fn register(&self, action: &str, p: &Value) -> Result<Value> {
        match action {
            "register_open" => {
                let session = id();
                self.c()?.execute(
                    "INSERT INTO register_sessions(id,opened_by,opening) VALUES(?1,?2,?3)",
                    params![session, self.actor()?.id, nonnegative(p, "opening")?],
                )?;
                Ok(json!({"id":session}))
            }
            "register_close" => {
                let session = required(p, "id")?;
                let expected=scalar(self.c()?,"SELECT opening+COALESCE((SELECT sum(amount) FROM cash_movements WHERE session_id=r.id),0) FROM register_sessions r WHERE id=?1 AND closed_at IS NULL",&[&session])?;
                let counted = nonnegative(p, "counted")?;
                let notes = s(p, "notes");
                if counted != expected && notes.trim().is_empty() {
                    return Err(err(
                        "VALIDATION",
                        "Explain the cash difference before closing.",
                    ));
                }
                self.c()?.execute("UPDATE register_sessions SET closed_at=CURRENT_TIMESTAMP,counted=?1,expected=?2,notes=?3 WHERE id=?4 AND closed_at IS NULL",params![counted,expected,notes,session])?;
                Ok(json!({"id":session,"variance":(counted-expected).to_string()}))
            }
            _ => {
                let amount = positive(p, "amount")?;
                let reason = required(p, "reason")?;
                let direction = required(p, "direction")?;
                if !["deposit", "withdrawal"].contains(&direction.as_str()) {
                    return Err(err("VALIDATION", "Choose deposit or withdrawal."));
                }
                self.cash(
                    if direction == "deposit" {
                        amount
                    } else {
                        -amount
                    },
                    &format!("{direction}: {reason}"),
                    s(p, "request_id"),
                )?;
                Ok(json!({"saved":true}))
            }
        }
    }
    pub fn hold(&self, action: &str, p: &Value) -> Result<Value> {
        if action == "hold_delete" {
            self.c()?
                .execute("DELETE FROM held_carts WHERE id=?1", [required(p, "id")?])?;
            return Ok(json!({"saved":true}));
        }
        let payload = &p["cart"];
        self.quote(payload)?;
        let held = if s(p, "id").is_empty() {
            id()
        } else {
            required(p, "id")?
        };
        if !s(p, "id").is_empty() {
            let updated = self.c()?.execute(
                "UPDATE held_carts SET name=?1,payload=?2 WHERE id=?3",
                params![required(p, "name")?, payload.to_string(), held],
            )?;
            if updated == 0 {
                return Err(err("NOT_FOUND", "Held sale not found."));
            }
            return Ok(json!({"id":held}));
        }
        self.c()?.execute(
            "INSERT INTO held_carts(id,name,payload,actor_id) VALUES(?1,?2,?3,?4)",
            params![
                held,
                required(p, "name")?,
                payload.to_string(),
                self.actor()?.id
            ],
        )?;
        Ok(json!({"id":held}))
    }
    pub fn import_preview(&self, p: &Value) -> Result<Value> {
        let content = required_csv(p)?;
        let mut reader = csv::Reader::from_reader(content.as_bytes());
        let headers = reader
            .headers()
            .map_err(|e| err("CSV", &e.to_string()))?
            .clone();
        for key in ["name", "sku", "unit", "price", "cost", "barcode"] {
            if !headers.iter().any(|h| h == key) {
                return Err(err(
                    "CSV",
                    &format!("Missing column: {key}. Amounts must be integer AFN minor units."),
                ));
            }
        }
        let mut rows = vec![];
        let mut errors = vec![];
        let mut seen = std::collections::HashSet::new();
        let mut codes = std::collections::HashSet::new();
        for (index, row) in reader.records().enumerate() {
            if index >= 10000 {
                return Err(err("CSV", "Import up to 10,000 products at a time."));
            }
            let row = row.map_err(|e| err("CSV", &e.to_string()))?;
            let mut object = serde_json::Map::new();
            for (key, value) in headers.iter().zip(row.iter()) {
                object.insert(key.into(), json!(value));
            }
            let mut v = Value::Object(object);
            let sku = s(&v, "sku").to_string();
            let code = s(&v, "barcode").to_string();
            if sku.is_empty()
                || s(&v, "name").trim().is_empty()
                || !seen.insert(sku.clone())
                || scalar(
                    self.c()?,
                    "SELECT count(*) FROM products WHERE sku=?1",
                    &[&sku],
                )? > 0
            {
                errors.push(format!(
                    "Row {}: missing name or duplicate/empty SKU.",
                    index + 2
                ));
            }
            if !code.is_empty()
                && (!codes.insert(code.clone())
                    || scalar(
                        self.c()?,
                        "SELECT count(*) FROM product_barcodes WHERE code=?1",
                        &[&code],
                    )? > 0)
            {
                errors.push(format!("Row {}: duplicate barcode.", index + 2));
            }
            if s(&v, "price").is_empty()
                || s(&v, "cost").is_empty()
                || !["piece", "kg", "liter", "meter"].contains(&s(&v, "unit"))
                || nonnegative(&v, "price").is_err()
                || nonnegative(&v, "cost").is_err()
            {
                errors.push(format!("Row {}: invalid unit, price or cost.", index + 2));
            }
            v["barcodes"] = if code.is_empty() {
                json!([])
            } else {
                json!([{"code":code,"multiplier":"1000"}])
            };
            v["opening_stock"] = json!("0");
            rows.push(v);
        }
        Ok(json!({"rows":rows,"errors":errors}))
    }
    pub fn import_commit(&self, p: &Value) -> Result<Value> {
        let result = self.import_preview(p)?;
        if !result["errors"].as_array().is_some_and(|v| v.is_empty()) {
            return Err(err("CSV", "Fix import errors before committing."));
        }
        let rows = result["rows"].as_array().unwrap();
        for row in rows {
            self.product_save(row)?;
        }
        Ok(json!({"count":rows.len()}))
    }
}
fn required_csv(p: &Value) -> Result<String> {
    let text = s(p, "csv");
    if text.is_empty() || text.len() > 5_000_000 {
        return Err(err("CSV", "Choose a CSV file smaller than 5 MB."));
    }
    Ok(text.into())
}
