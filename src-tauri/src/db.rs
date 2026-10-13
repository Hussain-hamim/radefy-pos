use fs2::FileExt;
use rusqlite::{params, types::ValueRef, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Error {
    pub code: String,
    pub message: String,
}
pub type Result<T> = std::result::Result<T, Error>;
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}
impl std::error::Error for Error {}
impl From<rusqlite::Error> for Error {
    fn from(e: rusqlite::Error) -> Self {
        err("DATABASE", &format!("Database operation failed: {e}"))
    }
}
impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        err("IO", &format!("File operation failed: {e}"))
    }
}
impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        err("INVALID", &e.to_string())
    }
}
pub fn err(code: &str, message: &str) -> Error {
    Error {
        code: code.into(),
        message: message.into(),
    }
}
pub fn id() -> String {
    Uuid::new_v4().to_string()
}
pub fn now() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}
pub fn today() -> String {
    (chrono::Utc::now() + chrono::Duration::minutes(270))
        .format("%Y-%m-%d")
        .to_string()
}
pub fn s<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}
pub fn required(v: &Value, key: &str) -> Result<String> {
    let t = s(v, key).trim();
    if t.is_empty() || t.len() > 500 {
        return Err(err("VALIDATION", &format!("Please enter a valid {key}.")));
    }
    Ok(t.into())
}
pub fn integer(v: &Value, key: &str) -> Result<i64> {
    let raw = s(v, key);
    if raw.is_empty() {
        return Ok(0);
    }
    raw.parse::<i64>()
        .map_err(|_| err("VALIDATION", &format!("Invalid {key}.")))
}
pub fn positive(v: &Value, key: &str) -> Result<i64> {
    let n = integer(v, key)?;
    if n <= 0 || n > 1_000_000_000_000 {
        return Err(err(
            "VALIDATION",
            &format!("{key} must be greater than zero and within the supported range."),
        ));
    }
    Ok(n)
}
pub fn nonnegative(v: &Value, key: &str) -> Result<i64> {
    let n = integer(v, key)?;
    if !(0..=1_000_000_000_000).contains(&n) {
        return Err(err("VALIDATION", &format!("Invalid {key}.")));
    }
    Ok(n)
}
pub fn rounded(n: i128, d: i128) -> Result<i64> {
    if n < 0 || d <= 0 {
        return Err(err("VALIDATION", "Invalid calculation."));
    }
    {
        let result = (n + d / 2) / d;
        if result > 1_000_000_000_000 {
            return Err(err("OVERFLOW", "Amount exceeds supported limits."));
        }
        Ok(result as i64)
    }
}
pub fn line_total(price: i64, qty: i64) -> Result<i64> {
    rounded(price as i128 * qty as i128, 1000)
}
pub fn list(c: &Connection, sql: &str, args: &[&dyn rusqlite::ToSql]) -> Result<Vec<Value>> {
    let mut st = c.prepare(sql)?;
    let cols = st
        .column_names()
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<_>>();
    let mut rows = st.query(args)?;
    let mut out = vec![];
    while let Some(row) = rows.next()? {
        let mut obj = serde_json::Map::new();
        for (i, name) in cols.iter().enumerate() {
            let v = match row.get_ref(i)? {
                ValueRef::Null => Value::Null,
                ValueRef::Integer(n) => json!(n.to_string()),
                ValueRef::Real(n) => json!(n.to_string()),
                ValueRef::Text(t) => json!(String::from_utf8_lossy(t)),
                ValueRef::Blob(_) => Value::Null,
            };
            obj.insert(name.clone(), v);
        }
        out.push(Value::Object(obj));
    }
    Ok(out)
}
pub fn scalar(c: &Connection, sql: &str, args: &[&dyn rusqlite::ToSql]) -> Result<i64> {
    Ok(c.query_row(sql, args, |r| r.get(0))?)
}
pub fn audit(c: &Connection, actor: &str, action: &str, detail: &str) -> Result<()> {
    c.execute(
        "INSERT INTO audit_logs(id,actor_id,action,detail) VALUES(?1,?2,?3,?4)",
        params![id(), actor, action, detail],
    )?;
    Ok(())
}
pub fn setting(c: &Connection, key: &str) -> String {
    c.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| {
        r.get(0)
    })
    .unwrap_or_default()
}
pub fn put_setting(c: &Connection, key: &str, value: &str) -> Result<()> {
    c.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,value])?;
    Ok(())
}
pub fn open_db(path: &Path) -> Result<Connection> {
    let c = Connection::open(path)?;
    c.create_scalar_function(
        "fixed_total",
        2,
        rusqlite::functions::FunctionFlags::SQLITE_UTF8
            | rusqlite::functions::FunctionFlags::SQLITE_DETERMINISTIC,
        |ctx| {
            let p: i64 = ctx.get(0)?;
            let q: i64 = ctx.get(1)?;
            line_total(p, q).map_err(|e| rusqlite::Error::UserFunctionError(Box::new(e)))
        },
    )?;
    c.busy_timeout(std::time::Duration::from_secs(5))?;
    c.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;")?;
    let version = scalar(&c, "PRAGMA user_version", &[])?;
    if version > 2 {
        return Err(err(
            "SCHEMA",
            "This store needs a newer application version.",
        ));
    }
    if version == 0 {
        c.execute_batch("BEGIN IMMEDIATE;")?;
        c.execute_batch(include_str!("../migrations/001_initial.sql"))?;
        c.execute_batch("PRAGMA user_version=1; COMMIT;")?;
    }
    if version < 2 {
        if version > 0 {
            let mut dest =
                Connection::open(path.with_extension(format!("pre-migration-{}.sqlite", id())))?;
            let backup = rusqlite::backup::Backup::new(&c, &mut dest)?;
            backup.run_to_completion(100, std::time::Duration::from_millis(5), None)?;
        }
        c.execute_batch("BEGIN IMMEDIATE")?;
        if let Err(e) = c.execute_batch(include_str!("../migrations/002_operational_records.sql")) {
            c.execute_batch("ROLLBACK")?;
            return Err(e.into());
        }
        c.execute_batch("PRAGMA user_version=2; COMMIT;")?;
    }
    // Early development databases stored request JSON. Retain idempotency without credentials.
    let legacy = list(
        &c,
        "SELECT id,payload FROM requests WHERE payload LIKE '{%'",
        &[],
    )?;
    for row in legacy {
        let digest = format!("{:x}", Sha256::digest(s(&row, "payload").as_bytes()));
        c.execute(
            "UPDATE requests SET payload=?1 WHERE id=?2",
            params![digest, s(&row, "id")],
        )?;
    }
    Ok(c)
}
#[derive(Clone)]
pub struct Actor {
    pub id: String,
    pub name: String,
    pub role: String,
    pub permissions: HashSet<String>,
}
pub struct Service {
    pub root: PathBuf,
    pub conn: Option<Connection>,
    pub actor: Option<Actor>,
    pub mode: String,
    pub preview: bool,
    pub fail_checkout: bool,
    lock: Option<fs::File>,
    login_failures: u32,
    login_blocked_until: Option<std::time::Instant>,
}
impl Service {
    pub fn new(root: PathBuf, preview: bool) -> Result<Self> {
        fs::create_dir_all(&root)?;
        Ok(Self {
            root,
            conn: None,
            actor: None,
            mode: String::new(),
            preview,
            fail_checkout: false,
            lock: None,
            login_failures: 0,
            login_blocked_until: None,
        })
    }
    pub fn c(&self) -> Result<&Connection> {
        self.conn
            .as_ref()
            .ok_or_else(|| err("NO_STORE", "Open a store first."))
    }
    pub fn actor(&self) -> Result<&Actor> {
        self.actor
            .as_ref()
            .ok_or_else(|| err("AUTH", "Please sign in."))
    }
    pub fn require(&self, permission: &str) -> Result<()> {
        let a = self.actor()?;
        if a.role == "owner" || a.permissions.contains(permission) {
            Ok(())
        } else {
            Err(err(
                "FORBIDDEN",
                "Your account does not have permission for this action.",
            ))
        }
    }
    pub fn dispatch(&mut self, action: &str, p: Value) -> Result<Value> {
        if action == "status" {
            return Ok(
                json!({"mode":self.mode,"preview":self.preview,"user":self.actor.as_ref().map(|a|json!({"id":a.id,"name":a.name,"role":a.role,"permissions":a.permissions})),"real_exists":self.root.join("store.sqlite").exists(),"language":self.conn.as_ref().map(|c|setting(c,"language")).unwrap_or_else(||"en".into())}),
            );
        }
        if action == "open_store" {
            return self.open_store(&p);
        }
        if action == "setup" {
            return self.setup(&p);
        }
        if action == "login" {
            if self
                .login_blocked_until
                .is_some_and(|t| t > std::time::Instant::now())
            {
                return Err(err("AUTH", "Too many attempts. Please wait one minute."));
            }
            let result = self.login(&p);
            if result.is_err() {
                self.login_failures += 1;
                if self.login_failures >= 5 {
                    self.login_blocked_until =
                        Some(std::time::Instant::now() + std::time::Duration::from_secs(60));
                    self.login_failures = 0
                }
            } else {
                self.login_failures = 0
            }
            return result;
        }
        if action == "logout" {
            self.actor = None;
            return Ok(json!(true));
        }
        self.actor()?;
        if action == "request_status" {
            self.require("sell")?;
            let rows = list(
                self.c()?,
                "SELECT result FROM requests WHERE id=?1 AND action='checkout'",
                &[&required(&p, "request_id")?],
            )?;
            return Ok(if let Some(row) = rows.first() {
                self.redact_receipt(serde_json::from_str(s(row, "result"))?)
            } else {
                Value::Null
            });
        }
        if action == "snapshot" {
            return self.snapshot(&p);
        }
        if action == "quote" {
            self.require("sell")?;
            return self.quote(&p);
        }
        if action == "receipt" {
            if self.require("sell").is_err() && self.require("refund").is_err() {
                self.require("reports")?;
            }
            return self.receipt(s(&p, "id"));
        }
        if action == "backup" {
            self.require("settings")?;
            return self.backup(&p);
        }
        if action == "restore" {
            self.require("settings")?;
            return self.restore(&p);
        }
        if action == "integrity" {
            self.require("settings")?;
            return Ok(
                json!({"result":self.c()?.query_row("PRAGMA integrity_check",[],|r|r.get::<_,String>(0))?}),
            );
        }
        if action == "import_preview" {
            self.require("catalog")?;
            return self.import_preview(&p);
        }
        let permission = match action {
            "checkout" | "hold" | "hold_delete" => "sell",
            "product_save" | "category_save" | "import_commit" => "catalog",
            "stock_adjust" => "inventory",
            "purchase_save" | "purchase_receive" | "supplier_return" | "supplier_save" => {
                "purchase"
            }
            "customer_save" | "customer_payment" => "customers",
            "supplier_payment" | "expense" | "register_open" | "register_close" | "cash_move" => {
                "finance"
            }
            "return" => "refund",
            "settings_save" | "user_save" | "permissions_save" => "settings",
            _ => return Err(err("UNKNOWN", "Unknown operation.")),
        };
        self.require(permission)?;
        let request = required(&p, "request_id")?;
        let serialized = format!("{:x}", Sha256::digest(serde_json::to_vec(&p)?));
        let old = list(
            self.c()?,
            "SELECT action,payload,result FROM requests WHERE id=?1",
            &[&request],
        )?;
        if let Some(old) = old.first() {
            if s(old, "action") != action
                || (if s(old, "payload").starts_with('{') {
                    format!("{:x}", Sha256::digest(s(old, "payload").as_bytes()))
                } else {
                    s(old, "payload").to_string()
                }) != serialized
            {
                return Err(err(
                    "CONFLICT",
                    "This request identifier was already used for a different operation.",
                ));
            }
            let result = serde_json::from_str(s(old, "result"))?;
            return Ok(if action == "checkout" {
                self.redact_receipt(result)
            } else {
                result
            });
        }
        self.c()?.execute_batch("BEGIN IMMEDIATE")?;
        let result = self.mutate(action, &p).and_then(|r| {
            let c = self.c()?;
            audit(c, &self.actor()?.id, action, &r.to_string())?;
            c.execute(
                "INSERT INTO requests(id,action,payload,result) VALUES(?1,?2,?3,?4)",
                params![request, action, serialized, r.to_string()],
            )?;
            Ok(r)
        });
        match result {
            Ok(v) => {
                if let Err(e) = self.c()?.execute_batch("COMMIT") {
                    let _ = self.c()?.execute_batch("ROLLBACK");
                    return Err(e.into());
                }
                Ok(v)
            }
            Err(e) => {
                self.c()?.execute_batch("ROLLBACK")?;
                Err(e)
            }
        }
    }
    fn mutate(&mut self, action: &str, p: &Value) -> Result<Value> {
        match action {
            "checkout" => self.checkout(p),
            "return" => self.return_sale(p),
            "product_save" => self.product_save(p),
            "category_save" => self.category_save(p),
            "stock_adjust" => self.stock_adjust(p),
            "purchase_save" => self.purchase_save(p),
            "purchase_receive" => self.purchase_receive(p),
            "supplier_return" => self.supplier_return(p),
            "supplier_save" | "customer_save" => self.party_save(action, p),
            "customer_payment" | "supplier_payment" => self.party_payment(action, p),
            "expense" => self.expense(p),
            "register_open" | "register_close" | "cash_move" => self.register(action, p),
            "hold" | "hold_delete" => self.hold(action, p),
            "settings_save" => self.settings_save(p),
            "user_save" => self.user_save(p),
            "permissions_save" => self.permissions_save(p),
            "import_commit" => self.import_commit(p),
            _ => Err(err("UNKNOWN", "Unknown operation.")),
        }
    }
    pub fn open_store(&mut self, p: &Value) -> Result<Value> {
        let mode = s(p, "mode");
        if !["demo", "real"].contains(&mode) || self.preview && mode != "demo" {
            return Err(err(
                "VALIDATION",
                "Real stores are only available in the desktop application.",
            ));
        }
        self.actor = None;
        self.conn = None;
        self.lock = None;
        let name = if mode == "demo" { "demo" } else { "store" };
        let f = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(self.root.join(format!("{name}.lock")))?;
        f.try_lock_exclusive().map_err(|_| {
            err(
                "LOCKED",
                "This store is already open in another application.",
            )
        })?;
        let c = open_db(&self.root.join(format!("{name}.sqlite")))?;
        self.conn = Some(c);
        self.lock = Some(f);
        self.mode = mode.into();
        if mode == "demo" {
            if scalar(self.c()?, "SELECT count(*) FROM users", &[])? == 0 {
                self.seed_demo()?;
            }
            self.login(&json!({"username":"owner","password":"demo12345"}))?;
        }
        let setup = scalar(self.c()?, "SELECT count(*) FROM users", &[])? == 0;
        Ok(json!({"needs_setup":setup,"mode":mode}))
    }
    pub fn automatic_backup(&self) -> Result<()> {
        if self.conn.is_none() {
            return Ok(());
        }
        let folder = self.root.join("backups");
        fs::create_dir_all(&folder)?;
        let path = folder.join(format!("{}-{}.sqlite", self.mode, today()));
        if !path.exists() {
            let temporary = path.with_extension("sqlite.partial");
            self.backup_to(&temporary)?;
            fs::rename(&temporary, &path)?;
            put_setting(self.c()?, "last_automatic_backup", &now())?;
        }
        let mut entries = fs::read_dir(&folder)?
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with(&format!("{}-", self.mode))
                    && e.path().extension().is_some_and(|ext| ext == "sqlite")
            })
            .collect::<Vec<_>>();
        entries.sort_by_key(|e| e.file_name());
        let remove = entries.len().saturating_sub(14);
        for e in entries.into_iter().take(remove) {
            fs::remove_file(e.path())?;
        }
        Ok(())
    }
    pub fn backup_to(&self, path: &Path) -> Result<()> {
        let mut dest = Connection::open(path)?;
        let b = rusqlite::backup::Backup::new(self.c()?, &mut dest)?;
        b.run_to_completion(100, std::time::Duration::from_millis(5), None)?;
        Ok(())
    }
    fn backup(&self, p: &Value) -> Result<Value> {
        let path = if self.preview || s(p, "path").is_empty() {
            let folder = self.root.join("backups");
            fs::create_dir_all(&folder)?;
            folder.join(format!("manual-{}.sqlite", id()))
        } else {
            PathBuf::from(required(p, "path")?)
        };
        let active = self.root.join(if self.mode == "demo" {
            "demo.sqlite"
        } else {
            "store.sqlite"
        });
        if path == active || path.exists() {
            return Err(err("VALIDATION", "Choose a new backup filename."));
        }
        self.backup_to(&path)?;
        put_setting(self.c()?, "last_backup", &now())?;
        Ok(json!({"path":path}))
    }
    fn restore(&mut self, p: &Value) -> Result<Value> {
        if self.preview {
            return Err(err(
                "PREVIEW",
                "Restore is available in the desktop application.",
            ));
        }
        let path = PathBuf::from(required(p, "path")?);
        let source =
            Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let valid: String = source.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
        let version = scalar(&source, "PRAGMA user_version", &[])?;
        let fk = scalar(
            &source,
            "SELECT count(*) FROM pragma_foreign_key_check",
            &[],
        )?;
        if valid != "ok"
            || version != 2
            || fk != 0
            || scalar(
                &source,
                "SELECT count(*) FROM users WHERE role='owner' AND active=1",
                &[],
            )? == 0
        {
            return Err(err(
                "INVALID_BACKUP",
                "The selected file is not a valid, compatible Radefy backup.",
            ));
        }
        let backup = self.root.join(format!("before-restore-{}.sqlite", id()));
        self.backup_to(&backup)?;
        // Online backup replaces database pages transactionally; failure leaves the destination unchanged.
        let dest = self
            .conn
            .as_mut()
            .ok_or_else(|| err("NO_STORE", "No open store."))?;
        {
            let b = rusqlite::backup::Backup::new(&source, dest)?;
            b.run_to_completion(100, std::time::Duration::from_millis(5), None)?;
        }
        dest.execute_batch("PRAGMA foreign_keys=ON;PRAGMA synchronous=FULL;")?;
        self.actor = None;
        Ok(json!({"restored":true,"recovery_path":backup}))
    }
}
