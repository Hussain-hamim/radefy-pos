use radefy_core::{
    db::{id, list, scalar},
    Service,
};
use serde_json::{json, Value};
use tempfile::TempDir;
fn store() -> (TempDir, Service) {
    let dir = TempDir::new().unwrap();
    let mut s = Service::new(dir.path().into(), false).unwrap();
    s.dispatch("open_store", json!({"mode":"real"})).unwrap();
    s.dispatch("setup",json!({"name":"Owner","store_name":"Test market","username":"owner","password":"test-pass-123"})).unwrap();
    write(&mut s, "register_open", json!({"opening":"1000000"}));
    (dir, s)
}
fn write(s: &mut Service, action: &str, mut p: Value) -> Value {
    p["request_id"] = json!(id());
    s.dispatch(action, p).unwrap()
}
fn product(s: &mut Service, name: &str, stock: &str, unit: &str, price: &str) -> String {
    let r = write(
        s,
        "product_save",
        json!({"name":name,"sku":name,"unit":unit,"price":price,"cost":"600","min_stock":"1000","opening_stock":stock,"barcodes":[{"code":format!("code-{name}"),"multiplier":"1000"}]}),
    );
    r["id"].as_str().unwrap().into()
}
fn sale(s: &mut Service, p: &str, quantity: &str, cash: &str, customer: &str) -> Value {
    write(
        s,
        "checkout",
        json!({"items":[{"product_id":p,"quantity":quantity}],"discount":"0","cash":cash,"other":"0","customer_id":customer}),
    )
}
fn stock(s: &Service, p: &str) -> i64 {
    scalar(
        s.c().unwrap(),
        "SELECT COALESCE(sum(quantity),0) FROM lots WHERE product_id=?1",
        &[&p],
    )
    .unwrap()
}
#[test]
fn checkout_rounding_change_and_idempotency() {
    let (_dir, mut s) = store();
    let p = product(&mut s, "rice", "10000", "kg", "1234");
    let req = json!({"request_id":"one-checkout","items":[{"product_id":p,"quantity":"1250"}],"discount":"3","cash":"2000","other":"0"});
    let r = s.dispatch("checkout", req.clone()).unwrap();
    assert_eq!(r["sale"]["subtotal"], "1543");
    assert_eq!(r["sale"]["total"], "1540");
    assert_eq!(r["sale"]["change_due"], "460");
    assert_eq!(stock(&s, &p), 8750);
    let retry = s.dispatch("checkout", req).unwrap();
    assert_eq!(r, retry);
    assert_eq!(
        scalar(s.c().unwrap(), "SELECT count(*) FROM sales", &[]).unwrap(),
        1
    );
    assert_eq!(stock(&s, &p), 8750);
    assert_eq!(
        scalar(
            s.c().unwrap(),
            "SELECT sum(amount) FROM cash_movements WHERE kind='sale'",
            &[]
        )
        .unwrap(),
        1540
    );
}
#[test]
fn failure_rolls_back_every_checkout_record() {
    let (_dir, mut s) = store();
    let p = product(&mut s, "milk", "5000", "piece", "1000");
    s.fail_checkout = true;
    let result = s.dispatch(
        "checkout",
        json!({"request_id":id(),"items":[{"product_id":p,"quantity":"2000"}],"cash":"2000"}),
    );
    assert!(result.is_err());
    assert_eq!(stock(&s, &p), 5000);
    for table in [
        "sales",
        "sale_items",
        "payments",
        "sale_allocations",
        "cash_movements",
        "customer_ledger",
    ] {
        assert_eq!(
            scalar(
                s.c().unwrap(),
                &format!("SELECT count(*) FROM {table}"),
                &[]
            )
            .unwrap(),
            0
        );
    }
    assert_eq!(
        scalar(
            s.c().unwrap(),
            "SELECT count(*) FROM inventory_movements WHERE reason='sale'",
            &[]
        )
        .unwrap(),
        0
    );
}
#[test]
fn rejects_overselling_fractional_pieces_and_expired_stock() {
    let (_dir, mut s) = store();
    let p = product(&mut s, "eggs", "2000", "piece", "1000");
    for q in ["3000", "1500"] {
        assert!(s
            .dispatch(
                "checkout",
                json!({"request_id":id(),"items":[{"product_id":p,"quantity":q}],"cash":"50000"})
            )
            .is_err());
    }
    s.c()
        .unwrap()
        .execute("UPDATE lots SET expires='2000-01-01'", [])
        .unwrap();
    assert!(s
        .dispatch(
            "checkout",
            json!({"request_id":id(),"items":[{"product_id":p,"quantity":"1000"}],"cash":"50000"})
        )
        .is_err());
    assert_eq!(stock(&s, &p), 2000);
}
#[test]
fn partial_purchase_receipts_change_stock_and_supplier_debt_only_on_receipt() {
    let (_dir, mut s) = store();
    let p = product(&mut s, "tea", "0", "piece", "1500");
    let supplier = write(&mut s, "supplier_save", json!({"name":"Pamir"}));
    let order = write(
        &mut s,
        "purchase_save",
        json!({"supplier_id":supplier["id"],"items":[{"product_id":p,"quantity":"12000","cost":"500"}]}),
    );
    assert_eq!(stock(&s, &p), 0);
    let item = list(
        s.c().unwrap(),
        "SELECT id FROM purchase_items WHERE purchase_id=?1",
        &[&order["id"].as_str().unwrap()],
    )
    .unwrap();
    write(
        &mut s,
        "purchase_receive",
        json!({"item_id":item[0]["id"],"quantity":"5000","batch":"B1"}),
    );
    assert_eq!(stock(&s, &p), 5000);
    assert_eq!(
        scalar(
            s.c().unwrap(),
            "SELECT sum(amount) FROM supplier_ledger",
            &[]
        )
        .unwrap(),
        2500
    );
    let state: String = s
        .c()
        .unwrap()
        .query_row("SELECT status FROM purchases", [], |r| r.get(0))
        .unwrap();
    assert_eq!(state, "partial");
    assert!(s
        .dispatch(
            "purchase_receive",
            json!({"request_id":id(),"item_id":item[0]["id"],"quantity":"8000","batch":"B2"})
        )
        .is_err());
    assert_eq!(stock(&s, &p), 5000);
}
#[test]
fn credit_collections_returns_and_overreturn() {
    let (_dir, mut s) = store();
    let p = product(&mut s, "sugar", "10000", "piece", "1000");
    let c = write(
        &mut s,
        "customer_save",
        json!({"name":"Ahmad","credit_limit":"50000"}),
    );
    let r = sale(&mut s, &p, "4000", "1000", c["id"].as_str().unwrap());
    assert_eq!(r["sale"]["debt"], "3000");
    write(
        &mut s,
        "customer_payment",
        json!({"id":c["id"],"amount":"1500","method":"cash"}),
    );
    assert_eq!(
        scalar(
            s.c().unwrap(),
            "SELECT sum(amount) FROM customer_ledger",
            &[]
        )
        .unwrap(),
        1500
    );
    assert_eq!(
        scalar(s.c().unwrap(), "SELECT count(*) FROM sales", &[]).unwrap(),
        1
    );
    let ret = write(
        &mut s,
        "return",
        json!({"item_id":r["items"][0]["id"],"quantity":"2000","restock":true,"reason":"Unopened"}),
    );
    assert_eq!(ret["debt_offset"], "1500");
    assert_eq!(ret["cash_refund"], "500");
    assert_eq!(stock(&s, &p), 8000);
    assert!(s.dispatch("return",json!({"request_id":id(),"item_id":r["items"][0]["id"],"quantity":"3000","restock":true,"reason":"Extra"})).is_err());
    let ret = write(
        &mut s,
        "return",
        json!({"item_id":r["items"][0]["id"],"quantity":"2000","restock":false,"reason":"Damaged"}),
    );
    assert_eq!(ret["amount"], "2000");
    assert_eq!(stock(&s, &p), 8000);
    assert_eq!(
        scalar(
            s.c().unwrap(),
            "SELECT sum(cost_reversed) FROM returns",
            &[]
        )
        .unwrap(),
        1200
    );
    let snap = s.dispatch("snapshot", json!({})).unwrap();
    assert_eq!(snap["stats"]["sales"], "0");
    assert_eq!(snap["stats"]["cogs"], "1200");
}
#[test]
fn cumulative_refunds_conserve_discounted_fractional_money() {
    let (_dir, mut s) = store();
    let p = product(&mut s, "weighted", "10000", "kg", "1000");
    let r = write(
        &mut s,
        "checkout",
        json!({"items":[{"product_id":p,"quantity":"3000"}],"discount":"1","cash":"5000"}),
    );
    for _ in 0..3 {
        write(
            &mut s,
            "return",
            json!({"item_id":r["items"][0]["id"],"quantity":"1000","restock":true,"reason":"Partial return"}),
        );
    }
    assert_eq!(
        scalar(s.c().unwrap(), "SELECT sum(amount) FROM returns", &[]).unwrap(),
        2999
    );
    assert_eq!(stock(&s, &p), 10000);
}
#[test]
fn register_close_reconciliation_is_immutable() {
    let (_dir, mut s) = store();
    let p = product(&mut s, "bread", "5000", "piece", "1000");
    sale(&mut s, &p, "1000", "1000", "");
    write(
        &mut s,
        "expense",
        json!({"category":"Utilities","description":"Fuel","amount":"100","method":"cash"}),
    );
    let register: String = s
        .c()
        .unwrap()
        .query_row(
            "SELECT id FROM register_sessions WHERE closed_at IS NULL",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let close = write(
        &mut s,
        "register_close",
        json!({"id":register,"counted":"1000800","notes":"100 shortage"}),
    );
    assert_eq!(close["variance"], "-100");
    assert!(s.dispatch("expense",json!({"request_id":id(),"category":"Utilities","description":"Fuel","amount":"100","method":"cash"})).is_err());
    assert_eq!(
        scalar(s.c().unwrap(), "SELECT count(*) FROM expenses", &[]).unwrap(),
        1
    );
}
#[test]
fn backup_restore_restart_and_demo_isolation() {
    let (dir, mut s) = store();
    let p = product(&mut s, "saved", "10000", "piece", "1000");
    let path = dir.path().join("backup.sqlite");
    s.dispatch("backup", json!({"path":path})).unwrap();
    sale(&mut s, &p, "2000", "2000", "");
    assert_eq!(stock(&s, &p), 8000);
    s.dispatch("restore", json!({"path":path})).unwrap();
    assert!(s.actor.is_none());
    s.dispatch(
        "login",
        json!({"username":"owner","password":"test-pass-123"}),
    )
    .unwrap();
    assert_eq!(stock(&s, &p), 10000);
    std::fs::write(dir.path().join("bad.sqlite"), "garbage").unwrap();
    assert!(s
        .dispatch("restore", json!({"path":dir.path().join("bad.sqlite")}))
        .is_err());
    assert_eq!(stock(&s, &p), 10000);
    drop(s);
    let mut s = Service::new(dir.path().into(), false).unwrap();
    s.dispatch("open_store", json!({"mode":"real"})).unwrap();
    s.dispatch(
        "login",
        json!({"username":"owner","password":"test-pass-123"}),
    )
    .unwrap();
    assert_eq!(stock(&s, &p), 10000);
    s.dispatch("open_store", json!({"mode":"demo"})).unwrap();
    assert_eq!(
        scalar(
            s.c().unwrap(),
            "SELECT count(*) FROM products WHERE id=?1",
            &[&p]
        )
        .unwrap(),
        0
    );
    s.dispatch("open_store", json!({"mode":"real"})).unwrap();
    assert_eq!(stock(&s, &p), 10000);
}
#[test]
fn cashier_permissions_enforced_by_backend() {
    let (_dir, mut s) = store();
    let p = product(&mut s, "permissions", "5000", "piece", "1000");
    write(
        &mut s,
        "user_save",
        json!({"name":"Cashier","username":"cashier","password":"cashier-pass","role":"cashier"}),
    );
    s.dispatch("logout", json!({})).unwrap();
    s.dispatch(
        "login",
        json!({"username":"cashier","password":"cashier-pass"}),
    )
    .unwrap();
    assert_eq!(s.dispatch("checkout",json!({"request_id":id(),"items":[{"product_id":p,"quantity":"1000"}],"discount":"1","cash":"1000"})).unwrap_err().code,"FORBIDDEN");
    for action in ["return", "stock_adjust", "settings_save", "user_save"] {
        assert_eq!(
            s.dispatch(action, json!({"request_id":id()}))
                .unwrap_err()
                .code,
            "FORBIDDEN"
        )
    }
    assert!(s.dispatch("snapshot", json!({})).unwrap()["products"][0]
        .get("cost")
        .is_none());
}
#[test]
fn counts_detect_stale_stock_and_import_is_atomic() {
    let (_dir, mut s) = store();
    let p = product(&mut s, "counted", "5000", "piece", "1000");
    let lot: String = s
        .c()
        .unwrap()
        .query_row("SELECT id FROM lots WHERE product_id=?1", [&p], |r| {
            r.get(0)
        })
        .unwrap();
    sale(&mut s, &p, "1000", "1000", "");
    assert_eq!(s.dispatch("stock_adjust",json!({"request_id":id(),"lot_id":lot,"expected":"5000","counted":"3000","reason":"Count"})).unwrap_err().code,"CONFLICT");
    let csv =
        "name,sku,unit,price,cost,barcode\nTea,new,kg,1200,600,12345\nBad,new,kg,1200,600,67890";
    let check = s.dispatch("import_preview", json!({"csv":csv})).unwrap();
    assert!(!check["errors"].as_array().unwrap().is_empty());
    assert!(s
        .dispatch("import_commit", json!({"request_id":id(),"csv":csv}))
        .is_err());
    assert_eq!(
        scalar(s.c().unwrap(), "SELECT count(*) FROM products", &[]).unwrap(),
        1
    );
}
#[test]
fn rejects_same_request_with_changed_payload() {
    let (_dir, mut s) = store();
    let p = product(&mut s, "retry", "10000", "piece", "1000");
    let mut req =
        json!({"request_id":"unique","items":[{"product_id":p,"quantity":"1000"}],"cash":"1000"});
    s.dispatch("checkout", req.clone()).unwrap();
    req["cash"] = json!("2000");
    assert_eq!(s.dispatch("checkout", req).unwrap_err().code, "CONFLICT");
    assert_eq!(stock(&s, &p), 9000);
}
#[test]
fn split_payment_and_tax_totals() {
    let (_dir, mut s) = store();
    let p = product(&mut s, "taxed", "10000", "piece", "1000");
    s.c()
        .unwrap()
        .execute("UPDATE products SET tax_bps=1000 WHERE id=?1", [&p])
        .unwrap();
    write(&mut s, "settings_save", json!({"tax_enabled":"1"}));
    let r = write(
        &mut s,
        "checkout",
        json!({"items":[{"product_id":p,"quantity":"2000"}],"discount":"100","cash":"1500","other":"1000"}),
    );
    assert_eq!(r["sale"]["tax"], "190");
    assert_eq!(r["sale"]["total"], "2090");
    assert_eq!(r["sale"]["change_due"], "410");
    assert_eq!(
        scalar(s.c().unwrap(), "SELECT sum(amount) FROM payments", &[]).unwrap(),
        2090
    );
}

#[test]
fn fefo_allocations_use_actual_lot_costs_and_labels_resolve_packs() {
    let (_dir, mut s) = store();
    let p = product(&mut s, "fefo", "12000", "piece", "1000");
    s.add_lot(&p, 2000, 800, "EARLY", "2090-01-01", "opening", &p)
        .unwrap();
    s.add_lot(&p, 2000, 700, "LATER", "2091-01-01", "opening", &p)
        .unwrap();
    let r = sale(&mut s, &p, "3000", "3000", "");
    assert_eq!(r["sale"]["cost"], "2300");
    assert_eq!(
        scalar(
            s.c().unwrap(),
            "SELECT quantity FROM lots WHERE batch='EARLY'",
            &[]
        )
        .unwrap(),
        0
    );
    assert_eq!(
        scalar(
            s.c().unwrap(),
            "SELECT quantity FROM lots WHERE batch='LATER'",
            &[]
        )
        .unwrap(),
        1000
    );
    assert_eq!(
        scalar(
            s.c().unwrap(),
            "SELECT count(*) FROM product_barcodes WHERE code=?1",
            &[&format!("radefy:{p}")]
        )
        .unwrap(),
        1
    );
    write(
        &mut s,
        "product_save",
        json!({"id":p,"sku":"fefo","name":"fefo","unit":"piece","price":"1000","cost":"600","barcodes":[{"code":"CARTON-12","multiplier":"12000"}]}),
    );
    let pack = scalar(
        s.c().unwrap(),
        "SELECT multiplier FROM product_barcodes WHERE code='CARTON-12'",
        &[],
    )
    .unwrap();
    let sale = sale(&mut s, &p, &pack.to_string(), "12000", "");
    assert_eq!(sale["sale"]["total"], "12000");
    assert_eq!(stock(&s, &p), 1000);
}

#[test]
fn zero_price_lines_never_receive_excess_discount() {
    let (_dir, mut s) = store();
    let a = product(&mut s, "a", "1000", "piece", "1");
    let b = product(&mut s, "b", "1000", "piece", "1");
    let free = product(&mut s, "free", "1000", "piece", "0");
    let r = write(
        &mut s,
        "checkout",
        json!({"items":[{"product_id":a,"quantity":"1000"},{"product_id":b,"quantity":"1000"},{"product_id":free,"quantity":"1000"}],"discount":"1","cash":"1"}),
    );
    assert_eq!(r["sale"]["total"], "1");
    assert_eq!(r["items"][2]["discount"], "0");
}

#[test]
fn supplier_returns_reconcile_cost_and_noncash_refunds_do_not_move_cash() {
    let (_dir, mut s) = store();
    let p = product(&mut s, "oil", "0", "liter", "1000");
    let supplier = write(&mut s, "supplier_save", json!({"name":"Oil supplier"}));
    write(
        &mut s,
        "purchase_save",
        json!({"supplier_id":supplier["id"],"items":[{"product_id":p,"quantity":"3000","cost":"333"}]}),
    );
    let item: String = s
        .c()
        .unwrap()
        .query_row("SELECT id FROM purchase_items", [], |r| r.get(0))
        .unwrap();
    write(
        &mut s,
        "purchase_receive",
        json!({"item_id":item,"quantity":"3000","batch":"O1"}),
    );
    let receipt: String = s
        .c()
        .unwrap()
        .query_row("SELECT id FROM purchase_receipts", [], |r| r.get(0))
        .unwrap();
    write(
        &mut s,
        "supplier_return",
        json!({"receipt_id":receipt,"quantity":"1000","reason":"Leaking"}),
    );
    assert_eq!(stock(&s, &p), 2000);
    assert_eq!(
        scalar(
            s.c().unwrap(),
            "SELECT sum(amount) FROM supplier_ledger",
            &[]
        )
        .unwrap(),
        666
    );
    let r = write(
        &mut s,
        "checkout",
        json!({"items":[{"product_id":p,"quantity":"1000"}],"other":"1000"}),
    );
    let ret = write(
        &mut s,
        "return",
        json!({"item_id":r["items"][0]["id"],"quantity":"1000","reason":"Damaged","restock":false,"method":"other"}),
    );
    assert_eq!(ret["other_refund"], "1000");
    assert_eq!(ret["cash_refund"], "0");
    assert_eq!(
        scalar(s.c().unwrap(), "SELECT count(*) FROM cash_movements", &[]).unwrap(),
        0
    );
}

#[test]
fn credentials_are_hashed_and_checkout_recovery_survives_restart() {
    let (dir, mut s) = store();
    write(
        &mut s,
        "user_save",
        json!({"name":"Employee","username":"newcashier","password":"never-persist-plaintext","role":"cashier"}),
    );
    let stored: String = s
        .c()
        .unwrap()
        .query_row(
            "SELECT payload FROM requests WHERE action='user_save'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(stored.len(), 64);
    assert!(!stored.contains("plaintext"));
    let hash: String = s
        .c()
        .unwrap()
        .query_row(
            "SELECT password_hash FROM users WHERE username='newcashier'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(hash.starts_with("$argon2id$"));
    let p = product(&mut s, "restart", "3000", "piece", "1000");
    let request = json!({"request_id":"survives-restart","items":[{"product_id":p,"quantity":"1000"}],"cash":"1000"});
    let receipt = s.dispatch("checkout", request.clone()).unwrap();
    drop(s);
    let mut s = Service::new(dir.path().into(), false).unwrap();
    s.dispatch("open_store", json!({"mode":"real"})).unwrap();
    s.dispatch(
        "login",
        json!({"username":"owner","password":"test-pass-123"}),
    )
    .unwrap();
    assert_eq!(
        s.dispatch("request_status", json!({"request_id":"survives-restart"}))
            .unwrap(),
        receipt
    );
    assert_eq!(s.dispatch("checkout", request).unwrap(), receipt);
    assert_eq!(stock(&s, &p), 2000);
}

#[test]
fn backup_preserves_media_and_rejects_incompatible_version() {
    let (dir, mut s) = store();
    let image="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=";
    write(&mut s, "settings_save", json!({"logo":image}));
    let path = dir.path().join("media.sqlite");
    s.dispatch("backup", json!({"path":path})).unwrap();
    write(&mut s, "settings_save", json!({"logo":""}));
    s.dispatch("restore", json!({"path":path})).unwrap();
    s.dispatch(
        "login",
        json!({"username":"owner","password":"test-pass-123"}),
    )
    .unwrap();
    assert_eq!(s.read_media("store-logo").unwrap(), image);
    let backup = rusqlite::Connection::open(&path).unwrap();
    backup.execute_batch("PRAGMA user_version=999").unwrap();
    drop(backup);
    assert_eq!(
        s.dispatch("restore", json!({"path":path}))
            .unwrap_err()
            .code,
        "INVALID_BACKUP"
    );
    assert_eq!(s.read_media("store-logo").unwrap(), image);
    assert!(s
        .dispatch(
            "settings_save",
            json!({"request_id":id(),"logo":"data:image/png;base64,YmFk"})
        )
        .is_err());
    assert_eq!(s.read_media("store-logo").unwrap(), image);
}

#[test]
fn retried_receipts_respect_current_permissions() {
    let (_dir, mut s) = store();
    let p = product(&mut s, "private-cost", "3000", "piece", "1000");
    let request = json!({"request_id":"owner-sale", "items":[{"product_id":p,"quantity":"1000"}],"cash":"1000"});
    let receipt = s.dispatch("checkout", request.clone()).unwrap();
    assert!(receipt["sale"]["cost"].is_string());
    write(
        &mut s,
        "user_save",
        json!({"name":"Cashier","username":"cashier","password":"cashier-pass-123","role":"cashier"}),
    );
    s.dispatch("logout", json!({})).unwrap();
    s.dispatch(
        "login",
        json!({"username":"cashier","password":"cashier-pass-123"}),
    )
    .unwrap();
    for result in [
        s.dispatch("request_status", json!({"request_id":"owner-sale"}))
            .unwrap(),
        s.dispatch("checkout", request).unwrap(),
    ] {
        assert!(result["sale"]["cost"].is_null());
        assert!(result["items"][0]["cost"].is_null());
        assert_eq!(result["sale"]["total"], receipt["sale"]["total"]);
    }
    assert_eq!(stock(&s, &p), 2000);
}

#[test]
fn held_carts_locks_and_daily_backups_survive_restart() {
    let (dir, mut s) = store();
    let p = product(&mut s, "held", "5000", "piece", "1000");
    let cart = json!({"items":[{"product_id":p,"quantity":"1000"}],"discount":"0"});
    let held = write(
        &mut s,
        "hold",
        json!({"name":"Waiting customer","cart":cart}),
    );
    write(
        &mut s,
        "hold",
        json!({"id":held["id"],"name":"Updated waiting customer","cart":cart}),
    );
    assert_eq!(
        scalar(s.c().unwrap(), "SELECT count(*) FROM held_carts", &[]).unwrap(),
        1
    );
    let mut second = Service::new(dir.path().into(), false).unwrap();
    assert_eq!(
        second
            .dispatch("open_store", json!({"mode":"real"}))
            .unwrap_err()
            .code,
        "LOCKED"
    );
    s.automatic_backup().unwrap();
    s.automatic_backup().unwrap();
    assert_eq!(
        std::fs::read_dir(dir.path().join("backups"))
            .unwrap()
            .count(),
        1
    );
    drop(s);
    second
        .dispatch("open_store", json!({"mode":"real"}))
        .unwrap();
    second
        .dispatch(
            "login",
            json!({"username":"owner","password":"test-pass-123"}),
        )
        .unwrap();
    assert_eq!(
        scalar(second.c().unwrap(), "SELECT count(*) FROM held_carts", &[]).unwrap(),
        1
    );
    let mut checkout = cart;
    checkout["held_id"] = held["id"].clone();
    checkout["cash"] = json!("1000");
    write(&mut second, "checkout", checkout);
    assert_eq!(stock(&second, &p), 4000);
    assert_eq!(
        scalar(second.c().unwrap(), "SELECT count(*) FROM held_carts", &[]).unwrap(),
        0
    );
}

#[test]
fn upgrades_version_one_with_a_recovery_backup() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("store.sqlite");
    let old = rusqlite::Connection::open(&path).unwrap();
    old.execute_batch(include_str!("../migrations/001_initial.sql"))
        .unwrap();
    old.execute_batch("PRAGMA user_version=1").unwrap();
    drop(old);
    let mut s = Service::new(dir.path().into(), false).unwrap();
    s.dispatch("open_store", json!({"mode":"real"})).unwrap();
    assert_eq!(
        scalar(s.c().unwrap(), "PRAGMA user_version", &[]).unwrap(),
        2
    );
    assert!(std::fs::read_dir(dir.path()).unwrap().any(|f| f
        .unwrap()
        .file_name()
        .to_string_lossy()
        .contains("pre-migration")));
}
