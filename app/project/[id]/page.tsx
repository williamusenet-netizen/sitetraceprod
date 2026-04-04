"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  getSupabaseBrowserClient,
  getUserFacingSupabaseErrorMessage,
  normalizeSupabaseError,
} from "@/lib/supabase";
import { buildIncidentClaimMailText, generateIncidentClaimPdf } from "@/lib/pdf";

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
  closed_at?: string | null;
};

type ProjectPageStatus =
  | "loading"
  | "ready"
  | "not-found"
  | "config-error"
  | "backend-unavailable";

function formatDate(date?: string | null) {
  if (!date) return "N/A";
  try {
    return new Date(date).toLocaleString("fr-FR");
  } catch {
    return date;
  }
}

function priorityTone(priority?: string | null) {
  const normalizedPriority = (priority || "").toLowerCase();
  if (normalizedPriority === "critical") return "bg-red-50 text-red-700";
  if (normalizedPriority === "high") return "bg-orange-50 text-orange-700";
  if (normalizedPriority === "medium") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}

function statusTone(status?: string | null) {
  const normalizedStatus = (status || "").toLowerCase();
  if (normalizedStatus === "closed") return "bg-emerald-50 text-emerald-700";
  if (normalizedStatus === "in_progress") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-700";
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
  const [priority, setPriority] = useState("medium");
  const [location, setLocation] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [initialPhotoFile, setInitialPhotoFile] = useState<File | null>(null);

  const [closingIncidentId, setClosingIncidentId] = useState<string | null>(null);
  const [closeComment, setCloseComment] = useState("");
  const [closedByName, setClosedByName] = useState("");
  const [closePhotoFile, setClosePhotoFile] = useState<File | null>(null);

  const load = async () => {
    setPageStatus("loading");
    setErrorMsg("");
    console.info("[FieldTrace][Project] Loading page data", { projectId: id });

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (projectError) {
        throw projectError;
      }

      if (!projectData) {
        console.warn("[FieldTrace][Project] Project not found", { projectId: id });
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

      if (incidentError) {
        throw incidentError;
      }

      setProject(projectData);
      setIncidents((incidentData || []) as Incident[]);
      setPageStatus("ready");
      console.info("[FieldTrace][Project] Page data loaded", {
        projectId: id,
        incidentCount: (incidentData || []).length,
      });
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      console.error("[FieldTrace][Project] Page load failed", {
        projectId: id,
        error: normalizedError,
      });
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

    console.info("[FieldTrace][Project] Creating incident", { projectId: id, title: title.trim() });

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
          console.warn("[FieldTrace][Project] Initial photo upload failed", uploadResult.error);
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
        console.warn("[FieldTrace][Project] Incident creation rejected", error);
        return;
      }

      setTitle("");
      setDescription("");
      setCategory("interface");
      setPriority("medium");
      setLocation("");
      setReporterName("");
      setInitialPhotoFile(null);
      setSuccessMsg("Incident créé.");
      console.info("[FieldTrace][Project] Incident created successfully", { projectId: id });
      await load();
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      console.error("[FieldTrace][Project] Incident creation failed", normalizedError);
      setErrorMsg(getUserFacingSupabaseErrorMessage(normalizedError.kind));
    }
  };

  const updateIncidentStatus = async (incidentId: string, nextStatus: string) => {
    setErrorMsg("");
    setSuccessMsg("");
    console.info("[FieldTrace][Project] Updating incident status", {
      projectId: id,
      incidentId,
      nextStatus,
    });

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
      }

      if (nextStatus !== "closed") {
        payload.close_comment = null;
        payload.close_photo_url = null;
        payload.closed_by_name = null;
        payload.closed_at = null;
      }

      const { error } = await supabase.from("incidents").update(payload).eq("id", incidentId);

      if (error) {
        setErrorMsg(error.message);
        console.warn("[FieldTrace][Project] Incident status update rejected", error);
        return;
      }

      if (nextStatus === "closed" && closePhotoFile) {
        let fileToUpload: File;

        try {
          fileToUpload = await convertHeicIfNeeded(closePhotoFile);
        } catch (error) {
          console.error("[FieldTrace][Project] Closure photo conversion failed", error);
          setErrorMsg("Erreur conversion image de clôture (HEIC/HEIF).");
          return;
        }

        const fileExt = fileToUpload.name.split(".").pop() || "jpg";
        const fileName = `${incidentId}-close-${Date.now()}.${fileExt}`;
        const filePath = `closures/${fileName}`;

        const uploadResult = await supabase.storage
          .from("incident-photos")
          .upload(filePath, fileToUpload, { upsert: true });

        if (uploadResult.error) {
          setErrorMsg(`Upload photo de clôture impossible : ${uploadResult.error.message}`);
          console.warn("[FieldTrace][Project] Closure photo upload failed", uploadResult.error);
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
          console.warn("[FieldTrace][Project] Closure photo persistence failed", updatePhotoError);
          return;
        }
      }

      setClosingIncidentId(null);
      setCloseComment("");
      setClosedByName("");
      setClosePhotoFile(null);
      setSuccessMsg(`Incident passé en ${nextStatus}.`);
      console.info("[FieldTrace][Project] Incident status updated successfully", {
        projectId: id,
        incidentId,
        nextStatus,
      });
      await load();
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      console.error("[FieldTrace][Project] Incident status update failed", normalizedError);
      setErrorMsg(getUserFacingSupabaseErrorMessage(normalizedError.kind));
    }
  };

  if (pageStatus !== "ready" || !project) {
    return <ProjectStatusScreen status={pageStatus} errorMsg={errorMsg} />;
  }

  const projectName = project.site_name || project.name || "Projet";

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 px-6 py-8 text-white md:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
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
                  <Link
                    href="/"
                    className="mb-3 inline-flex rounded-xl bg-white/10 px-4 py-2 text-sm text-white backdrop-blur-sm"
                  >
                    ← Retour accueil
                  </Link>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-300">
                    project command center
                  </p>
                  <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">{projectName}</h1>
                  <p className="mt-2 text-sm text-slate-300 md:text-base">
                    {project.client_name || "Client N/A"} — {project.location || "Localisation N/A"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <MiniMetric
                  label="Ouverts"
                  value={incidents.filter((incident) => (incident.status || "open") !== "closed").length}
                />
                <MiniMetric
                  label="Clôturés"
                  value={incidents.filter((incident) => (incident.status || "open") === "closed").length}
                />
                <MiniMetric label="Total" value={incidents.length} />
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6 space-y-6">
          {errorMsg && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
              {successMsg}
            </div>
          )}

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                création incident
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">Nouveau signalement</h2>
              <p className="mt-1 text-slate-600">
                Déclarez un incident avec contexte, photo initiale et niveau de priorité.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
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
              placeholder="Commentaire initial / description factuelle"
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
                <option value="quality">Qualité</option>
                <option value="safety">Sécurité</option>
                <option value="delay">Délai</option>
                <option value="access">Accès</option>
              </select>

              <select
                className="rounded-2xl border border-slate-300 p-3 text-black"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
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
              Ajouter incident
            </button>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                historique terrain
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">Incidents</h2>
              <p className="mt-1 text-slate-600">
                Mettez à jour les statuts, générez les claims unitaires et conservez la
                traçabilité visuelle.
              </p>
            </div>

            <div className="space-y-4">
              {incidents.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-600">
                  Aucun incident enregistré.
                </div>
              ) : (
                incidents.map((incident) => (
                  <div key={incident.id} className="rounded-3xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-semibold text-slate-900">{incident.title}</h3>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityTone(
                              incident.priority
                            )}`}
                          >
                            {incident.priority || "N/A"}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(
                              incident.status
                            )}`}
                          >
                            {incident.status || "open"}
                          </span>
                        </div>

                        <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                          <p className="text-sm font-semibold text-slate-900">Signalement initial</p>
                          <p className="mt-2 text-sm text-slate-700">
                            {incident.description || "Sans commentaire initial"}
                          </p>
                          <div className="mt-3 grid gap-2 text-sm text-slate-500 md:grid-cols-2">
                            <p>Déclaré par : {incident.reporter_name || "N/A"}</p>
                            <p>Créé le : {formatDate(incident.created_at)}</p>
                            <p>Catégorie : {incident.category || "N/A"}</p>
                            <p>Zone : {incident.location || "N/A"}</p>
                          </div>

                          {incident.initial_photo_url && (
                            <div className="mt-4">
                              <p className="mb-2 text-sm font-semibold text-slate-900">Photo initiale</p>
                              <img
                                src={incident.initial_photo_url}
                                alt="Photo initiale"
                                className="max-h-72 rounded-2xl border border-slate-200"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex w-full flex-wrap gap-2 xl:w-[320px] xl:justify-end">
                        <button
                          onClick={() => updateIncidentStatus(incident.id, "open")}
                          className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700"
                        >
                          Open
                        </button>
                        <button
                          onClick={() => updateIncidentStatus(incident.id, "in_progress")}
                          className="rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-800"
                        >
                          In progress
                        </button>
                        <button
                          onClick={() => setClosingIncidentId(incident.id)}
                          className="rounded-xl bg-emerald-100 px-3 py-2 text-sm text-emerald-800"
                        >
                          Close
                        </button>
                        <button
                          onClick={() => generateIncidentClaimPdf(project, incident)}
                          className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-800"
                        >
                          Claim PDF
                        </button>
                        <button
                          onClick={async () => {
                            const text = buildIncidentClaimMailText(project, incident);
                            await navigator.clipboard.writeText(text);
                            setSuccessMsg("Texte du claim copié dans le presse-papiers.");
                          }}
                          className="rounded-xl bg-slate-200 px-3 py-2 text-sm text-slate-700"
                        >
                          Copier texte mail
                        </button>
                      </div>
                    </div>

                    {closingIncidentId === incident.id && (
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h4 className="font-semibold text-slate-900">Clôturer l'incident</h4>

                        <textarea
                          className="mt-3 min-h-[100px] w-full rounded-2xl border border-slate-300 p-3 text-black"
                          placeholder="Commentaire de clôture"
                          value={closeComment}
                          onChange={(event) => setCloseComment(event.target.value)}
                        />

                        <div className="mt-3 grid gap-4 md:grid-cols-2">
                          <input
                            className="rounded-2xl border border-slate-300 p-3 text-black"
                            placeholder="Clôturé par"
                            value={closedByName}
                            onChange={(event) => setClosedByName(event.target.value)}
                          />

                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="rounded-2xl border border-slate-300 p-3 text-black file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2"
                            onChange={(event) => setClosePhotoFile(event.target.files?.[0] || null)}
                          />
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => updateIncidentStatus(incident.id, "closed")}
                            className="rounded-xl bg-slate-900 px-4 py-2 text-white"
                          >
                            Confirmer fermeture
                          </button>
                          <button
                            onClick={() => {
                              setClosingIncidentId(null);
                              setCloseComment("");
                              setClosedByName("");
                              setClosePhotoFile(null);
                            }}
                            className="rounded-xl bg-slate-200 px-4 py-2 text-slate-700"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}

                    {(incident.close_comment ||
                      incident.close_photo_url ||
                      incident.closed_by_name ||
                      incident.closed_at) && (
                      <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
                        <p className="font-semibold">Clôture</p>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <p>Commentaire : {incident.close_comment || "N/A"}</p>
                          <p>Clôturé par : {incident.closed_by_name || "N/A"}</p>
                          <p>Clôturé le : {formatDate(incident.closed_at)}</p>
                        </div>

                        {incident.close_photo_url && (
                          <div className="mt-4">
                            <p className="mb-2 font-semibold">Photo de clôture</p>
                            <img
                              src={incident.close_photo_url}
                              alt="Photo de clôture"
                              className="max-h-72 rounded-2xl border border-slate-200"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <footer className="pb-2 text-center text-[10px] leading-4 text-slate-400">
            © {new Date().getFullYear()} FieldTrace. Concept, structure fonctionnelle, interface et
            logique applicative réservés. Toute reproduction, adaptation ou exploitation non
            autorisée est interdite.
          </footer>
        </div>
      </div>
    </main>
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
      "Vérifiez les variables d’environnement Vercel NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY.",
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
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto flex min-h-screen max-w-4xl items-center px-4 py-10 md:px-8">
        <section className="w-full overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 px-6 py-8 text-white md:px-8">
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
                <p className="text-xs uppercase tracking-[0.25em] text-slate-300">project command center</p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">FieldTrace</h1>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-6 md:p-8">
            <div className={`rounded-2xl border p-6 ${toneClassName}`}>
              <h2 className="text-2xl font-bold">{titleByStatus[status]}</h2>
              <p className="mt-2 text-sm">{descriptionByStatus[status]}</p>
              {errorMsg && <p className="mt-3 text-sm font-medium">{errorMsg}</p>}
            </div>

            <Link
              href="/"
              className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm text-white"
            >
              Retour à l'accueil
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center backdrop-blur-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
