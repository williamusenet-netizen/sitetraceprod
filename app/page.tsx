"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { generateProjectReportPdf } from "@/lib/pdf";

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
  display_name: string;
  client_name: string | null;
  location: string | null;
  status: string | null;
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
  reporter_name?: string | null;
  initial_photo_url?: string | null;
  created_at?: string | null;
};

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg("");

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("id, name, site_name, client_name, location, status, created_at")
      .order("created_at", { ascending: false });

    if (projectError) {
      setProjects([]);
      setErrorMsg(`Chargement projets impossible : ${projectError.message}`);
    } else {
      const mapped = ((projectData || []) as RawProject[]).map((project) => ({
        id: project.id,
        display_name: project.site_name || project.name || "Projet sans nom",
        client_name: project.client_name || null,
        location: project.location || null,
        status: project.status || "active",
        created_at: project.created_at || null,
      }));
      setProjects(mapped);
    }

    const { data: incidentData, error: incidentError } = await supabase
      .from("incidents")
      .select(
        "id, project_id, title, description, category, priority, status, reporter_name, initial_photo_url, created_at"
      )
      .order("created_at", { ascending: false });

    if (incidentError) {
      setIncidents([]);
      if (!projectError) {
        setErrorMsg(`Chargement incidents impossible : ${incidentError.message}`);
      }
    } else {
      setIncidents((incidentData || []) as Incident[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const createProject = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    if (!name.trim()) {
      setErrorMsg("Le nom du projet est obligatoire.");
      return;
    }

    setSaving(true);
    const projectName = name.trim();

    const { error } = await supabase.from("projects").insert({
      name: projectName,
      site_name: projectName,
      client_name: clientName.trim() || null,
      location: location.trim() || null,
      status: "active",
    });

    setSaving(false);

    if (error) {
      if (error.message.toLowerCase().includes("duplicate")) {
        setErrorMsg("Un projet avec ce nom existe déjà.");
      } else {
        setErrorMsg(error.message);
      }
      return;
    }

    setName("");
    setClientName("");
    setLocation("");
    setSuccessMsg("Projet créé avec succès.");
    loadData();
  };

  const stats = useMemo(() => {
    const openIncidents = incidents.filter((i) => (i.status || "open") !== "closed");
    const closedIncidents = incidents.filter((i) => (i.status || "open") === "closed");
    const activePriorityIncidents = incidents.filter((i) => (i.status || "open") !== "closed");
    const criticalIncidents = activePriorityIncidents.filter(
      (i) => (i.priority || "").toLowerCase() === "critical"
    );

    return {
      openIncidents: openIncidents.length,
      closedIncidents: closedIncidents.length,
      criticalIncidents: criticalIncidents.length,
      totalIncidents: incidents.length,
      byPriority: {
        critical: activePriorityIncidents.filter((i) => (i.priority || "").toLowerCase() === "critical").length,
        high: activePriorityIncidents.filter((i) => (i.priority || "").toLowerCase() === "high").length,
        medium: activePriorityIncidents.filter((i) => (i.priority || "").toLowerCase() === "medium").length,
        low: activePriorityIncidents.filter((i) => (i.priority || "").toLowerCase() === "low").length,
      },
    };
  }, [incidents]);

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
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
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-300">
                    terrain intelligence platform
                  </p>
                  <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
                    FieldTrace
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-300 md:text-base">
                    Plateforme terrain pour piloter les incidents, formaliser les réserves,
                    sécuriser la traçabilité photo et générer des livrables PDF professionnels
                    prêts à transmission client.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[460px]">
                <MiniHeroCard label="Mobile" value="Tablet / Phone" />
                <MiniHeroCard label="Pilotage" value="Incidents" />
                <MiniHeroCard label="Livrables" value="PDF client" />
                <MiniHeroCard label="Usage" value="Terrain" />
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

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard title="Projets" value={projects.length} subtitle="Portefeuille actif" valueClassName="text-slate-900" />
            <StatCard title="Incidents ouverts" value={stats.openIncidents} subtitle="Suivi terrain" valueClassName="text-slate-900" />
            <StatCard title="Incidents clôturés" value={stats.closedIncidents} subtitle="Actions finalisées" valueClassName="text-emerald-700" />
            <StatCard title="Incidents critiques" value={stats.criticalIncidents} subtitle="Arbitrage immédiat" valueClassName="text-red-700" />
            <StatCard title="Total incidents" value={stats.totalIncidents} subtitle="Vision consolidée" valueClassName="text-slate-900" />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    onboarding projet
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900">
                    Créer un nouveau projet
                  </h2>
                  <p className="mt-1 text-slate-600">
                    Crée un projet terrain en moins de 30 secondes depuis PC, tablette ou téléphone.
                  </p>
                </div>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  V3 pilot
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <input
                  className="rounded-2xl border border-slate-300 bg-white p-3 text-black placeholder-gray-400 outline-none transition focus:border-slate-500"
                  placeholder="Nom du projet"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className="rounded-2xl border border-slate-300 bg-white p-3 text-black placeholder-gray-400 outline-none transition focus:border-slate-500"
                  placeholder="Client"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
                <input
                  className="rounded-2xl border border-slate-300 bg-white p-3 text-black placeholder-gray-400 outline-none transition focus:border-slate-500"
                  placeholder="Localisation"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>

              <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                <button
                  onClick={createProject}
                  disabled={saving}
                  className="rounded-2xl bg-slate-900 px-6 py-3 text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {saving ? "Création..." : "Créer le projet"}
                </button>

                <p className="text-sm text-slate-500">
                  Le projet sera immédiatement disponible pour le suivi incidents et les rapports.
                </p>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                priorités actives
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                Tableau de bord terrain
              </h2>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <PriorityCard label="CRITIQUE" value={stats.byPriority.critical} valueClassName="text-red-700" />
                <PriorityCard label="HIGH" value={stats.byPriority.high} valueClassName="text-orange-600" />
                <PriorityCard label="MEDIUM" value={stats.byPriority.medium} valueClassName="text-amber-600" />
                <PriorityCard label="LOW" value={stats.byPriority.low} valueClassName="text-emerald-700" />
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                Les incidents clôturés sont exclus du calcul des priorités pour garder une lecture
                opérationnelle réaliste du portefeuille en cours.
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  portefeuille projets
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">Projets</h2>
                <p className="mt-1 text-slate-600">
                  Ouvre un projet pour gérer les incidents, générer des claims unitaires et préparer les livrables client.
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {projects.length} projet(s)
              </span>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-slate-600">
                Chargement...
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-slate-600">
                Aucun projet trouvé. Crée ton premier projet ci-dessus.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {projects.map((project) => {
                  const projectIncidents = incidents.filter((i) => i.project_id === project.id);
                  const projectOpen = projectIncidents.filter((i) => (i.status || "open") !== "closed").length;
                  const projectClosed = projectIncidents.filter((i) => (i.status || "open") === "closed").length;

                  return (
                    <div
                      key={project.id}
                      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-semibold text-slate-900">{project.display_name}</h3>
                          <div className="mt-2 space-y-1 text-sm text-slate-600">
                            <p>Client : {project.client_name || "N/A"}</p>
                            <p>Localisation : {project.location || "N/A"}</p>
                            <p>Statut : {project.status || "N/A"}</p>
                          </div>
                        </div>

                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          {project.status || "active"}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-3">
                        <InfoPill label="Total" value={projectIncidents.length} />
                        <InfoPill label="Ouverts" value={projectOpen} />
                        <InfoPill label="Clôturés" value={projectClosed} />
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            window.location.href = `/project/${project.id}`;
                          }}
                          className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white"
                        >
                          Ouvrir le projet
                        </button>

                        <button
                          onClick={() =>
                            generateProjectReportPdf(
                              {
                                id: project.id,
                                site_name: project.display_name,
                                client_name: project.client_name,
                                location: project.location,
                                status: project.status,
                              },
                              projectIncidents
                            )
                          }
                          className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-800"
                        >
                          Rapport PDF
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <footer className="pb-2 text-center text-[10px] leading-4 text-slate-400">
            © {new Date().getFullYear()} FieldTrace. Concept, structure fonctionnelle, interface et logique applicative réservés.
            Toute reproduction, adaptation ou exploitation non autorisée est interdite.
          </footer>
        </div>
      </div>
    </main>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  valueClassName,
}: {
  title: string;
  value: number;
  subtitle: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <p className={`mt-3 text-5xl font-bold ${valueClassName || "text-slate-900"}`}>{value}</p>
      <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function PriorityCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-4xl font-bold ${valueClassName || "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function MiniHeroCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}