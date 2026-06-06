import { withTimeout } from "@/lib/async-timeout";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export type IncidentEventAction =
  | "incident_created"
  | "incident_updated"
  | "status_changed"
  | "assigned"
  | "photo_added"
  | "closed"
  | "reopened"
  | "deleted"
  | "pdf_exported";

export type IncidentEventSource = "terrain" | "boss" | "project";

export type IncidentEvent = {
  id: string;
  incident_id: string;
  project_id?: string | null;
  action: IncidentEventAction;
  actor_label?: string | null;
  actor_role?: string | null;
  source?: IncidentEventSource | string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type IncidentEventInput = Omit<IncidentEvent, "id" | "created_at">;
export type IncidentEventsUnavailableReason = "missing" | "schema_cache" | "error" | null;
export type IncidentEventsFetchResult = {
  events: IncidentEvent[];
  available: boolean;
  reason: IncidentEventsUnavailableReason;
};
export type IncidentEventWriteResult = {
  ok: boolean;
  skipped: boolean;
  reason: IncidentEventsUnavailableReason;
};

const INCIDENT_EVENT_SELECT =
  "id, incident_id, project_id, action, actor_label, actor_role, source, summary, metadata, created_at";
const INCIDENT_EVENT_READ_TIMEOUT_MS = 10000;
const INCIDENT_EVENT_WRITE_TIMEOUT_MS = 8000;

export function getIncidentEventsUnavailableMessage(reason: IncidentEventsUnavailableReason) {
  if (reason === "schema_cache") {
    return "Journal non visible par l'API Supabase. Vérifiez le cache schema PostgREST ou relancez le reload schema.";
  }

  if (reason === "error") {
    return "Journal indisponible. Vérifiez les droits, policies RLS ou le cache schema Supabase.";
  }

  return "Journal non activé en base. Appliquez le script incident-events-journal.sql pour enregistrer les actions.";
}

export function getIncidentEventsUnavailableDetail(reason: IncidentEventsUnavailableReason) {
  if (reason === "schema_cache") {
    return "La table incident_events peut etre creee, mais l'API Supabase ne la voit pas encore. Attendez le reload PostgREST ou relancez notify pgrst, 'reload schema'.";
  }

  if (reason === "error") {
    return "La table incident_events semble presente ou partiellement configuree, mais la lecture du journal echoue. Verifiez les grants, policies RLS et le cache schema Supabase.";
  }

  return "Le code est prêt, mais la table Supabase incident_events n'existe pas encore. Appliquez le script SQL non destructif avant d'attendre des entrées persistées.";
}

export function getIncidentEventWriteFeedbackMessage({
  baseMessage,
  recorded,
  skipped = false,
  reason,
  hasAnchorIncident = true,
  journalWasAvailable,
}: {
  baseMessage: string;
  recorded: boolean;
  skipped?: boolean;
  reason: IncidentEventsUnavailableReason;
  hasAnchorIncident?: boolean;
  journalWasAvailable?: boolean;
}) {
  if (recorded) {
    return `${baseMessage} et journal mis à jour.`;
  }

  if (reason === "schema_cache") {
    return `${baseMessage}. Journal non visible par l'API Supabase, vérifiez le cache schema.`;
  }

  if (reason === "error") {
    return `${baseMessage}. Journal indisponible, vérifiez les droits Supabase.`;
  }

  if (reason === "missing" || skipped) {
    return `${baseMessage}. Journal non activé en base.`;
  }

  if (!hasAnchorIncident) {
    return `${baseMessage}. Aucun incident à journaliser.`;
  }

  if (journalWasAvailable) {
    return `${baseMessage}. Journal disponible, événement non enregistré.`;
  }

  return `${baseMessage}. Événement journal non enregistré.`;
}

function readErrorField(error: unknown, field: string) {
  if (typeof error !== "object" || error === null || !(field in error)) {
    return "";
  }

  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function buildIncidentEventErrorText(error: unknown): string {
  const fields = ["code", "message", "details", "hint", "status", "statusText"];
  const directText = fields.map((field) => readErrorField(error, field)).filter(Boolean);
  const cause = typeof error === "object" && error !== null ? (error as { cause?: unknown }).cause : null;
  const causeText = cause ? fields.map((field) => readErrorField(cause, field)).filter(Boolean) : [];

  if (error instanceof Error) {
    directText.push(error.message);
  }

  if (typeof error === "string") {
    directText.push(error);
  }

  return [...directText, ...causeText].join(" ").toLowerCase();
}

function availableIncidentEvents(data: unknown[] | null): IncidentEventsFetchResult {
  return { events: (data || []) as IncidentEvent[], available: true, reason: null };
}

function unavailableIncidentEvents(error: unknown, warning: string): IncidentEventsFetchResult {
  if (isIncidentEventsSchemaCacheError(error)) {
    return { events: [], available: false, reason: "schema_cache" };
  }

  if (isIncidentEventsMissing(error)) {
    return { events: [], available: false, reason: "missing" };
  }

  console.warn(warning, error);
  return { events: [], available: false, reason: "error" };
}

export function isIncidentEventsSchemaCacheError(error: unknown) {
  const message = buildIncidentEventErrorText(error);
  return message.includes("pgrst205") || message.includes("schema cache");
}

export function isIncidentEventsMissing(error: unknown) {
  const message = buildIncidentEventErrorText(error);
  const mentionsIncidentEvents = message.includes("incident_events");

  return (
    message.includes("42p01") ||
    (mentionsIncidentEvents &&
      (message.includes("could not find the table") ||
        message.includes("relation") ||
        message.includes("does not exist")))
  );
}

export async function logIncidentEvent(input: IncidentEventInput) {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await withTimeout(
      supabase.from("incident_events").insert({
        incident_id: input.incident_id,
        project_id: input.project_id || null,
        action: input.action,
        actor_label: input.actor_label || null,
        actor_role: input.actor_role || null,
        source: input.source || null,
        summary: input.summary,
        metadata: input.metadata || {},
      }),
      INCIDENT_EVENT_WRITE_TIMEOUT_MS,
      "Timeout ecriture journal incident."
    );

    if (error) throw error;
    return { ok: true, skipped: false, reason: null } satisfies IncidentEventWriteResult;
  } catch (error) {
    if (isIncidentEventsSchemaCacheError(error)) {
      return { ok: false, skipped: true, reason: "schema_cache" } satisfies IncidentEventWriteResult;
    }

    if (isIncidentEventsMissing(error)) {
      return { ok: false, skipped: true, reason: "missing" } satisfies IncidentEventWriteResult;
    }

    console.warn("[FieldTrace][Audit] Incident event not recorded", error);
    return { ok: false, skipped: false, reason: "error" } satisfies IncidentEventWriteResult;
  }
}

export async function fetchIncidentEvents(incidentId: string, limit = 20) {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await withTimeout(
      supabase
        .from("incident_events")
        .select(INCIDENT_EVENT_SELECT)
        .eq("incident_id", incidentId)
        .order("created_at", { ascending: false })
        .limit(limit),
      INCIDENT_EVENT_READ_TIMEOUT_MS,
      "Timeout lecture journal incident."
    );

    if (error) throw error;
    return availableIncidentEvents(data);
  } catch (error) {
    return unavailableIncidentEvents(error, "[FieldTrace][Audit] Incident events unavailable");
  }
}

