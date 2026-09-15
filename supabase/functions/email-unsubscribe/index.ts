// Fonction Edge email-unsubscribe : branchement Deno de handler.ts.
// Desinscription des emails de relance par lien signe, sans connexion.
//
// Deploiement (OBLIGATOIREMENT sans verification JWT : un client mail qui
// suit l'en-tete List-Unsubscribe-Post n'a pas de jeton Supabase) :
//   supabase functions deploy email-unsubscribe --no-verify-jwt
//
// Secrets :
//   EMAIL_UNSUBSCRIBE_SECRET          obligatoire, meme valeur que send-lifecycle-emails
//   EMAIL_UNSUBSCRIBE_ALLOWED_ORIGIN  optionnel (defaut https://iashark.com)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  fournis par Supabase
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleRequest } from "./handler.ts";
import type { UnsubscribeStore } from "./handler.ts";

const SUPA_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = SUPA_URL && SERVICE_KEY
  ? createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const db: UnsubscribeStore | null = supabase
  ? {
    async unsubscribe({ userId, source }) {
      const { data, error } = await supabase.rpc("email_unsubscribe", { p_user_id: userId, p_source: source });
      if (error) throw new Error("email_unsubscribe: " + error.message);
      return String(data);
    },
  }
  : null;

Deno.serve((req: Request) =>
  handleRequest(req, {
    env: (name: string) => Deno.env.get(name),
    now: () => new Date(),
    log: {
      info: (m: string) => console.log(m),
      warn: (m: string) => console.warn(m),
      error: (m: string) => console.error(m),
    },
    db,
  })
);
