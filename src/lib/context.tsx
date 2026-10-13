import { createContext, useContext } from "react";
import type { Page, Snapshot, Payload } from "./types";
export interface StoreContext {
  data: Snapshot;
  page: Page;
  setPage: (p: Page) => void;
  t: (s: string) => string;
  refresh: () => Promise<void>;
  notify: (text: string, error?: boolean) => void;
  run: <T = unknown>(action: string, payload?: Payload) => Promise<T>;
  can: (p: string) => boolean;
}
export const Store = createContext<StoreContext | null>(null);
export function useStore() {
  const c = useContext(Store);
  if (!c) throw new Error("Store is unavailable");
  return c;
}
