import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Store, type StoreContext } from "../lib/context";
import type { Payload, Receipt, Snapshot } from "../lib/types";
import { command } from "../lib/api";
import { POS } from "./POS";
import { Inventory } from "./Catalog";

vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  command: vi.fn(),
}));
const product = {
  id: "milk",
  name: "Milk",
  unit: "piece",
  active: "1",
  available: "25000",
  price: "10000",
  category_id: "",
  sku: "MILK",
};
function context(page: StoreContext["page"] = "pos") {
  const data = {
    mode: "demo",
    settings: {
      language: "en",
      receipt_width: "80",
      store_name: "Test store",
      date_calendar: "gregory",
    },
    products: [product],
    categories: [],
    barcodes: [],
    held: [],
    lots: [],
    customers: [{ id: "existing", name: "Ahmad", phone: "0700000000" }],
    registers: [{ id: "register", closed_at: null }],
  } as unknown as Snapshot;
  const run = vi.fn(async (action: string, payload: Payload = {}) => {
    if (action === "customer_save") return { id: "new-customer" };
    if (action === "product_save") return { id: "new-product" };
    return {
      sale: {
        number: "RD-000001",
        total: "10000",
        customer: payload.customer_id ? "New customer" : null,
        tendered: String(payload.cash),
        change_due: "0",
        debt: "0",
      },
      items: [],
      payments: [],
    } as Receipt;
  });
  return {
    data,
    page,
    run,
    t: (s: string) => s,
    can: () => true,
    notify: vi.fn(),
    setPage: vi.fn(),
    refresh: vi.fn(),
  } as unknown as StoreContext & { run: typeof run };
}
function show(ctx: StoreContext, inventory = false) {
  return render(
    <Store.Provider value={ctx}>
      {inventory ? <Inventory /> : <POS />}
    </Store.Provider>,
  );
}
async function addMilk() {
  fireEvent.click(screen.getByRole("button", { name: /Milk.*100/ }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Complete sale" })).toBeEnabled(),
  );
}
function picker() {
  fireEvent.click(screen.getByRole("button", { name: /^Customer / }));
  return screen.getByRole("dialog", { name: "Select customer" });
}
beforeEach(() => {
  localStorage.clear();
  vi.mocked(command).mockImplementation(async (_action, payload = {}) => {
    const items = payload.items as { product_id: string; quantity: string }[];
    const subtotal = items.reduce(
      (sum, item) => sum + BigInt(item.quantity) * 10n,
      0n,
    );
    const total = subtotal - BigInt(String(payload.discount ?? "0"));
    return {
      subtotal: String(subtotal),
      discount: String(payload.discount ?? "0"),
      tax: "0",
      total: String(total),
      lines: items.map((item) => ({
        ...item,
        total: String(BigInt(item.quantity) * 10n),
      })),
    } as never;
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("walk-in checkout and customer selection", () => {
  it("defaults to walk-in and submits the visible exact cash amount, including quantity, discount and split-payment changes", async () => {
    const ctx = context();
    show(ctx);
    expect(
      screen.getByRole("button", { name: "Customer Walk-in customer" }),
    ).toBeInTheDocument();
    await addMilk();
    expect(screen.getByLabelText("Cash received")).toHaveValue("100.00");
    fireEvent.click(screen.getByRole("button", { name: "Increase Milk" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Cash received")).toHaveValue("200.00"),
    );
    fireEvent.change(screen.getByLabelText("Discount"), {
      target: { value: "10" },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Cash received")).toHaveValue("190.00"),
    );
    fireEvent.change(screen.getByLabelText("Other payment"), {
      target: { value: "40" },
    });
    expect(screen.getByLabelText("Cash received")).toHaveValue("150.00");
    fireEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    await waitFor(() =>
      expect(ctx.run).toHaveBeenCalledWith(
        "checkout",
        expect.objectContaining({
          customer_id: "",
          cash: "15000",
          other: "4000",
          discount: "1000",
          items: [{ product_id: "milk", quantity: "2000" }],
        }),
      ),
    );
    expect(
      await screen.findByRole("dialog", { name: "Receipt" }),
    ).toHaveTextContent("Customer: Walk-in customer");
  });

  it("preserves manually entered cash and requires full payment for walk-in customers", async () => {
    show(context());
    await addMilk();
    fireEvent.change(screen.getByLabelText("Cash received"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Increase Milk" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Complete sale" }),
      ).toBeDisabled(),
    );
    expect(screen.getByLabelText("Cash received")).toHaveValue("50");
    expect(
      screen.getByText("Walk-in sales must be paid in full."),
    ).toBeVisible();
    const dialog = picker();
    fireEvent.click(within(dialog).getByRole("button", { name: /Ahmad/ }));
    expect(screen.getByRole("button", { name: "Complete sale" })).toBeEnabled();
    fireEvent.click(
      within(picker()).getByRole("button", { name: /Walk-in customer/ }),
    );
    expect(
      screen.getByRole("button", { name: "Complete sale" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Use exact cash" }));
    expect(screen.getByLabelText("Cash received")).toHaveValue("200.00");
    expect(screen.getByRole("button", { name: "Complete sale" })).toBeEnabled();
  });

  it("creates a missing customer from search, selects them, preserves the cart, and resets the next sale to walk-in", async () => {
    const ctx = context();
    show(ctx);
    await addMilk();
    const dialog = picker();
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "New customer" },
    });
    expect(within(dialog).getByText("No matching customers")).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: /Walk-in customer/ }),
    ).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add customer" }),
    );
    expect(screen.getByLabelText(/Name/)).toHaveValue("New customer");
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "0791234567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(ctx.run).toHaveBeenCalledWith(
      "customer_save",
      expect.objectContaining({
        name: "New customer",
        phone: "0791234567",
        credit_limit: "0",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Customer New customer" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity Milk")).toHaveValue("1");
    fireEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    await waitFor(() =>
      expect(ctx.run).toHaveBeenCalledWith(
        "checkout",
        expect.objectContaining({ customer_id: "new-customer", cash: "10000" }),
      ),
    );
    const receipt = await screen.findByRole("dialog", { name: "Receipt" });
    fireEvent.click(
      within(receipt).getAllByRole("button", { name: "Close" })[0],
    );
    expect(
      screen.getByRole("button", { name: "Customer Walk-in customer" }),
    ).toBeInTheDocument();
  });

  it("searches phone numbers and preserves selection and cart when customer creation is cancelled", async () => {
    show(context());
    await addMilk();
    let dialog = picker();
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "070000" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Ahmad/ }));
    dialog = picker();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add customer" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("button", { name: "Customer Ahmad" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity Milk")).toHaveValue("1");
  });

  it("does not offer customer creation without the customer permission", () => {
    const ctx = context();
    ctx.can = () => false;
    show(ctx);
    expect(
      within(picker()).queryByRole("button", { name: "Add customer" }),
    ).not.toBeInTheDocument();
  });
});

describe("opening inventory", () => {
  it("creates a product from Inventory with an exact fractional opening quantity", async () => {
    const ctx = context("inventory");
    show(ctx, true);
    fireEvent.click(screen.getByRole("button", { name: "Add product" }));
    expect(screen.getByLabelText(/Opening stock/)).toHaveValue("0");
    fireEvent.change(screen.getByLabelText(/Product name/), {
      target: { value: "Rice" },
    });
    fireEvent.change(screen.getByLabelText("Unit"), {
      target: { value: "kg" },
    });
    fireEvent.change(screen.getByLabelText(/Selling price/), {
      target: { value: "100.50" },
    });
    fireEvent.change(screen.getByLabelText(/Purchase cost/), {
      target: { value: "70" },
    });
    fireEvent.change(screen.getByLabelText(/Opening stock/), {
      target: { value: "1.250" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(ctx.run).toHaveBeenCalledWith(
        "product_save",
        expect.objectContaining({
          name: "Rice",
          unit: "kg",
          opening_stock: "1250",
          price: "10050",
          cost: "7000",
        }),
      ),
    );
  });
});
