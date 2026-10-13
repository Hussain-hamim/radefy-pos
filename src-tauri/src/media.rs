use crate::db::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, OptionalExtension};
impl Service {
    pub fn save_media(&self, key: &str, value: &str) -> Result<()> {
        if value.is_empty() {
            self.c()?.execute("DELETE FROM media WHERE id=?1", [key])?;
            return Ok(());
        }
        let (header, data) = value
            .split_once(',')
            .ok_or_else(|| err("IMAGE", "Choose a PNG, JPEG, or WebP image."))?;
        let mime = match header {
            "data:image/png;base64" => "image/png",
            "data:image/jpeg;base64" => "image/jpeg",
            "data:image/webp;base64" => "image/webp",
            _ => return Err(err("IMAGE", "Choose a PNG, JPEG, or WebP image.")),
        };
        let bytes = STANDARD
            .decode(data)
            .map_err(|_| err("IMAGE", "Invalid image file."))?;
        if bytes.len() > 2_000_000 {
            return Err(err("IMAGE", "Image must be smaller than 2 MB."));
        }
        let valid = match mime {
            "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
            "image/jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
            _ => bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"),
        };
        if !valid {
            return Err(err("IMAGE", "Image contents do not match its file type."));
        }
        self.c()?.execute("INSERT INTO media(id,mime,data) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET mime=excluded.mime,data=excluded.data",params![key,mime,bytes])?;
        Ok(())
    }
    pub fn read_media(&self, key: &str) -> Result<String> {
        let row: Option<(String, Vec<u8>)> = self
            .c()?
            .query_row("SELECT mime,data FROM media WHERE id=?1", [key], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .optional()?;
        Ok(row
            .map(|(mime, data)| format!("data:{mime};base64,{}", STANDARD.encode(data)))
            .unwrap_or_default())
    }
}
