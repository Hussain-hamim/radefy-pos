import type { FormSpec, Field } from "../components/ui";
import type { StoreContext } from "./context";
import { decimal } from "./money";
import type { Row } from "./types";

export function partyForm(
  ctx: Pick<StoreContext, "run" | "can">,
  kind: "customer" | "supplier",
  party?: Row,
  onSaved?: (id: string, name: string) => void,
  initial: Record<string, string> = {},
): FormSpec {
  const customer = kind === "customer";
  return {
    title: customer
      ? party
        ? "Edit customer"
        : "Add customer"
      : party
        ? "Edit supplier"
        : "Add supplier",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "phone", label: "Phone" },
      { key: "address", label: "Address", full: true },
      { key: "notes", label: "Notes", type: "textarea", full: true },
      ...(customer
        ? [
            {
              key: "credit_limit",
              label: "Credit limit",
              type: "money",
            } as Field,
          ]
        : []),
      ...(!party && ctx.can("finance")
        ? [
            {
              key: "opening_balance",
              label: "Opening balance",
              type: "money",
            } as Field,
          ]
        : []),
    ],
    initial: party
      ? {
          name: party.name ?? "",
          phone: party.phone ?? "",
          address: party.address ?? "",
          notes: party.notes ?? "",
          credit_limit: decimal(party.credit_limit),
        }
      : { credit_limit: "0", opening_balance: "0", ...initial },
    onSubmit: async (values) => {
      const result = await ctx.run<{ id: string }>(`${kind}_save`, {
        ...values,
        id: party?.id ?? "",
      });
      onSaved?.(result.id, values.name);
    },
  };
}
