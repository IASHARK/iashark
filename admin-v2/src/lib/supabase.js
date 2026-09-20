// Client Supabase de l'admin v2. MEME projet et MEME session de navigateur
// que le site (cle de stockage par defaut sb-<ref>-auth-token) : un admin
// connecte sur iashark.com est deja connecte ici.
import { createClient } from "@supabase/supabase-js";

export const SUPA_URL = "https://ksvjraqitxouwiabecai.supabase.co";
const SUPA_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8";

export const supabase = createClient(SUPA_URL, SUPA_ANON_KEY);

// Appel RPC : renvoie { data } ou { error, kind } ('denied' = pas admin,
// 'missing' = migration absente), sans jamais jeter.
export async function rpc(name, args) {
  try {
    const { data, error } = await supabase.rpc(name, args || {});
    if (error) {
      const kind = /42501|access_denied|permission/i.test(error.code + " " + error.message)
        ? "denied"
        : /42883|404|not.?exist|not.?found/i.test(error.code + " " + error.message)
          ? "missing"
          : "error";
      return { error, kind };
    }
    return { data };
  } catch (error) {
    return { error, kind: "error" };
  }
}

// Fonction Edge admin-revenue : chiffres Stripe reels (MRR, encaisse, echecs).
export async function fetchRevenue() {
  try {
    const { data: s } = await supabase.auth.getSession();
    const token = s?.session?.access_token;
    if (!token) return { error: new Error("no_session"), kind: "denied" };
    const res = await fetch(SUPA_URL + "/functions/v1/admin-revenue", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, apikey: SUPA_ANON_KEY, "Content-Type": "application/json" },
      body: "{}",
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: body || res.status, kind: res.status === 403 ? "denied" : "error" };
    return { data: body };
  } catch (error) {
    return { error, kind: "error" };
  }
}

// Suivi des visites demarre a cette date (meme constante que admin.html).
export const LAUNCH_AT = "2026-09-13 19:00:00+00";
