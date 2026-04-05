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

type PageStatus = "loading" | "ready" | "not-found" | "config-error" | "backend-unavailable";
type IncidentStatus = "open" | "in_progress" | "closed";
type IncidentPriority = "critical" | "high" | "medium" | "low";
type ProofKind = "constat" | "action_corrective" | "cloture";

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

function formatDate(value?: string | null) {
  if (!value) return "Non renseigné";
  try {
    return new Date(value).toLocaleString("fr-FR");
  } catch {
    return value;
  }
}

function incidentRef(id: string) {
  return `INC-${id.slice(0, 8).toUpperCase()}`;
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

function buildExecutiveSummary(incident: Incident) {
  const status = normalizeStatus(incident.status);
  const priority = normalizePriority(incident.priority);

  return {
    constat: incident.description || incident.title,
    impact:
      priority === "critical"
        ? "Impact terrain majeur avec risque direct sur exécution, délai ou relation client."
        : priority === "high"
          ? "Impact significatif à traiter rapidement pour contenir le risque."
          : priority === "medium"
            ? "Impact maîtrisé mais nécessitant un suivi structuré."
            : "Impact limité, à documenter pour garder la traçabilité.",
    actionImmediate:
      status === "open"
        ? "Qualifier le point, cadrer la zone concernée et lancer le traitement."
        : status === "in_progress"
          ? "Poursuivre l'action corrective et consolider les preuves avant clôture."
          : "Vérifier la restitution client puis archiver le dossier.",
    nextStep:
      status === "closed"
        ? "Transmettre le livrable client et solder le dossier."
        : status === "in_progress"
          ? "Confirmer la résolution puis clôturer avec commentaire et preuve."
          : "Faire passer l'incident en IN_PROGRESS.",
    processingState:
      status === "closed"
        ? "Dossier clôturé"
        : status === "in_progress"
          ? "Traitement en cours"
          : "Qualification initiale",
  };
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

export default function IncidentPage({
  params,
}: {
  params: Promise<{ id: string; incidentId: string }>;
}) {
  const { id, incidentId } = React.use(params);

  const [project, setProject] = useState<Project | null>(null);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [selectedProof, setSelectedProof] = useState<{
    url: string;
    label: string;
    legend: string;
  } | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("interface");
  const [priority, setPriority] = useState<IncidentPriority>("medium");
  const [location, setLocation] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [assignee, setAssignee] = useState("");
  const [statusDraft, setStatusDraft] = useState<IncidentStatus>("open");
  const [closeComment, setCloseComment] = useState("");
  const [closedByName, setClosedByName] = useState("");
  const [proofSlot, setProofSlot] = useState<"constat" | "cloture">("constat");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isSavingWorkflow, setIsSavingWorkflow] = useState(false);
  const [isUploadingProof, setIsUploadingProof] = useState(false);

  const load = async ({ preserveReadyState = false }: { preserveReadyState?: boolean } = {}) => {
    if (!preserveReadyState) {
      setPageStatus("loading");
    }
    setErrorMsg("");

    try {
      const supabase = getSupabaseBrowserClient();
      const [{ data: projectData, error: projectError }, { data: incidentData, error: incidentError }] =
        await Promise.all([
          supabase.from("projects").select("*").eq("id", id).maybeSingle(),
          supabase.from("incidents").select("*").eq("id", incidentId).eq("project_id", id).maybeSingle(),
        ]);

      if (projectError) throw projectError;
      if (incidentError) throw incidentError;

      if (!projectData || !incidentData) {
        setProject(null);
        setIncident(null);
        setPageStatus("not-found");
        return;
      }

      setProject(projectData);
      setIncident(incidentData as Incident);
      setPageStatus("ready");
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      console.error("[FieldTrace][Incident] Page load failed", {
        projectId: id,
        incidentId,
        error: normalizedError,
      });
      setProject(null);
      setIncident(null);
      setPageStatus(normalizedError.kind === "config" ? "config-error" : "backend-unavailable");
      setErrorMsg(getUserFacingSupabaseErrorMessage(normalizedError.kind));
    }
  };

  useEffect(() => {
    if (id && incidentId) {
      load();
    }
  }, [id, incidentId]);

  useEffect(() => {
    if (!incident) return;
    setTitle(incident.title || "");
    setDescription(incident.description || "");
    setCategory(incident.category || "interface");
    setPriority(normalizePriority(incident.priority));
    setLocation(incident.location || "");
    setReporterName(incident.reporter_name || "");
    setAssignee(incident.assignee || "");
    setStatusDraft(normalizeStatus(incident.status));
    setCloseComment(incident.close_comment || "");
    setClosedByName(incident.closed_by_name || "");
    setProofSlot(incident.initial_photo_url ? "cloture" : "constat");
  }, [incident]);

  useEffect(() => {
    if (!selectedProof) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedProof(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [selectedProof]);

  const updateIncidentDetails = async () => {
    if (!incident) return;
    if (!title.trim()) {
      setErrorMsg("Le titre de l'incident est obligatoire.");
      return;
    }

    setIsSavingDetails(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase
        .from("incidents")
        .update({
          title: title.trim(),
          description: description.trim() || null,
          category: category || null,
          priority,
          location: location.trim() || null,
          reporter_name: reporterName.trim() || null,
          assignee: assignee.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", incident.id);

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setSuccessMsg("Le dossier incident a été mis à jour.");
      await load({ preserveReadyState: true });
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      console.error("[FieldTrace][Incident] Detail update failed", normalizedError);
      setErrorMsg(getUserFacingSupabaseErrorMessage(normalizedError.kind));
    } finally {
      setIsSavingDetails(false);
    }
  };

  const updateWorkflow = async () => {
    if (!incident) return;
    if (statusDraft === "closed" && !closeComment.trim()) {
      setErrorMsg("Un commentaire de clôture est obligatoire pour fermer le dossier.");
      return;
    }
    if (statusDraft === "closed" && !closedByName.trim()) {
      setErrorMsg("Le nom du responsable de clôture est obligatoire.");
      return;
    }

    setIsSavingWorkflow(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const supabase = getSupabaseBrowserClient();
      const payload: Record<string, unknown> = {
        status: statusDraft,
        close_comment: closeComment.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (statusDraft === "closed") {
        payload.closed_by_name = closedByName.trim() || null;
        payload.closed_at = incident.closed_at || new Date().toISOString();
      } else {
        payload.closed_by_name = null;
        payload.closed_at = null;
      }

      const { error } = await supabase.from("incidents").update(payload).eq("id", incident.id);
      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setSuccessMsg(`Workflow incident enregistré en ${labelStatus(statusDraft)}.`);
      await load({ preserveReadyState: true });
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      console.error("[FieldTrace][Incident] Workflow update failed", normalizedError);
      setErrorMsg(getUserFacingSupabaseErrorMessage(normalizedError.kind));
    } finally {
      setIsSavingWorkflow(false);
    }
  };

  const uploadProof = async () => {
    if (!incident) return;
    if (!proofFile) {
      setErrorMsg("Selectionnez une photo avant de l'ajouter au dossier.");
      return;
    }

    setIsUploadingProof(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const supabase = getSupabaseBrowserClient();
      const fileToUpload = await convertHeicIfNeeded(proofFile);
      const fileExt = fileToUpload.name.split(".").pop() || "jpg";
      const fileName = `${incident.id}-${proofSlot}-${Date.now()}.${fileExt}`;
      const filePath = `${proofSlot}/${fileName}`;

      const uploadResult = await supabase.storage
        .from("incident-photos")
        .upload(filePath, fileToUpload, { upsert: true });

      if (uploadResult.error) {
        setErrorMsg(uploadResult.error.message);
        return;
      }

      const { data } = supabase.storage.from("incident-photos").getPublicUrl(filePath);
      const updatePayload =
        proofSlot === "constat"
          ? {
              initial_photo_url: data.publicUrl,
              updated_at: new Date().toISOString(),
            }
          : {
              close_photo_url: data.publicUrl,
              updated_at: new Date().toISOString(),
            };

      const { error } = await supabase.from("incidents").update(updatePayload).eq("id", incident.id);
      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setProofFile(null);
      setSuccessMsg(
        proofSlot === "constat"
          ? "Preuve de constat ajoutée au dossier."
          : statusDraft === "closed"
            ? "Preuve de clôture ajoutée au dossier."
            : "Preuve d'action corrective ajoutée au dossier."
      );
      await load({ preserveReadyState: true });
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      console.error("[FieldTrace][Incident] Proof upload failed", normalizedError);
      setErrorMsg(getUserFacingSupabaseErrorMessage(normalizedError.kind));
    } finally {
      setIsUploadingProof(false);
    }
  };

  if (pageStatus !== "ready" || !project || !incident) {
    return <IncidentStatusScreen status={pageStatus} errorMsg={errorMsg} projectId={id} />;
  }

  const executive = buildExecutiveSummary(incident);
  const projectName = project.site_name || project.name || "Projet";
  const status = normalizeStatus(incident.status);
  const currentPriority = normalizePriority(incident.priority);
  const proofItems = [
    incident.initial_photo_url
      ? {
          kind: "constat" as ProofKind,
          label: "Constat initial",
          legend: "Preuve du constat au moment du signalement terrain.",
          url: incident.initial_photo_url,
        }
      : null,
    incident.close_photo_url
      ? {
          kind: status === "closed" ? ("cloture" as ProofKind) : ("action_corrective" as ProofKind),
          label: status === "closed" ? "Preuve de clôture" : "Action corrective",
          legend:
            status === "closed"
              ? "Preuve finale rattachée à la clôture du dossier."
              : "Preuve visuelle de traitement avant clôture finale.",
          url: incident.close_photo_url,
        }
      : null,
  ].filter(Boolean) as Array<{ kind: ProofKind; label: string; legend: string; url: string }>;

  const timelineEntries = [
    {
      id: "created",
      label: "Création",
      date: formatDate(incident.created_at),
      body: "Signalement initial enregistré dans le projet.",
    },
    incident.initial_photo_url
      ? {
          id: "proof-start",
          label: "Preuve",
          date: formatDate(incident.created_at),
          body: "Photo de constat ajoutée au dossier.",
        }
      : null,
    incident.updated_at && incident.updated_at !== incident.created_at
      ? {
          id: "update",
          label: "Mise à jour",
          date: formatDate(incident.updated_at),
          body:
            status === "open"
              ? "Le dossier a été qualifié ou enrichi."
              : "Le dossier a été mis à jour pendant le traitement.",
        }
      : null,
    status !== "open"
      ? {
          id: "follow",
          label: "Suivi",
          date: formatDate(incident.updated_at || incident.created_at),
          body:
            status === "closed"
              ? "Le suivi a été mené jusqu'à la clôture."
              : "L'incident est passé en traitement terrain.",
        }
      : null,
    incident.close_photo_url
      ? {
          id: "proof-close",
          label: status === "closed" ? "Preuve clôture" : "Preuve corrective",
          date: formatDate(incident.closed_at || incident.updated_at),
          body:
            status === "closed"
              ? "Une preuve finale est rattachée au dossier."
              : "Une preuve de traitement a été ajoutée avant clôture.",
        }
      : null,
    status === "closed"
      ? {
          id: "closed",
          label: "Clôture",
          date: formatDate(incident.closed_at),
          body: incident.close_comment || "Clôture sans commentaire détaillé.",
        }
      : null,
  ].filter(Boolean) as Array<{ id: string; label: string; date: string; body: string }>;

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
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Link
                      href={`/project/${id}`}
                      className="group inline-flex items-center gap-2 rounded-2xl border border-cyan-300/70 bg-cyan-400/15 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(34,211,238,0.18)] ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-300/20"
                    >
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/16 text-base transition group-hover:bg-white/22">
                        ←
                      </span>
                      <span>Retour projet</span>
                    </Link>
                    <button
                      onClick={() => generateIncidentClientPdf(project, incident)}
                      className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900"
                    >
                      Générer le PDF
                    </button>
                  </div>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-300">
                    Dossier incident terrain
                  </p>
                  <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">{incident.title}</h1>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold">
                      {incidentRef(incident.id)}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(incident.status)}`}
                    >
                      {labelStatus(incident.status)}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityTone(incident.priority)}`}
                    >
                      {labelPriority(incident.priority)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">
                    {projectName} - {project.location || "Localisation à confirmer"}
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    Créé le {formatDate(incident.created_at)} - Mis à jour le{" "}
                    {formatDate(incident.updated_at || incident.created_at)}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:w-[420px]">
                <ActionLink
                  href="#details"
                  title="Modifier"
                  body="Ajuster le dossier terrain avant restitution."
                />
                <ActionLink
                  href="#workflow"
                  title="Changer statut"
                  body="Piloter OPEN, IN_PROGRESS puis CLOSED."
                />
                <ActionLink
                  href="#proofs"
                  title="Ajouter une preuve"
                  body="Rattacher un constat ou une preuve corrective."
                />
                <ActionButton
                  title="Copier le résumé client"
                  body="Préparer un message d'envoi directement exploitable."
                  onClick={async () => {
                    await navigator.clipboard.writeText(buildIncidentClientMailText(project, incident));
                    setSuccessMsg("Le résumé client a été copié dans le presse-papiers.");
                  }}
                />
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

          <section className="grid gap-6 xl:grid-cols-[1fr_0.96fr]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <SectionHeader
                eyebrow="Résumé exécutif"
                title="Lecture immédiate"
                description="Synthèse courte pour comprendre le constat, l'impact et la prochaine action."
              />
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <InfoBox label="Constat" value={executive.constat} />
                <InfoBox label="Impact" value={executive.impact} />
                <InfoBox label="Action immédiate" value={executive.actionImmediate} />
                <InfoBox label="Prochaine étape" value={executive.nextStep} />
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  État de traitement
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{executive.processingState}</p>
              </div>
            </div>

            <section id="workflow" className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <SectionHeader
                eyebrow="Workflow"
                title="Traitement et clôture"
                description="Le dossier suit un flux simple et explicite : OPEN, IN_PROGRESS, puis CLOSED."
              />

              <div className="mt-5 flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(incident.status)}`}
                >
                  {labelStatus(incident.status)}
                </span>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityTone(incident.priority)}`}
                >
                  {labelPriority(incident.priority)}
                </span>
              </div>

              <div className="mt-5 grid gap-3">
                <StatusAction
                  title="OPEN"
                  body="Incident créé, en attente de traitement engagé."
                  active={statusDraft === "open"}
                  onClick={() => setStatusDraft("open")}
                />
                <StatusAction
                  title="IN_PROGRESS"
                  body="Traitement terrain en cours avec preuves et suivi."
                  active={statusDraft === "in_progress"}
                  onClick={() => setStatusDraft("in_progress")}
                />
                <StatusAction
                  title="CLOSED"
                  body="Dossier traité, clôture documentée et livrable prêt."
                  active={statusDraft === "closed"}
                  onClick={() => setStatusDraft("closed")}
                />
              </div>

              <div className="mt-5 grid gap-4">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Commentaire de traitement / clôture
                  </label>
                  <textarea
                    value={closeComment}
                    onChange={(event) => setCloseComment(event.target.value)}
                    className="mt-2 min-h-[120px] w-full rounded-2xl border border-slate-300 p-3 text-black"
                    placeholder="Documenter l'action menee, le constat de resolution et les points restants."
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Responsable de clôture
                  </label>
                  <input
                    value={closedByName}
                    onChange={(event) => setClosedByName(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-300 p-3 text-black"
                    placeholder="Nom du pilote terrain ou responsable projet"
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    onClick={updateWorkflow}
                    disabled={isSavingWorkflow}
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingWorkflow ? "Enregistrement..." : "Enregistrer le workflow"}
                  </button>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    {statusDraft === "closed"
                      ? "La clôture exige un commentaire et un responsable nommé."
                      : "Le commentaire reste utile pour préparer la restitution client."}
                  </div>
                </div>
              </div>
            </section>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
            <section id="details" className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <SectionHeader
                eyebrow="Détails terrain"
                title="Dossier opérationnel"
                description="Informations structurées pour qualifier, suivre puis restituer l'incident."
              />

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Titre
                  </label>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-300 p-3 text-black"
                    placeholder="Titre incident"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Type / catégorie
                  </label>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-300 p-3 text-black"
                  >
                    <option value="interface">Interface</option>
                    <option value="qualite">Qualité</option>
                    <option value="securite">Sécurité</option>
                    <option value="planning">Planning</option>
                    <option value="execution">Exécution</option>
                    <option value="reserve">Réserve</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Criticité
                  </label>
                  <select
                    value={priority}
                    onChange={(event) => setPriority(normalizePriority(event.target.value))}
                    className="mt-2 w-full rounded-2xl border border-slate-300 p-3 text-black"
                  >
                    <option value="critical">CRITICAL</option>
                    <option value="high">HIGH</option>
                    <option value="medium">MEDIUM</option>
                    <option value="low">LOW</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Localisation / équipement
                  </label>
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-300 p-3 text-black"
                    placeholder="Zone / équipement"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Déclaré par
                  </label>
                  <input
                    value={reporterName}
                    onChange={(event) => setReporterName(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-300 p-3 text-black"
                    placeholder="Nom du déclarant"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Entreprise concernée
                  </label>
                  <input
                    value={assignee}
                    onChange={(event) => setAssignee(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-300 p-3 text-black"
                    placeholder="Entreprise / responsable concerné"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Description détaillée
                </label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="mt-2 min-h-[160px] w-full rounded-2xl border border-slate-300 p-3 text-black"
                  placeholder="Constat terrain détaillé, contexte, cause présumée, conséquence et périmètre."
                />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <InfoBox label="Date et heure" value={formatDate(incident.created_at)} />
                <InfoBox
                  label="Cause présumée"
                  value={description.trim() || "À confirmer après analyse terrain."}
                />
                <InfoBox label="Risque" value={labelPriority(currentPriority)} />
                <InfoBox
                  label="Conséquence"
                  value={
                    currentPriority === "critical"
                      ? "Blocage majeur possible sur exécution ou relation client."
                      : currentPriority === "high"
                        ? "Risque significatif à contenir rapidement."
                        : "Impact contenu, à tracer dans le dossier."
                  }
                />
                <InfoBox label="Projet / site" value={projectName} />
                <InfoBox label="Référence" value={incidentRef(incident.id)} />
              </div>

              <button
                onClick={updateIncidentDetails}
                disabled={isSavingDetails}
                className="mt-5 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingDetails ? "Enregistrement..." : "Enregistrer les modifications"}
              </button>
            </section>

            <section id="proofs" className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <SectionHeader
                eyebrow="Preuves"
                title="Constat, correctif, clôture"
                description="Module de preuves compatible avant / après avec état vide explicite."
              />

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-4">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Type de preuve
                    </label>
                    <select
                      value={proofSlot}
                      onChange={(event) => setProofSlot(event.target.value as "constat" | "cloture")}
                      className="mt-2 w-full rounded-2xl border border-slate-300 p-3 text-black"
                    >
                      <option value="constat">Constat initial</option>
                      <option value="cloture">
                        {statusDraft === "closed" ? "Clôture" : "Action corrective / clôture"}
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Photo terrain
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="mt-2 w-full rounded-2xl border border-slate-300 p-3 text-black file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2"
                      onChange={(event) => setProofFile(event.target.files?.[0] || null)}
                    />
                  </div>

                  <button
                    onClick={uploadProof}
                    disabled={isUploadingProof}
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUploadingProof ? "Ajout en cours..." : "Ajouter la preuve"}
                  </button>
                </div>
              </div>

              {proofItems.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-slate-600">
                  Aucune preuve photo disponible pour le moment.
                </div>
              ) : (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {proofItems.map((proof) => (
                    <button
                      key={`${proof.kind}-${proof.url}`}
                      type="button"
                      onClick={() =>
                        setSelectedProof({
                          url: proof.url,
                          label: proof.label,
                          legend: proof.legend,
                        })
                      }
                      className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 text-left transition hover:bg-white"
                    >
                      <div className="bg-slate-100 p-3">
                        <img
                          src={proof.url}
                          alt={proof.label}
                          className="h-56 w-full object-contain"
                        />
                      </div>
                      <div className="p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                              proof.kind === "cloture"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : proof.kind === "action_corrective"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-sky-200 bg-sky-50 text-sky-700"
                            }`}
                          >
                            {proof.label}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-slate-700">{proof.legend}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <SectionHeader
                eyebrow="Historique"
                title="Timeline du dossier"
                description="Journal lisible des moments clés : création, preuves, suivi et clôture."
              />
              <div className="mt-5 space-y-4">
                {timelineEntries.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{entry.label}</p>
                      <p className="text-sm text-slate-500">{entry.date}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{entry.body}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <SectionHeader
                eyebrow="Clôture / client"
                title="Restitution professionnelle"
                description="La logique terrain reste distincte de la synthèse client pour produire un livrable propre."
              />

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <InfoBox label="Statut final" value={labelStatus(incident.status)} />
                <InfoBox label="Date de clôture" value={formatDate(incident.closed_at)} />
                <InfoBox
                  label="Preuve associée"
                  value={
                    incident.close_photo_url
                      ? status === "closed"
                        ? "Preuve finale disponible"
                        : "Preuve corrective disponible"
                      : "Aucune preuve finale"
                  }
                />
                <InfoBox
                  label="Point restant"
                  value={
                    status === "closed"
                      ? "Aucun point restant formel."
                      : "Le dossier n'est pas encore complètement clôturé."
                  }
                />
              </div>

              <div className="mt-5 grid gap-4">
                <ClientBlock
                  title="Résumé client"
                  body={
                    incident.description ||
                    "Constat transmis au client à partir des informations terrain disponibles."
                  }
                />
                <ClientBlock
                  title="Actions correctives"
                  body={incident.close_comment || "Action corrective en attente de détail."}
                />
                <ClientBlock
                  title="Conclusion"
                  body={
                    status === "closed"
                      ? "Le point est considéré comme traité et documenté pour restitution client."
                      : "Le point reste en traitement. La conclusion définitive sera validée après clôture."
                  }
                />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <button
                  onClick={() => generateIncidentClientPdf(project, incident)}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
                >
                  Générer le PDF client
                </button>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(buildIncidentClientMailText(project, incident));
                    setSuccessMsg("Le texte client a été copié dans le presse-papiers.");
                  }}
                  className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700"
                >
                  Copier le résumé client
                </button>
              </div>
            </section>
          </section>
        </div>
      </div>

      {selectedProof ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedProof(null)}
          role="presentation"
        >
          <div
            className="max-h-[92vh] max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-white"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedProof.label}</h2>
                <p className="mt-1 text-sm text-slate-600">{selectedProof.legend}</p>
              </div>
              <button
                onClick={() => setSelectedProof(null)}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700"
              >
                Fermer
              </button>
            </div>
            <img
              src={selectedProof.url}
              alt={selectedProof.label}
              className="max-h-[80vh] w-full object-contain bg-slate-100"
            />
          </div>
        </div>
      ) : null}
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

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-800">{value}</p>
    </div>
  );
}

function ActionLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <a
      href={href}
      className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
    >
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-300">{body}</p>
    </a>
  );
}

function ActionButton({
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
      className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
    >
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-300">{body}</p>
    </button>
  );
}

function StatusAction({
  title,
  body,
  active,
  onClick,
}: {
  title: string;
  body: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition ${
        active ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-slate-50 hover:bg-white"
      }`}
    >
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
    </button>
  );
}

function ClientBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-800">{body}</p>
    </div>
  );
}

function IncidentStatusScreen({
  status,
  errorMsg,
  projectId,
}: {
  status: PageStatus;
  errorMsg: string;
  projectId: string;
}) {
  const titleByStatus: Record<PageStatus, string> = {
    loading: "Chargement du dossier incident...",
    "not-found": "Incident introuvable",
    "config-error": "Erreur de configuration",
    "backend-unavailable": "Backend indisponible",
    ready: "Chargement du dossier incident...",
  };

  const descriptionByStatus: Record<PageStatus, string> = {
    loading: "Le dossier incident est en cours de récupération.",
    "not-found": "L'incident demande est introuvable sur ce projet.",
    "config-error":
      "Vérifiez les variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    "backend-unavailable": "Impossible de joindre Supabase pour le moment.",
    ready: "Le dossier incident est en cours de récupération.",
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#e7edf3_0%,#f4f6f8_42%,#f5f1e8_100%)]">
      <div className="w-full px-5 py-6 md:px-8 md:py-8 xl:px-10 2xl:px-12">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">{titleByStatus[status]}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{descriptionByStatus[status]}</p>
          {errorMsg ? <p className="mt-3 text-sm font-medium text-red-700">{errorMsg}</p> : null}
          <div className="mt-4 flex gap-3">
            <Link href={`/project/${projectId}`} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">
              Retour projet
            </Link>
            <Link href="/" className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-700">
              Retour accueil
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}


