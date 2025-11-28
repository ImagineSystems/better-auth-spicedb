// src/lib/authClient.ts
import { createAuthClient } from "better-auth/svelte";
import { spiceDBClient } from "better-auth-spicedb/client";

export const authClient = createAuthClient({
  baseURL: "http://localhost:5173",
  plugins: [spiceDBClient()],
});