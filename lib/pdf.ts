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

function addInfoGrid(
  doc: jsPDF,
  entries: Array<{ label: string; value: string }>,
  startY: number
) {
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

export async function generateProjectReportPdf(project: ProjectLike, incidents: IncidentLike[]) {
  const doc = new jsPDF();
  const name = projectName(project);

  addHeader(
    doc,
    "Rapport projet",
    "Pilotage terrain, incidents, priorités et suivi projet"
  );

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

  doc.setFont("helvetica", "bold");
  doc.text("Synthèse", 14, 98);
  doc.setFont("helvetica", "normal");
  doc.text(`Incidents total : ${incidents.length}`, 14, 106);
  doc.text(`Incidents ouverts : ${openCount}`, 14, 114);
  doc.text(`Incidents clôturés : ${closedCount}`, 14, 122);
  doc.text(`Incidents critiques : ${criticalCount}`, 14, 130);

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

      let photoDataUrl: string | null = null;
      let photoDim: { width: number; height: number } | null = null;

      if (incident.initial_photo_url) {
        photoDataUrl = await imageUrlToPngDataUrl(incident.initial_photo_url);
        if (photoDataUrl) {
          photoDim = await getImageDimensions(photoDataUrl);
        }
      }

      const blockHeight = photoDataUrl && photoDim ? 54 : 34;

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

      if (photoDataUrl && photoDim) {
        const fit = fitRect(photoDim.width, photoDim.height, 34, 22);
        try {
          doc.addImage(photoDataUrl, "PNG", 18, y + 28, fit.width, fit.height);
        } catch {
          // keep report readable even if image injection fails
        }
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
