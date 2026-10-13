import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Payload } from "./types";
export const desktop = isTauri();
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function command<T>(
  action: string,
  payload: Payload = {},
): Promise<T> {
  try {
    if (desktop) return await invoke<T>("command", { action, payload });
    const r = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    if (!r.ok)
      throw new AppError(
        "NETWORK",
        "The local demo database is starting. Please try again in a moment.",
      );
    const v = (await r.json()) as {
      ok: boolean;
      data: T;
      error: { code: string; message: string };
    };
    if (!v.ok) throw new AppError(v.error.code, v.error.message);
    return v.data;
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e && typeof e === "object" && "message" in e)
      throw new AppError(
        "code" in e ? String(e.code) : "NETWORK",
        String(e.message),
      );
    throw new AppError("NETWORK", String(e));
  }
}
const requestIds = new Map<string, string>();
export async function mutate<T>(
  action: string,
  payload: Payload = {},
): Promise<T> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(action + JSON.stringify(payload)),
  );
  const key =
    "radefy-request-" +
    Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
  const request_id =
    typeof payload.request_id === "string"
      ? payload.request_id
      : (requestIds.get(key) ??
        localStorage.getItem(key) ??
        crypto.randomUUID());
  requestIds.set(key, request_id);
  localStorage.setItem(key, request_id);
  try {
    const result = await command<T>(action, { ...payload, request_id });
    requestIds.delete(key);
    localStorage.removeItem(key);
    return result;
  } catch (error) {
    if (
      error instanceof AppError &&
      !["NETWORK", "WORKER", "STATE"].includes(error.code)
    ) {
      requestIds.delete(key);
      localStorage.removeItem(key);
    }
    throw error;
  }
}
export function downloadCsv(
  name: string,
  rows: Record<string, string | null>[],
) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const quote = (v: string) => '"' + v.replace(/"/g, '""') + '"';
  const safe = (v: string) => (/^[=+@\-\t\r]/.test(v) ? "'" + v : v);
  const content = [
    keys.map(quote).join(","),
    ...rows.map((r) => keys.map((k) => quote(safe(r[k] ?? ""))).join(",")),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
