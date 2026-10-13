use crate::db::*;
use rusqlite::params;
use serde_json::json;
impl Service {
    pub fn seed_demo(&mut self) -> Result<()> {
        self.setup(&json!({"name":"Hussain Ahmad","username":"owner","password":"demo12345","store_name":"Radefy Market","address":"Shahr-e Naw, Kabul","phone":"+93 700 123 456","language":"en","receipt_width":"80"}))?;
        self.c()?.execute_batch("BEGIN IMMEDIATE")?;
        let result = (|| {
            let categories = [
                ("produce", "Fruit & vegetables"),
                ("dairy", "Dairy & eggs"),
                ("bakery", "Bakery"),
                ("pantry", "Pantry essentials"),
                ("beverages", "Beverages"),
                ("household", "Household"),
            ];
            for (c, n) in categories {
                self.c()?.execute(
                    "INSERT INTO categories(id,name) VALUES(?1,?2)",
                    params![c, n],
                )?;
            }
            let products = [
                (
                    "p1",
                    "Fresh red apples",
                    "سیب سرخ تازه",
                    "produce",
                    "kg",
                    12000,
                    8500,
                    125000,
                    "8901000000011",
                    false,
                ),
                (
                    "p2",
                    "Fresh whole milk",
                    "شیر تازه",
                    "dairy",
                    "liter",
                    7500,
                    5200,
                    90000,
                    "8901000000028",
                    true,
                ),
                (
                    "p3",
                    "Golden basmati rice",
                    "برنج باسمتی",
                    "pantry",
                    "kg",
                    16500,
                    12000,
                    300000,
                    "8901000000035",
                    false,
                ),
                (
                    "p4",
                    "Farm fresh eggs · 12 pack",
                    "تخم مرغ تازه",
                    "dairy",
                    "piece",
                    15000,
                    11200,
                    95000,
                    "8901000000042",
                    true,
                ),
                (
                    "p5",
                    "Whole wheat bread",
                    "نان گندم",
                    "bakery",
                    "piece",
                    4000,
                    2500,
                    95000,
                    "8901000000059",
                    true,
                ),
                (
                    "p6",
                    "Sunflower oil · 1 liter",
                    "روغن آفتاب پرست",
                    "pantry",
                    "piece",
                    14500,
                    11000,
                    140000,
                    "8901000000066",
                    false,
                ),
                (
                    "p7",
                    "Green tea · 250 g",
                    "چای سبز",
                    "beverages",
                    "piece",
                    18000,
                    13000,
                    120000,
                    "8901000000073",
                    false,
                ),
                (
                    "p8",
                    "Fresh tomatoes",
                    "بادنجان رومی",
                    "produce",
                    "kg",
                    4500,
                    2800,
                    110000,
                    "8901000000080",
                    true,
                ),
                (
                    "p9",
                    "Natural yogurt · 500 g",
                    "ماست طبیعی",
                    "dairy",
                    "piece",
                    6500,
                    4200,
                    130000,
                    "8901000000097",
                    true,
                ),
                (
                    "p10",
                    "Mineral water · 1.5 L",
                    "آب معدنی",
                    "beverages",
                    "piece",
                    3000,
                    1800,
                    220000,
                    "8901000000103",
                    false,
                ),
                (
                    "p11",
                    "Laundry powder · 1 kg",
                    "پودر لباسشویی",
                    "household",
                    "piece",
                    13500,
                    9700,
                    65000,
                    "8901000000110",
                    false,
                ),
                (
                    "p12",
                    "Cane sugar · 1 kg",
                    "بوره",
                    "pantry",
                    "piece",
                    7000,
                    5200,
                    180000,
                    "8901000000127",
                    false,
                ),
                (
                    "p13",
                    "Sweet bananas",
                    "کیله شیرین",
                    "produce",
                    "kg",
                    9500,
                    6500,
                    95000,
                    "8901000000134",
                    true,
                ),
                (
                    "p14",
                    "Red lentils · 1 kg",
                    "دال سرخ",
                    "pantry",
                    "piece",
                    11500,
                    8500,
                    140000,
                    "8901000000141",
                    false,
                ),
                (
                    "p15",
                    "Orange juice · 1 L",
                    "آب مالته",
                    "beverages",
                    "piece",
                    8500,
                    5900,
                    100000,
                    "8901000000158",
                    true,
                ),
                (
                    "p16",
                    "Tissue box · 200 sheets",
                    "دستمال کاغذی",
                    "household",
                    "piece",
                    5500,
                    3200,
                    80000,
                    "8901000000165",
                    false,
                ),
            ];
            let expiry = (chrono::Utc::now() + chrono::Duration::days(45))
                .format("%Y-%m-%d")
                .to_string();
            for (pid, name, dari, cat, unit, price, cost, stock, barcode, track) in products {
                self.product_save(&json!({"id":pid,"name":name,"name_dari":dari,"sku":format!("RD-{}",pid.trim_start_matches('p')),"category_id":cat,"unit":unit,"price":price.to_string(),"cost":cost.to_string(),"min_stock":"10000","track_expiry":if track{"1"}else{"0"},"barcodes":[{"code":barcode,"multiplier":"1000"},{"code":format!("radefy:{pid}"),"multiplier":"1000"}]}))?;
                self.add_lot(
                    pid,
                    stock,
                    cost,
                    "LOT-001",
                    if track { &expiry } else { "" },
                    "opening",
                    "demo",
                )?;
            }
            for (n, name, phone, limit, opening) in [
                (1, "Ahmad Wali", "+93 700 234 567", 5000000, 245000),
                (2, "Fatima Rahimi", "+93 790 456 789", 2500000, 89000),
                (3, "Mohammad Omar", "+93 780 123 456", 5000000, 156000),
                (4, "Maryam Sultani", "+93 770 567 890", 2500000, 0),
                (5, "Zubair Khan", "+93 700 890 123", 2500000, 67000),
            ] {
                self.party_save("customer_save",&json!({"id":format!("c{n}"),"name":name,"phone":phone,"address":"Kabul","credit_limit":limit.to_string()}))?;
                if opening > 0 {
                    self.c()?.execute("INSERT INTO customer_ledger(id,customer_id,amount,kind) VALUES(?1,?2,?3,'opening')",params![id(),format!("c{n}"),opening])?;
                }
            }
            for (n, name) in [
                (1, "Kabul Fresh Produce"),
                (2, "Pamir Food Distribution"),
                (3, "Afghan Dairy Co."),
            ] {
                self.party_save("supplier_save",&json!({"id":format!("s{n}"),"name":name,"phone":"+93 700 345 678","address":"Kabul wholesale market"}))?;
            }
            self.register("register_open", &json!({"opening":"1000000"}))?;
            for day in (0..30).rev() {
                for k in 0..3 {
                    let a = (day * 7 + k * 3) % 16 + 1;
                    let b = (day * 3 + k + 4) % 16 + 1;
                    let customer = if k == 0 { "c1" } else { "" };
                    let items = if a == b {
                        json!([{"product_id":format!("p{a}"),"quantity":"1000"}])
                    } else {
                        json!([{"product_id":format!("p{a}"),"quantity":((k+1)*1000).to_string()},{"product_id":format!("p{b}"),"quantity":"2000"}])
                    };
                    let receipt=self.checkout(&json!({"request_id":id(),"items":items,"discount":"0","cash":"500000","other":"0","customer_id":customer}))?;
                    let date = (chrono::Utc::now()
                        - chrono::Duration::days(day as i64)
                        - chrono::Duration::minutes((k * 17) as i64))
                    .format("%Y-%m-%d %H:%M:%S")
                    .to_string();
                    let sale = s(&receipt["sale"], "id");
                    self.c()?.execute(
                        "UPDATE sales SET created_at=?1 WHERE id=?2",
                        params![date, sale],
                    )?;
                    self.c()?.execute(
                        "UPDATE payments SET created_at=?1 WHERE sale_id=?2",
                        params![date, sale],
                    )?;
                    self.c()?.execute(
                        "UPDATE inventory_movements SET created_at=?1 WHERE source_id=?2",
                        params![date, sale],
                    )?;
                    self.c()?.execute(
                        "UPDATE cash_movements SET created_at=?1 WHERE source_id=?2",
                        params![date, sale],
                    )?;
                }
            }
            self.expense(&json!({"category":"Utilities","description":"Electricity and generator fuel","amount":"185000","method":"cash"}))?;
            let purchase=self.purchase_save(&json!({"supplier_id":"s2","invoice":"PF-2048","items":[{"product_id":"p3","quantity":"50000","cost":"12000"},{"product_id":"p6","quantity":"24000","cost":"11000"}]}))?;
            let lines = list(
                self.c()?,
                "SELECT id FROM purchase_items WHERE purchase_id=?1",
                &[&s(&purchase, "id")],
            )?;
            self.purchase_receive(&json!({"item_id":lines[0]["id"],"quantity":"10000","batch":"PF-2048","request_id":id()}))?;
            for pid in ["p5", "p11", "p15"] {
                let row = list(
                    self.c()?,
                    "SELECT id,quantity FROM lots WHERE product_id=?1 ORDER BY received_at LIMIT 1",
                    &[&pid],
                )?
                .remove(0);
                self.stock_adjust(&json!({"lot_id":row["id"],"expected":row["quantity"],"counted":"4000","reason":"Demo stock count","request_id":id()}))?;
            }
            let soon = (chrono::Utc::now() + chrono::Duration::days(5))
                .format("%Y-%m-%d")
                .to_string();
            self.c()?
                .execute("UPDATE lots SET expires=?1 WHERE product_id='p9'", [soon])?;
            put_setting(
                self.c()?,
                "demo_notice",
                "Demonstration store — sample records",
            )?;
            Ok::<_, Error>(())
        })();
        match result {
            Ok(_) => self.c()?.execute_batch("COMMIT")?,
            Err(e) => {
                self.c()?.execute_batch("ROLLBACK")?;
                return Err(e);
            }
        }
        Ok(())
    }
}
