// src/lib/session-maint.ts
import { SessionOptions } from "iron-session";

export type MaintSession = {
  id?: string;
  matricula?: string;
  nome?: string;
  role?: "maint";
};

const sessionPassword = process.env.IRON_SESSION_PASSWORD;
const sessionCookieName = process.env.IRON_SESSION_COOKIE_NAME;

if (!sessionPassword) {
  throw new Error("Missing IRON_SESSION_PASSWORD environment variable");
}

if (sessionPassword.length < 32) {
  throw new Error("IRON_SESSION_PASSWORD must be at least 32 characters long");
}

if (!sessionCookieName) {
  throw new Error("Missing IRON_SESSION_COOKIE_NAME environment variable");
}

export const maintSessionOptions: SessionOptions = {
  cookieName: sessionCookieName,
  password: sessionPassword,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  },
};
