"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function formatDateTime(date: Date) {
  return {
    dateLabel: new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Paris",
    }).format(date),
    timeLabel: new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Europe/Paris",
    }).format(date),
  };
}

function getPageLabel(pathname: string) {
  if (pathname === "/") {
    return "Accueil";
  }

  if (pathname.startsWith("/boss")) {
    return "Mode bureau";
  }

  if (pathname.startsWith("/operation/")) {
    return "Opération terrain";
  }

  if (pathname.startsWith("/project/")) {
    return "Projet terrain";
  }

  if (pathname.startsWith("/projects/")) {
    return "Accès projet";
  }

  return "SiteTrace";
}

export function AppStatusBar() {
  const pathname = usePathname();
  const [now, setNow] = useState<ReturnType<typeof formatDateTime> | null>(null);

  useEffect(() => {
    setNow(formatDateTime(new Date()));

    const intervalId = window.setInterval(() => {
      setNow(formatDateTime(new Date()));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const pageLabel = getPageLabel(pathname);
  const mainTitle =
    pathname.startsWith("/boss")
      ? "Pilotage Bureau"
      : pathname === "/" || pathname.startsWith("/operation/")
        ? "Pilotage Terrain"
        : pageLabel;

  if (pathname === "/") {
    return null;
  }

  return (
    <div className="sticky top-0 z-50 bg-[#0b1220]/92 px-3 py-4 shadow-[0_14px_40px_rgba(2,6,23,0.45)] backdrop-blur-xl sm:px-4 md:px-5 lg:px-6 xl:px-8">
      <div className="mx-auto w-full max-w-[2160px] rounded-[28px] border border-white/10 bg-[#111827]/92 px-5 py-4 shadow-[0_10px_30px_rgba(2,6,23,0.35)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <Link
              href="/"
              className="text-xs uppercase tracking-[0.25em] text-sky-300 transition hover:text-sky-200"
            >
              SiteTrace Board V1
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-slate-50">{mainTitle}</h1>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-400">
              <span>{pathname.startsWith("/boss") ? "Mode : bureau" : "Mode : terrain"}</span>
              <span>{pathname.startsWith("/boss") ? "Usage : pilotage et portefeuille" : "Usage : incidents et preuves"}</span>
              <span>{`Page : ${pageLabel}`}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0b1220]/55 px-4 py-3 text-right">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Page active</div>
            <div className="mt-1 text-base font-semibold text-slate-50">{pageLabel}</div>
            <div className="mt-3 min-h-[20px] text-sm capitalize text-slate-400">
              {now?.dateLabel || "Chargement de la date..."}
            </div>
            <div className="mt-1 min-h-[28px] text-lg font-semibold text-slate-50">
              {now?.timeLabel || "--:--:--"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

