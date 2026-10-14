import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search, UserRound } from "lucide-react";
import { useStore } from "../lib/context";
import { partyForm } from "../lib/party-form";
import { FormModal, Modal } from "./ui";

export function CustomerPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const ctx = useStore();
  const { data, t, can } = ctx;
  const [view, setView] = useState<"pick" | "create" | null>(null);
  const [search, setSearch] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (view === null && wasOpen.current) trigger.current?.focus();
    wasOpen.current = view !== null;
  }, [view]);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(
    null,
  );
  const selected =
    data.customers.find((c) => c.id === value) ??
    (created?.id === value ? created : null);
  const term = search.trim().toLocaleLowerCase();
  const matches = data.customers.filter((c) =>
    `${c.name ?? ""} ${c.phone ?? ""}`.toLocaleLowerCase().includes(term),
  );
  function select(id: string) {
    onChange(id);
    setView(null);
  }
  return (
    <>
      <span className="customer-label" id="sale-customer-label">
        {t("Customer")}
      </span>
      <button
        ref={trigger}
        type="button"
        className="customer-picker-trigger"
        aria-labelledby="sale-customer-label sale-customer-value"
        aria-haspopup="dialog"
        aria-expanded={view !== null}
        disabled={disabled}
        onClick={() => {
          setSearch("");
          setView("pick");
        }}
      >
        <UserRound size={16} />
        <span id="sale-customer-value">
          {value ? (selected?.name ?? t("Customer")) : t("Walk-in customer")}
        </span>
        <ChevronDown size={15} />
      </button>
      {view === "pick" && (
        <Modal title={t("Select customer")} close={() => setView(null)}>
          <div className="modal-body customer-picker-body">
            <label className="search-field">
              <Search size={17} />
              <input
                autoFocus
                aria-label={t("Search customers by name or phone")}
                placeholder={t("Search customers by name or phone")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              className="customer-option walk-in-option"
              aria-pressed={!value}
              onClick={() => select("")}
            >
              <UserRound size={20} />
              <span>
                <strong>{t("Walk-in customer")}</strong>
                <small>{t("No customer account needed")}</small>
              </span>
              {!value && <Check size={17} />}
            </button>
            <div className="customer-results" aria-label={t("Customers")}>
              {matches.map((c) => (
                <button
                  className="customer-option"
                  key={c.id}
                  aria-pressed={value === c.id}
                  onClick={() => select(c.id ?? "")}
                >
                  <span>
                    <strong>{c.name}</strong>
                    {c.phone && (
                      <small>
                        <bdi dir="ltr">{c.phone}</bdi>
                      </small>
                    )}
                  </span>
                  {value === c.id && <Check size={17} />}
                </button>
              ))}
              {!matches.length && (
                <p className="customer-no-results" role="status">
                  {t("No matching customers")}
                </p>
              )}
            </div>
          </div>
          {can("customers") && (
            <div className="modal-footer">
              <button className="button" onClick={() => setView("create")}>
                <Plus size={16} />
                {t("Add customer")}
              </button>
            </div>
          )}
        </Modal>
      )}
      {view === "create" && (
        <FormModal
          close={() => setView(null)}
          spec={partyForm(
            ctx,
            "customer",
            undefined,
            (id, name) => {
              setCreated({ id, name });
              onChange(id);
            },
            /^\+?[\d\s()-]+$/.test(search.trim())
              ? { phone: search.trim() }
              : { name: search.trim() },
          )}
        />
      )}
    </>
  );
}
