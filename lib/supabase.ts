import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

export type SupabaseErrorKind = "config" | "backend";

export class FieldTraceSupabaseError extends Error {
  kind: SupabaseErrorKind;
  cause?: unknown;

  constructor(kind: SupabaseErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = "FieldTraceSupabaseError";
    this.kind = kind;
    this.cause = cause;
  }
}

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[FieldTrace][Supabase] Missing public environment variables", {
      hasUrl: Boolean(supabaseUrl),
      hasAnonKey: Boolean(supabaseAnonKey),
    });

    throw new FieldTraceSupabaseError(
      "config",
      "Configuration Supabase incomplète. Variables publiques manquantes."
    );
  }

  if (!browserClient) {
    try {
      new URL(supabaseUrl);
    } catch (error) {
      throw new FieldTraceSupabaseError(
        "config",
        "Configuration Supabase invalide. NEXT_PUBLIC_SUPABASE_URL doit être une URL valide.",
        error
      );
    }

    browserClient = createClient(supabaseUrl, supabaseAnonKey);
  }

  return browserClient;
}

export function normalizeSupabaseError(error: unknown) {
  if (error instanceof FieldTraceSupabaseError) {
    return error;
  }

  if (error instanceof Error) {
    return new FieldTraceSupabaseError("backend", error.message, error);
  }

  return new FieldTraceSupabaseError(
    "backend",
    "Erreur inconnue pendant l'accès aux données Supabase.",
    error
  );
}

export function getUserFacingSupabaseErrorMessage(kind: SupabaseErrorKind) {
  if (kind === "config") {
    return "Erreur de configuration. Vérifiez les variables d’environnement Vercel NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY.";
  }

  return "Backend indisponible. Impossible de charger les données pour le moment.";
}

export function isNotFoundPostgrestError(error: PostgrestError | null | undefined) {
  if (!error) {
    return false;
  }

  return error.code === "PGRST116";
}
