import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Store, type StoreContext } from "../lib/context";
import { DataTable, FormModal } from "./ui";
import { translate } from "../lib/i18n";
const context = {
  t: (s: string) => s,
  notify: vi.fn(),
} as unknown as StoreContext;
describe("management workflows", () => {
  it("filters real table rows", () => {
    render(
      <Store.Provider value={context}>
        <DataTable
          rows={[{ name: "Rice" }, { name: "Milk" }]}
          columns={[{ key: "name", label: "Product" }]}
        />
      </Store.Provider>,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Rice" },
    });
    expect(screen.getByText("Rice")).toBeInTheDocument();
    expect(screen.queryByText("Milk")).not.toBeInTheDocument();
  });
  it("submits exact money values and supports Dari labels", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const ctx = { ...context, t: (s: string) => translate("fa", s) };
    render(
      <Store.Provider value={ctx}>
        <FormModal
          close={vi.fn()}
          spec={{
            title: "Record payment",
            fields: [
              { key: "amount", label: "Amount", type: "money", required: true },
            ],
            onSubmit: submit,
          }}
        />
      </Store.Provider>,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "0.29" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));
    await vi.waitFor(() =>
      expect(submit).toHaveBeenCalledWith({ amount: "29" }),
    );
  });
});
