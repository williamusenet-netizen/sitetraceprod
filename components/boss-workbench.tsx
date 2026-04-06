"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getSupabaseBrowserClient,
  getUserFacingSupabaseErrorMessage,
  normalizeSupabaseError,
} from "@/lib/supabase";
import { generateProjectReportPdf } from "@/lib/pdf";
import demoOperators from "@/data/fieldtrace-demo-operators.json";

type DashboardStatus = "loading" | "ready" | "config-error" | "backend-unavailable";
type BossView =
  | "overview"
  | "command-center"
  | "incidents"
  | "operators"
  | "performance"
  | "review";
type AssignmentChannel = "email" | "sms";
type InsightKey =
  | "open"
  | "critical"
  | "overdue"
  | "closure"
  | "unassigned"
  | "treatment"
  | "operators"
  | "workload";
type IncidentStatus = "open" | "in_progress" | "closed";
type IncidentPriority = "critical" | "high" | "medium" | "low";

type RawProject = {
  id: string;
  name?: string | null;
  site_name?: string | null;
  client_name?: string | null;
  location?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type Project = {
  id: string;
  displayName: string;
  clientName: string | null;
  location: string | null;
  status: string | null;
  createdAt?: string | null;
};

type Incident = {
  id: string;
  project_id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: string | null;
  status?: string | null;
  reporter_name?: string | null;
  assignee?: string | null;
  initial_photo_url?: string | null;
  close_comment?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  closed_at?: string | null;
};

type Operator = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  phone: string;
};

type IncidentRecord = Incident & {
  project: Project | null;
};

type AssignmentDraft = {
  incidentId: string;
  operatorId: string;
  channel: AssignmentChannel;
};

type InsightConfig = {
  key: InsightKey;
  eyebrow: string;
  title: string;
  summary: string;
  incidents: IncidentRecord[];
  emptyLabel: string;
  primaryActionLabel: string;
  secondaryActionLabel?: string;
};

type ReviewActionKey = "critical-review" | "unassigned-review" | "overdue-review" | "stable-review";

type ReviewActionConfig = {
  key: ReviewActionKey;
  label: string;
  summary: string;
  incidents: IncidentRecord[];
  emptyLabel: string;
  primaryActionLabel?: string;
};

type DemoOperatorSeed = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  phone: string;
};

const OPERATOR_STORAGE_KEY = "fieldtrace:boss:operators";
const DEMO_OPERATOR_SEED = ((demoOperators as { operators?: DemoOperatorSeed[] }).operators || []).map(
  (operator) => ({
    id: operator.id,
    firstName: operator.firstName,
    lastName: operator.lastName,
    role: operator.role,
    email: operator.email,
    phone: operator.phone,
  })
);

function normalizeStatus(status?: string | null): IncidentStatus {
  const value = (status || "open").toLowerCase();
  if (value === "closed") return "closed";
  if (value === "in_progress") return "in_progress";
  return "open";
}

function normalizePriority(priority?: string | null): IncidentPriority {
  const value = (priority || "low").toLowerCase();
  if (value === "critical") return "critical";
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  return "low";
}

function statusLabel(status?: string | null) {
  const value = normalizeStatus(status);
  if (value === "in_progress") return "IN_PROGRESS";
  if (value === "closed") return "CLOSED";
  return "OPEN";
}

function priorityLabel(priority?: string | null) {
  return normalizePriority(priority).toUpperCase();
}

function incidentNatureLabel(category?: string | null) {
  const normalized = (category || "").toLowerCase();
  return normalized === "non-conformite" ? "Non-conformité" : "Incident";
}

function projectLabel(project?: Project | null) {
  return project?.displayName || "Emplacement inconnu";
}

function incidentRef(id: string) {
  return `FT-${id.slice(0, 8).toUpperCase()}`;
}

function operatorLabel(operator: Operator) {
  return `${operator.firstName} ${operator.lastName}`.trim();
}

function formatDate(value?: string | null) {
  if (!value) return "Non renseigné";
  try {
    return new Date(value).toLocaleString("fr-FR");
  } catch {
    return value;
  }
}

function formatShortDate(value?: string | null) {
  if (!value) return "Non renseigné";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDuration(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) {
    return "0 h";
  }

  if (hours < 24) {
    return `${Math.round(hours)} h`;
  }

  return `${(hours / 24).toFixed(1)} j`;
}

function formatAgingHours(value?: string | null) {
  const baseDate = new Date(value || Date.now()).getTime();
  const hours = Math.max(0, (Date.now() - baseDate) / 36e5);
  return formatDuration(hours);
}

function incidentPreviewUrl(incident: Incident) {
  return incident.initial_photo_url || null;
}

function priorityTone(priority?: string | null) {
  const value = normalizePriority(priority);
  if (value === "critical") return "border-red-500/30 bg-red-500/10 text-red-100";
  if (value === "high") return "border-orange-500/30 bg-orange-500/10 text-orange-100";
  if (value === "medium") return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
}

function statusTone(status?: string | null) {
  const value = normalizeStatus(status);
  if (value === "closed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  if (value === "in_progress") return "border-sky-500/30 bg-sky-500/10 text-sky-100";
  return "border-slate-500/30 bg-slate-500/10 text-slate-100";
}

function compareIncidents(left: Incident, right: Incident) {
  const priorityRank: Record<IncidentPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const statusRank: Record<IncidentStatus, number> = {
    open: 0,
    in_progress: 1,
    closed: 2,
  };

  const priorityDiff =
    priorityRank[normalizePriority(left.priority)] - priorityRank[normalizePriority(right.priority)];
  if (priorityDiff !== 0) return priorityDiff;

  const statusDiff =
    statusRank[normalizeStatus(left.status)] - statusRank[normalizeStatus(right.status)];
  if (statusDiff !== 0) return statusDiff;

  return (right.updated_at || right.created_at || "").localeCompare(
    left.updated_at || left.created_at || ""
  );
}

function loadStoredOperators() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(OPERATOR_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Operator[]) : [];
  } catch {
    return [];
  }
}

function saveStoredOperators(operators: Operator[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OPERATOR_STORAGE_KEY, JSON.stringify(operators));
}

function normalizePhoneNumber(phone: string) {
  const trimmed = phone.trim();
  if (!trimmed) return "";

  const hasPlusPrefix = trimmed.startsWith("+");
  const digitsOnly = trimmed.replace(/[^\d]/g, "");
  if (!digitsOnly) return "";

  return hasPlusPrefix ? `+${digitsOnly}` : digitsOnly;
}

function buildAssignmentEmailSubject(incident: IncidentRecord) {
  return `Assignation incident ${incidentRef(incident.id)} - ${incident.title}`;
}

function buildIncidentOperationUrl(appOrigin: string, incident: IncidentRecord) {
  const incidentPath = `/operation/${incident.id}`;
  return appOrigin ? `${appOrigin}${incidentPath}` : incidentPath;
}

function buildAssignmentEmailBody(incident: IncidentRecord, operator: Operator, appOrigin: string) {
  const incidentUrl = buildIncidentOperationUrl(appOrigin, incident);

  return [
    `Bonjour ${operator.firstName},`,
    "",
    `Vous êtes assigné à l'incident N°${incidentRef(incident.id)}.`,
    `Titre : ${incident.title}`,
    `Emplacement : ${projectLabel(incident.project)}`,
    `Criticité : ${priorityLabel(incident.priority)}`,
    `Statut : ${statusLabel(incident.status)}`,
    "",
    `Accéder au problème : ${incidentUrl}`,
    "",
    "Merci de prendre en charge ce point.",
  ].join("\n");
}

function buildAssignmentSmsBody(incident: IncidentRecord, operator: Operator, appOrigin: string) {
  const incidentUrl = buildIncidentOperationUrl(appOrigin, incident);

  return [
    `Bonjour ${operator.firstName},`,
    `incident ${incidentRef(incident.id)} assigné.`,
    `${incident.title}`,
    `${projectLabel(incident.project)}`,
    `${priorityLabel(incident.priority)} / ${statusLabel(incident.status)}`,
    `Accéder : ${incidentUrl}`,
    "Merci de prendre en charge ce point.",
  ].join(" ");
}

function buildMailtoLink(email: string, subject: string, body: string) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildSmsLink(phone: string, body: string) {
  return `sms:${phone}?body=${encodeURIComponent(body)}`;
}

