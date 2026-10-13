use crate::db::*;
use argon2::{
    password_hash::{PasswordHash, SaltString},
    Argon2, PasswordHasher, PasswordVerifier,
};
use rand_core::OsRng;
use rusqlite::params;
use serde_json::{json, Value};
pub fn hash(password: &str) -> Result<String> {
    if password.len() < 8 {
        return Err(err(
            "VALIDATION",
            "Use a password with at least 8 characters.",
        ));
    }
    Argon2::default()
        .hash_password(password.as_bytes(), &SaltString::generate(&mut OsRng))
        .map(|h| h.to_string())
        .map_err(|_| err("AUTH", "Could not protect the password."))
}
impl Service {
    pub fn setup(&mut self, p: &Value) -> Result<Value> {
        if scalar(self.c()?, "SELECT count(*) FROM users", &[])? != 0 {
            return Err(err("CONFLICT", "This store has already been set up."));
        }
        let name = required(p, "name")?;
        let store = required(p, "store_name")?;
        let username = required(p, "username")?;
        let password = hash(&required(p, "password")?)?;
        let c = self.c()?;
        c.execute_batch("BEGIN IMMEDIATE")?;
        let result = (|| {
            c.execute("INSERT INTO users(id,name,username,password_hash,role) VALUES(?1,?2,?3,?4,'owner')",params![id(),name,username,password])?;
            for (key, value) in [
                ("store_name", store.as_str()),
                ("address", s(p, "address")),
                ("phone", s(p, "phone")),
                (
                    "language",
                    if s(p, "language") == "fa" { "fa" } else { "en" },
                ),
                (
                    "receipt_width",
                    if s(p, "receipt_width") == "58" {
                        "58"
                    } else {
                        "80"
                    },
                ),
                ("date_calendar", "gregory"),
                ("tax_enabled", "0"),
                ("receipt_footer", "Thank you for shopping with us!"),
            ] {
                put_setting(c, key, value)?;
            }
            for (role, permissions) in [
                (
                    "manager",
                    vec![
                        "sell",
                        "discount",
                        "catalog",
                        "inventory",
                        "purchase",
                        "customers",
                        "finance",
                        "refund",
                        "reports",
                    ],
                ),
                ("cashier", vec!["sell", "customers", "finance"]),
                ("inventory", vec!["catalog", "inventory", "purchase"]),
                ("accountant", vec!["reports", "finance", "customers"]),
            ] {
                for permission in permissions {
                    c.execute(
                        "INSERT INTO role_permissions(role,permission) VALUES(?1,?2)",
                        params![role, permission],
                    )?;
                }
            }
            Ok::<_, Error>(())
        })();
        match result {
            Ok(_) => c.execute_batch("COMMIT")?,
            Err(e) => {
                c.execute_batch("ROLLBACK")?;
                return Err(e);
            }
        }
        self.login(p)
    }
    pub fn login(&mut self, p: &Value) -> Result<Value> {
        let username = required(p, "username")?;
        let rows = list(
            self.c()?,
            "SELECT * FROM users WHERE username=?1 AND active=1",
            &[&username],
        )?;
        let u = rows
            .first()
            .ok_or_else(|| err("AUTH", "Incorrect username or password."))?;
        let parsed = PasswordHash::new(s(u, "password_hash"))
            .map_err(|_| err("AUTH", "Invalid account credentials."))?;
        Argon2::default()
            .verify_password(s(p, "password").as_bytes(), &parsed)
            .map_err(|_| err("AUTH", "Incorrect username or password."))?;
        let permissions = list(
            self.c()?,
            "SELECT permission FROM role_permissions WHERE role=?1",
            &[&s(u, "role")],
        )?
        .iter()
        .map(|r| s(r, "permission").to_string())
        .collect();
        self.actor = Some(Actor {
            id: s(u, "id").into(),
            name: s(u, "name").into(),
            role: s(u, "role").into(),
            permissions,
        });
        audit(self.c()?, s(u, "id"), "login", s(u, "username"))?;
        self.dispatch("status", json!({}))
    }
    pub fn settings_save(&self, p: &Value) -> Result<Value> {
        if let Some(image) = p.get("logo").and_then(Value::as_str) {
            self.save_media("store-logo", image)?;
        }
        for key in [
            "store_name",
            "address",
            "phone",
            "language",
            "receipt_width",
            "date_calendar",
            "receipt_footer",
            "tax_enabled",
        ] {
            if let Some(value) = p.get(key).and_then(Value::as_str) {
                if value.len() > 1000 {
                    return Err(err("VALIDATION", "Setting is too long."));
                }
                match key {
                    "language" if !["en", "fa"].contains(&value) => {
                        return Err(err("VALIDATION", "Unsupported language."))
                    }
                    "receipt_width" if !["58", "80"].contains(&value) => {
                        return Err(err("VALIDATION", "Unsupported receipt width."))
                    }
                    "date_calendar" if !["gregory", "persian"].contains(&value) => {
                        return Err(err("VALIDATION", "Unsupported calendar."))
                    }
                    "tax_enabled" if !["0", "1"].contains(&value) => {
                        return Err(err("VALIDATION", "Invalid tax setting."))
                    }
                    _ => (),
                }
                put_setting(self.c()?, key, value)?;
            }
        }
        Ok(json!({"saved":true}))
    }
    pub fn user_save(&self, p: &Value) -> Result<Value> {
        if self.actor()?.role != "owner" {
            return Err(err(
                "FORBIDDEN",
                "Only the owner can manage employee accounts.",
            ));
        }
        let user_id = if s(p, "id").is_empty() {
            id()
        } else {
            required(p, "id")?
        };
        let role = required(p, "role")?;
        if !["owner", "manager", "cashier", "inventory", "accountant"].contains(&role.as_str()) {
            return Err(err("VALIDATION", "Invalid role."));
        }
        let active = if s(p, "active") == "0" { 0 } else { 1 };
        if user_id == self.actor()?.id && (role != "owner" || active == 0) {
            return Err(err(
                "VALIDATION",
                "You cannot disable or demote your own owner account.",
            ));
        }
        let name = required(p, "name")?;
        let username = required(p, "username")?;
        let exists = scalar(
            self.c()?,
            "SELECT count(*) FROM users WHERE id=?1",
            &[&user_id],
        )? > 0;
        if exists {
            self.c()?.execute(
                "UPDATE users SET name=?1,username=?2,role=?3,active=?4 WHERE id=?5",
                params![name, username, role, active, user_id],
            )?;
            if !s(p, "password").is_empty() {
                self.c()?.execute(
                    "UPDATE users SET password_hash=?1 WHERE id=?2",
                    params![hash(s(p, "password"))?, user_id],
                )?;
            }
        } else {
            self.c()?.execute("INSERT INTO users(id,name,username,role,password_hash,active) VALUES(?1,?2,?3,?4,?5,?6)",params![user_id,name,username,role,hash(&required(p,"password")?)?,active])?;
        }
        Ok(json!({"id":user_id}))
    }
    pub fn permissions_save(&self, p: &Value) -> Result<Value> {
        if self.actor()?.role != "owner" {
            return Err(err("FORBIDDEN", "Only the owner can manage permissions."));
        }
        let role = required(p, "role")?;
        if !["manager", "cashier", "inventory", "accountant"].contains(&role.as_str()) {
            return Err(err("VALIDATION", "Invalid role."));
        }
        let perms = p["permissions"]
            .as_array()
            .ok_or_else(|| err("VALIDATION", "Select permissions."))?;
        self.c()?
            .execute("DELETE FROM role_permissions WHERE role=?1", [&role])?;
        for v in perms {
            let perm = v.as_str().unwrap_or("");
            if ![
                "sell",
                "discount",
                "catalog",
                "inventory",
                "purchase",
                "customers",
                "finance",
                "refund",
                "reports",
            ]
            .contains(&perm)
            {
                return Err(err("VALIDATION", "Invalid permission."));
            }
            self.c()?.execute(
                "INSERT INTO role_permissions(role,permission) VALUES(?1,?2)",
                params![role, perm],
            )?;
        }
        Ok(json!({"saved":true}))
    }
}
