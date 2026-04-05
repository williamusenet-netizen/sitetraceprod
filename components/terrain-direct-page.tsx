"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  getSupabaseBrowserClient,
  getUserFacingSupabaseErrorMessage,
  normalizeSupabaseError,
} from "@/lib/supabase";

type Emplacement = {
  id: string;
  name?: string | null;
  site_name?: string | null;
  location?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type Incident = {
  id: string;
  project_id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: string | null;
  status?: string | null;
  initial_photo_url?: string | null;
  close_comment?: string | null;
  close_photo_url?: string | null;
  closed_by_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  closed_at?: string | null;
};

type TerrainScreen = "home" | "create" | "follow" | "detail";
type TerrainStatus = "loading" | "ready" | "config-error" | "backend-unavailable";
type EntryKind = "incident" | "non_conformite";
type IncidentPriority = "critical" | "high" | "medium" | "low";
type IncidentStatus = "open" | "in_progress" | "closed";

function emplacementLabel(emplacement: Emplacement) {
  return emplacement.site_name || emplacement.name || "Emplacement sans nom";
}

function mapEmplacements(items: Emplacement[]) {
  return items.map((item) => ({
    id: item.id,
    name: item.name || null,
    site_name: item.site_name || null,
    location: item.location || null,
    status: item.status || "active",
    created_at: item.created_at || null,
  }));
}

function getOperationErrorMessage(error: unknown) {
  const normalizedError = normalizeSupabaseError(error);
  const rawMessage = normalizedError.message || "";
  const message = rawMessage.toLowerCase();

  if (normalizedError.kind === "config") {
    return "Configuration invalide. Contactez le support ou vérifiez les variables Supabase.";
  }

  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("fetch")
  ) {
    return "Connexion impossible. Vérifiez le réseau puis réessayez.";
  }

  if (
    message.includes("duplicate") ||
    message.includes("already exists") ||
    message.includes("23505")
  ) {
    return "Un élément similaire existe déjà. Vérifiez avant de créer un doublon.";
  }

  if (message.includes("23502") || message.includes("not-null") || message.includes("null value in column")) {
    if (message.includes("client_name")) {
      return "Création impossible avec les données actuelles. Le client sera renseigné automatiquement à la création.";
    }

    return "Une information obligatoire manque pour enregistrer cette action.";
  }

  if (
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("not allowed") ||
    message.includes("forbidden") ||
    message.includes("42501")
  ) {
    return "Action refusee par le backend. Vos droits d'ecriture doivent etre verifies.";
  }

  if (
    message.includes("bucket") ||
    message.includes("storage") ||
    message.includes("mime") ||
    message.includes("payload too large") ||
    message.includes("entity too large")
  ) {
    return "La photo n'a pas pu être enregistrée. Réessayez avec une image plus simple ou plus légère.";
  }

  if (
    message.includes("invalid input") ||
    message.includes("uuid") ||
    message.includes("malformed")
  ) {
    return "La donnee envoyee est invalide. Rechargez la page puis recommencez.";
  }

  if (
    message.includes("relation") ||
    message.includes("column") ||
    message.includes("schema")
  ) {
    return "Le backend n'est pas aligne avec l'application. Une verification technique est necessaire.";
  }

  if (
    message.includes("timeout") ||
    message.includes("temporarily unavailable") ||
    message.includes("service unavailable")
  ) {
    return "Le service est temporairement indisponible. Réessayez dans quelques instants.";
  }

  return rawMessage || getUserFacingSupabaseErrorMessage("backend");
}

function incidentReference(id: string) {
  return `FT-${id.slice(0, 8).toUpperCase()}`;
}

function normalizePriority(priority?: string | null): IncidentPriority {
  const value = (priority || "medium").toLowerCase();
  if (value === "critical") return "critical";
  if (value === "high") return "high";
  if (value === "low") return "low";
  return "medium";
}

function normalizeStatus(status?: string | null): IncidentStatus {
  const value = (status || "open").toLowerCase();
  if (value === "closed") return "closed";
  if (value === "in_progress") return "in_progress";
  return "open";
}

function priorityLabel(priority?: string | null) {
  return normalizePriority(priority).toUpperCase();
}

function statusLabel(status?: string | null) {
  const value = normalizeStatus(status);
  if (value === "in_progress") return "IN_PROGRESS";
  if (value === "closed") return "CLOSED";
  return "OPEN";
}

function formatDate(value?: string | null) {
  if (!value) return "Non renseigné";
  try {
    return new Date(value).toLocaleString("fr-FR");
  } catch {
    return value;
  }
}

