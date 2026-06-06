export type ClipboardCopyResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
    };

export async function copyTextToClipboard(text: string): Promise<ClipboardCopyResult> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return {
      ok: false,
      message: "Le presse-papiers n'est pas disponible dans ce navigateur.",
    };
  }

  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "La copie dans le presse-papiers a été refusée par le navigateur.",
    };
  }
}
