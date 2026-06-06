import { formatIncidentReference } from "@/lib/incident-reference";

export type AssignmentMessageTarget = {
  id: string;
  title: string;
  locationLabel: string;
  priorityLabel: string;
  statusLabel: string;
};

export type AssignmentMessageOperator = {
  firstName: string;
};

function cleanText(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed || fallback;
}

function operatorGreetingName(operator: AssignmentMessageOperator) {
  return cleanText(operator.firstName, "équipe");
}

export function buildAssignmentSubject(target: AssignmentMessageTarget) {
  return `Assignation incident ${formatIncidentReference(target.id)} - ${cleanText(target.title, "Incident terrain")}`;
}

export function buildAssignmentEmailBody(
  target: AssignmentMessageTarget,
  operator: AssignmentMessageOperator,
  incidentUrl: string
) {
  const title = cleanText(target.title, "Incident terrain");
  const location = cleanText(target.locationLabel, "Emplacement non renseigné");
  const priority = cleanText(target.priorityLabel, "Priorité non renseignée");
  const status = cleanText(target.statusLabel, "Statut non renseigné");
  const accessLine = incidentUrl.trim() ? `Accéder au problème : ${incidentUrl}` : "Lien d'accès non disponible.";

  return [
    `Bonjour ${operatorGreetingName(operator)},`,
    "",
    "Vous êtes assigné à un incident FieldTrace.",
    `Référence : ${formatIncidentReference(target.id)}`,
    `Titre : ${title}`,
    `Emplacement : ${location}`,
    `Criticité : ${priority}`,
    `Statut : ${status}`,
    "",
    accessLine,
    "",
    "Merci de prendre en charge ce point.",
  ].join("\n");
}

export function buildAssignmentSmsBody(
  target: AssignmentMessageTarget,
  operator: AssignmentMessageOperator,
  incidentUrl: string
) {
  const title = cleanText(target.title, "Incident terrain");
  const location = cleanText(target.locationLabel, "Emplacement non renseigné");
  const priority = cleanText(target.priorityLabel, "Priorité non renseignée");
  const status = cleanText(target.statusLabel, "Statut non renseigné");
  const accessLine = incidentUrl.trim() ? `Accéder : ${incidentUrl}` : "Lien indisponible.";

  return [
    `Bonjour ${operatorGreetingName(operator)},`,
    "Incident FieldTrace assigné.",
    `Référence : ${formatIncidentReference(target.id)}.`,
    title,
    location,
    `${priority} / ${status}`,
    accessLine,
    "Merci de prendre en charge ce point.",
  ].join(" ");
}

export function buildMailtoLink(email: string, subject: string, body: string) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildSmsLink(phone: string, body: string) {
  return `sms:${phone}?body=${encodeURIComponent(body)}`;
}
