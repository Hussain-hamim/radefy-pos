import { useMemo, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  PackageOpen,
  LoaderCircle,
  Download,
} from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useStore } from "../lib/context";
import type { Row } from "../lib/types";
import { downloadCsv } from "../lib/api";
import { readLocalImage } from "../lib/images";
import { parseFixed } from "../lib/money";
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}
export function Empty({
  title = "No records yet",
  description = "Your records will appear here.",
  children,
}: {
  title?: string;
  description?: string;
  children?: ReactNode;
}) {
  const { t } = useStore();
  return (
    <div className="empty">
      <PackageOpen size={36} strokeWidth={1.3} />
      <h3>{t(title)}</h3>
      <p>{t(description)}</p>
      {children}
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  close,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const { t } = useStore();
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`modal ${wide ? "wide" : ""}`}
          aria-describedby={description ? "modal-description" : undefined}
        >
          <div className="modal-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description id="modal-description">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className="icon-button" aria-label={t("Close")}>
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export interface Field {
  key: string;
  label: string;
  type?:
    | "text"
    | "password"
    | "money"
    | "quantity"
    | "select"
    | "date"
    | "textarea"
    | "number"
    | "image";
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  full?: boolean;
  placeholder?: string;
}
export interface FormSpec {
  title: string;
  description?: string;
  fields: Field[];
  initial?: Record<string, string>;
  submitLabel?: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}
export function FormModal({
  spec,
  close,
}: {
  spec: FormSpec;
  close: () => void;
}) {
  const { t } = useStore();
  const [failure, setFailure] = useState("");
  const shape = Object.fromEntries(
    spec.fields.map((f) => [
      f.key,
      f.required
        ? z.string().min(1, `${t(f.label)}: ${t("Required")}`)
        : z.string(),
    ]),
  );
  const schema = z.object(shape);
  const defaults = Object.fromEntries(
    spec.fields.map((f) => [
      f.key,
      spec.initial?.[f.key] ??
        (f.type === "select" ? (f.options?.[0]?.value ?? "") : ""),
    ]),
  );
  const {
    register,
    setValue,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<Record<string, string>>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  return (
    <Modal
      title={t(spec.title)}
      description={spec.description ? t(spec.description) : undefined}
      close={() => {
        if (!isSubmitting) close();
      }}
    >
      <form
        onSubmit={handleSubmit(async (values) => {
          try {
            setFailure("");
            const converted = { ...values };
            for (const field of spec.fields) {
              if (field.type === "money" || field.type === "quantity")
                converted[field.key] = parseFixed(
                  values[field.key] || "0",
                  field.type === "quantity" ? 3 : 2,
                );
            }
            await spec.onSubmit(converted);
            close();
          } catch (e) {
            setFailure(e instanceof Error ? e.message : String(e));
          }
        })}
      >
        <div className="form-grid">
          {spec.fields.map((f) => (
            <label className={f.full ? "full" : ""} key={f.key}>
              <span>
                {t(f.label)}
                {f.required && <b className="required"> *</b>}
              </span>
              {f.type === "image" ? (
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    try {
                      const file = e.target.files?.[0];
                      if (file) setValue(f.key, await readLocalImage(file));
                    } catch (e) {
                      setFailure(e instanceof Error ? e.message : String(e));
                    }
                  }}
                />
              ) : f.type === "select" ? (
                <select {...register(f.key)}>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {t(o.label)}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea rows={3} {...register(f.key)} />
              ) : (
                <input
                  {...register(f.key)}
                  type={
                    f.type === "password"
                      ? "password"
                      : f.type === "date"
                        ? "date"
                        : "text"
                  }
                  inputMode={
                    f.type === "money" ||
                    f.type === "quantity" ||
                    f.type === "number"
                      ? "decimal"
                      : undefined
                  }
                  placeholder={f.placeholder}
                  autoComplete={f.type === "password" ? "new-password" : "off"}
                />
              )}
              <small className={errors[f.key] ? "field-error" : ""}>
                {errors[f.key]
                  ? String(errors[f.key]?.message)
                  : f.hint
                    ? t(f.hint)
                    : ""}
              </small>
            </label>
          ))}
        </div>
        {failure && (
          <div role="alert" className="error-box">
            {t(failure)}
          </div>
        )}
        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            onClick={close}
            disabled={isSubmitting}
          >
            {t("Cancel")}
          </button>
          <button className="button" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle size={16} className="spin" /> : null}
            {t(spec.submitLabel ?? "Save changes")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export interface Column {
  key: string;
  label: string;
  render?: (r: Row) => ReactNode;
}
export function DataTable({
  rows,
  columns,
  search = true,
  exportName,
  toolbar,
  emptyTitle,
}: {
  rows: Row[];
  columns: Column[];
  search?: boolean;
  exportName?: string;
  toolbar?: ReactNode;
  emptyTitle?: string;
}) {
  const { t } = useStore();
  const [filter, setFilter] = useState("");
  const defs = useMemo<ColumnDef<Row>[]>(
    () =>
      columns.map((c) => ({
        accessorKey: c.key,
        header: t(c.label),
        sortingFn: (a, b) => {
          const x = a.original[c.key] ?? "";
          const y = b.original[c.key] ?? "";
          if (/^-?\d+$/.test(x) && /^-?\d+$/.test(y))
            return BigInt(x) < BigInt(y) ? -1 : BigInt(x) > BigInt(y) ? 1 : 0;
          return x.localeCompare(y);
        },
        cell: (info) =>
          c.render
            ? c.render(info.row.original)
            : String(info.getValue() ?? "—"),
      })),
    [columns, t],
  );
  const table = useReactTable({
    data: rows,
    columns: defs,
    state: { globalFilter: filter },
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });
  return (
    <div className="panel table-panel">
      {(search || toolbar || exportName) && (
        <div className="table-toolbar">
          {search && (
            <label className="search-field">
              <Search size={17} />
              <input
                aria-label={t("Search…")}
                placeholder={t("Search…")}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
          )}
          <div className="toolbar-actions">
            {toolbar}
            {exportName && (
              <button
                className="button secondary small"
                onClick={() =>
                  downloadCsv(
                    exportName,
                    table.getFilteredRowModel().rows.map((r) => r.original),
                  )
                }
              >
                <Download size={15} />
                {t("Export CSV")}
              </button>
            )}
          </div>
        </div>
      )}
      {rows.length === 0 ? (
        <Empty title={emptyTitle} />
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                {table.getHeaderGroups().map((g) => (
                  <tr key={g.id}>
                    {g.headers.map((h) => (
                      <th key={h.id}>
                        <button onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(
                            h.column.columnDef.header,
                            h.getContext(),
                          )}
                          {h.column.getIsSorted() && <ArrowUpDown size={12} />}
                        </button>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((c) => (
                      <td key={c.id}>
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {table.getRowModel().rows.length === 0 && <Empty />}
          </div>
          <div className="table-footer">
            <span>
              {table.getFilteredRowModel().rows.length} {t("records")} ·{" "}
              {table.getState().pagination.pageIndex + 1} /{" "}
              {Math.max(1, table.getPageCount())}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label={t("Previous")}
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                className="icon-button"
                aria-label={t("Next")}
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const { t } = useStore();
  return (
    <div className="page-heading">
      <div>
        <h1>{t(title)}</h1>
        <p>{t(description)}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
