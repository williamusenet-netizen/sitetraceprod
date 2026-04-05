import jsPDF from "jspdf";

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

function ensurePageSpace(doc: jsPDF, y: number, needed: number) {
  if (y + needed > 282) {
    doc.addPage();
    return 20;
  }
  return y;
}

function addSectionTitle(doc: jsPDF, title: string, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title, 14, y);
  return y + 7;
}

function addInfoGrid(doc: jsPDF, entries: Array<{ label: string; value: string }>, startY: number) {
  let y = startY;
  entries.forEach((entry, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? 14 : 108;
    const cellY = y + row * 18;
    doc.setDrawColor(220, 226, 235);
    doc.roundedRect(x, cellY, 88, 14, 3, 3);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(entry.label, x + 3, cellY + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(entry.value || "Non renseigné", 80), x + 3, cellY + 10);
  });
  return y + Math.ceil(entries.length / 2) * 18;
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

function fitRect(width: number, height: number, maxWidth: number, maxHeight: number) {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  return { width: width * ratio, height: height * ratio };
}

async function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number } | null> {
  return await new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function generateIncidentClientPdf(project: ProjectLike, incident: IncidentLike) {
  const doc = new jsPDF();
  const name = projectName(project);
  const reference = `INC-${incident.id.slice(0, 8).toUpperCase()}`;
  const summary = incident.description || `Incident "${incident.title}" remonte sur le projet ${name}.`;
  const actionCorrective =
    incident.close_comment || "Action corrective a confirmer lors de la cloture ou du retour terrain.";
  const clientConclusion =
    (incident.status || "open") === "closed"
      ? "Le point est considere comme traite et cloture, sous reserve de validation client."
      : "Le point reste ouvert ou en traitement. Une validation client finale reste necessaire.";

  addHeader(doc, "Rapport incident", "Dossier incident structure pour transmission client");

  let y = 52;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  y = addSectionTitle(doc, "En-tete dossier", y);
  y = addInfoGrid(
    doc,
    [
      { label: "Projet", value: name },
      { label: "Reference", value: reference },
      { label: "Client", value: project.client_name || "Non renseigné" },
      { label: "Localisation", value: project.location || "Non renseigné" },
      { label: "Statut", value: incident.status || "open" },
      { label: "Priorité", value: incident.priority || "Non renseigné" },
      { label: "Cree le", value: formatDate(incident.created_at) },
      { label: "Date d'edition", value: new Date().toLocaleString("fr-FR") },
    ],
    y
  );

  y = ensurePageSpace(doc, y + 4, 40);
  y = addSectionTitle(doc, "Resume executif", y + 8);
  y = addWrappedText(
    doc,
    `Constat : ${summary}

Impact : ${
      (incident.priority || "").toLowerCase() === "critical"
        ? "Impact majeur sur execution ou relation client."
        : (incident.priority || "").toLowerCase() === "high"
          ? "Impact significatif a traiter rapidement."
          : "Impact contenu mais devant etre trace."
    }

Action immediate : ${
      (incident.status || "open") === "closed"
        ? "Verifier la restitution client et archiver le dossier."
        : "Poursuivre le traitement puis documenter la cloture."
    }`,
    14,
    y,
    180
  );

  y = ensurePageSpace(doc, y + 4, 54);
  y = addSectionTitle(doc, "Details incident", y + 8);
  y = addWrappedText(
    doc,
    `Titre : ${incident.title}
Catégorie : ${incident.category || "Non renseigné"}
Zone / équipement : ${incident.location || "Non renseigné"}
Déclaré par : ${incident.reporter_name || "Non renseigné"}
Description detaillee :
${incident.description || "Sans description detaillee"}`,
    14,
    y,
    180
  );

  const proofSources = [
    incident.initial_photo_url ? { label: "Constat initial", url: incident.initial_photo_url } : null,
    incident.close_photo_url ? { label: "Photo de cloture", url: incident.close_photo_url } : null,
  ].filter(Boolean) as Array<{ label: string; url: string }>;

  if (proofSources.length > 0) {
    y = ensurePageSpace(doc, y + 4, 60);
    y = addSectionTitle(doc, "Preuves", y + 8);

    for (const proof of proofSources) {
      const dataUrl = await imageUrlToPngDataUrl(proof.url);
      if (!dataUrl) continue;
      const dim = await getImageDimensions(dataUrl);
      if (!dim) continue;
      const fit = fitRect(dim.width, dim.height, 72, 46);
      y = ensurePageSpace(doc, y + 2, fit.height + 18);
      doc.setFont("helvetica", "normal");
      doc.text(proof.label, 14, y);
      try {
        doc.addImage(dataUrl, "PNG", 14, y + 4, fit.width, fit.height);
      } catch {
        // keep PDF readable if image draw fails
      }
      y += fit.height + 10;
    }
  }

  y = ensurePageSpace(doc, y + 4, 34);
  y = addSectionTitle(doc, "Actions correctives", y + 8);
  y = addWrappedText(doc, actionCorrective, 14, y, 180);

  y = ensurePageSpace(doc, y + 4, 34);
  y = addSectionTitle(doc, "Synthese client", y + 8);
  y = addWrappedText(
    doc,
    `Resume client :
${summary}

Conclusion :
${clientConclusion}`,
    14,
    y,
    180
  );

  y = ensurePageSpace(doc, y + 4, 30);
  y = addSectionTitle(doc, "Statut final", y + 8);
  addWrappedText(
    doc,
    `Statut : ${incident.status || "open"}
Clôturé par : ${incident.closed_by_name || "Non renseigné"}
Date de cloture : ${formatDate(incident.closed_at)}
Commentaire de clôture : ${incident.close_comment || "Non renseigné"}`,
    14,
    y,
    180
  );

  doc.save(`FieldTrace_Incident_${name.replace(/\s+/g, "_")}_${incident.title.replace(/\s+/g, "_")}.pdf`);
}

export function buildIncidentClientMailText(project: ProjectLike, incident: IncidentLike) {
  const name = projectName(project);
  const conclusion =
    (incident.status || "open") === "closed"
      ? "Le point est traite et cloture avec restitution documentaire disponible."
      : "Le point reste en traitement et fera l'objet d'une restitution finale apres cloture.";

  return [
    `Objet : Rapport incident - ${name} - ${incident.title}`,
    "",
    "Bonjour,",
    "",
    `Veuillez trouver la synthese client de l'incident ${incident.title} sur le projet ${name}.`,
    "",
    `Projet : ${name}`,
    `Client : ${project.client_name || "Non renseigné"}`,
    `Localisation : ${project.location || "Non renseigné"}`,
    `Reference : INC-${incident.id.slice(0, 8).toUpperCase()}`,
    `Catégorie : ${incident.category || "Non renseigné"}`,
    `Priorité : ${incident.priority || "Non renseigné"}`,
    `Statut : ${incident.status || "open"}`,
    `Zone : ${incident.location || "Non renseigné"}`,
    `Déclaré par : ${incident.reporter_name || "Non renseigné"}`,
    `Cree le : ${formatDate(incident.created_at)}`,
    "",
    "Resume executif :",
    incident.description || "Sans commentaire initial",
    "",
    "Action corrective / cloture :",
    incident.close_comment || "En attente de detail de cloture",
    "",
    "Conclusion :",
    conclusion,
    "",
    "Cordialement,",
    "FieldTrace",
  ].join("\n");
}
