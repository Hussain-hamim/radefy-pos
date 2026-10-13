export function parseFixed(input: string, precision = 2): string {
  const text = input.trim();
  if (!/^\d+(\.\d+)?$/.test(text))
    throw new Error("Enter a valid positive number.");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > precision)
    throw new Error(`Use at most ${precision} decimal places.`);
  const result =
    BigInt(whole) * 10n ** BigInt(precision) +
    BigInt(fraction.padEnd(precision, "0") || "0");
  if (result > 1_000_000_000_000n) throw new Error("Amount is too large.");
  return result.toString();
}
export function decimal(
  value: string | null | undefined,
  precision = 2,
): string {
  const n = BigInt(value || "0");
  const sign = n < 0n ? "-" : "";
  const abs = n < 0n ? -n : n;
  const unit = 10n ** BigInt(precision);
  return `${sign}${abs / unit}.${String(abs % unit).padStart(precision, "0")}`;
}
export function money(
  value: string | null | undefined,
  currency = false,
): string {
  const [whole, fraction] = decimal(value).split(".");
  const formatted =
    (whole === "-0" ? "-0" : BigInt(whole).toLocaleString("en-US")) +
    (fraction === "00" ? "" : "." + fraction);
  return currency ? `${formatted} AFN` : formatted;
}
export function qty(value: string | null | undefined): string {
  return decimal(value, 3).replace(/\.?0+$/, "");
}
export function sum(
  rows: Record<string, string | null>[],
  key: string,
): string {
  return rows.reduce((n, r) => n + BigInt(r[key] || "0"), 0n).toString();
}
export function dateLabel(
  value: string | null | undefined,
  calendar = "gregory",
  time = false,
): string {
  if (!value) return "—";
  const parsed = new Date(
    value.includes(" ")
      ? value.replace(" ", "T") + "Z"
      : value.length === 10
        ? value + "T00:00:00Z"
        : value,
  );
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(`en-US-u-ca-${calendar}`, {
    timeZone: "Asia/Kabul",
    month: "short",
    day: "numeric",
    year: time ? undefined : "numeric",
    ...(time ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(parsed);
}
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function businessDate(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length === 10) return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(
    new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z")),
  );
}
