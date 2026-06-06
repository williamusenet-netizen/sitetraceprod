import jsPDF from "jspdf";
import { labelIncidentEventAction, labelIncidentEventSource } from "@/lib/incident-event-labels";

type ProjectLike = {
  id: string;
  name?: string | null;
  site_name?: string | null;
  client_name?: string | null;
  location?: string | null;
  status?: string | null;
};

type IncidentLike = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: string | null;
  status?: string | null;
  reporter_name?: string | null;
  location?: string | null;
  initial_photo_url?: string | null;
  close_comment?: string | null;
  close_photo_url?: string | null;
  closed_by_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  closed_at?: string | null;
};

type PdfIncidentEvent = {
  action?: string | null;
  actor_label?: string | null;
  actor_role?: string | null;
  source?: string | null;
  summary?: string | null;
  created_at?: string | null;
};

const VEOLIA_LOGO_PATH = "/brands/veolia-soredi.png";

function projectName(project: ProjectLike) {
  return project.site_name || project.name || "Projet";
}

function formatDate(value?: string | null) {
  if (!value) return "Non renseigné";
  try {
    return new Date(value).toLocaleString("fr-FR");
  } catch {
    return value;
  }
}

function addHeader(doc: jsPDF, title: string, subtitle: string) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("FieldTrace", 14, 12);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(subtitle, 14, 20);

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, 14, 40);
}

function addWrappedText(doc: jsPDF, text: string, x: number, y: number, width: number) {
  const lines = doc.splitTextToSize(text || "", width);
  doc.text(lines, x, y);
  return y + lines.length * 5.5;
}

async function imageUrlToPngDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    return await new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(blob);
      const img = new window.Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            URL.revokeObjectURL(objectUrl);
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0);
          const data = canvas.toDataURL("image/png");
          URL.revokeObjectURL(objectUrl);
          resolve(data);
        } catch {
          URL.revokeObjectURL(objectUrl);
          resolve(null);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      };

      img.src = objectUrl;
    });
  } catch {
    return null;
  }
}

async function addVeoliaBrandLogo(doc: jsPDF) {
  const logoDataUrl = await imageUrlToPngDataUrl(VEOLIA_LOGO_PATH);
  if (!logoDataUrl) return;

  try {
    doc.addImage(logoDataUrl, "PNG", 154, 8, 42, 12);
  } catch {
    // Keep the report readable if the client logo cannot be embedded.
  }
}

function fitRect(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
) {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: width * ratio,
    height: height * ratio,
  };
}

