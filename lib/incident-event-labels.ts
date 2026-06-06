import type { IncidentEventAction, IncidentEventSource } from "@/lib/incident-events";

const ACTION_LABELS: Record<IncidentEventAction, string> = {
  incident_created: "Incident créé",
  incident_updated: "Incident mis à jour",
  status_changed: "Statut modifié",
  assigned: "Assignation",
  photo_added: "Photo ajoutée",
  closed: "Clôture",
  reopened: "Réouverture",
  deleted: "Suppression",
  pdf_exported: "Export PDF",
};

const SOURCE_LABELS: Record<IncidentEventSource, string> = {
  terrain: "Terrain",
  boss: "Bureau",
  project: "Dossier incident",
};

export function labelIncidentEventAction(action?: string | null) {
  if (!action) return "Action tracée";
  return ACTION_LABELS[action as IncidentEventAction] || action.replace(/_/g, " ");
}

export function labelIncidentEventSource(source?: string | null) {
  if (!source) return "Non renseignée";
  return SOURCE_LABELS[source as IncidentEventSource] || source;
}
