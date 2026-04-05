"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  getSupabaseBrowserClient,
  getUserFacingSupabaseErrorMessage,
  normalizeSupabaseError,
} from "@/lib/supabase";
import { buildIncidentClientMailText, generateIncidentClientPdf } from "@/lib/incident-pdf";
import { generateProjectReportPdf } from "@/lib/pdf";

type Project = {
  id: string;
  name?: string | null;
  site_name?: string | null;
  client_name?: string | null;
  location?: string | null;
  status?: string | null;
};

type Incident = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: string | null;
  status?: string | null;
  assignee?: string | null;
  location?: string | null;
  reporter_name?: string | null;
  initial_photo_url?: string | null;
  close_comment?: string | null;
  close_photo_url?: string | null;
  closed_by_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  closed_at?: string | null;
};

type ProjectPageStatus =
  | "loading"
  | "ready"
  | "not-found"
  | "config-error"
  | "backend-unavailable";

type IncidentStatus = "open" | "in_progress" | "closed";
type IncidentPriority = "critical" | "high" | "medium" | "low";

const PRIORITY_RANK: Record<IncidentPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const STATUS_RANK: Record<IncidentStatus, number> = {
  open: 0,
  in_progress: 1,
  closed: 2,
};

function normalizeStatus(status?: string | null): IncidentStatus {
  const normalized = (status || "open").toLowerCase();
  if (normalized === "closed") return "closed";
  if (normalized === "in_progress") return "in_progress";
  return "open";
}

function normalizePriority(priority?: string | null): IncidentPriority {
  const normalized = (priority || "low").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  return "low";
}

function formatDate(date?: string | null) {
  if (!date) return "Non renseigné";
  try {
    return new Date(date).toLocaleString("fr-FR");
  } catch {
    return date;
  }
}

function formatShortDate(date?: string | null) {
  if (!date) return "Non renseigné";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  } catch {
    return date;
  }
}