export async function fetchRecentIncidentEvents(limit = 80) {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await withTimeout(
      supabase
        .from("incident_events")
        .select(INCIDENT_EVENT_SELECT)
        .order("created_at", { ascending: false })
        .limit(limit),
      INCIDENT_EVENT_READ_TIMEOUT_MS,
      "Timeout lecture journal recent."
    );

    if (error) throw error;
    return availableIncidentEvents(data);
  } catch (error) {
    return unavailableIncidentEvents(error, "[FieldTrace][Audit] Recent incident events unavailable");
  }
}

export async function fetchProjectIncidentEvents(projectId: string, limit = 300) {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await withTimeout(
      supabase
        .from("incident_events")
        .select(INCIDENT_EVENT_SELECT)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(limit),
      INCIDENT_EVENT_READ_TIMEOUT_MS,
      "Timeout lecture journal projet."
    );

    if (error) throw error;
    return availableIncidentEvents(data);
  } catch (error) {
    return unavailableIncidentEvents(error, "[FieldTrace][Audit] Project incident events unavailable");
  }
}

export function groupIncidentEventsByIncident(events: IncidentEvent[], projectId?: string | null) {
  return events.reduce<Record<string, IncidentEvent[]>>((acc, event) => {
    if (projectId && event.project_id !== projectId) return acc;
    acc[event.incident_id] = [...(acc[event.incident_id] || []), event];
    return acc;
  }, {});
}

export function formatIncidentEventDate(value?: string | null) {
  if (!value) return "Non renseigné";
  try {
    return new Date(value).toLocaleString("fr-FR");
  } catch {
    return value;
  }
}