async function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number } | null> {
  return await new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function generateProjectReportPdf(
  project: ProjectLike,
  incidents: IncidentLike[],
  eventsByIncident: Record<string, PdfIncidentEvent[]> = {}
) {
  const doc = new jsPDF();
  const name = projectName(project);

  addHeader(
    doc,
    "Rapport projet",
    "Pilotage terrain, incidents, priorités et suivi projet"
  );
  await addVeoliaBrandLogo(doc);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Projet : ${name}`, 14, 52);
  doc.text(`Client : ${project.client_name || "Non renseigné"}`, 14, 60);
  doc.text(`Localisation : ${project.location || "Non renseigné"}`, 14, 68);
  doc.text(`Statut : ${project.status || "Non renseigné"}`, 14, 76);
  doc.text(`Date d'édition : ${new Date().toLocaleString("fr-FR")}`, 14, 84);

  const openCount = incidents.filter((i) => (i.status || "open") !== "closed").length;
  const closedCount = incidents.filter((i) => (i.status || "open") === "closed").length;
  const criticalCount = incidents.filter((i) => (i.priority || "").toLowerCase() === "critical").length;
  const projectEvents = Object.values(eventsByIncident).flat();
  const terrainEventCount = projectEvents.filter((event) => event.source === "terrain").length;
  const bossEventCount = projectEvents.filter((event) => event.source === "boss").length;
  const closureEventCount = projectEvents.filter((event) => event.action === "closed").length;
  const exportEventCount = projectEvents.filter((event) => event.action === "pdf_exported").length;

  doc.setFont("helvetica", "bold");
  doc.text("Synthèse", 14, 98);
  doc.setFont("helvetica", "normal");
  doc.text(`Incidents total : ${incidents.length}`, 14, 106);
  doc.text(`Incidents ouverts : ${openCount}`, 14, 114);
  doc.text(`Incidents clôturés : ${closedCount}`, 14, 122);
  doc.text(`Incidents critiques : ${criticalCount}`, 14, 130);

  if (projectEvents.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.text("Synthese journal", 108, 98);
    doc.setFont("helvetica", "normal");
    doc.text(`Evenements traces : ${projectEvents.length}`, 108, 106);
    doc.text(`Actions terrain : ${terrainEventCount}`, 108, 114);
    doc.text(`Actions bureau : ${bossEventCount}`, 108, 122);
    doc.text(`Clotures / exports : ${closureEventCount} / ${exportEventCount}`, 108, 130);
  }

  let y = 144;

  doc.setFont("helvetica", "bold");
  doc.text("Historique incidents", 14, y);
  y += 8;

  if (incidents.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.text("Aucun incident enregistré.", 14, y);
  } else {
    for (let index = 0; index < incidents.length; index++) {
      const incident = incidents[index];

      const proofPhotoInputs = [
        incident.initial_photo_url ? { label: "Photo initiale", url: incident.initial_photo_url } : null,
        incident.close_photo_url ? { label: "Photo de cloture", url: incident.close_photo_url } : null,
      ].filter(Boolean) as Array<{ label: string; url: string }>;
      const proofPhotos: Array<{
        label: string;
        dataUrl: string;
        dim: { width: number; height: number };
      }> = [];

      for (const proofPhoto of proofPhotoInputs) {
        const dataUrl = await imageUrlToPngDataUrl(proofPhoto.url);
        if (!dataUrl) continue;
        const dim = await getImageDimensions(dataUrl);
        if (!dim) continue;
        proofPhotos.push({ label: proofPhoto.label, dataUrl, dim });
      }

      const eventLines = (eventsByIncident[incident.id] || []).slice(0, 3).map((event) => {
        const date = event.created_at ? formatDate(event.created_at) : "Date non renseignée";
        const source = labelIncidentEventSource(event.source);
        const actor = event.actor_label || "Utilisateur";
        const role = event.actor_role ? ` (${event.actor_role})` : "";
        return `${date} - ${source} - ${actor}${role} - ${
          event.summary || labelIncidentEventAction(event.action)
        }`;
      });
      const wrappedEventLines = eventLines.flatMap((line) => doc.splitTextToSize(line, 158) as string[]);
      const eventHeight = wrappedEventLines.length > 0 ? 9 + wrappedEventLines.length * 5 : 0;
      const photoHeight = proofPhotos.length > 0 ? 32 : 0;
      const blockHeight = 34 + eventHeight + photoHeight;

      if (y + blockHeight > 280) {
        doc.addPage();
        y = 20;
      }

      doc.setDrawColor(220, 220, 220);
      doc.roundedRect(14, y, 182, blockHeight, 3, 3);

      doc.setFont("helvetica", "bold");
      doc.text(`${index + 1}. ${incident.title}`, 18, y + 8);

      doc.setFont("helvetica", "normal");
      doc.text(`Statut : ${incident.status || "open"}`, 18, y + 16);
      doc.text(`Priorité : ${incident.priority || "Non renseigné"}`, 70, y + 16);
      doc.text(`Catégorie : ${incident.category || "Non renseigné"}`, 120, y + 16);
      doc.text(`Déclaré par : ${incident.reporter_name || "Non renseigné"}`, 18, y + 24);
      doc.text(`Créé le : ${formatDate(incident.created_at)}`, 100, y + 24);

      let contentY = y + 32;

      if (wrappedEventLines.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.text("Journal recent", 18, contentY);
        contentY += 6;
        doc.setFont("helvetica", "normal");
        wrappedEventLines.forEach((line) => {
          doc.text(line, 18, contentY);
          contentY += 5;
        });
      }

      if (proofPhotos.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.text("Preuves photo", 18, contentY);
        contentY += 5;

        proofPhotos.slice(0, 2).forEach((proofPhoto, proofIndex) => {
          const x = 18 + proofIndex * 42;
          const fit = fitRect(proofPhoto.dim.width, proofPhoto.dim.height, 34, 20);
          try {
            doc.setFont("helvetica", "normal");
            doc.text(proofPhoto.label, x, contentY);
            doc.addImage(proofPhoto.dataUrl, "PNG", x, contentY + 3, fit.width, fit.height);
          } catch {
            // keep report readable even if image injection fails
          }
        });
      }

      y += blockHeight + 8;
    }
  }

  doc.save(`FieldTrace_Rapport_${name.replace(/\s+/g, "_")}.pdf`);
}

export async function generateIncidentClaimPdf(project: ProjectLike, incident: IncidentLike) {
  const doc = new jsPDF();
  const name = projectName(project);

  addHeader(
    doc,
    "Claim / Lettre de réserve",
    "Document unitaire prêt à transmission client"
  );
  await addVeoliaBrandLogo(doc);

  let y = 52;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  y = addWrappedText(
    doc,
    `Projet : ${name}
Client : ${project.client_name || "Non renseigné"}
Localisation : ${project.location || "Non renseigné"}
Date d'édition : ${new Date().toLocaleString("fr-FR")}`,
    14,
    y,
    180
  );

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Objet", 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");

  y = addWrappedText(
    doc,
    `Réserve / point ouvert relatif à l'incident "${incident.title}".`,
    14,
    y,
    180
  );

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Détails incident", 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");

  y = addWrappedText(
    doc,
    `Titre : ${incident.title}
Catégorie : ${incident.category || "Non renseigné"}
Priorité : ${incident.priority || "Non renseigné"}
Statut : ${incident.status || "open"}
Zone : ${incident.location || "Non renseigné"}
Déclaré par : ${incident.reporter_name || "Non renseigné"}
Créé le : ${formatDate(incident.created_at)}

Commentaire initial :
${incident.description || "Sans commentaire initial"}`,
    14,
    y,
    180
  );

  let photoDataUrl: string | null = null;
  let photoDim: { width: number; height: number } | null = null;

  if (incident.initial_photo_url) {
    photoDataUrl = await imageUrlToPngDataUrl(incident.initial_photo_url);
    if (photoDataUrl) {
      photoDim = await getImageDimensions(photoDataUrl);
    }
  }

  if (photoDataUrl && photoDim) {
    const fit = fitRect(photoDim.width, photoDim.height, 72, 46);

    const remaining = 287 - y;
    if (remaining < fit.height + 28) {
      // if not enough space, move image + final text to next page
      doc.addPage();
      y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.text("Photo initiale", 14, y + 4);

    try {
      doc.addImage(photoDataUrl, "PNG", 14, y + 8, fit.width, fit.height);
      y += fit.height + 16;
    } catch {
      y += 8;
    }
  }

  if (incident.status === "closed") {
    if (y > 235) {
      doc.addPage();
      y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.text("Éléments de clôture", 14, y);
    y += 5;
    doc.setFont("helvetica", "normal");

    y = addWrappedText(
      doc,
      `Clôturé par : ${incident.closed_by_name || "Non renseigné"}
Clôturé le : ${formatDate(incident.closed_at)}

Commentaire de clôture :
${incident.close_comment || "Non renseigné"}`,
      14,
      y,
      180
    );
  }

  if (y > 245) {
    doc.addPage();
    y = 20;
  }

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Demande", 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");

  addWrappedText(
    doc,
    "Nous demandons la prise en compte formelle de ce point, les décisions nécessaires, ainsi que les actions correctives permettant de sécuriser l'exécution et de limiter les impacts opérationnels et contractuels.",
    14,
    y,
    180
  );

  doc.save(
    `FieldTrace_Claim_${name.replace(/\s+/g, "_")}_${incident.title.replace(/\s+/g, "_")}.pdf`
  );
}

export function buildIncidentClaimMailText(project: ProjectLike, incident: IncidentLike) {
  const name = projectName(project);

  return [
    `Objet : Réserve / point ouvert - ${name} - ${incident.title}`,
    "",
    "Bonjour,",
    "",
    `Veuillez trouver ci-dessous la synthèse du point ouvert identifié sur le projet ${name}.`,
    "",
    `Projet : ${name}`,
    `Client : ${project.client_name || "Non renseigné"}`,
    `Localisation : ${project.location || "Non renseigné"}`,
    `Titre incident : ${incident.title}`,
    `Catégorie : ${incident.category || "Non renseigné"}`,
    `Priorité : ${incident.priority || "Non renseigné"}`,
    `Statut : ${incident.status || "open"}`,
    `Zone : ${incident.location || "Non renseigné"}`,
    `Déclaré par : ${incident.reporter_name || "Non renseigné"}`,
    `Créé le : ${formatDate(incident.created_at)}`,
    "",
    "Commentaire initial :",
    incident.description || "Sans commentaire initial",
    "",
    "Merci de votre prise en compte et retour.",
    "",
    "Cordialement,",
    "FieldTrace",
  ].join("\n");
}