function priorityTone(priority?: string | null) {
  const normalized = normalizePriority(priority);
  if (normalized === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (normalized === "high") return "border-orange-200 bg-orange-50 text-orange-700";
  if (normalized === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function statusTone(status?: string | null) {
  const normalized = normalizeStatus(status);
  if (normalized === "closed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "in_progress") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function labelStatus(status?: string | null) {
  const normalized = normalizeStatus(status);
  if (normalized === "in_progress") return "IN_PROGRESS";
  if (normalized === "closed") return "CLOSED";
  return "OPEN";
}

function labelPriority(priority?: string | null) {
  return normalizePriority(priority).toUpperCase();
}

function compareIncidents(left: Incident, right: Incident) {
  const priorityDiff =
    PRIORITY_RANK[normalizePriority(left.priority)] - PRIORITY_RANK[normalizePriority(right.priority)];
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const statusDiff =
    STATUS_RANK[normalizeStatus(left.status)] - STATUS_RANK[normalizeStatus(right.status)];
  if (statusDiff !== 0) {
    return statusDiff;
  }

  return (right.created_at || "").localeCompare(left.created_at || "");
}

async function convertHeicIfNeeded(file: File): Promise<File> {
  const lowerName = file.name.toLowerCase();
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    lowerName.endsWith(".heic") ||
    lowerName.endsWith(".heif");

  if (!isHeic) {
    return file;
  }

  const module = await import("heic2any");
  const heic2any = module.default;
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });

  const blob = Array.isArray(converted) ? converted[0] : converted;
  const jpgName = lowerName.replace(/\.(heic|heif)$/i, ".jpg") || "photo.jpg";

  return new File([blob as BlobPart], jpgName, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);

  const [project, setProject] = useState<Project | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [pageStatus, setPageStatus] = useState<ProjectPageStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("interface");
  const [priority, setPriority] = useState<IncidentPriority>("medium");
  const [location, setLocation] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [initialPhotoFile, setInitialPhotoFile] = useState<File | null>(null);

  const [closingIncidentId, setClosingIncidentId] = useState<string | null>(null);
  const [closeComment, setCloseComment] = useState("");
  const [closedByName, setClosedByName] = useState("");
  const [closePhotoFile, setClosePhotoFile] = useState<File | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | IncidentStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | IncidentPriority>("all");

  const resetClosureForm = () => {
    setClosingIncidentId(null);
    setCloseComment("");
    setClosedByName("");
    setClosePhotoFile(null);
  };

  const openClosureForm = (incidentId: string) => {
    setClosingIncidentId(incidentId);
    setCloseComment("");
    setClosedByName("");
    setClosePhotoFile(null);
  };

  const load = async ({ preserveReadyState = false }: { preserveReadyState?: boolean } = {}) => {
    if (!preserveReadyState) {
      setPageStatus("loading");
    }
    setErrorMsg("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (projectError) throw projectError;

      if (!projectData) {
        setProject(null);
        setIncidents([]);
        setPageStatus("not-found");
        return;
      }

      const { data: incidentData, error: incidentError } = await supabase
        .from("incidents")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false });

      if (incidentError) throw incidentError;

      setProject(projectData);
      setIncidents((incidentData || []) as Incident[]);
      setPageStatus("ready");
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      console.error("[FieldTrace][Project] Page load failed", { projectId: id, error: normalizedError });
      setProject(null);
      setIncidents([]);
      setPageStatus(normalizedError.kind === "config" ? "config-error" : "backend-unavailable");
      setErrorMsg(getUserFacingSupabaseErrorMessage(normalizedError.kind));
    }
  };

  useEffect(() => {
    if (id) {
      load();
    }
  }, [id]);

  const createIncident = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    if (!title.trim()) {
      setErrorMsg("Le titre de l'incident est obligatoire.");
      return;
    }

    try {
      const supabase = getSupabaseBrowserClient();
      let initialPhotoUrl: string | null = null;
      if (initialPhotoFile) {
        let fileToUpload: File;

        try {
          fileToUpload = await convertHeicIfNeeded(initialPhotoFile);
        } catch (error) {
          console.error("[FieldTrace][Project] Initial photo conversion failed", error);
          setErrorMsg("Erreur conversion image initiale (HEIC/HEIF).");
          return;
        }

        const fileExt = fileToUpload.name.split(".").pop() || "jpg";
        const fileName = `initial-${Date.now()}.${fileExt}`;
        const filePath = `initial/${fileName}`;

        const uploadResult = await supabase.storage
          .from("incident-photos")
          .upload(filePath, fileToUpload, { upsert: true });

        if (uploadResult.error) {
          setErrorMsg(`Upload photo initiale impossible : ${uploadResult.error.message}`);
          return;
        }

        const { data } = supabase.storage.from("incident-photos").getPublicUrl(filePath);
        initialPhotoUrl = data.publicUrl;
      }

      const { error } = await supabase.from("incidents").insert({
        project_id: id,
        title: title.trim(),
        description: description.trim() || null,
        category,
        priority,
        status: "open",
        location: location.trim() || null,
        reporter_name: reporterName.trim() || null,
        initial_photo_url: initialPhotoUrl,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setTitle("");
      setDescription("");
      setCategory("interface");
      setPriority("medium");
      setLocation("");
      setReporterName("");
      setInitialPhotoFile(null);
      setSuccessMsg("Incident cree.");
      await load({ preserveReadyState: true });
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      console.error("[FieldTrace][Project] Incident creation failed", normalizedError);
      setErrorMsg(getUserFacingSupabaseErrorMessage(normalizedError.kind));
    }
  };

  const updateIncidentStatus = async (incidentId: string, nextStatus: IncidentStatus) => {
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const supabase = getSupabaseBrowserClient();
      const payload: Record<string, unknown> = {
        status: nextStatus,
        updated_at: new Date().toISOString(),
      };

      if (nextStatus === "closed") {
        payload.close_comment = closeComment.trim() || null;
        payload.closed_by_name = closedByName.trim() || null;
        payload.closed_at = new Date().toISOString();
      } else {
        payload.close_comment = null;
        payload.close_photo_url = null;
        payload.closed_by_name = null;
        payload.closed_at = null;
      }

      const { error } = await supabase.from("incidents").update(payload).eq("id", incidentId);
      if (error) {
        setErrorMsg(error.message);
        return;
      }

      if (nextStatus === "closed" && closePhotoFile) {
        let fileToUpload: File;

        try {
          fileToUpload = await convertHeicIfNeeded(closePhotoFile);
        } catch (error) {
          console.error("[FieldTrace][Project] Closure photo conversion failed", error);
          setErrorMsg("Erreur de conversion de l'image de clôture (HEIC/HEIF).");
          return;
        }

        const fileExt = fileToUpload.name.split(".").pop() || "jpg";
        const fileName = `${incidentId}-close-${Date.now()}.${fileExt}`;
        const filePath = `closures/${fileName}`;

        const uploadResult = await supabase.storage
          .from("incident-photos")
          .upload(filePath, fileToUpload, { upsert: true });

        if (uploadResult.error) {
          setErrorMsg(`Téléversement de la photo de clôture impossible : ${uploadResult.error.message}`);
          return;
        }

        const { data } = supabase.storage.from("incident-photos").getPublicUrl(filePath);
        const { error: updatePhotoError } = await supabase
          .from("incidents")
          .update({
            close_photo_url: data.publicUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", incidentId);

        if (updatePhotoError) {
          setErrorMsg(updatePhotoError.message);
          return;
        }
      }

      resetClosureForm();
      setSuccessMsg(`Incident passe en ${labelStatus(nextStatus)}.`);
      await load({ preserveReadyState: true });
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      console.error("[FieldTrace][Project] Incident status update failed", normalizedError);
      setErrorMsg(getUserFacingSupabaseErrorMessage(normalizedError.kind));
    }
  };

  if (pageStatus !== "ready" || !project) {
    return <ProjectStatusScreen status={pageStatus} errorMsg={errorMsg} />;
  }

  const sortedIncidents = [...incidents].sort(compareIncidents);
  const activeIncidents = sortedIncidents.filter((incident) => normalizeStatus(incident.status) !== "closed");
  const closedIncidents = sortedIncidents.filter((incident) => normalizeStatus(incident.status) === "closed");
  const criticalIncidents = activeIncidents.filter(
    (incident) => normalizePriority(incident.priority) === "critical"
  );
  const filteredIncidents = sortedIncidents.filter((incident) => {
    const matchesStatus = statusFilter === "all" || normalizeStatus(incident.status) === statusFilter;
    const matchesPriority =
      priorityFilter === "all" || normalizePriority(incident.priority) === priorityFilter;
    return matchesStatus && matchesPriority;
  });
  const nextActionIncident = criticalIncidents[0] || activeIncidents[0] || null;

  const projectName = project.site_name || project.name || "Projet";
  const openCount = activeIncidents.length;
  const criticalCount = criticalIncidents.length;
  const closedCount = closedIncidents.length;
  const allClosed = incidents.length > 0 && activeIncidents.length === 0;
  const noCritical = incidents.length > 0 && criticalIncidents.length === 0;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#e7edf3_0%,#f4f6f8_42%,#f5f1e8_100%)]">
      <div className="w-full px-5 py-6 md:px-8 md:py-8 xl:px-10 2xl:px-12">
        <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_16px_60px_rgba(15,23,42,0.10)]">
          <div className="bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_24%),linear-gradient(135deg,#0f172a_0%,#172033_48%,#243047_100%)] px-6 py-8 text-white md:px-8 xl:px-10">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex items-start gap-4">
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 p-2 shadow-lg">
                  <Image
                    src="/fieldtrace-logo.svg"
                    alt="FieldTrace logo"
                    width={64}
                    height={64}
                    priority
                    className="h-14 w-14 rounded-xl"
                  />
                </div>
                <div>
                  <Link
                    href="/"
                    className="mb-3 inline-flex items-center gap-2 rounded-2xl border border-cyan-300/70 bg-cyan-400/15 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(34,211,238,0.18)] ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-300/20"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/16 text-base">
                      ←
                    </span>
                    <span>Retour accueil</span>
                  </Link>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-300">
                    Pilotage incidents terrain
                  </p>
                  <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">{projectName}</h1>
                  <p className="mt-2 text-sm text-slate-300 md:text-base">
                    {project.client_name || "Client non renseigné"} - {project.location || "Localisation à confirmer"}
                  </p>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                    Cycle terrain centralisé pour qualifier les incidents, piloter le suivi, clôturer
                    proprement puis produire un livrable client exploitable.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 xl:min-w-[360px]">
                <MetricTile label="Ouverts" value={openCount} />
                <MetricTile label="Critiques" value={criticalCount} />
                <MetricTile label="Clôturés" value={closedCount} />
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6 space-y-6">
          {errorMsg ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{errorMsg}</div>
          ) : null}
          {successMsg ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
              {successMsg}
            </div>
          ) : null}

          <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <SectionHeader
                eyebrow="Priorités"
                title="À traiter maintenant"
                description="Tri automatique : CRITICAL en premier, puis HIGH, MEDIUM et LOW."
              />

              <div className="mt-5">
                {incidents.length === 0 ? (
                  <StatePanel
                    tone="slate"
                    title="Aucun incident"
                    body="Le projet est prêt. Utilisez le formulaire pour déclarer le premier signalement terrain."
                  />
                ) : allClosed ? (
                  <StatePanel
                    tone="emerald"
                    title="Tous les incidents sont clôturés"
                    body="Le suivi terrain est bouclé. Vous pouvez passer au bloc livrables pour finaliser le client."
                  />
                ) : noCritical ? (
                  <StatePanel
                    tone="emerald"
                    title="Aucun critique ouvert"
                    body="Le projet reste actif mais aucune criticité immédiate n'est ouverte. Poursuivez le suivi des incidents restants."
                  />
                ) : (
                  <StatePanel
                    tone="red"
                    title={`${criticalCount} critique(s) à arbitrer`}
                    body="Les incidents CRITICAL passent en tête de liste pour orienter la décision terrain sans ambiguïté."
                  />
                )}
              </div>

              {activeIncidents.length > 0 ? (
                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  {activeIncidents.slice(0, 3).map((incident) => (
                    <PriorityCard key={incident.id} incident={incident} projectId={id} />
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <SectionHeader
                eyebrow="Cycle incident"
                title="Parcours terrain"
                description="Le projet suit un flux simple : signaler, qualifier, suivre, clôturer, livrer."
              />

              <div className="mt-5 flex flex-wrap gap-2">
                {["Incident", "Qualification", "Suivi", "Clôture", "Livrable"].map((step) => (
                  <span
                    key={step}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600"
                  >
                    {step}
                  </span>
                ))}
              </div>

              <div className="mt-5 grid gap-3">
                <QuickAction href="#new-incident" title="Créer un incident" body="Déclarer un nouveau signalement terrain." />
                <QuickAction
                  href={nextActionIncident ? `#incident-${nextActionIncident.id}` : "#incident-list"}
                  title="Reprendre le point prioritaire"
                  body={
                    nextActionIncident
                      ? `${nextActionIncident.title} - ${labelPriority(nextActionIncident.priority)}`
                      : "Aller à la liste des incidents."
                  }
                />
                <QuickAction
                  href="#incident-list"
                  title="Voir les critiques"
                  body={
                    criticalIncidents.length > 0
                      ? `${criticalIncidents.length} critique(s) ouverte(s) à afficher.`
                      : "Aucune criticité ouverte actuellement."
                  }
                />
                <QuickAction
                  href="#livrables"
                  title="Préparer le livrable"
                  body="Accéder aux incidents clôturés et aux exports client."
                />
                <QuickActionButton
                  title="Générer le rapport"
                  body="Produire une synthèse projet complète pour reporting."
                  onClick={() => generateProjectReportPdf(project, sortedIncidents)}
                />
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  État global projet
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {allClosed
                    ? "Projet bouclé pour reporting"
                    : `${openCount} incident(s) restent à traiter avant clôture complète`}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {allClosed
                    ? "Tous les incidents sont clôturés. Le projet peut passer en restitution client."
                    : "Le cockpit reste orienté traitement jusqu'à fermeture complète des incidents."}
                </p>
              </div>
            </div>
          </section>

          <section id="incident-list" className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <SectionHeader
                eyebrow="Suivi"
                title="Incidents triés pour action"
                description="Chaque incident suit un seul parcours clair : OPEN, IN_PROGRESS, puis CLOSED."
              />
              <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
                {filteredIncidents.length} incident(s) affiché(s)
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | IncidentStatus)}
              >
                <option value="all">Tous les statuts</option>
                <option value="open">OPEN</option>
                <option value="in_progress">IN_PROGRESS</option>
                <option value="closed">CLOSED</option>
              </select>
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value as "all" | IncidentPriority)}
              >
                <option value="all">Toutes les criticités</option>
                <option value="critical">CRITICAL</option>
                <option value="high">HIGH</option>
                <option value="medium">MEDIUM</option>
                <option value="low">LOW</option>
              </select>
            </div>

            {filteredIncidents.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-slate-600">
                Aucun incident ne correspond aux filtres actifs.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {filteredIncidents.map((incident) => (
                  <IncidentCard
                    key={incident.id}
                    projectId={id}
                    incident={incident}
                    isClosing={closingIncidentId === incident.id}
                    closeComment={closeComment}
                    closedByName={closedByName}
                    closePhotoFile={closePhotoFile}
                    onSetCloseComment={setCloseComment}
                    onSetClosedByName={setClosedByName}
                    onSetClosePhotoFile={setClosePhotoFile}
                    onOpen={() => updateIncidentStatus(incident.id, "open")}
                    onInProgress={() => updateIncidentStatus(incident.id, "in_progress")}
                    onOpenClosure={() => openClosureForm(incident.id)}
                    onConfirmClosure={() => updateIncidentStatus(incident.id, "closed")}
                    onCancelClosure={resetClosureForm}
                  />
                ))}
              </div>
            )}
          </section>

          <section id="new-incident" className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              eyebrow="Qualification"
              title="Nouveau signalement"
              description="Documentez le contexte initial pour lancer un suivi propre et exploitable."
            />

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <input
                className="rounded-2xl border border-slate-300 p-3 text-black"
                placeholder="Titre incident"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <input
                className="rounded-2xl border border-slate-300 p-3 text-black"
                placeholder="Zone / localisation"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </div>

            <textarea
              className="mt-4 min-h-[120px] w-full rounded-2xl border border-slate-300 p-3 text-black"
              placeholder="Description factuelle"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <select
                className="rounded-2xl border border-slate-300 p-3 text-black"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="interface">Interface</option>
                <option value="quality">Qualite</option>
                <option value="safety">Securite</option>
                <option value="delay">Delai</option>
                <option value="access">Acces</option>
              </select>

              <select
                className="rounded-2xl border border-slate-300 p-3 text-black"
                value={priority}
                onChange={(event) => setPriority(event.target.value as IncidentPriority)}
              >
                <option value="critical">CRITICAL</option>
                <option value="high">HIGH</option>
                <option value="medium">MEDIUM</option>
                <option value="low">LOW</option>
              </select>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <input
                className="rounded-2xl border border-slate-300 p-3 text-black"
                placeholder="Déclaré par"
                value={reporterName}
                onChange={(event) => setReporterName(event.target.value)}
              />
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="rounded-2xl border border-slate-300 p-3 text-black file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2"
                onChange={(event) => setInitialPhotoFile(event.target.files?.[0] || null)}
              />
            </div>

            <button
              onClick={createIncident}
              className="mt-4 rounded-2xl bg-slate-900 px-6 py-3 text-white"
            >
              Créer l'incident
            </button>
          </section>

          <section id="livrables" className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <SectionHeader
                eyebrow="Clôture / livrable"
                title="Finaliser la sortie client"
                description="Les incidents clôturés sont préparés ici pour le PDF unitaire et le texte d'envoi."
              />
              <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
                {closedCount} incident(s) clôturé(s)
              </div>
            </div>
            <div className="mt-5">
              {incidents.length === 0 ? (
                <StatePanel
                  tone="slate"
                  title="Aucun incident"
                  body="Aucun livrable possible tant qu'aucun incident n'est créé."
                />
              ) : closedCount === 0 ? (
                <StatePanel
                  tone="amber"
                  title="Aucun incident clôturé"
                  body="Clôturez au moins un incident pour générer un PDF et préparer l'envoi client."
                />
              ) : allClosed ? (
                <StatePanel
                  tone="emerald"
                  title="Projet prêt pour livrable"
                  body="Tous les incidents sont clôturés. Vous pouvez produire les PDF clients sans ambiguïté."
                />
              ) : (
                <StatePanel
                  tone="amber"
                  title="Livrable partiel"
                  body="Des incidents restent ouverts. Les PDF peuvent être générés, mais le projet n'est pas encore complètement bouclé."
                />
              )}
            </div>

            {closedIncidents.length > 0 ? (
              <div className="mt-6 space-y-4">
                {closedIncidents.map((incident) => (
                  <div key={incident.id} className="rounded-3xl border border-slate-200 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-slate-900">{incident.title}</h3>
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityTone(incident.priority)}`}>
                            {labelPriority(incident.priority)}
                          </span>
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(incident.status)}`}>
                            {labelStatus(incident.status)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          Clôturé par {incident.closed_by_name || "Non renseigné"} le {formatDate(incident.closed_at)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => generateIncidentClientPdf(project, incident)}
                          className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white"
                        >
                          Générer le PDF
                        </button>
                        <button
                          onClick={async () => {
                            const text = buildIncidentClientMailText(project, incident);
                            await navigator.clipboard.writeText(text);
                            setSuccessMsg("Texte de livrable copié dans le presse-papiers.");
                          }}
                          className="rounded-xl bg-slate-200 px-4 py-2 text-sm text-slate-700"
                        >
                          Copier texte mail
                        </button>
                        <a
                          href={`#incident-${incident.id}`}
                          className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-700"
                        >
                          Revoir l'incident
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center backdrop-blur-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function QuickAction({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <a href={href} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-slate-100">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
    </a>
  );
}

function QuickActionButton({
  title,
  body,
  onClick,
}: {
  title: string;
  body: string;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:bg-slate-100"
    >
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
    </button>
  );
}

function PriorityCard({ incident, projectId }: { incident: Incident; projectId: string }) {
  return (
    <Link
      href={`/project/${projectId}/incident/${incident.id}`}
      className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 transition hover:bg-white"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityTone(incident.priority)}`}>
          {labelPriority(incident.priority)}
        </span>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(incident.status)}`}>
          {labelStatus(incident.status)}
        </span>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-slate-900">{incident.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{incident.description || "Sans commentaire initial."}</p>
      <div className="mt-3 text-sm text-slate-500">
        {incident.location || "Zone à préciser"} - {formatShortDate(incident.created_at)}
      </div>
    </Link>
  );
}

function IncidentCard({
  projectId,
  incident,
  isClosing,
  closeComment,
  closedByName,
  closePhotoFile,
  onSetCloseComment,
  onSetClosedByName,
  onSetClosePhotoFile,
  onOpen,
  onInProgress,
  onOpenClosure,
  onConfirmClosure,
  onCancelClosure,
}: {
  projectId: string;
  incident: Incident;
  isClosing: boolean;
  closeComment: string;
  closedByName: string;
  closePhotoFile: File | null;
  onSetCloseComment: (value: string) => void;
  onSetClosedByName: (value: string) => void;
  onSetClosePhotoFile: (file: File | null) => void;
  onOpen: () => void;
  onInProgress: () => void;
  onOpenClosure: () => void;
  onConfirmClosure: () => void;
  onCancelClosure: () => void;
}) {
  const status = normalizeStatus(incident.status);

  return (
    <article id={`incident-${incident.id}`} className="rounded-3xl border border-slate-200 p-5 shadow-sm">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold text-slate-900">{incident.title}</h3>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityTone(incident.priority)}`}>
              {labelPriority(incident.priority)}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(incident.status)}`}>
              {labelStatus(incident.status)}
            </span>
          </div>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            {incident.description || "Sans commentaire initial."}
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoField label="Zone" value={incident.location || "Non renseigné"} />
            <InfoField label="Catégorie" value={incident.category || "Non renseigné"} />
            <InfoField label="Déclaré par" value={incident.reporter_name || "Non renseigné"} />
            <InfoField label="Cree le" value={formatDate(incident.created_at)} />
          </div>

          <IncidentTimeline incident={incident} />

          {incident.initial_photo_url ? (
            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold text-slate-900">Photo initiale</p>
              <img
                src={incident.initial_photo_url}
                alt="Photo initiale"
                className="max-h-72 rounded-2xl border border-slate-200"
              />
            </div>
          ) : null}
        </div>

        <div className="flex w-full flex-wrap gap-2 xl:w-[260px] xl:justify-end">
          <Link
            href={`/project/${projectId}/incident/${incident.id}`}
            className="rounded-xl bg-sky-100 px-3 py-2 text-sm text-sky-800"
          >
            Ouvrir dossier
          </Link>
          {status === "open" ? (
            <>
              <button onClick={onInProgress} className="rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-800">
                Passer en suivi
              </button>
              <button onClick={onOpenClosure} className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white">
                Clôturer / commenter
              </button>
            </>
          ) : null}

          {status === "in_progress" ? (
            <>
              <button onClick={onOpenClosure} className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white">
                Clôturer / commenter
              </button>
              <button onClick={onOpen} className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
                Revenir OPEN
              </button>
            </>
          ) : null}

          {status === "closed" ? (
            <button onClick={onOpen} className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
              Rouvrir
            </button>
          ) : null}
        </div>
      </div>

      {isClosing ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="font-semibold text-slate-900">Clôture et commentaire</h4>

          <textarea
            className="mt-3 min-h-[100px] w-full rounded-2xl border border-slate-300 p-3 text-black"
            placeholder="Commentaire de clôture"
            value={closeComment}
            onChange={(event) => onSetCloseComment(event.target.value)}
          />

          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <input
              className="rounded-2xl border border-slate-300 p-3 text-black"
              placeholder="Clôturé par"
              value={closedByName}
              onChange={(event) => onSetClosedByName(event.target.value)}
            />

            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="rounded-2xl border border-slate-300 p-3 text-black file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2"
              onChange={(event) => onSetClosePhotoFile(event.target.files?.[0] || null)}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={onConfirmClosure} className="rounded-xl bg-slate-900 px-4 py-2 text-white">
              Confirmer la clôture
            </button>
            <button onClick={onCancelClosure} className="rounded-xl bg-slate-200 px-4 py-2 text-slate-700">
              Annuler
            </button>
            {closePhotoFile ? <p className="self-center text-sm text-slate-500">{closePhotoFile.name}</p> : null}
          </div>
        </div>
      ) : null}

      {incident.close_comment || incident.close_photo_url || incident.closed_by_name || incident.closed_at ? (
        <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Clôture</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <p>Commentaire : {incident.close_comment || "Non renseigné"}</p>
            <p>Clôturé par : {incident.closed_by_name || "Non renseigné"}</p>
            <p>Clôturé le : {formatDate(incident.closed_at)}</p>
          </div>

          {incident.close_photo_url ? (
            <div className="mt-4">
              <p className="mb-2 font-semibold">Photo de clôture</p>
              <img
                src={incident.close_photo_url}
                alt="Photo de clôture"
                className="max-h-72 rounded-2xl border border-slate-200"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function IncidentTimeline({ incident }: { incident: Incident }) {
  const status = normalizeStatus(incident.status);
  const followUpDate =
    status === "open" ? "À lancer" : formatDate(incident.updated_at || incident.created_at);
  const closeDate = status === "closed" ? formatDate(incident.closed_at) : "En attente";

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <TimelineStep label="Incident" value={formatDate(incident.created_at)} state="done" />
      <TimelineStep
        label="Suivi"
        value={followUpDate}
        state={status === "open" ? "pending" : status === "in_progress" ? "current" : "done"}
      />
      <TimelineStep label="Clôture" value={closeDate} state={status === "closed" ? "done" : "pending"} />
    </div>
  );
}

function TimelineStep({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: "done" | "current" | "pending";
}) {
  const tone =
    state === "done"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : state === "current"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <div className={`rounded-2xl border p-3 ${tone}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-slate-800">{value}</p>
    </div>
  );
}

function StatePanel({
  tone,
  title,
  body,
}: {
  tone: "slate" | "amber" | "red" | "emerald";
  title: string;
  body: string;
}) {
  const className =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : tone === "red"
          ? "border-red-200 bg-red-50 text-red-900"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-2xl border p-4 ${className}`}>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6">{body}</p>
    </div>
  );
}

function ProjectStatusScreen({
  status,
  errorMsg,
}: {
  status: ProjectPageStatus;
  errorMsg: string;
}) {
  const titleByStatus: Record<ProjectPageStatus, string> = {
    loading: "Chargement en cours du projet...",
    "not-found": "Projet introuvable",
    "config-error": "Erreur de configuration",
    "backend-unavailable": "Backend indisponible",
    ready: "Chargement en cours du projet...",
  };

  const descriptionByStatus: Record<ProjectPageStatus, string> = {
    loading: "Les données terrain du projet sont en cours de récupération.",
    "not-found": "Le projet demandé est introuvable. Vérifiez le lien ou retournez à l'accueil.",
    "config-error":
      "Vérifiez les variables d'environnement Vercel NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    "backend-unavailable":
      "Impossible de joindre Supabase pour le moment. Réessayez dans quelques instants.",
    ready: "Les données terrain du projet sont en cours de récupération.",
  };

  const toneClassName =
    status === "loading"
      ? "border-slate-200 bg-slate-50 text-slate-700"
      : status === "not-found"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-red-200 bg-red-50 text-red-700";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#e7edf3_0%,#f4f6f8_42%,#f5f1e8_100%)]">
      <div className="w-full px-5 py-6 md:px-8 md:py-8 xl:px-10 2xl:px-12">
        <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_16px_60px_rgba(15,23,42,0.10)]">
          <div className="bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_24%),linear-gradient(135deg,#0f172a_0%,#172033_48%,#243047_100%)] px-6 py-8 text-white md:px-8 xl:px-10">
            <div className="flex items-center gap-4">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 p-2 shadow-lg">
                <Image
                  src="/fieldtrace-logo.svg"
                  alt="FieldTrace logo"
                  width={64}
                  height={64}
                  priority
                  className="h-14 w-14 rounded-xl"
                />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Poste de pilotage projet</p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">FieldTrace</h1>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-6 md:p-8">
            <div className={`rounded-2xl border p-6 ${toneClassName}`}>
              <h2 className="text-2xl font-bold">{titleByStatus[status]}</h2>
              <p className="mt-2 text-sm">{descriptionByStatus[status]}</p>
              {errorMsg ? <p className="mt-3 text-sm font-medium">{errorMsg}</p> : null}
            </div>

            <Link href="/" className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">
              Retour accueil
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