export function BossWorkbench() {
  const [dashboardStatus, setDashboardStatus] = useState<DashboardStatus>("loading");
  const [activeView, setActiveView] = useState<BossView>("overview");
  const [projects, setProjects] = useState<Project[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [operatorsLoaded, setOperatorsLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [location, setLocation] = useState("");

  const [statusFilter, setStatusFilter] = useState<"all" | IncidentStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | IncidentPriority>("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [operatorFilter, setOperatorFilter] = useState("all");

  const [selectedIncidentId, setSelectedIncidentId] = useState("");
  const [assignmentDraft, setAssignmentDraft] = useState<AssignmentDraft | null>(null);
  const [activeInsightKey, setActiveInsightKey] = useState<InsightKey | null>(null);
  const [activeReviewActionKey, setActiveReviewActionKey] = useState<ReviewActionKey | null>(null);
  const [selectedImage, setSelectedImage] = useState<{
    url: string;
    title: string;
    subtitle: string;
  } | null>(null);
  const [operatorFirstName, setOperatorFirstName] = useState("");
  const [operatorLastName, setOperatorLastName] = useState("");
  const [operatorRole, setOperatorRole] = useState("");
  const [operatorEmail, setOperatorEmail] = useState("");
  const [operatorPhone, setOperatorPhone] = useState("");
  const [editingOperatorId, setEditingOperatorId] = useState<string | null>(null);
  const [pendingDeleteOperatorId, setPendingDeleteOperatorId] = useState<string | null>(null);
  const selectedIncidentPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stored = loadStoredOperators();
    setOperators(stored.length > 0 ? stored : DEMO_OPERATOR_SEED);
    setOperatorsLoaded(true);
  }, []);

  useEffect(() => {
    if (!operatorsLoaded) return;
    saveStoredOperators(operators);
  }, [operators, operatorsLoaded]);

  const loadData = async () => {
    setDashboardStatus("loading");
    setErrorMsg("");

    try {
      const supabase = getSupabaseBrowserClient();
      const [projectResult, incidentResult] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, site_name, client_name, location, status, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("incidents")
          .select(
            "id, project_id, title, description, category, priority, status, reporter_name, assignee, initial_photo_url, close_comment, created_at, updated_at, closed_at"
          )
          .order("created_at", { ascending: false }),
      ]);

      if (projectResult.error) throw projectResult.error;
      if (incidentResult.error) throw incidentResult.error;

      const mappedProjects = ((projectResult.data || []) as RawProject[]).map((project) => ({
        id: project.id,
        displayName: project.site_name || project.name || "Emplacement sans nom",
        clientName: project.client_name || null,
        location: project.location || null,
        status: project.status || null,
        createdAt: project.created_at || null,
      }));

      setProjects(mappedProjects);
      setIncidents((incidentResult.data || []) as Incident[]);
      setDashboardStatus("ready");
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      setErrorMsg(getUserFacingSupabaseErrorMessage(normalizedError.kind));
      setDashboardStatus(
        normalizedError.kind === "config" ? "config-error" : "backend-unavailable"
      );
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const records = useMemo(() => {
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    return [...incidents]
      .sort(compareIncidents)
      .map((incident) => ({
        ...incident,
        project: projectMap.get(incident.project_id) || null,
      }));
  }, [incidents, projects]);

  useEffect(() => {
    if (records.length === 0) {
      setSelectedIncidentId("");
      return;
    }

    const exists = records.some((item) => item.id === selectedIncidentId);
    if (!exists) {
      setSelectedIncidentId(records[0].id);
    }
  }, [records, selectedIncidentId]);

  const selectedIncident = useMemo(
    () => records.find((incident) => incident.id === selectedIncidentId) || null,
    [records, selectedIncidentId]
  );

  const selectedAssignmentIncident = useMemo(
    () => records.find((incident) => incident.id === assignmentDraft?.incidentId) || null,
    [assignmentDraft?.incidentId, records]
  );

  const selectedAssignmentOperator = useMemo(
    () => operators.find((operator) => operator.id === assignmentDraft?.operatorId) || null,
    [assignmentDraft?.operatorId, operators]
  );

  const editedOperator = useMemo(
    () => operators.find((operator) => operator.id === editingOperatorId) || null,
    [editingOperatorId, operators]
  );

  const pendingDeleteOperator = useMemo(
    () => operators.find((operator) => operator.id === pendingDeleteOperatorId) || null,
    [pendingDeleteOperatorId, operators]
  );

  const filteredIncidents = useMemo(
    () =>
      records.filter((incident) => {
        if (statusFilter !== "all" && normalizeStatus(incident.status) !== statusFilter) return false;
        if (priorityFilter !== "all" && normalizePriority(incident.priority) !== priorityFilter) {
          return false;
        }
        if (projectFilter !== "all" && incident.project_id !== projectFilter) return false;
        if (operatorFilter !== "all" && (incident.assignee || "") !== operatorFilter) return false;
        return true;
      }),
    [operatorFilter, priorityFilter, projectFilter, records, statusFilter]
  );

  const criticalOpen = useMemo(
    () =>
      records.filter(
        (incident) =>
          normalizePriority(incident.priority) === "critical" &&
          normalizeStatus(incident.status) !== "closed"
      ),
    [records]
  );

  const openUnassigned = useMemo(
    () =>
      records.filter(
        (incident) =>
          normalizeStatus(incident.status) === "open" && !(incident.assignee || "").trim()
      ),
    [records]
  );

  const inProgress = useMemo(
    () => records.filter((incident) => normalizeStatus(incident.status) === "in_progress"),
    [records]
  );

  const openActive = useMemo(
    () => records.filter((incident) => normalizeStatus(incident.status) !== "closed"),
    [records]
  );

  const closedIncidents = useMemo(
    () => records.filter((incident) => normalizeStatus(incident.status) === "closed"),
    [records]
  );

  const recentIncidents = useMemo(() => records.slice(0, 6), [records]);

  const overdueIncidents = useMemo(
    () =>
      records.filter((incident) => {
        const status = normalizeStatus(incident.status);
        if (status === "closed") return false;

        const baseDate = new Date(incident.updated_at || incident.created_at || Date.now()).getTime();
        const ageHours = (Date.now() - baseDate) / 36e5;
        return status === "open" ? ageHours > 48 : ageHours > 72;
      }),
    [records]
  );

  const agingOpenIncidents = useMemo(
    () =>
      records.filter((incident) => {
        if (normalizeStatus(incident.status) !== "open") return false;
        const baseDate = new Date(incident.updated_at || incident.created_at || Date.now()).getTime();
        const ageHours = (Date.now() - baseDate) / 36e5;
        return ageHours > 48;
      }),
    [records]
  );

  const averageTreatmentHours = useMemo(() => {
    const closed = records.filter(
      (incident) => normalizeStatus(incident.status) === "closed" && incident.created_at && incident.closed_at
    );
    if (closed.length === 0) return 0;

    const totalHours = closed.reduce((sum, incident) => {
      const created = new Date(incident.created_at as string).getTime();
      const closedAt = new Date(incident.closed_at as string).getTime();
      return sum + Math.max(0, closedAt - created) / 36e5;
    }, 0);

    return totalHours / closed.length;
  }, [records]);

  const closureRate = useMemo(() => {
    if (records.length === 0) return 0;
    const closedCount = records.filter((incident) => normalizeStatus(incident.status) === "closed").length;
    return Math.round((closedCount / records.length) * 100);
  }, [records]);

  const topProblems = useMemo(() => {
    const counts = new Map<string, number>();
    records.forEach((incident) => {
      const key = incident.category || "Non classe";
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));
  }, [records]);

  const topProblematicProjects = useMemo(() => {
    const counts = new Map<
      string,
      { label: string; total: number; critical: number; open: number }
    >();

    records.forEach((incident) => {
      const key = incident.project_id;
      const current = counts.get(key) || {
        label: projectLabel(incident.project),
        total: 0,
        critical: 0,
        open: 0,
      };

      current.total += 1;
      if (normalizePriority(incident.priority) === "critical") current.critical += 1;
      if (normalizeStatus(incident.status) !== "closed") current.open += 1;
      counts.set(key, current);
    });

    return [...counts.values()]
      .sort((left, right) => right.critical - left.critical || right.open - left.open || right.total - left.total)
      .slice(0, 5);
  }, [records]);

  const incidentTrend = useMemo(() => {
    const counts = new Map<string, number>();

    records.forEach((incident) => {
      const key = formatShortDate(incident.created_at);
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .slice(-6);
  }, [records]);

  const operatorPerformance = useMemo(() => {
    return operators
      .map((operator) => {
        const label = operatorLabel(operator);
        const assigned = records.filter((incident) => incident.assignee === label);
        const closed = assigned.filter((incident) => normalizeStatus(incident.status) === "closed");
        const critical = assigned.filter(
          (incident) =>
            normalizeStatus(incident.status) !== "closed" &&
            normalizePriority(incident.priority) === "critical"
        );

        return {
          operator,
          assignedCount: assigned.length,
          assignedIncidents: assigned.slice(0, 4),
          closedCount: closed.length,
          openCount: assigned.length - closed.length,
          criticalCount: critical.length,
          closureRate: assigned.length === 0 ? 0 : Math.round((closed.length / assigned.length) * 100),
        };
      })
      .sort(
        (left, right) =>
          right.openCount - left.openCount ||
          right.criticalCount - left.criticalCount ||
          right.assignedCount - left.assignedCount
      );
  }, [operators, records]);

  const editedOperatorAssignedCount = useMemo(() => {
    if (!editedOperator) return 0;
    const editedLabel = operatorLabel(editedOperator);
    return records.filter((incident) => incident.assignee === editedLabel).length;
  }, [editedOperator, records]);

  const pendingDeleteAssignedCount = useMemo(() => {
    if (!pendingDeleteOperator) return 0;
    const pendingDeleteLabel = operatorLabel(pendingDeleteOperator);
    return records.filter((incident) => incident.assignee === pendingDeleteLabel).length;
  }, [pendingDeleteOperator, records]);

  const activeOperatorsCount = useMemo(
    () => operatorPerformance.filter((entry) => entry.assignedCount > 0).length,
    [operatorPerformance]
  );

  const busiestOperatorEntry = useMemo(
    () => operatorPerformance[0] || null,
    [operatorPerformance]
  );

  const busiestOperatorOpenIncidents = useMemo(
    () =>
      busiestOperatorEntry
        ? busiestOperatorEntry.assignedIncidents
            .filter((incident) => normalizeStatus(incident.status) !== "closed")
            .sort(compareIncidents)
        : [],
    [busiestOperatorEntry]
  );

  const recentlyClosedIncidents = useMemo(
    () =>
      [...closedIncidents].sort((left, right) =>
        (right.closed_at || right.updated_at || right.created_at || "").localeCompare(
          left.closed_at || left.updated_at || left.created_at || ""
        )
      ),
    [closedIncidents]
  );

  const managerHighlights = useMemo(
    () => [
      {
        key: "critical" as const,
        label: "Incidents critiques",
        value: criticalOpen.length.toString(),
        body:
          criticalOpen.length > 0
            ? "Des arbitrages immediats sont requis sur le portefeuille."
            : "Aucune criticite ouverte a ce stade.",
      },
      {
        key: "unassigned" as const,
        label: "Incidents non assignés",
        value: openUnassigned.length.toString(),
        body:
          openUnassigned.length > 0
            ? "Ces incidents attendent un responsable de traitement."
            : "Tous les incidents ouverts sont affectes.",
      },
      {
        key: "overdue" as const,
        label: "Incidents en retard",
        value: overdueIncidents.length.toString(),
        body:
          overdueIncidents.length > 0
            ? "Des points ages doivent remonter en revue."
            : "Aucun incident en retard detecte.",
      },
    ],
    [criticalOpen.length, openUnassigned.length, overdueIncidents.length]
  );

  const reviewActions = useMemo<ReviewActionConfig[]>(() => {
    const actions: ReviewActionConfig[] = [];

    if (criticalOpen.length > 0) {
      actions.push({
        key: "critical-review",
        label: `${criticalOpen.length} incident(s) critique(s) a arbitrer avant la prochaine reunion.`,
        summary:
          "Ces incidents critiques doivent etre mis sur la table avant la revue. La bonne action manager consiste a ouvrir le point prioritaire, verifier la preuve terrain puis confirmer l'arbitrage.",
        incidents: criticalOpen,
        emptyLabel: "Aucun incident critique ouvert.",
        primaryActionLabel: "Afficher l'incident prioritaire",
      });
    }
    if (openUnassigned.length > 0) {
      actions.push({
        key: "unassigned-review",
        label: `${openUnassigned.length} incident(s) ouverts attendent une assignation immediate.`,
        summary:
          "Ces points ouverts sont sans responsable. La priorite est de selectionner l'incident, verifier le contexte puis lancer l'assignation.",
        incidents: openUnassigned,
        emptyLabel: "Aucun incident ouvert non assigne.",
        primaryActionLabel: "Afficher l'incident a assigner",
      });
    }
    if (overdueIncidents.length > 0) {
      actions.push({
        key: "overdue-review",
        label: `${overdueIncidents.length} point(s) ages doivent etre remis sous controle.`,
        summary:
          "Ces incidents ages doivent etre relances. Ouvrez le point le plus ancien pour verifier le blocage et decider de la suite en revue.",
        incidents: overdueIncidents,
        emptyLabel: "Aucun incident age a relancer.",
        primaryActionLabel: "Afficher le point le plus age",
      });
    }
    if (actions.length === 0) {
      actions.push({
        key: "stable-review",
        label: "Le portefeuille est sous controle. La revue peut se concentrer sur la prevention.",
        summary:
          "Aucune action immediate n'est necessaire. La revue peut se concentrer sur la prevention, la discipline de cloture et l'anticipation des risques.",
        incidents: [],
        emptyLabel: "Aucun incident prioritaire a ouvrir.",
      });
    }

    return actions;
  }, [criticalOpen, openUnassigned, overdueIncidents]);

  const activeReviewAction = useMemo(
    () => reviewActions.find((action) => action.key === activeReviewActionKey) || null,
    [activeReviewActionKey, reviewActions]
  );

  const activeInsight = useMemo<InsightConfig | null>(() => {
    if (!activeInsightKey) return null;

    if (activeInsightKey === "open") {
      return {
        key: "open",
        eyebrow: "Portefeuille ouvert",
        title: "Incidents en cours de traitement",
        summary:
          openActive.length > 0
            ? "Ces incidents demandent un arbitrage, une assignation ou un suivi manager."
            : "Aucun incident ouvert n'est a traiter actuellement.",
        incidents: openActive,
        emptyLabel: "Aucun incident ouvert pour le moment.",
        primaryActionLabel: "Ouvrir la liste incidents",
        secondaryActionLabel: openActive[0] ? "Ouvrir le dossier prioritaire" : undefined,
      };
    }

    if (activeInsightKey === "critical") {
      return {
        key: "critical",
        eyebrow: "Criticite manager",
        title: "Incidents critiques a arbitrer",
        summary:
          criticalOpen.length > 0
            ? "Ces incidents menacent le terrain et doivent etre traites avant le reste du portefeuille."
            : "Aucune criticite ouverte n'est detectee.",
        incidents: criticalOpen,
        emptyLabel: "Aucun incident critique ouvert.",
        primaryActionLabel: "Aller au command center",
        secondaryActionLabel: criticalOpen[0] ? "Ouvrir le dossier critique" : undefined,
      };
    }

    if (activeInsightKey === "unassigned") {
      return {
        key: "unassigned",
        eyebrow: "Assignation",
        title: "Incidents a affecter",
        summary:
          openUnassigned.length > 0
            ? "Ces points restent sans responsable. Ils doivent etre affectes pour enclencher le traitement."
            : "Tous les incidents ouverts disposent deja d'un responsable.",
        incidents: openUnassigned,
        emptyLabel: "Aucun incident ouvert non assigne.",
        primaryActionLabel: "Ouvrir la liste incidents",
        secondaryActionLabel: openUnassigned[0] ? "Assigner le premier incident" : undefined,
      };
    }

    if (activeInsightKey === "overdue") {
      return {
        key: "overdue",
        eyebrow: "Retard portefeuille",
        title: "Incidents ages a relancer",
        summary:
          overdueIncidents.length > 0
            ? "Ces incidents depassent le rythme de traitement attendu et doivent remonter en revue."
            : "Aucun incident en retard n'est detecte.",
        incidents: overdueIncidents,
        emptyLabel: "Aucun incident en retard a ce stade.",
        primaryActionLabel: "Ouvrir la revue direction",
        secondaryActionLabel: overdueIncidents[0] ? "Ouvrir le point le plus age" : undefined,
      };
    }

    if (activeInsightKey === "treatment") {
      return {
        key: "treatment",
        eyebrow: "Temps de traitement",
        title: "Lecture du temps moyen de traitement",
        summary:
          recentlyClosedIncidents.length > 0
            ? `Le MTTR simplifie est de ${formatDuration(averageTreatmentHours)} sur ${recentlyClosedIncidents.length} incident(s) cloture(s). Ouvrez un dossier cloture pour comprendre ce qui accelere ou ralentit le traitement.`
            : "Aucun incident cloture ne permet encore de mesurer le temps moyen de traitement.",
        incidents: recentlyClosedIncidents,
        emptyLabel: "Aucun incident cloture disponible pour le calcul.",
        primaryActionLabel: "Ouvrir les incidents clotures",
        secondaryActionLabel: recentlyClosedIncidents[0] ? "Ouvrir le dernier incident cloture" : undefined,
      };
    }

    if (activeInsightKey === "operators") {
      const assignedActiveIncidents = records
        .filter(
          (incident) =>
            normalizeStatus(incident.status) !== "closed" && Boolean((incident.assignee || "").trim())
        )
        .sort(compareIncidents);

      return {
        key: "operators",
        eyebrow: "Capacite operateur",
        title: "Opérateurs actuellement engages",
        summary:
          activeOperatorsCount > 0
            ? `${activeOperatorsCount} operateur(s) portent actuellement des incidents. Le bureau peut ouvrir les incidents suivis ou basculer vers la vue operateurs pour reequilibrer la charge.`
            : "Aucun operateur n'est actuellement engage sur des incidents.",
        incidents: assignedActiveIncidents,
        emptyLabel: "Aucun incident actif assigne a un operateur.",
        primaryActionLabel: "Ouvrir la vue operateurs",
        secondaryActionLabel: assignedActiveIncidents[0] ? "Afficher un incident assigne" : undefined,
      };
    }

    if (activeInsightKey === "workload") {
      return {
        key: "workload",
        eyebrow: "Charge max",
        title: "Opérateur le plus charge",
        summary: busiestOperatorEntry
          ? `${operatorLabel(busiestOperatorEntry.operator)} porte ${busiestOperatorEntry.openCount} incident(s) ouvert(s). Ouvrez la vue operateurs pour arbitrer la charge ou affichez son incident prioritaire.`
          : "Aucune charge operateur n'est disponible.",
        incidents: busiestOperatorOpenIncidents,
        emptyLabel: "Aucun incident ouvert n'est affecte a un operateur.",
        primaryActionLabel: "Ouvrir la vue operateurs",
        secondaryActionLabel: busiestOperatorOpenIncidents[0] ? "Afficher l'incident prioritaire" : undefined,
      };
    }

    return {
      key: "closure",
      eyebrow: "Discipline de cloture",
      title: "Lecture du taux de cloture",
      summary:
        closedIncidents.length > 0
          ? `Le portefeuille compte ${closedIncidents.length} incident(s) cloture(s) et ${openActive.length} encore actif(s).`
          : "Aucune cloture n'est encore enregistree sur le portefeuille.",
      incidents: closedIncidents.slice(0, 8),
      emptyLabel: "Aucun incident cloture a afficher.",
      primaryActionLabel: "Ouvrir la performance",
      secondaryActionLabel: closedIncidents[0] ? "Ouvrir le dernier dossier cloture" : undefined,
    };
  }, [
    activeInsightKey,
    activeOperatorsCount,
    averageTreatmentHours,
    busiestOperatorEntry,
    busiestOperatorOpenIncidents,
    closedIncidents,
    criticalOpen,
    openActive,
    openUnassigned,
    overdueIncidents,
    recentlyClosedIncidents,
    records,
  ]);

  const createProject = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    if (!name.trim()) {
      setErrorMsg("Le nom de l'emplacement est obligatoire.");
      return;
    }

    setIsBusy(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from("projects").insert({
        name: name.trim(),
        site_name: name.trim(),
        client_name: clientName.trim() || "Client non renseigné",
        location: location.trim() || null,
        status: "active",
      });

      if (error) {
        setErrorMsg(
          error.message.toLowerCase().includes("duplicate")
            ? "Un emplacement avec ce nom existe deja."
            : error.message
        );
        return;
      }

      setName("");
      setClientName("");
      setLocation("");
      setSuccessMsg("Emplacement cree avec succes.");
      await loadData();
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      setErrorMsg(getUserFacingSupabaseErrorMessage(normalizedError.kind));
    } finally {
      setIsBusy(false);
    }
  };

  const updateIncidentStatus = async (incidentId: string, nextStatus: IncidentStatus) => {
    setErrorMsg("");
    setSuccessMsg("");
    setIsBusy(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const payload: Record<string, unknown> = {
        status: nextStatus,
        updated_at: new Date().toISOString(),
      };

      if (nextStatus === "closed") {
        payload.closed_at = new Date().toISOString();
        payload.closed_by_name = "Pilotage bureau";
        payload.close_comment = "Statut mis à jour depuis le mode bureau.";
      } else {
        payload.closed_at = null;
        payload.closed_by_name = null;
      }

      const { error } = await supabase.from("incidents").update(payload).eq("id", incidentId);
      if (error) throw error;

      setSuccessMsg(`Statut incident mis à jour en ${statusLabel(nextStatus)}.`);
      await loadData();
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      setErrorMsg(getUserFacingSupabaseErrorMessage(normalizedError.kind));
    } finally {
      setIsBusy(false);
    }
  };

  const resetOperatorForm = () => {
    setEditingOperatorId(null);
    setOperatorFirstName("");
    setOperatorLastName("");
    setOperatorRole("");
    setOperatorEmail("");
    setOperatorPhone("");
  };

  const startEditingOperator = (operator: Operator) => {
    setEditingOperatorId(operator.id);
    setOperatorFirstName(operator.firstName);
    setOperatorLastName(operator.lastName);
    setOperatorRole(operator.role);
    setOperatorEmail(operator.email);
    setOperatorPhone(operator.phone);
    setErrorMsg("");
    setSuccessMsg(`Edition de ${operatorLabel(operator)} en cours.`);
  };

  const createOperator = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    if (
      !operatorFirstName.trim() ||
      !operatorLastName.trim() ||
      !operatorRole.trim() ||
      !operatorEmail.trim() ||
      !operatorPhone.trim()
    ) {
      setErrorMsg("Tous les champs operateur sont obligatoires.");
      return;
    }

    const firstName = operatorFirstName.trim();
    const lastName = operatorLastName.trim();
    const role = operatorRole.trim();
    const email = operatorEmail.trim();
    const phone = operatorPhone.trim();

    if (!editingOperatorId) {
      const nextOperator: Operator = {
        id: crypto.randomUUID(),
        firstName,
        lastName,
        role,
        email,
        phone,
      };

      setOperators((current) => [nextOperator, ...current]);
      resetOperatorForm();
      setSuccessMsg("Opérateur enregistre et disponible pour assignation.");
      return;
    }

    const currentOperator = operators.find((operator) => operator.id === editingOperatorId);
    if (!currentOperator) {
      setErrorMsg("Opérateur introuvable pour la mise a jour.");
      return;
    }

    const previousLabel = operatorLabel(currentOperator);
    const updatedOperator: Operator = {
      ...currentOperator,
      firstName,
      lastName,
      role,
      email,
      phone,
    };
    const nextLabel = operatorLabel(updatedOperator);

    setIsBusy(true);

    try {
      if (previousLabel !== nextLabel) {
        const supabase = getSupabaseBrowserClient();
        const { error } = await supabase
          .from("incidents")
          .update({
            assignee: nextLabel,
            updated_at: new Date().toISOString(),
          })
          .eq("assignee", previousLabel);

        if (error) throw error;
      }

      setOperators((current) =>
        current.map((operator) => (operator.id === editingOperatorId ? updatedOperator : operator))
      );

      if (previousLabel !== nextLabel) {
        await loadData();
      }

      resetOperatorForm();
      setSuccessMsg("Opérateur mis a jour.");
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      setErrorMsg(getUserFacingSupabaseErrorMessage(normalizedError.kind));
    } finally {
      setIsBusy(false);
    }
  };

  const confirmDeleteOperator = async () => {
    if (!pendingDeleteOperator) {
      setErrorMsg("Opérateur introuvable pour la suppression.");
      return;
    }

    setErrorMsg("");
    setSuccessMsg("");
    setIsBusy(true);

    try {
      const targetLabel = operatorLabel(pendingDeleteOperator);

      if (pendingDeleteAssignedCount > 0) {
        const supabase = getSupabaseBrowserClient();
        const { error } = await supabase
          .from("incidents")
          .update({
            assignee: null,
            updated_at: new Date().toISOString(),
          })
          .eq("assignee", targetLabel);

        if (error) throw error;
      }

      setOperators((current) =>
        current.filter((operator) => operator.id !== pendingDeleteOperator.id)
      );

      if (editingOperatorId === pendingDeleteOperator.id) {
        resetOperatorForm();
      }

      if (pendingDeleteAssignedCount > 0) {
        await loadData();
      }

      setPendingDeleteOperatorId(null);
      setSuccessMsg(
        pendingDeleteAssignedCount > 0
          ? "Contact supprimé. Les incidents associés sont revenus en non assigné."
          : "Contact supprimé."
      );
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      setErrorMsg(getUserFacingSupabaseErrorMessage(normalizedError.kind));
    } finally {
      setIsBusy(false);
    }
  };

  const assignmentMessage = useMemo(() => {
    if (!assignmentDraft || !selectedAssignmentIncident || !selectedAssignmentOperator) return "";

    const appOrigin = typeof window !== "undefined" ? window.location.origin : "";

    return assignmentDraft.channel === "sms"
      ? buildAssignmentSmsBody(selectedAssignmentIncident, selectedAssignmentOperator, appOrigin)
      : buildAssignmentEmailBody(selectedAssignmentIncident, selectedAssignmentOperator, appOrigin);
  }, [assignmentDraft, selectedAssignmentIncident, selectedAssignmentOperator]);

  const assignmentEmailSubject = useMemo(() => {
    if (!selectedAssignmentIncident) return "";
    return buildAssignmentEmailSubject(selectedAssignmentIncident);
  }, [selectedAssignmentIncident]);

  const canDeliverAssignment = useMemo(() => {
    if (!assignmentDraft || !selectedAssignmentOperator) return false;
    if (assignmentDraft.channel === "sms") {
      return Boolean(normalizePhoneNumber(selectedAssignmentOperator.phone));
    }
    return Boolean(selectedAssignmentOperator.email.trim());
  }, [assignmentDraft, selectedAssignmentOperator]);

  const openIncidentFromInsight = (incident: IncidentRecord) => {
    setSelectedIncidentId(incident.id);

    if (activeInsightKey === "critical") {
      setActiveView("command-center");
    } else if (activeInsightKey === "overdue") {
      setActiveView("review");
    } else if (activeInsightKey === "closure") {
      setActiveView("performance");
    } else {
      setActiveView("incidents");
      setStatusFilter(normalizeStatus(incident.status) === "closed" ? "closed" : "open");
    }

    setActiveInsightKey(null);
  };

  const openIncidentFromReviewAction = (incident: IncidentRecord) => {
    setSelectedIncidentId(incident.id);
    setActiveReviewActionKey(null);
    setSuccessMsg(`Incident prioritaire chargé : ${incident.title}`);

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        selectedIncidentPanelRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  };

  const focusInsightPrimaryAction = () => {
    if (!activeInsight) return;

    if (activeInsight.key === "critical") {
      setActiveView("command-center");
      if (criticalOpen[0]) setSelectedIncidentId(criticalOpen[0].id);
    } else if (activeInsight.key === "overdue") {
      setActiveView("review");
      if (overdueIncidents[0]) setSelectedIncidentId(overdueIncidents[0].id);
    } else if (activeInsight.key === "treatment") {
      setActiveView("incidents");
      setStatusFilter("closed");
      setPriorityFilter("all");
      setProjectFilter("all");
      setOperatorFilter("all");
      if (recentlyClosedIncidents[0]) setSelectedIncidentId(recentlyClosedIncidents[0].id);
    } else if (activeInsight.key === "operators" || activeInsight.key === "workload") {
      setActiveView("operators");
      if (activeInsight.incidents[0]) setSelectedIncidentId(activeInsight.incidents[0].id);
    } else if (activeInsight.key === "closure") {
      setActiveView("performance");
      if (closedIncidents[0]) setSelectedIncidentId(closedIncidents[0].id);
    } else if (activeInsight.key === "unassigned") {
      setActiveView("incidents");
      setStatusFilter("open");
      setPriorityFilter("all");
      setProjectFilter("all");
      setOperatorFilter("all");
      if (openUnassigned[0]) setSelectedIncidentId(openUnassigned[0].id);
    } else {
      setActiveView("incidents");
      setStatusFilter("all");
      setPriorityFilter("all");
      setProjectFilter("all");
      setOperatorFilter("all");
      if (openActive[0]) setSelectedIncidentId(openActive[0].id);
    }

    setActiveInsightKey(null);
  };

  const focusInsightSecondaryAction = () => {
    if (!activeInsight || !activeInsight.incidents[0]) return;

    const incident = activeInsight.incidents[0];
    if (activeInsight.key === "unassigned") {
      setAssignmentDraft({
        incidentId: incident.id,
        operatorId: operators[0]?.id || "",
        channel: "email",
      });
      setActiveInsightKey(null);
      return;
    }

    openIncidentFromInsight(incident);
  };

  const assignIncident = async () => {
    if (!assignmentDraft?.operatorId || !assignmentDraft.incidentId) {
      setErrorMsg("Choisissez un opérateur avant d'assigner.");
      return;
    }

    if (!selectedAssignmentOperator || !selectedAssignmentIncident) {
      setErrorMsg("Opérateur introuvable.");
      return;
    }

    if (assignmentDraft.channel === "email" && !selectedAssignmentOperator.email.trim()) {
      setErrorMsg("Aucun email n'est renseigné pour cet opérateur.");
      return;
    }

    const normalizedPhone = normalizePhoneNumber(selectedAssignmentOperator.phone);
    if (assignmentDraft.channel === "sms" && !normalizedPhone) {
      setErrorMsg("Aucun numéro SMS exploitable n'est renseigné pour cet opérateur.");
      return;
    }

    setErrorMsg("");
    setSuccessMsg("");
    setIsBusy(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase
        .from("incidents")
        .update({
          assignee: operatorLabel(selectedAssignmentOperator),
          updated_at: new Date().toISOString(),
        })
        .eq("id", assignmentDraft.incidentId);

      if (error) throw error;

      if (assignmentMessage && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(assignmentMessage);
      }

      const deliveryLink =
        assignmentDraft.channel === "sms"
          ? buildSmsLink(normalizedPhone, assignmentMessage)
          : buildMailtoLink(
              selectedAssignmentOperator.email.trim(),
              assignmentEmailSubject,
              assignmentMessage
            );

      if (typeof window !== "undefined") {
        window.location.href = deliveryLink;
      }

      setAssignmentDraft(null);
      setSuccessMsg(
        assignmentDraft.channel === "sms"
          ? "Incident assigné. Le SMS est prêt à être envoyé."
          : "Incident assigné. Le mail est prêt à être envoyé."
      );
      await loadData();
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      setErrorMsg(getUserFacingSupabaseErrorMessage(normalizedError.kind));
    } finally {
      setIsBusy(false);
    }
  };

  const exportProjectReport = async (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) {
      setErrorMsg("Emplacement introuvable pour le rapport.");
      return;
    }

    setErrorMsg("");
    setSuccessMsg("");

    try {
      await generateProjectReportPdf(
        {
          id: project.id,
          name: project.displayName,
          site_name: project.displayName,
          client_name: project.clientName,
          location: project.location,
          status: project.status,
        },
        records
          .filter((incident) => incident.project_id === projectId)
          .map((incident) => ({
            id: incident.id,
            title: incident.title,
            description: incident.description,
            category: incident.category,
            priority: incident.priority,
            status: incident.status,
            reporter_name: incident.reporter_name,
            location: incident.project?.location,
            initial_photo_url: incident.initial_photo_url,
            close_comment: incident.close_comment,
            created_at: incident.created_at,
            updated_at: incident.updated_at,
            closed_at: incident.closed_at,
          }))
      );
      setSuccessMsg("Rapport PDF projet généré.");
    } catch {
      setErrorMsg("Le rapport PDF n'a pas pu être généré.");
    }
  };

  const viewTabs: Array<{ id: BossView; label: string; counter?: string }> = [
    { id: "overview", label: "Accueil bureau" },
    { id: "command-center", label: "Command Center", counter: criticalOpen.length.toString() },
    { id: "incidents", label: "Incidents", counter: filteredIncidents.length.toString() },
    { id: "operators", label: "Opérateurs", counter: operators.length.toString() },
    { id: "performance", label: "Performance" },
    { id: "review", label: "Revue direction" },
  ];

  if (dashboardStatus === "loading") {
    return (
      <div className="min-h-[calc(100vh-120px)] bg-[#08101d] px-4 py-10 text-slate-50 sm:px-5 lg:px-8">
        <div className="mx-auto max-w-[1680px] rounded-[32px] border border-white/10 bg-[#0f172a] p-8 shadow-[0_30px_90px_rgba(2,6,23,0.45)]">
          <p className="text-xs uppercase tracking-[0.3em] text-sky-300">Mode bureau</p>
          <h2 className="mt-3 text-3xl font-semibold">Chargement du poste de pilotage</h2>
          <p className="mt-3 max-w-2xl text-sm text-slate-300">
            Consolidation du portefeuille incidents, des emplacements et des actions manager en cours.
          </p>
        </div>
      </div>
    );
  }

  if (dashboardStatus !== "ready") {
    return (
      <div className="min-h-[calc(100vh-120px)] bg-[#08101d] px-4 py-10 text-slate-50 sm:px-5 lg:px-8">
        <div className="mx-auto max-w-[1080px] rounded-[32px] border border-red-500/25 bg-[#0f172a] p-8 shadow-[0_30px_90px_rgba(2,6,23,0.45)]">
          <p className="text-xs uppercase tracking-[0.3em] text-red-200">
            {dashboardStatus === "config-error" ? "Configuration" : "Backend"}
          </p>
          <h2 className="mt-3 text-3xl font-semibold">
            {dashboardStatus === "config-error" ? "Erreur de configuration" : "Backend indisponible"}
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-slate-300">
            {errorMsg || "Impossible de charger le mode bureau pour le moment."}
          </p>
          <div className="mt-6">
            <BoardButton onClick={() => void loadData()} disabled={isBusy}>
              Recharger le mode bureau
            </BoardButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#08101d] px-3 py-6 text-slate-50 sm:px-4 lg:px-6 xl:px-8">
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-6">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_28%),linear-gradient(135deg,#0f172a_0%,#111827_55%,#151a27_100%)] p-5 shadow-[0_24px_80px_rgba(2,6,23,0.4)] sm:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex flex-wrap gap-2">
                <TagPill tone="sky">Field Trace Bureau</TagPill>
                <TagPill tone="emerald">Pilotage opérationnel</TagPill>
              </div>
              <p className="mt-4 text-xs uppercase tracking-[0.32em] text-sky-300">
                Bureau command center
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                Prioriser, assigner et suivre chaque incident terrain.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                Le manager ne regarde plus seulement des chiffres. Il voit les incidents critiques,
                pilote la charge opérateur, relance les points et prépare une revue de direction
                exploitable.
              </p>
            </div>

            <div className="grid w-full max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
              <HeroMetric
                eyebrow="Ouverts"
                value={openActive.length}
                detail="A suivre maintenant"
                onClick={() => setActiveInsightKey("open")}
              />
              <HeroMetric
                eyebrow="Critiques"
                value={criticalOpen.length}
                detail="Arbitrage immédiat"
                onClick={() => setActiveInsightKey("critical")}
              />
              <HeroMetric
                eyebrow="En retard"
                value={overdueIncidents.length}
                detail="Risque de dérive"
                onClick={() => setActiveInsightKey("overdue")}
              />
              <HeroMetric
                eyebrow="Clôture"
                value={`${closureRate}%`}
                detail="Taux portefeuille"
                onClick={() => setActiveInsightKey("closure")}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {viewTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveView(tab.id)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  activeView === tab.id
                    ? "border-sky-400/70 bg-sky-400/15 text-sky-100"
                    : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"
                }`}
              >
                {tab.label}
                {tab.counter ? ` · ${tab.counter}` : ""}
              </button>
            ))}
          </div>
        </section>

        {(errorMsg || successMsg) && (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
            <div>
              {errorMsg ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-50">
                  {errorMsg}
                </div>
              ) : null}
              {successMsg ? (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">
                  {successMsg}
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0f172a] px-4 py-3 text-sm text-slate-300">
              Chaque incident est cliquable. Les actions rapides restent accessibles en un point sans
              quitter le portefeuille.
            </div>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.9fr)]">
          <div className="flex flex-col gap-6">
            {activeView === "overview" ? (
              <>
                <SectionShell
                  eyebrow="Accueil bureau"
                  title="Lecture immédiate du portefeuille"
                  description="Trois angles de lecture pour savoir quoi arbitrer, quoi assigner et quoi sécuriser avant la revue."
                >
                  <div className="grid gap-4 lg:grid-cols-3">
                    {managerHighlights.map((highlight) => (
                      <HighlightCard
                        key={highlight.label}
                        title={highlight.label}
                        value={highlight.value}
                        body={highlight.body}
                        onClick={() => setActiveInsightKey(highlight.key)}
                      />
                    ))}
                  </div>
                </SectionShell>

                <SectionShell
                  eyebrow="Activation portefeuille"
                  title="Créer un nouvel emplacement"
                  description="Le mode bureau peut ouvrir rapidement un nouvel emplacement de suivi sans sortir du cockpit."
                >
                  <div className="grid gap-3 lg:grid-cols-3">
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Nom emplacement"
                      className="rounded-2xl border border-white/10 bg-[#08101d] px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400/60"
                    />
                    <input
                      value={clientName}
                      onChange={(event) => setClientName(event.target.value)}
                      placeholder="Client"
                      className="rounded-2xl border border-white/10 bg-[#08101d] px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400/60"
                    />
                    <input
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      placeholder="Localisation"
                      className="rounded-2xl border border-white/10 bg-[#08101d] px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400/60"
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <BoardButton onClick={() => void createProject()} disabled={isBusy}>
                      Créer l'emplacement
                    </BoardButton>
                    <BoardGhostButton onClick={() => setActiveView("command-center")}>
                      Aller au command center
                    </BoardGhostButton>
                  </div>
                </SectionShell>

                <SectionShell
                  eyebrow="Emplacements actifs"
                  title="Portefeuille des emplacements"
                  description="Accès direct aux rapports projet et à la charge incidents de chaque emplacement."
                >
                  <div className="grid gap-4 xl:grid-cols-2">
                    {projects.map((project) => {
                      const projectIncidents = records.filter((incident) => incident.project_id === project.id);
                      const projectOpen = projectIncidents.filter(
                        (incident) => normalizeStatus(incident.status) !== "closed"
                      );
                      const projectCritical = projectIncidents.filter(
                        (incident) =>
                          normalizeStatus(incident.status) !== "closed" &&
                          normalizePriority(incident.priority) === "critical"
                      );

                      return (
                        <div
                          key={project.id}
                          className="rounded-[28px] border border-white/10 bg-[#0b1220] p-5"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                                Emplacement
                              </p>
                              <h3 className="mt-2 text-xl font-semibold text-white">
                                {project.displayName}
                              </h3>
                              <p className="mt-2 text-sm text-slate-400">
                                {project.location || "Localisation a confirmer"}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                Client : {project.clientName || "A confirmer"}
                              </p>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <MiniMetric label="Total" value={projectIncidents.length} />
                              <MiniMetric label="Ouverts" value={projectOpen.length} />
                              <MiniMetric label="Critiques" value={projectCritical.length} />
                            </div>
                          </div>

                          <div className="mt-5 flex flex-wrap gap-3">
                            <BoardButton onClick={() => void exportProjectReport(project.id)}>
                              Generer rapport
                            </BoardButton>
                            <Link
                              href={`/project/${project.id}`}
                              className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                            >
                              Ouvrir l'emplacement
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionShell>
              </>
            ) : null}
            {activeView === "command-center" ? (
              <SectionShell
                eyebrow="Command Center"
                title="Priorisation manager en temps reel"
                description="Chaque colonne sert a declencher une action. Les incidents sont ordonnes pour traiter d'abord le risque, puis la charge ouverte et enfin le suivi en cours."
              >
                <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
                  <IncidentLane
                    title="Critiques"
                    subtitle="A arbitrer maintenant"
                    incidents={criticalOpen}
                    emptyLabel="Aucun incident critique ouvert."
                    selectedIncidentId={selectedIncidentId}
                    onSelect={setSelectedIncidentId}
                    onPreview={setSelectedImage}
                    onAssign={(incidentId) =>
                      setAssignmentDraft({
                        incidentId,
                        operatorId: operators[0]?.id || "",
                        channel: "email",
                      })
                    }
                    onStatusChange={(incidentId, status) => void updateIncidentStatus(incidentId, status)}
                  />
                  <IncidentLane
                    title="OPEN > 48h"
                    subtitle="Points ages a relancer"
                    incidents={agingOpenIncidents}
                    emptyLabel="Aucun incident ouvert age au-dela du seuil."
                    selectedIncidentId={selectedIncidentId}
                    onSelect={setSelectedIncidentId}
                    onPreview={setSelectedImage}
                    onAssign={(incidentId) =>
                      setAssignmentDraft({
                        incidentId,
                        operatorId: operators[0]?.id || "",
                        channel: "email",
                      })
                    }
                    onStatusChange={(incidentId, status) => void updateIncidentStatus(incidentId, status)}
                  />
                  <IncidentLane
                    title="IN_PROGRESS"
                    subtitle="A suivre operateur"
                    incidents={inProgress}
                    emptyLabel="Aucun incident actuellement en traitement."
                    selectedIncidentId={selectedIncidentId}
                    onSelect={setSelectedIncidentId}
                    onPreview={setSelectedImage}
                    onAssign={(incidentId) =>
                      setAssignmentDraft({
                        incidentId,
                        operatorId: operators[0]?.id || "",
                        channel: "email",
                      })
                    }
                    onStatusChange={(incidentId, status) => void updateIncidentStatus(incidentId, status)}
                  />
                  <IncidentLane
                    title="Recents"
                    subtitle="Dernieres creations"
                    incidents={recentIncidents}
                    emptyLabel="Aucun incident recent a afficher."
                    selectedIncidentId={selectedIncidentId}
                    onSelect={setSelectedIncidentId}
                    onPreview={setSelectedImage}
                    onAssign={(incidentId) =>
                      setAssignmentDraft({
                        incidentId,
                        operatorId: operators[0]?.id || "",
                        channel: "email",
                      })
                    }
                    onStatusChange={(incidentId, status) => void updateIncidentStatus(incidentId, status)}
                  />
                </div>
              </SectionShell>
            ) : null}

            {activeView === "incidents" ? (
              <SectionShell
                eyebrow="Incidents"
                title="Liste globale actionnable"
                description="Le manager filtre rapidement le portefeuille pour ouvrir, assigner ou faire evoluer le statut sans quitter le bureau."
              >
                <div className="grid gap-3 lg:grid-cols-4">
                  <FilterSelect
                    label="Statut"
                    value={statusFilter}
                    onChange={(value) => setStatusFilter(value as "all" | IncidentStatus)}
                    options={[
                      { value: "all", label: "Tous statuts" },
                      { value: "open", label: "OPEN" },
                      { value: "in_progress", label: "IN_PROGRESS" },
                      { value: "closed", label: "CLOSED" },
                    ]}
                  />
                  <FilterSelect
                    label="Criticite"
                    value={priorityFilter}
                    onChange={(value) => setPriorityFilter(value as "all" | IncidentPriority)}
                    options={[
                      { value: "all", label: "Toutes criticites" },
                      { value: "critical", label: "CRITICAL" },
                      { value: "high", label: "HIGH" },
                      { value: "medium", label: "MEDIUM" },
                      { value: "low", label: "LOW" },
                    ]}
                  />
                  <FilterSelect
                    label="Emplacement"
                    value={projectFilter}
                    onChange={setProjectFilter}
                    options={[
                      { value: "all", label: "Tous emplacements" },
                      ...projects.map((project) => ({
                        value: project.id,
                        label: project.displayName,
                      })),
                    ]}
                  />
                  <FilterSelect
                    label="Opérateur"
                    value={operatorFilter}
                    onChange={setOperatorFilter}
                    options={[
                      { value: "all", label: "Tous operateurs" },
                      ...operators.map((operator) => ({
                        value: operatorLabel(operator),
                        label: operatorLabel(operator),
                      })),
                    ]}
                  />
                </div>

                <div className="mt-5 overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1220]">
                  <div className="hidden grid-cols-[88px_1.05fr_1.8fr_1.4fr_1.1fr_1fr_1fr_1.35fr_1fr_220px] gap-3 border-b border-white/10 px-4 py-4 text-xs uppercase tracking-[0.24em] text-slate-400 xl:grid">
                    <span>Image</span>
                    <span>ID</span>
                    <span>Titre</span>
                    <span>Emplacement</span>
                    <span>Type</span>
                    <span>Statut</span>
                    <span>Criticite</span>
                    <span>Assigné à</span>
                    <span>Date</span>
                    <span>Actions</span>
                  </div>

                  {filteredIncidents.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-slate-400">
                      Aucun incident ne correspond aux filtres actifs.
                    </div>
                  ) : (
                    <div className="divide-y divide-white/10">
                      {filteredIncidents.map((incident) => {
                        const incidentStatus = normalizeStatus(incident.status);

                        return (
                        <div
                          key={incident.id}
                          className="grid gap-4 px-4 py-4 xl:grid-cols-[88px_1.05fr_1.8fr_1.4fr_1.1fr_1fr_1fr_1.35fr_1fr_220px] xl:items-center"
                        >
                          <div>
                            {incidentPreviewUrl(incident) ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedImage({
                                    url: incidentPreviewUrl(incident) as string,
                                    title: incident.title,
                                    subtitle: `${projectLabel(incident.project)} · ${incidentNatureLabel(incident.category)}`,
                                  })
                                }
                                className="overflow-hidden rounded-2xl border border-white/10"
                              >
                                <img
                                  src={incidentPreviewUrl(incident) as string}
                                  alt={incident.title}
                                  className="h-16 w-16 object-cover"
                                />
                              </button>
                            ) : (
                              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-white/10 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                                Sans visuel
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedIncidentId(incident.id)}
                            className="text-left text-sm font-semibold text-sky-200 transition hover:text-sky-100"
                          >
                            {incidentRef(incident.id)}
                          </button>
                          <div>
                            <p className="text-sm font-medium text-white">{incident.title}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              {incident.category || "Incident terrain"}
                            </p>
                          </div>
                          <span className="text-sm text-slate-300">{projectLabel(incident.project)}</span>
                          <span className="text-sm text-slate-300">{incidentNatureLabel(incident.category)}</span>
                          <span
                            className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(incident.status)}`}
                          >
                            {statusLabel(incident.status)}
                          </span>
                          <span
                            className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${priorityTone(incident.priority)}`}
                          >
                            {priorityLabel(incident.priority)}
                          </span>
                          <span className="text-sm text-slate-300">
                            {incident.assignee || "Non assigné"}
                          </span>
                          <span className="text-sm text-slate-400">
                            {formatShortDate(incident.updated_at || incident.created_at)}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedIncidentId(incident.id)}
                              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                            >
                              Ouvrir
                            </button>
                            {incidentStatus !== "closed" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setAssignmentDraft({
                                    incidentId: incident.id,
                                    operatorId: operators[0]?.id || "",
                                    channel: "email",
                                  })
                                }
                                className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-xs text-sky-100 transition hover:bg-sky-400/20"
                              >
                                Assigner
                              </button>
                            ) : null}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </SectionShell>
            ) : null}
            {activeView === "operators" ? (
              <SectionShell
                eyebrow="Opérateurs"
                title="Suivi operateur et capacite de traitement"
                description="Le bureau maintient la liste des intervenants puis visualise la charge et la fermeture par operateur."
              >
                <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.7fr)_minmax(0,1fr)]">
                  <div className="rounded-[28px] border border-white/10 bg-[#0b1220] p-5">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      {editingOperatorId ? "Mettre à jour un opérateur" : "Ajouter un operateur"}
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      {editingOperatorId
                        ? "Mettez à jour les coordonnées et la fonction. Si le nom change, les assignations en cours seront alignées."
                        : "Ajoutez un opérateur bureau avec des coordonnées exploitables pour l'assignation."}
                    </p>
                    <div className="mt-4 grid gap-3">
                      <input
                        value={operatorFirstName}
                        onChange={(event) => setOperatorFirstName(event.target.value)}
                        placeholder="Prénom"
                        className="rounded-2xl border border-white/10 bg-[#08101d] px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400/60"
                      />
                      <input
                        value={operatorLastName}
                        onChange={(event) => setOperatorLastName(event.target.value)}
                        placeholder="Nom"
                        className="rounded-2xl border border-white/10 bg-[#08101d] px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400/60"
                      />
                      <input
                        value={operatorRole}
                        onChange={(event) => setOperatorRole(event.target.value)}
                        placeholder="Fonction"
                        className="rounded-2xl border border-white/10 bg-[#08101d] px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400/60"
                      />
                      <input
                        value={operatorEmail}
                        onChange={(event) => setOperatorEmail(event.target.value)}
                        placeholder="Email"
                        className="rounded-2xl border border-white/10 bg-[#08101d] px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400/60"
                      />
                      <input
                        value={operatorPhone}
                        onChange={(event) => setOperatorPhone(event.target.value)}
                        placeholder="Téléphone"
                        className="rounded-2xl border border-white/10 bg-[#08101d] px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400/60"
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <BoardButton onClick={() => void createOperator()} disabled={isBusy}>
                        {editingOperatorId ? "Mettre à jour l'opérateur" : "Enregistrer l'operateur"}
                      </BoardButton>
                      {editingOperatorId ? (
                        <BoardGhostButton onClick={resetOperatorForm}>Annuler l'édition</BoardGhostButton>
                      ) : null}
                      {editingOperatorId ? (
                        <button
                          type="button"
                          onClick={() => setPendingDeleteOperatorId(editingOperatorId)}
                          className="rounded-full border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm text-red-100 transition hover:bg-red-400/20"
                        >
                          Supprimer le contact
                        </button>
                      ) : null}
                    </div>
                    {editingOperatorId ? (
                      <p className="mt-3 text-xs leading-6 text-slate-500">
                        {editedOperatorAssignedCount > 0
                          ? `${editedOperatorAssignedCount} incident(s) sont actuellement reliés à ce contact.`
                          : "Aucun incident n'est actuellement relié à ce contact."}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {operatorPerformance.length === 0 ? (
                      <div className="rounded-[28px] border border-white/10 bg-[#0b1220] p-6 text-sm text-slate-400 md:col-span-2">
                        Aucun opérateur enregistré. Ajoutez au moins un profil pour activer l'assignation.
                      </div>
                    ) : (
                      operatorPerformance.map((entry) => (
                        <div
                          key={entry.operator.id}
                          className="rounded-[28px] border border-white/10 bg-[#0b1220] p-5"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-lg font-semibold text-white">
                                {operatorLabel(entry.operator)}
                              </p>
                              <p className="mt-1 text-sm text-slate-400">{entry.operator.role}</p>
                              <p className="mt-3 text-xs uppercase tracking-[0.28em] text-slate-500">
                                Contact
                              </p>
                              <p className="mt-1 text-sm text-slate-300">{entry.operator.email}</p>
                              <p className="mt-1 text-sm text-slate-400">{entry.operator.phone}</p>
                            </div>
                            <div className="flex flex-col items-end gap-3">
                              <TagPill tone={entry.criticalCount > 0 ? "red" : "emerald"}>
                                {entry.criticalCount > 0
                                  ? `${entry.criticalCount} critique(s)`
                                  : "Charge stable"}
                              </TagPill>
                              <button
                                type="button"
                                onClick={() => startEditingOperator(entry.operator)}
                                className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-xs text-sky-100 transition hover:bg-sky-400/20"
                              >
                                Éditer
                              </button>
                            </div>
                          </div>

                          <div className="mt-5 grid grid-cols-2 gap-3">
                            <MiniMetric label="Assignés" value={entry.assignedCount} />
                            <MiniMetric label="Ouverts" value={entry.openCount} />
                            <MiniMetric label="Clôtures" value={entry.closedCount} />
                            <MiniMetric label="Taux" value={`${entry.closureRate}%`} />
                          </div>

                          <div className="mt-4 rounded-2xl border border-white/10 bg-[#08101d] p-4">
                            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                              Dossiers en charge
                            </p>
                            <div className="mt-3 grid gap-2">
                              {entry.assignedIncidents.length === 0 ? (
                                <p className="text-sm text-slate-500">Aucun incident assigné.</p>
                              ) : (
                                entry.assignedIncidents.map((incident) => (
                                  <button
                                    key={incident.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedIncidentId(incident.id);
                                      setActiveView("incidents");
                                    }}
                                    className="rounded-xl border border-white/10 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                                  >
                                    {incident.title}
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </SectionShell>
            ) : null}

            {activeView === "performance" ? (
              <SectionShell
                eyebrow="Performance"
                title="KPI utiles pour pilotage et charge"
                description="Le bureau suit les incidents ouverts, les retards, le temps moyen de traitement et la contribution operateur."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                  <HighlightCard
                    title="Incidents ouverts"
                    value={openActive.length}
                    body="Volume actuellement a piloter."
                    onClick={() => setActiveInsightKey("open")}
                  />
                  <HighlightCard
                    title="Incidents critiques"
                    value={criticalOpen.length}
                    body="Niveau de risque manager immediat."
                    onClick={() => setActiveInsightKey("critical")}
                  />
                  <HighlightCard
                    title="Incidents en retard"
                    value={overdueIncidents.length}
                    body="Points ages au-dela du delai de suivi attendu."
                    onClick={() => setActiveInsightKey("overdue")}
                  />
                  <HighlightCard
                    title="Temps moyen de traitement"
                    value={formatDuration(averageTreatmentHours)}
                    body="Calcul réalisé sur les incidents clôturés."
                    onClick={() => setActiveInsightKey("treatment")}
                  />
                  <HighlightCard
                    title="Taux de clôture"
                    value={`${closureRate}%`}
                    body="Part des incidents déjà refermés sur le portefeuille."
                    onClick={() => setActiveInsightKey("closure")}
                  />
                  <HighlightCard
                    title="Opérateurs actifs"
                    value={activeOperatorsCount}
                    body="Ressources actuellement engagées."
                    onClick={() => setActiveInsightKey("operators")}
                  />
                  <HighlightCard
                    title="Charge max opérateur"
                    value={
                      busiestOperatorEntry ? busiestOperatorEntry.openCount : 0
                    }
                    body="Plus forte charge ouverte individuelle."
                    onClick={() => setActiveInsightKey("workload")}
                  />
                </div>

                <div className="mt-6 rounded-[28px] border border-white/10 bg-[#0b1220] p-5">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    Performance par operateur
                  </p>
                  <div className="mt-4 grid gap-3">
                    {operatorPerformance.length === 0 ? (
                      <p className="text-sm text-slate-400">
                        Ajoutez des opérateurs pour mesurer la charge et le taux de clôture.
                      </p>
                    ) : (
                      operatorPerformance.map((entry) => (
                        <div
                          key={entry.operator.id}
                          className="grid gap-3 rounded-2xl border border-white/10 bg-[#08101d] px-4 py-4 md:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))]"
                        >
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {operatorLabel(entry.operator)}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">{entry.operator.role}</p>
                          </div>
                          <MetricLine label="Assignés" value={entry.assignedCount.toString()} />
                          <MetricLine label="Ouverts" value={entry.openCount.toString()} />
                          <MetricLine label="Critiques" value={entry.criticalCount.toString()} />
                          <MetricLine label="Clôture" value={`${entry.closureRate}%`} />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </SectionShell>
            ) : null}

            {activeView === "review" ? (
              <SectionShell
                eyebrow="Revue de direction"
                title="Synthèse management prête à présenter"
                description="La revue consolide la criticité, les tendances du portefeuille, la performance et les actions prioritaires à acter."
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
                  <div className="grid gap-4">
                    <div className="rounded-[28px] border border-white/10 bg-[#0b1220] p-5">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                        Synthèse globale
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <MiniMetric
                          label="Portefeuille"
                          value={records.length}
                          detail="Incidents total"
                        />
                        <MiniMetric
                          label="Critiques"
                          value={criticalOpen.length}
                          detail="Ouverts"
                        />
                        <MiniMetric
                          label="Taux de clôture"
                          value={`${closureRate}%`}
                          detail="Portefeuille"
                        />
                      </div>
                      <p className="mt-5 text-sm leading-7 text-slate-300">
                        Field Trace montre un portefeuille compose de {records.length} incident(s), dont{" "}
                        {criticalOpen.length} critique(s) encore ouvert(s). {overdueIncidents.length} point(s)
                        sont considérés en retard et nécessitent un suivi de direction.
                      </p>
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-[#0b1220] p-5">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                        Top problèmes
                      </p>
                      <div className="mt-4 grid gap-3">
                        {topProblems.length === 0 ? (
                          <p className="text-sm text-slate-400">
                            Aucun thème récurrent détecté pour le moment.
                          </p>
                        ) : (
                          topProblems.map((problem) => (
                            <div
                              key={problem.category}
                              className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#08101d] px-4 py-3"
                            >
                              <span className="text-sm text-slate-200">{problem.category}</span>
                              <span className="text-sm font-semibold text-white">{problem.count}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-[#0b1220] p-5">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                        Répartition criticité
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <MetricLine
                          label="CRITICAL"
                          value={records.filter((incident) => normalizePriority(incident.priority) === "critical").length.toString()}
                        />
                        <MetricLine
                          label="HIGH"
                          value={records.filter((incident) => normalizePriority(incident.priority) === "high").length.toString()}
                        />
                        <MetricLine
                          label="MEDIUM"
                          value={records.filter((incident) => normalizePriority(incident.priority) === "medium").length.toString()}
                        />
                        <MetricLine
                          label="LOW"
                          value={records.filter((incident) => normalizePriority(incident.priority) === "low").length.toString()}
                        />
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-[#0b1220] p-5">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                        Top emplacements problématiques
                      </p>
                      <div className="mt-4 grid gap-3">
                        {topProblematicProjects.map((project) => (
                          <div
                            key={project.label}
                            className="grid gap-3 rounded-2xl border border-white/10 bg-[#08101d] px-4 py-4 md:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]"
                          >
                            <div className="text-sm font-semibold text-white">{project.label}</div>
                            <MetricLine label="Total" value={project.total.toString()} />
                            <MetricLine label="Ouverts" value={project.open.toString()} />
                            <MetricLine label="Critiques" value={project.critical.toString()} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="rounded-[28px] border border-white/10 bg-[#0b1220] p-5">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                        Actions prioritaires
                      </p>
                      <div className="mt-4 grid gap-3">
                        {reviewActions.map((action) => (
                          <button
                            key={action.key}
                            type="button"
                            onClick={() => setActiveReviewActionKey(action.key)}
                            className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-50 transition hover:border-amber-400/40 hover:bg-amber-500/15"
                          >
                            <span>{action.label}</span>
                            <span className="mt-2 block text-[11px] uppercase tracking-[0.22em] text-amber-100/80">
                              Cliquer pour ouvrir l'action
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-[#0b1220] p-5">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                        Évolution et performance
                      </p>
                      <div className="mt-4 grid gap-3">
                        <MetricLine label="Incidents en cours" value={inProgress.length.toString()} />
                        <MetricLine
                          label="Temps moyen de traitement"
                          value={formatDuration(averageTreatmentHours)}
                        />
                        <MetricLine
                          label="Opérateurs actifs"
                          value={operatorPerformance.filter((entry) => entry.assignedCount > 0).length.toString()}
                        />
                        <MetricLine label="Incidents non assignés" value={openUnassigned.length.toString()} />
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-[#0b1220] p-5">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                        Performance équipes
                      </p>
                      <div className="mt-4 grid gap-3">
                        {operatorPerformance.length === 0 ? (
                          <p className="text-sm text-slate-400">Aucune équipe disponible.</p>
                        ) : (
                          operatorPerformance.slice(0, 5).map((entry) => (
                            <div
                              key={entry.operator.id}
                              className="grid gap-3 rounded-2xl border border-white/10 bg-[#08101d] px-4 py-4 md:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]"
                            >
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  {operatorLabel(entry.operator)}
                                </p>
                                <p className="mt-1 text-xs text-slate-400">{entry.operator.role}</p>
                              </div>
                              <MetricLine label="Ouverts" value={entry.openCount.toString()} />
                              <MetricLine label="Critiques" value={entry.criticalCount.toString()} />
                              <MetricLine label="Clôture" value={`${entry.closureRate}%`} />
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-[#0b1220] p-5">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                        Évolution des incidents
                      </p>
                      <div className="mt-4 grid gap-3">
                        {incidentTrend.length === 0 ? (
                          <p className="text-sm text-slate-400">Aucune tendance disponible.</p>
                        ) : (
                          incidentTrend.map((entry) => (
                            <div
                              key={`${entry.label}-${entry.count}`}
                              className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#08101d] px-4 py-3"
                            >
                              <span className="text-sm text-slate-300">{entry.label}</span>
                              <span className="text-sm font-semibold text-white">{entry.count}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </SectionShell>
            ) : null}
          </div>

          <aside className="flex flex-col gap-6">
            <div ref={selectedIncidentPanelRef}>
            <SectionShell
              eyebrow="Incident sélectionné"
              title={selectedIncident ? selectedIncident.title : "Aucun incident"}
              description={
                selectedIncident
                  ? normalizeStatus(selectedIncident.status) === "closed"
                    ? "Le détail manager permet de consulter la clôture, rouvrir si besoin et ouvrir le dossier complet."
                    : "Le détail manager permet de changer le statut, d'assigner et d'ouvrir le dossier complet."
                  : "Sélectionnez un incident depuis le bureau pour afficher le détail et les actions."
              }
              compact
            >
              {selectedIncident ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap gap-2">
                    <TagPill tone="slate">{incidentRef(selectedIncident.id)}</TagPill>
                    <TagPill tone="sky">{statusLabel(selectedIncident.status)}</TagPill>
                    <TagPill
                      tone={
                        normalizePriority(selectedIncident.priority) === "critical"
                          ? "red"
                          : normalizePriority(selectedIncident.priority) === "high"
                            ? "orange"
                            : normalizePriority(selectedIncident.priority) === "medium"
                              ? "amber"
                              : "emerald"
                      }
                    >
                      {priorityLabel(selectedIncident.priority)}
                    </TagPill>
                  </div>

                  <div className="grid gap-3">
                    {incidentPreviewUrl(selectedIncident) ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedImage({
                            url: incidentPreviewUrl(selectedIncident) as string,
                            title: selectedIncident.title,
                            subtitle: `${projectLabel(selectedIncident.project)} · ${incidentNatureLabel(selectedIncident.category)}`,
                          })
                        }
                        className="overflow-hidden rounded-2xl border border-white/10 bg-[#08101d] p-2"
                      >
                        <img
                          src={incidentPreviewUrl(selectedIncident) as string}
                          alt={selectedIncident.title}
                          className="max-h-64 w-full object-contain"
                        />
                      </button>
                    ) : null}
                    <DetailField label="Emplacement" value={projectLabel(selectedIncident.project)} />
                    <DetailField label="Type" value={incidentNatureLabel(selectedIncident.category)} />
                    <DetailField label="Assigné à" value={selectedIncident.assignee || "Non assigné"} />
                    <DetailField label="Création" value={formatDate(selectedIncident.created_at)} />
                    <DetailField label="Dernière mise à jour" value={formatDate(selectedIncident.updated_at)} />
                    <DetailField
                      label="Description"
                      value={selectedIncident.description || "Aucune description detaillee"}
                      multiline
                    />
                    <DetailField
                      label="Clôture"
                      value={selectedIncident.close_comment || "Pas de commentaire de cloture"}
                      multiline
                    />
                  </div>

                  <div className="grid gap-3">
                    {normalizeStatus(selectedIncident.status) !== "closed" ? (
                      <BoardButton
                        onClick={() =>
                          setAssignmentDraft({
                            incidentId: selectedIncident.id,
                            operatorId: operators[0]?.id || "",
                            channel: "email",
                          })
                        }
                      >
                        Assigner
                      </BoardButton>
                    ) : null}
                    <Link
                      href={`/project/${selectedIncident.project_id}/incident/${selectedIncident.id}`}
                      className="rounded-full border border-white/10 px-4 py-3 text-center text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                    >
                      Ouvrir le dossier complet
                    </Link>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <StatusActionButton
                      label="Passer OPEN"
                      active={normalizeStatus(selectedIncident.status) === "open"}
                      onClick={() => void updateIncidentStatus(selectedIncident.id, "open")}
                    />
                    <StatusActionButton
                      label="Passer IN_PROGRESS"
                      active={normalizeStatus(selectedIncident.status) === "in_progress"}
                      onClick={() => void updateIncidentStatus(selectedIncident.id, "in_progress")}
                    />
                    <StatusActionButton
                      label="Clôturer"
                      active={normalizeStatus(selectedIncident.status) === "closed"}
                      onClick={() => void updateIncidentStatus(selectedIncident.id, "closed")}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Aucun incident selectionne dans le portefeuille.</p>
              )}
            </SectionShell>
            </div>

            <SectionShell
              eyebrow="Manager quick wins"
              title="Actions immediates"
              description="Trois raccourcis pour transformer la lecture KPI en actions concretes."
              compact
            >
              <div className="grid gap-3">
                <ActionCard
                  title="Voir les critiques"
                  body="Bascule directement sur le Command Center priorise."
                  actionLabel="Ouvrir le command center"
                  onClick={() => setActiveView("command-center")}
                />
                <ActionCard
                  title="Lister les incidents"
                  body="Afficher la liste globale avec les filtres statut, criticite et emplacement."
                  actionLabel="Ouvrir les incidents"
                  onClick={() => setActiveView("incidents")}
                />
                <ActionCard
                  title="Preparer la revue"
                  body="Consolider la synthese, les top problemes et les actions de direction."
                  actionLabel="Ouvrir la revue"
                  onClick={() => setActiveView("review")}
                />
              </div>
            </SectionShell>
          </aside>
        </div>
      </div>

      {activeInsight ? (
        <ModalShell title={activeInsight.title} onClose={() => setActiveInsightKey(null)}>
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-[#08101d] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-sky-300">{activeInsight.eyebrow}</p>
              <p className="mt-3 text-sm leading-7 text-slate-200">{activeInsight.summary}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <BoardButton onClick={focusInsightPrimaryAction}>{activeInsight.primaryActionLabel}</BoardButton>
              {activeInsight.secondaryActionLabel ? (
                <BoardGhostButton onClick={focusInsightSecondaryAction}>
                  {activeInsight.secondaryActionLabel}
                </BoardGhostButton>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#08101d] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Elements concernes</p>
              <div className="mt-4 grid gap-3">
                {activeInsight.incidents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-400">
                    {activeInsight.emptyLabel}
                  </div>
                ) : (
                  activeInsight.incidents.slice(0, 6).map((incident) => (
                    <div
                      key={incident.id}
                      className="rounded-2xl border border-white/10 bg-[#0b1220] p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex gap-3">
                          {incidentPreviewUrl(incident) ? (
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedImage({
                                  url: incidentPreviewUrl(incident) as string,
                                  title: incident.title,
                                  subtitle: `${projectLabel(incident.project)} · ${incidentNatureLabel(incident.category)}`,
                                })
                              }
                              className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10"
                            >
                              <img
                                src={incidentPreviewUrl(incident) as string}
                                alt={incident.title}
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ) : null}
                          <div>
                          <div className="flex flex-wrap gap-2">
                            <TagPill tone="slate">{incidentRef(incident.id)}</TagPill>
                            <TagPill tone="sky">{statusLabel(incident.status)}</TagPill>
                            <TagPill
                              tone={
                                normalizePriority(incident.priority) === "critical"
                                  ? "red"
                                  : normalizePriority(incident.priority) === "high"
                                    ? "orange"
                                    : normalizePriority(incident.priority) === "medium"
                                      ? "amber"
                                      : "emerald"
                              }
                            >
                              {priorityLabel(incident.priority)}
                            </TagPill>
                          </div>
                          <p className="mt-3 text-base font-semibold text-white">{incident.title}</p>
                          <p className="mt-2 text-sm text-slate-400">{projectLabel(incident.project)}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Assigné à : {incident.assignee || "Non assigné"}
                          </p>
                        </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openIncidentFromInsight(incident)}
                            className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                          >
                            Voir dans le bureau
                          </button>
                          {normalizeStatus(incident.status) !== "closed" ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedIncidentId(incident.id);
                                setAssignmentDraft({
                                  incidentId: incident.id,
                                  operatorId: operators[0]?.id || "",
                                  channel: "email",
                                });
                                setActiveInsightKey(null);
                              }}
                              className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-xs text-sky-100 transition hover:bg-sky-400/20"
                            >
                              Assigner
                            </button>
                          ) : null}
                          <Link
                            href={`/project/${incident.project_id}/incident/${incident.id}`}
                            className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-100 transition hover:bg-emerald-400/20"
                          >
                            Ouvrir le dossier
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {activeReviewAction ? (
        <ModalShell title="Action prioritaire de revue" onClose={() => setActiveReviewActionKey(null)}>
          <div className="space-y-5">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-amber-100">Revue de direction</p>
              <p className="mt-3 text-sm leading-7 text-amber-50">{activeReviewAction.label}</p>
              <p className="mt-3 text-sm leading-7 text-slate-200">{activeReviewAction.summary}</p>
            </div>

            {activeReviewAction.incidents[0] ? (
              <div className="flex flex-wrap gap-3">
                <BoardButton onClick={() => openIncidentFromReviewAction(activeReviewAction.incidents[0])}>
                  {activeReviewAction.primaryActionLabel || "Afficher l'incident prioritaire"}
                </BoardButton>
                <Link
                  href={`/project/${activeReviewAction.incidents[0].project_id}/incident/${activeReviewAction.incidents[0].id}`}
                  onClick={() => setActiveReviewActionKey(null)}
                  className="rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                >
                  Ouvrir le dossier complet
                </Link>
              </div>
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-[#08101d] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Incidents concernes</p>
              <div className="mt-4 grid gap-3">
                {activeReviewAction.incidents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-400">
                    {activeReviewAction.emptyLabel}
                  </div>
                ) : (
                  activeReviewAction.incidents.slice(0, 5).map((incident) => (
                    <div
                      key={incident.id}
                      className="rounded-2xl border border-white/10 bg-[#0b1220] p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap gap-2">
                            <TagPill tone="slate">{incidentRef(incident.id)}</TagPill>
                            <TagPill tone="sky">{statusLabel(incident.status)}</TagPill>
                            <TagPill
                              tone={
                                normalizePriority(incident.priority) === "critical"
                                  ? "red"
                                  : normalizePriority(incident.priority) === "high"
                                    ? "orange"
                                    : normalizePriority(incident.priority) === "medium"
                                      ? "amber"
                                      : "emerald"
                              }
                            >
                              {priorityLabel(incident.priority)}
                            </TagPill>
                          </div>
                          <p className="mt-3 text-base font-semibold text-white">{incident.title}</p>
                          <p className="mt-2 text-sm text-slate-400">{projectLabel(incident.project)}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Assigné à : {incident.assignee || "Non assigné"}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openIncidentFromReviewAction(incident)}
                            className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-xs text-sky-100 transition hover:bg-sky-400/20"
                          >
                            Afficher dans le bureau
                          </button>
                          <Link
                            href={`/project/${incident.project_id}/incident/${incident.id}`}
                            onClick={() => setActiveReviewActionKey(null)}
                            className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                          >
                            Ouvrir le dossier
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {pendingDeleteOperator ? (
        <ModalShell title="Supprimer le contact" onClose={() => setPendingDeleteOperatorId(null)}>
          <div className="space-y-5">
            <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4">
              <p className="text-sm leading-7 text-red-50">
                Vous allez supprimer <strong>{operatorLabel(pendingDeleteOperator)}</strong>.
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-200">
                {pendingDeleteAssignedCount > 0
                  ? `${pendingDeleteAssignedCount} incident(s) assigné(s) à ce contact seront remis en non assigné.`
                  : "Aucun incident n'est actuellement assigné à ce contact."}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#08101d] p-4 text-sm leading-7 text-slate-300">
              Cette action supprime le contact du bureau. Les assignations futures ne pourront plus utiliser ce profil.
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void confirmDeleteOperator()}
                disabled={isBusy}
                className="rounded-full border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Confirmer la suppression
              </button>
              <BoardGhostButton onClick={() => setPendingDeleteOperatorId(null)}>
                Annuler
              </BoardGhostButton>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {selectedImage ? (
        <ModalShell title={selectedImage.title} onClose={() => setSelectedImage(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-300">{selectedImage.subtitle}</p>
            <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#08101d]">
              <img src={selectedImage.url} alt={selectedImage.title} className="max-h-[72vh] w-full object-contain" />
            </div>
          </div>
        </ModalShell>
      ) : null}

      {assignmentDraft ? (
        <ModalShell title="Assigner un incident" onClose={() => setAssignmentDraft(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Choisissez l'operateur puis le canal d'envoi. Le message est prepare pour ouverture
              directe dans votre client mail ou votre application SMS.
            </p>

            <FilterSelect
              label="Opérateur"
              value={assignmentDraft.operatorId}
              onChange={(value) =>
                setAssignmentDraft((current) =>
                  current ? { ...current, operatorId: value } : current
                )
              }
              options={[
                {
                  value: "",
                  label:
                    operators.length === 0 ? "Aucun operateur disponible" : "Choisir un opérateur",
                },
                ...operators.map((operator) => ({
                  value: operator.id,
                  label: `${operatorLabel(operator)} · ${operator.role}`,
                })),
              ]}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  setAssignmentDraft((current) =>
                    current ? { ...current, channel: "email" } : current
                  )
                }
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  assignmentDraft.channel === "email"
                    ? "border-sky-400/40 bg-sky-400/10 text-sky-100"
                    : "border-white/10 bg-[#08101d] text-slate-200 hover:border-white/20"
                }`}
              >
                <p className="text-sm font-semibold">Envoyer par mail</p>
                <p className="mt-1 text-xs text-slate-400">
                  {selectedAssignmentOperator?.email || "Email opérateur non renseigné"}
                </p>
              </button>
              <button
                type="button"
                onClick={() =>
                  setAssignmentDraft((current) =>
                    current ? { ...current, channel: "sms" } : current
                  )
                }
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  assignmentDraft.channel === "sms"
                    ? "border-sky-400/40 bg-sky-400/10 text-sky-100"
                    : "border-white/10 bg-[#08101d] text-slate-200 hover:border-white/20"
                }`}
              >
                <p className="text-sm font-semibold">Envoyer par SMS</p>
                <p className="mt-1 text-xs text-slate-400">
                  {selectedAssignmentOperator?.phone || "Numéro opérateur non renseigné"}
                </p>
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#08101d] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Canal sélectionné</p>
              <p className="mt-2 text-sm text-slate-200">
                {assignmentDraft.channel === "sms"
                  ? "SMS pré-rempli pour notification terrain rapide."
                  : "Mail pré-rempli pour notification et traçabilité."}
              </p>
              {assignmentDraft.channel === "email" ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-[#0b1220] px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Objet</p>
                  <p className="mt-1 text-sm text-slate-200">
                    {assignmentEmailSubject || "Sélectionnez un opérateur pour préparer l'objet."}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#08101d] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Message préparé</p>
              <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">
                {assignmentMessage || "Sélectionnez un opérateur pour générer le message d'assignation."}
              </pre>
            </div>

            <div className="flex flex-wrap gap-3">
              <BoardButton
                onClick={() => void assignIncident()}
                disabled={isBusy || operators.length === 0 || !canDeliverAssignment}
              >
                {assignmentDraft.channel === "sms"
                  ? "Valider et ouvrir le SMS"
                  : "Valider et ouvrir le mail"}
              </BoardButton>
              <BoardGhostButton onClick={() => setAssignmentDraft(null)}>Annuler</BoardGhostButton>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

function SectionShell({
  eyebrow,
  title,
  description,
  children,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      className={`rounded-[32px] border border-white/10 bg-[#101827] shadow-[0_22px_70px_rgba(2,6,23,0.35)] ${
        compact ? "p-5" : "p-5 sm:p-6"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.28em] text-sky-300">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function HeroMetric({
  eyebrow,
  value,
  detail,
  onClick,
}: {
  eyebrow: string;
  value: string | number;
  detail: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[28px] border border-white/10 bg-white/5 px-4 py-4 text-left transition hover:border-white/20 hover:bg-white/10"
    >
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{eyebrow}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-300">{detail}</p>
      <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-sky-300">Cliquer pour agir</p>
    </button>
  );
}

