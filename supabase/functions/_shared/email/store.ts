// Journal des e-mails dans public.transactional_emails (migration 0020), via
// le client supabase-js service_role deja cree par la fonction appelante.
// Aucun import : le client est passe en parametre (type minimal).
import type { EmailLogRow, EmailLogStore, EmailLogWrite, EmailStatus, ReserveResult } from "./sender.ts";

export const EMAIL_LOG_TABLE = "transactional_emails";

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (table: string) => any };

const COLUMNS = "idempotency_key,kind,status,attempts,updated_at,provider_message_id";

export function supabaseEmailLogStore(client: SupabaseLike, table: string = EMAIL_LOG_TABLE): EmailLogStore {
  return {
    async get(key: string): Promise<EmailLogRow | null> {
      const { data, error } = await client.from(table).select(COLUMNS).eq("idempotency_key", key).maybeSingle();
      if (error) throw new Error("transactional_emails select: " + error.message);
      return (data as EmailLogRow) || null;
    },
    async reserve(row: EmailLogWrite): Promise<ReserveResult> {
      const { error } = await client.from(table).insert(row);
      if (!error) return { ok: true };
      if (error.code === "23505") return { ok: false, conflict: true };
      return { ok: false, conflict: false, error: error.message };
    },
    async reclaim(key: string, expected: { status: EmailStatus; updated_at: string }, patch: EmailLogWrite): Promise<boolean> {
      const { data, error } = await client
        .from(table)
        .update(patch)
        .eq("idempotency_key", key)
        .eq("status", expected.status)
        .eq("updated_at", expected.updated_at)
        .select("idempotency_key");
      if (error) throw new Error("transactional_emails reclaim: " + error.message);
      return Array.isArray(data) && data.length === 1;
    },
    async update(key: string, patch: EmailLogWrite): Promise<void> {
      const { error } = await client.from(table).update(patch).eq("idempotency_key", key);
      if (error) throw new Error("transactional_emails update: " + error.message);
    },
  };
}