function todayLocalInputValue() {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function findSimilarEmplacements(emplacements: Emplacement[], query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  return emplacements.filter((emplacement) => {
    const candidate = normalizeText(emplacementLabel(emplacement));
    return (
      candidate === normalizedQuery ||
      candidate.includes(normalizedQuery) ||
      normalizedQuery.includes(candidate)
    );
  });
}

function compareIncidents(a: Incident, b: Incident) {
  const statusOrder: Record<IncidentStatus, number> = {
    open: 0,
    in_progress: 1,
    closed: 2,
  };
  const priorityOrder: Record<IncidentPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const statusDiff = statusOrder[normalizeStatus(a.status)] - statusOrder[normalizeStatus(b.status)];
  if (statusDiff !== 0) return statusDiff;

  const priorityDiff =
    priorityOrder[normalizePriority(a.priority)] - priorityOrder[normalizePriority(b.priority)];
  if (priorityDiff !== 0) return priorityDiff;

  return (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || "");
}

function priorityTone(priority?: string | null) {
  const value = normalizePriority(priority);
  if (value === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (value === "high") return "border-orange-200 bg-orange-50 text-orange-700";
  if (value === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function statusTone(status?: string | null) {
  const value = normalizeStatus(status);
  if (value === "closed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "in_progress") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
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

async function uploadIncidentPhoto(file: File, folder: "initial" | "closures") {
  const supabase = getSupabaseBrowserClient();
  const fileToUpload = await convertHeicIfNeeded(file);
  const fileExt = fileToUpload.name.split(".").pop() || "jpg";
  const fileName = `${folder}-${Date.now()}.${fileExt}`;
  const filePath = `${folder}/${fileName}`;

  const uploadResult = await supabase.storage
    .from("incident-photos")
    .upload(filePath, fileToUpload, { upsert: true });

  if (uploadResult.error) {
    throw uploadResult.error;
  }

  const { data } = supabase.storage.from("incident-photos").getPublicUrl(filePath);
  return data.publicUrl;
}

export function TerrainDirectPage({
  initialIncidentId,
}: {
  initialIncidentId?: string;
}) {
  const [terrainStatus, setTerrainStatus] = useState<TerrainStatus>("loading");
  const [screen, setScreen] = useState<TerrainScreen>("home");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [emplacements, setEmplacements] = useState<Emplacement[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [entryKind, setEntryKind] = useState<EntryKind>("incident");
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const [selectedEmplacementId, setSelectedEmplacementId] = useState("");
  const [emplacementSearch, setEmplacementSearch] = useState("");
  const [showCreateEmplacement, setShowCreateEmplacement] = useState(false);
  const [newEmplacementName, setNewEmplacementName] = useState("");
  const [newEmplacementLocation, setNewEmplacementLocation] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftPriority, setDraftPriority] = useState<IncidentPriority>("medium");
  const [draftPhotoFile, setDraftPhotoFile] = useState<File | null>(null);
  const [showNoPhotoDialog, setShowNoPhotoDialog] = useState(false);
  const [followQuery, setFollowQuery] = useState("");
  const [selectedIncidentId, setSelectedIncidentId] = useState("");
  const [followComment, setFollowComment] = useState("");
  const [followPhotoFile, setFollowPhotoFile] = useState<File | null>(null);
  const [showClosureDialog, setShowClosureDialog] = useState(false);
  const [closureName, setClosureName] = useState("");
  const [closureDate, setClosureDate] = useState(todayLocalInputValue());
  const [closureComment, setClosureComment] = useState("");
  const [closurePhotoFile, setClosurePhotoFile] = useState<File | null>(null);
  const [closureError, setClosureError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [hasAppliedInitialIncident, setHasAppliedInitialIncident] = useState(false);

  const loadData = async ({ quiet = false }: { quiet?: boolean } = {}) => {
    if (!quiet) {
      setTerrainStatus("loading");
    }

    try {
      const supabase = getSupabaseBrowserClient();
      const [projectResult, incidentResult] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, site_name, location, status, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("incidents")
          .select(
            "id, project_id, title, description, category, priority, status, initial_photo_url, close_comment, close_photo_url, closed_by_name, created_at, updated_at, closed_at"
          )
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
      ]);

      if (projectResult.error) throw projectResult.error;
      if (incidentResult.error) throw incidentResult.error;

      setEmplacements(mapEmplacements((projectResult.data || []) as Emplacement[]));
      setIncidents((incidentResult.data || []) as Incident[]);
      setTerrainStatus("ready");
    } catch (error) {
      const normalizedError = normalizeSupabaseError(error);
      if (!quiet) {
        setTerrainStatus(normalizedError.kind === "config" ? "config-error" : "backend-unavailable");
      }
      setMessage({
        tone: "error",
        text: getOperationErrorMessage(error),
      });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedEmplacement = useMemo(
    () => emplacements.find((emplacement) => emplacement.id === selectedEmplacementId) || null,
    [emplacements, selectedEmplacementId]
  );

  const filteredEmplacements = useMemo(() => {
    const query = normalizeText(emplacementSearch);
    if (!query) return emplacements;

    return emplacements.filter((emplacement) => {
      const label = normalizeText(emplacementLabel(emplacement));
      const location = normalizeText(emplacement.location || "");
      return label.includes(query) || location.includes(query);
    });
  }, [emplacements, emplacementSearch]);

  const similarEmplacements = useMemo(
    () => findSimilarEmplacements(emplacements, newEmplacementName || emplacementSearch),
    [emplacements, emplacementSearch, newEmplacementName]
  );

  const incidentsWithEmplacement = useMemo(
    () =>
      [...incidents]
        .sort(compareIncidents)
        .map((incident) => ({
          ...incident,
          emplacement:
            emplacements.find((emplacement) => emplacement.id === incident.project_id) || null,
        })),
    [emplacements, incidents]
  );

  const filteredIncidents = useMemo(() => {
    const query = normalizeText(followQuery);
    if (!query) return incidentsWithEmplacement;

    return incidentsWithEmplacement.filter((incident) => {
      const haystack = [
        incidentReference(incident.id),
        incident.title,
        incident.description || "",
        emplacementLabel(incident.emplacement || { id: "", name: "", site_name: "" }),
      ]
        .map((value) => normalizeText(value))
        .join(" ");

      return haystack.includes(query);
    });
  }, [followQuery, incidentsWithEmplacement]);

  const selectedIncident = useMemo(
    () => incidentsWithEmplacement.find((incident) => incident.id === selectedIncidentId) || null,
    [incidentsWithEmplacement, selectedIncidentId]
  );

  useEffect(() => {
    if (!initialIncidentId || hasAppliedInitialIncident || terrainStatus !== "ready") return;

    const targetIncident = incidentsWithEmplacement.find((incident) => incident.id === initialIncidentId);

    if (targetIncident) {
      setSelectedIncidentId(targetIncident.id);
      setScreen("detail");
      setMessage(null);
    } else {
      setScreen("follow");
      setMessage({
        tone: "error",
        text: "Problème introuvable. Recherchez l'incident depuis la liste terrain.",
      });
    }

    setHasAppliedInitialIncident(true);
  }, [hasAppliedInitialIncident, incidentsWithEmplacement, initialIncidentId, terrainStatus]);

  useEffect(() => {
    if (!selectedIncident) return;
    setFollowComment("");
    setFollowPhotoFile(null);
    setClosureName(selectedIncident.closed_by_name || "");
    setClosureDate(
      selectedIncident.closed_at
        ? new Date(new Date(selectedIncident.closed_at).getTime() - new Date().getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16)
        : todayLocalInputValue()
    );
    setClosureComment(selectedIncident.close_comment || "");
    setClosurePhotoFile(null);
    setClosureError("");
  }, [selectedIncident]);

  const goHome = () => {
    setScreen("home");
    setCreateStep(1);
    setSelectedIncidentId("");
    setShowNoPhotoDialog(false);
    setShowClosureDialog(false);
  };

  const resetCreateFlow = (kind: EntryKind) => {
    setEntryKind(kind);
    setCreateStep(1);
    setSelectedEmplacementId("");
    setEmplacementSearch("");
    setShowCreateEmplacement(false);
    setNewEmplacementName("");
    setNewEmplacementLocation("");
    setDraftTitle("");
    setDraftDescription("");
    setDraftPriority("medium");
    setDraftPhotoFile(null);
    setScreen("create");
    setMessage(null);
  };

  const createEmplacement = async () => {
    const trimmedName = newEmplacementName.trim();
    if (!trimmedName) {
      setMessage({ tone: "error", text: "Le nom de l'emplacement est obligatoire." });
      return;
    }

    const exactMatch = emplacements.find(
      (emplacement) => normalizeText(emplacementLabel(emplacement)) === normalizeText(trimmedName)
    );

    if (exactMatch) {
      setMessage({
        tone: "error",
        text: "Emplacement similaire existant. Sélectionnez-le dans la liste.",
      });
      setSelectedEmplacementId(exactMatch.id);
      setShowCreateEmplacement(false);
      return;
    }

    setIsBusy(true);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from("projects").insert({
        name: trimmedName,
        site_name: trimmedName,
        client_name: "Client non renseigné",
        location: newEmplacementLocation.trim() || null,
        status: "active",
      });

      if (error) throw error;

      const { data: refreshedProjects, error: refreshError } = await supabase
        .from("projects")
        .select("id, name, site_name, location, status, created_at")
        .order("created_at", { ascending: false });

      if (refreshError) throw refreshError;

      const mappedProjects = mapEmplacements((refreshedProjects || []) as Emplacement[]);
      const createdEmplacement =
        mappedProjects.find(
          (emplacement) =>
            normalizeText(emplacementLabel(emplacement)) === normalizeText(trimmedName)
        ) || null;

      setEmplacements(mappedProjects);
      setSelectedEmplacementId(createdEmplacement?.id || "");
      setShowCreateEmplacement(false);
      setNewEmplacementName("");
      setNewEmplacementLocation("");
      setMessage({ tone: "success", text: "Emplacement cree." });
      setCreateStep(2);
    } catch (error) {
      setMessage({
        tone: "error",
        text: getOperationErrorMessage(error),
      });
    } finally {
      setIsBusy(false);
    }
  };

  const validateCreateStepTwo = () => {
    if (!selectedEmplacementId) {
      setMessage({ tone: "error", text: "Choisissez un emplacement avant de continuer." });
      setCreateStep(1);
      return false;
    }
    if (!draftTitle.trim() || !draftDescription.trim()) {
      setMessage({
        tone: "error",
        text: "Le titre court et la description sont obligatoires.",
      });
      return false;
    }
    return true;
  };

  const submitEntry = async () => {
    if (!selectedEmplacement || !validateCreateStepTwo()) {
      return;
    }

    setIsBusy(true);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const payload: Record<string, unknown> = {
        project_id: selectedEmplacement.id,
        title: draftTitle.trim(),
        description: draftDescription.trim(),
        category: entryKind === "incident" ? "incident" : "non_conformite",
        priority: draftPriority,
        status: "open",
        location: selectedEmplacement.location || emplacementLabel(selectedEmplacement),
        updated_at: new Date().toISOString(),
      };

      if (draftPhotoFile) {
        payload.initial_photo_url = await uploadIncidentPhoto(draftPhotoFile, "initial");
      }

      const { error } = await supabase.from("incidents").insert(payload);
      if (error) throw error;

      await loadData({ quiet: true });
      goHome();
      setMessage({
        tone: "success",
        text: entryKind === "incident" ? "Incident enregistré." : "Non-conformité enregistrée.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: getOperationErrorMessage(error),
      });
    } finally {
      setIsBusy(false);
      setShowNoPhotoDialog(false);
    }
  };

  const saveFollowUpdate = async () => {
    if (!selectedIncident) return;
    if (!followComment.trim() && !followPhotoFile) {
      setMessage({ tone: "error", text: "Ajoutez un commentaire ou une photo avant d'enregistrer." });
      return;
    }

    setIsBusy(true);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const now = new Date().toLocaleString("fr-FR");
      const appendedDescription = followComment.trim()
        ? [selectedIncident.description || "", `Suivi terrain (${now}) : ${followComment.trim()}`]
            .filter(Boolean)
            .join("\n\n")
        : selectedIncident.description || null;

      const payload: Record<string, unknown> = {
        description: appendedDescription,
        updated_at: new Date().toISOString(),
      };

      if (followPhotoFile) {
        const targetField = selectedIncident.initial_photo_url ? "close_photo_url" : "initial_photo_url";
        payload[targetField] = await uploadIncidentPhoto(
          followPhotoFile,
          targetField === "initial_photo_url" ? "initial" : "closures"
        );
      }

      const { error } = await supabase.from("incidents").update(payload).eq("id", selectedIncident.id);
      if (error) throw error;

      await loadData({ quiet: true });
      setFollowComment("");
      setFollowPhotoFile(null);
      setMessage({ tone: "success", text: "Mise à jour terrain enregistrée." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: getOperationErrorMessage(error),
      });
    } finally {
      setIsBusy(false);
    }
  };

  const updateIncidentStatus = async (incidentId: string, nextStatus: IncidentStatus) => {
    setIsBusy(true);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase
        .from("incidents")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
          ...(nextStatus !== "closed"
            ? {
                close_comment: null,
                close_photo_url: null,
                closed_by_name: null,
                closed_at: null,
              }
            : {}),
        })
        .eq("id", incidentId);

      if (error) throw error;

      await loadData({ quiet: true });
      setMessage({ tone: "success", text: `Statut mis a jour en ${statusLabel(nextStatus)}.` });
    } catch (error) {
      setMessage({
        tone: "error",
        text: getOperationErrorMessage(error),
      });
    } finally {
      setIsBusy(false);
    }
  };

  const closeIncident = async () => {
    if (!selectedIncident) return;

    if (!closureName.trim() || !closureDate.trim() || !closureComment.trim()) {
      setClosureError(
        "Pour clôturer, vous devez renseigner :\n- le nom\n- la date\n- un commentaire"
      );
      return;
    }

    setIsBusy(true);
    setClosureError("");
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const payload: Record<string, unknown> = {
        status: "closed",
        closed_by_name: closureName.trim(),
        closed_at: new Date(closureDate).toISOString(),
        close_comment: closureComment.trim(),
        updated_at: new Date().toISOString(),
      };

      if (closurePhotoFile) {
        payload.close_photo_url = await uploadIncidentPhoto(closurePhotoFile, "closures");
      }

      const { error } = await supabase.from("incidents").update(payload).eq("id", selectedIncident.id);
      if (error) throw error;

      await loadData({ quiet: true });
      setShowClosureDialog(false);
      setMessage({ tone: "success", text: "Incident clôturé." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: getOperationErrorMessage(error),
      });
    } finally {
      setIsBusy(false);
    }
  };

  if (terrainStatus !== "ready") {
    return (
      <TerrainStatusScreen
        status={terrainStatus}
        errorText={message?.tone === "error" ? message.text : ""}
        onRetry={() => loadData()}
      />
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#eef4f8_0%,#f8fafc_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6 sm:px-5">
        {message ? (
          <div
            className={`mb-4 rounded-[24px] border px-4 py-3 text-sm ${
              message.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        {screen === "home" ? (
          <HomeScreen
            onCreateIncident={() => resetCreateFlow("incident")}
            onCreateNonConformity={() => resetCreateFlow("non_conformite")}
            onFollow={() => {
              setFollowQuery("");
              setScreen("follow");
              setMessage(null);
            }}
          />
        ) : null}

        {screen === "create" ? (
          <section className="space-y-4">
            <BackButton onClick={goHome} label="Retour accueil" />

            {createStep === 1 ? (
              <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                <h2 className="text-2xl font-bold text-slate-900">Emplacement du problème</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Choisissez un emplacement existant ou créez-en un nouveau sans doublon.
                </p>

                <input
                  value={emplacementSearch}
                  onChange={(event) => setEmplacementSearch(event.target.value)}
                  placeholder="Rechercher un emplacement"
                  className="mt-4 w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-base text-slate-900 outline-none focus:border-sky-300 focus:bg-white"
                />

                {similarEmplacements.length > 0 ? (
                  <div className="mt-3 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Emplacement similaire existant.
                  </div>
                ) : null}

                <div className="mt-4 space-y-3">
                  {filteredEmplacements.map((emplacement) => (
                    <button
                      key={emplacement.id}
                      type="button"
                      onClick={() => setSelectedEmplacementId(emplacement.id)}
                      className={`w-full rounded-[24px] border px-4 py-4 text-left ${
                        selectedEmplacementId === emplacement.id
                          ? "border-sky-300 bg-sky-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="text-base font-semibold text-slate-900">
                        {emplacementLabel(emplacement)}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {emplacement.location || "Localisation à préciser"}
                      </div>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowCreateEmplacement((current) => !current)}
                  className="mt-4 w-full rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-base font-semibold text-slate-900"
                >
                  Créer un emplacement
                </button>

                {showCreateEmplacement ? (
                  <div className="mt-4 space-y-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                    <input
                      value={newEmplacementName}
                      onChange={(event) => setNewEmplacementName(event.target.value)}
                      placeholder="Nom de l'emplacement"
                      className="w-full rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-base text-slate-900 outline-none"
                    />
                    <input
                      value={newEmplacementLocation}
                      onChange={(event) => setNewEmplacementLocation(event.target.value)}
                      placeholder="Localisation"
                      className="w-full rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-base text-slate-900 outline-none"
                    />
                    {similarEmplacements.length > 0 ? (
                      <div className="space-y-2 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        <div className="font-semibold">Emplacement similaire existant</div>
                        {similarEmplacements.slice(0, 3).map((emplacement) => (
                          <button
                            key={emplacement.id}
                            type="button"
                            onClick={() => {
                              setSelectedEmplacementId(emplacement.id);
                              setShowCreateEmplacement(false);
                            }}
                            className="block text-left font-medium underline"
                          >
                            {emplacementLabel(emplacement)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <PrimaryButton onClick={createEmplacement} disabled={isBusy}>
                      {isBusy ? "Création..." : "Valider l'emplacement"}
                    </PrimaryButton>
                  </div>
                ) : null}

                <PrimaryButton
                  onClick={() => {
                    if (!selectedEmplacementId) {
                      setMessage({ tone: "error", text: "Choisissez un emplacement avant de continuer." });
                      return;
                    }
                    setCreateStep(2);
                    setMessage(null);
                  }}
                  className="mt-4"
                >
                  Continuer
                </PrimaryButton>
              </section>
            ) : null}

            {createStep === 2 ? (
              <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                <h2 className="text-2xl font-bold text-slate-900">Saisie rapide</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Renseignez uniquement l'essentiel pour enregistrer vite.
                </p>

                <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Emplacement : <span className="font-semibold">{emplacementLabel(selectedEmplacement!)}</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <ChoiceButton
                    selected={entryKind === "incident"}
                    onClick={() => setEntryKind("incident")}
                    label="Incident"
                  />
                  <ChoiceButton
                    selected={entryKind === "non_conformite"}
                    onClick={() => setEntryKind("non_conformite")}
                    label="Non-conformité"
                  />
                </div>

                <input
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  placeholder="Titre court"
                  className="mt-4 w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-base text-slate-900 outline-none focus:border-sky-300 focus:bg-white"
                />

                <textarea
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  placeholder="Description"
                  className="mt-4 min-h-[140px] w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-base text-slate-900 outline-none focus:border-sky-300 focus:bg-white"
                />

                <div className="mt-4 space-y-3">
                  <div className="text-sm font-semibold text-slate-700">Criticité</div>
                  <div className="grid grid-cols-2 gap-3">
                    {(["critical", "high", "medium", "low"] as IncidentPriority[]).map((priority) => (
                      <ChoiceButton
                        key={priority}
                        selected={draftPriority === priority}
                        onClick={() => setDraftPriority(priority)}
                        label={priority.toUpperCase()}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <SecondaryButton onClick={() => setCreateStep(1)}>Retour</SecondaryButton>
                  <PrimaryButton
                    onClick={() => {
                      if (!validateCreateStepTwo()) {
                        return;
                      }
                      setCreateStep(3);
                      setMessage(null);
                    }}
                  >
                    Continuer
                  </PrimaryButton>
                </div>
              </section>
            ) : null}

            {createStep === 3 ? (
              <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                <h2 className="text-2xl font-bold text-slate-900">Ajouter une photo</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  La photo est optionnelle, mais fortement recommandée.
                </p>

                <label className="mt-4 block rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-base font-semibold text-slate-900">
                  Ajouter une photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => setDraftPhotoFile(event.target.files?.[0] || null)}
                  />
                </label>

                {draftPhotoFile ? (
                  <div className="mt-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    Photo sélectionnée : {draftPhotoFile.name}
                  </div>
                ) : null}

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <SecondaryButton onClick={() => setCreateStep(2)}>Retour</SecondaryButton>
                  <PrimaryButton
                    onClick={() => {
                      if (!draftPhotoFile) {
                        setShowNoPhotoDialog(true);
                        return;
                      }
                      submitEntry();
                    }}
                    disabled={isBusy}
                  >
                    {isBusy ? "Enregistrement..." : "Valider"}
                  </PrimaryButton>
                </div>
              </section>
            ) : null}
          </section>
        ) : null}

        {screen === "follow" ? (
          <section className="space-y-4">
            <BackButton onClick={goHome} label="Retour accueil" />

            <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <h2 className="text-2xl font-bold text-slate-900">Suivre / Clôturer</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Recherchez un numéro ou un texte, puis ouvrez le dossier incident.
              </p>

              <input
                value={followQuery}
                onChange={(event) => setFollowQuery(event.target.value)}
                placeholder="Numéro ou texte"
                className="mt-4 w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-base text-slate-900 outline-none focus:border-sky-300 focus:bg-white"
              />

              <div className="mt-4 space-y-3">
                {filteredIncidents.length === 0 ? (
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    Aucun incident trouvé.
                  </div>
                ) : (
                  filteredIncidents.map((incident) => (
                    <button
                      key={incident.id}
                      type="button"
                      onClick={() => {
                        setSelectedIncidentId(incident.id);
                        setScreen("detail");
                        setMessage(null);
                      }}
                      className="w-full rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-slate-900">{incident.title}</div>
                          <div className="mt-1 text-sm text-slate-600">
                            {emplacementLabel(incident.emplacement || { id: "", name: "", site_name: "" })}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                            {incidentReference(incident.id)}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(incident.status)}`}
                          >
                            {statusLabel(incident.status)}
                          </span>
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityTone(incident.priority)}`}
                          >
                            {priorityLabel(incident.priority)}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          </section>
        ) : null}

        {screen === "detail" && selectedIncident ? (
          <section className="space-y-4">
            <BackButton
              onClick={() => {
                setScreen("follow");
                setShowClosureDialog(false);
              }}
              label="Retour à la liste"
            />

            <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{selectedIncident.title}</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {emplacementLabel(selectedIncident.emplacement || { id: "", name: "", site_name: "" })}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                    {incidentReference(selectedIncident.id)}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(selectedIncident.status)}`}
                  >
                    {statusLabel(selectedIncident.status)}
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityTone(selectedIncident.priority)}`}
                  >
                    {priorityLabel(selectedIncident.priority)}
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                {selectedIncident.description || "Aucune description."}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <InfoTile label="Statut" value={statusLabel(selectedIncident.status)} />
                <InfoTile label="Créé le" value={formatDate(selectedIncident.created_at)} />
                <InfoTile label="Mis à jour" value={formatDate(selectedIncident.updated_at || selectedIncident.created_at)} />
                <InfoTile label="Clôturé le" value={formatDate(selectedIncident.closed_at)} />
              </div>

              {selectedIncident.initial_photo_url ? (
                <div className="mt-4">
                  <div className="mb-2 text-sm font-semibold text-slate-700">Photo initiale</div>
                  <img
                    src={selectedIncident.initial_photo_url}
                    alt="Photo initiale"
                    className="w-full rounded-[24px] border border-slate-200 object-cover"
                  />
                </div>
              ) : null}

              {selectedIncident.close_photo_url ? (
                <div className="mt-4">
                  <div className="mb-2 text-sm font-semibold text-slate-700">
                    {normalizeStatus(selectedIncident.status) === "closed"
                      ? "Photo de clôture"
                      : "Photo de suivi"}
                  </div>
                  <img
                    src={selectedIncident.close_photo_url}
                    alt="Photo de suivi"
                    className="w-full rounded-[24px] border border-slate-200 object-cover"
                  />
                </div>
              ) : null}

              <textarea
                value={followComment}
                onChange={(event) => setFollowComment(event.target.value)}
                placeholder="Ajouter un commentaire"
                className="mt-4 min-h-[120px] w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-base text-slate-900 outline-none focus:border-sky-300 focus:bg-white"
              />

              <label className="mt-4 block rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-base font-semibold text-slate-900">
                Ajouter une photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => setFollowPhotoFile(event.target.files?.[0] || null)}
                />
              </label>

              {followPhotoFile ? (
                <div className="mt-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Photo sélectionnée : {followPhotoFile.name}
                </div>
              ) : null}

              <div className="mt-5 space-y-3">
                <PrimaryButton onClick={saveFollowUpdate} disabled={isBusy}>
                  {isBusy ? "Enregistrement..." : "Enregistrer les modifications"}
                </PrimaryButton>

                {normalizeStatus(selectedIncident.status) === "open" ? (
                  <SecondaryButton
                    onClick={() => updateIncidentStatus(selectedIncident.id, "in_progress")}
                    disabled={isBusy}
                  >
                    Passer en suivi
                  </SecondaryButton>
                ) : null}

                {normalizeStatus(selectedIncident.status) === "in_progress" ? (
                  <SecondaryButton
                    onClick={() => updateIncidentStatus(selectedIncident.id, "open")}
                    disabled={isBusy}
                  >
                    Revenir à OPEN
                  </SecondaryButton>
                ) : null}

                {normalizeStatus(selectedIncident.status) === "closed" ? (
                  <SecondaryButton
                    onClick={() => updateIncidentStatus(selectedIncident.id, "open")}
                    disabled={isBusy}
                  >
                    Rouvrir
                  </SecondaryButton>
                ) : null}

                {normalizeStatus(selectedIncident.status) !== "closed" ? (
                  <PrimaryButton
                    onClick={() => {
                      setShowClosureDialog(true);
                      setClosureError("");
                    }}
                    disabled={isBusy}
                  >
                    Clôturer
                  </PrimaryButton>
                ) : null}
              </div>
            </section>
          </section>
        ) : null}
      </div>

      {showNoPhotoDialog ? (
        <ModalShell>
          <h3 className="text-xl font-bold text-slate-900">Vous enregistrez sans preuve photo.</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Souhaitez-vous continuer ou ajouter une photo ? Nous recommandons d'ajouter une photo.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <SecondaryButton onClick={() => setShowNoPhotoDialog(false)}>Ajouter photo</SecondaryButton>
            <PrimaryButton onClick={submitEntry} disabled={isBusy}>
              Continuer
            </PrimaryButton>
          </div>
        </ModalShell>
      ) : null}

      {showClosureDialog && selectedIncident ? (
        <ModalShell>
          <h3 className="text-xl font-bold text-slate-900">Clôturer l'incident</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            La clôture terrain exige un nom, une date et un commentaire non vide.
          </p>

          {closureError ? (
            <div className="mt-4 whitespace-pre-line rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {closureError}
            </div>
          ) : null}

          <input
            value={closureName}
            onChange={(event) => setClosureName(event.target.value)}
            placeholder="Nom de la personne"
            className="mt-4 w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-base text-slate-900 outline-none"
          />
          <input
            type="datetime-local"
            value={closureDate}
            onChange={(event) => setClosureDate(event.target.value)}
            className="mt-3 w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-base text-slate-900 outline-none"
          />
          <textarea
            value={closureComment}
            onChange={(event) => setClosureComment(event.target.value)}
            placeholder="Commentaire de clôture"
            className="mt-3 min-h-[120px] w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-base text-slate-900 outline-none"
          />
          <label className="mt-3 block rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-base font-semibold text-slate-900">
            Ajouter une photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => setClosurePhotoFile(event.target.files?.[0] || null)}
            />
          </label>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <SecondaryButton onClick={() => setShowClosureDialog(false)}>Annuler</SecondaryButton>
            <PrimaryButton onClick={closeIncident} disabled={isBusy}>
              Valider la clôture
            </PrimaryButton>
          </div>
        </ModalShell>
      ) : null}
    </main>
  );
}

function HomeScreen({
  onCreateIncident,
  onCreateNonConformity,
  onFollow,
}: {
  onCreateIncident: () => void;
  onCreateNonConformity: () => void;
  onFollow: () => void;
}) {
  return (
    <section className="flex flex-1 flex-col justify-center">
      <div className="rounded-[32px] bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <h1 className="text-4xl font-black tracking-tight text-slate-950">Field Trace</h1>
        <p className="mt-3 text-lg font-medium text-slate-700">Suivi des problèmes opérationnels</p>

        <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <p>
            <span className="font-semibold text-slate-900">Non-conformité</span> = écart au standard
            (qualité, norme, procédure)
          </p>
          <p className="mt-3">
            <span className="font-semibold text-slate-900">Incident</span> = événement à risque
            (sécurité, dérive, accident)
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <PrimaryButton onClick={onCreateIncident}>⚠️ Créer un incident</PrimaryButton>
          <PrimaryButton onClick={onCreateNonConformity}>📏 Créer une non-conformité</PrimaryButton>
          <SecondaryButton onClick={onFollow}>🔎 Suivre / Clôturer</SecondaryButton>
        </div>
      </div>
    </section>
  );
}

function TerrainStatusScreen({
  status,
  errorText,
  onRetry,
}: {
  status: TerrainStatus;
  errorText: string;
  onRetry: () => void;
}) {
  const title =
    status === "loading"
      ? "Chargement du mode terrain"
      : status === "config-error"
        ? "Erreur de configuration"
        : "Backend indisponible";

  const body =
    status === "loading"
      ? "Préparation du mode terrain..."
      : errorText ||
        (status === "config-error"
          ? "Vérifiez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY."
          : "Impossible de charger les données terrain pour le moment.");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#eef4f8_0%,#f8fafc_100%)] px-4">
      <section className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <h1 className="text-3xl font-black tracking-tight text-slate-950">Field Trace</h1>
        <h2 className="mt-4 text-xl font-bold text-slate-900">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
        {status !== "loading" ? (
          <PrimaryButton onClick={onRetry} className="mt-5">
            Reessayer
          </PrimaryButton>
        ) : null}
      </section>
    </main>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
    >
      {label}
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-[24px] bg-slate-950 px-5 py-5 text-base font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.18)] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-[24px] border border-slate-200 bg-white px-5 py-5 text-base font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function ChoiceButton({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[20px] border px-4 py-4 text-base font-semibold ${
        selected ? "border-sky-300 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-900"
      }`}
    >
      {label}
    </button>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function ModalShell({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.22)]">
        {children}
      </div>
    </div>
  );
}


