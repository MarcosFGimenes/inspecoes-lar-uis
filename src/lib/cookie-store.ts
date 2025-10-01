import { cookies } from "next/headers";

export type CookieStore = Awaited<ReturnType<typeof cookies>>;

export function getCookieStore(): CookieStore {
  return cookies() as unknown as CookieStore;
}