function HighlightCard({
  title,
  value,
  body,
  onClick,
}: {
  title: string;
  value: string | number;
  body: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[28px] border border-white/10 bg-[#0b1220] p-5 text-left transition hover:border-white/20 hover:bg-[#10192c]"
    >
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{title}</p>
      <p className="mt-4 text-4xl font-semibold text-white">{value}</p>
      <p className="mt-3 text-sm leading-7 text-slate-300">{body}</p>
      <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-sky-300">Voir les elements concernes</p>
    </button>
  );
}

function IncidentLane({
  title,
  subtitle,
  incidents,
  emptyLabel,
  selectedIncidentId,
  onSelect,
  onPreview,
  onAssign,
  onStatusChange,
}: {
  title: string;
  subtitle: string;
  incidents: IncidentRecord[];
  emptyLabel: string;
  selectedIncidentId: string | null;
  onSelect: (incidentId: string) => void;
  onPreview: (image: { url: string; title: string; subtitle: string } | null) => void;
  onAssign: (incidentId: string) => void;
  onStatusChange: (incidentId: string, nextStatus: IncidentStatus) => void;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-[#0b1220] p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-sky-300">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
      <div className="mt-4 grid gap-3">
        {incidents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-400">
            {emptyLabel}
          </div>
        ) : (
          incidents.map((incident) => {
            const incidentStatus = normalizeStatus(incident.status);
            const isSelected = selectedIncidentId === incident.id;

            return (
            <div
              key={incident.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(incident.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(incident.id);
                }
              }}
              className={`rounded-2xl border bg-[#08101d] p-4 text-left transition ${
                isSelected
                  ? "border-sky-400/50 shadow-[0_0_0_1px_rgba(56,189,248,0.2)]"
                  : "border-white/10 hover:border-white/20"
              }`}
            >
              <div className="flex gap-3">
                {incidentPreviewUrl(incident) ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(incident.id);
                      onPreview({
                        url: incidentPreviewUrl(incident) as string,
                        title: incident.title,
                        subtitle: `${projectLabel(incident.project)} · ${incidentNatureLabel(incident.category)}`,
                      });
                    }}
                    className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10"
                  >
                    <img
                      src={incidentPreviewUrl(incident) as string}
                      alt={incident.title}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-dashed border-white/10 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    Sans visuel
                  </div>
                )}

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(incident.id);
                  }}
                  className="flex-1 text-left"
                >
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                      {incidentRef(incident.id)}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${priorityTone(
                        incident.priority
                      )}`}
                    >
                      {priorityLabel(incident.priority)}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${statusTone(
                        incident.status
                      )}`}
                    >
                      {statusLabel(incident.status)}
                    </span>
                  </div>
                  <p className="mt-3 text-base font-semibold text-white">{incident.title}</p>
                  <p className="mt-2 text-sm text-slate-400">{projectLabel(incident.project)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {incidentNatureLabel(incident.category)} · {incident.assignee || "Non assigné"} · Âge {formatAgingHours(incident.updated_at || incident.created_at)}
                  </p>
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {incidentStatus !== "closed" ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAssign(incident.id);
                    }}
                    className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-xs text-sky-100 transition hover:bg-sky-400/20"
                  >
                    Assigner
                  </button>
                ) : null}
                {incidentStatus === "open" ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onStatusChange(incident.id, "in_progress");
                    }}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                  >
                    En suivi
                  </button>
                ) : null}
                {incidentStatus === "in_progress" ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onStatusChange(incident.id, "open");
                    }}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                  >
                    Repasser OPEN
                  </button>
                ) : null}
                {incidentStatus !== "closed" ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onStatusChange(incident.id, "closed");
                    }}
                    className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-100 transition hover:bg-emerald-400/20"
                  >
                    Clôturer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onStatusChange(incident.id, "open");
                    }}
                    className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-100 transition hover:bg-amber-400/20"
                  >
                    Reouvrir
                  </button>
                )}
              </div>
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.24em] text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-[#08101d] px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400/60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DetailField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#08101d] px-4 py-3">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className={`mt-2 text-sm text-slate-200 ${multiline ? "leading-7" : ""}`}>{value}</p>
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#08101d] px-4 py-3">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#08101d] px-4 py-3 text-left">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-400">{detail}</p> : null}
    </div>
  );
}

function TagPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "sky" | "emerald" | "red" | "orange" | "amber" | "slate";
}) {
  const toneClass =
    tone === "sky"
      ? "border-sky-400/30 bg-sky-400/10 text-sky-100"
      : tone === "emerald"
        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
        : tone === "red"
          ? "border-red-400/30 bg-red-400/10 text-red-100"
          : tone === "orange"
            ? "border-orange-400/30 bg-orange-400/10 text-orange-100"
            : tone === "amber"
              ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
              : "border-white/10 bg-white/5 text-slate-200";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs uppercase tracking-[0.22em] ${toneClass}`}>
      {children}
    </span>
  );
}

function BoardButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-sky-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function BoardGhostButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/5"
    >
      {children}
    </button>
  );
}

function StatusActionButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-3 py-3 text-sm transition ${
        active
          ? "border-sky-400/40 bg-sky-400/10 text-sky-100"
          : "border-white/10 bg-[#08101d] text-slate-200 hover:border-white/20"
      }`}
    >
      {label}
    </button>
  );
}

function ActionCard({
  title,
  body,
  actionLabel,
  onClick,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[24px] border border-white/10 bg-[#0b1220] p-4 text-left transition hover:border-white/20 hover:bg-[#10192c]"
    >
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-7 text-slate-300">{body}</p>
      <p className="mt-4 text-xs uppercase tracking-[0.24em] text-sky-300">{actionLabel}</p>
    </button>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    panelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 px-4 py-4 backdrop-blur-sm sm:px-6 sm:py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        className="flex w-full max-w-3xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[#0f172a] p-6 shadow-[0_30px_90px_rgba(2,6,23,0.55)] outline-none sm:max-h-[calc(100vh-3rem)]"
      >
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-2xl font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/5"
          >
            Fermer
          </button>
        </div>
        <div className="mt-5 overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}


