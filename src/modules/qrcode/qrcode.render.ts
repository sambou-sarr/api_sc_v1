import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import sharp from "sharp";
import { unprocessable } from "../../lib/httpError";
import type { Format, Style } from "./qrcode.schemas";

// Logique de dessin, SANS base de données (comme parametres.tarifs.ts pour les prix).
// On dessine le QR nous-mêmes en SVG à partir de la matrice de points fournie par `qrcode` :
// c'est ce qui permet de personnaliser chaque détail (points, coins, dégradé, logo...).
// Les autres formats (png, jpeg, webp, pdf) sont ensuite fabriqués à partir de ce SVG.

// ───────── Formats d'export ─────────
export const FORMATS_INFO: Record<
  Format,
  { mime: string; extension: string; description: string }
> = {
  png: { mime: "image/png", extension: "png", description: "Image, fond transparent possible" },
  svg: { mime: "image/svg+xml", extension: "svg", description: "Vectoriel, net à toutes les tailles (impression)" },
  jpeg: { mime: "image/jpeg", extension: "jpg", description: "Image légère, sans transparence" },
  webp: { mime: "image/webp", extension: "webp", description: "Image web moderne, sans perte" },
  pdf: { mime: "application/pdf", extension: "pdf", description: "Prêt à imprimer (300 dpi)" },
};

// ───────── Style complet (toutes les valeurs renseignées) ─────────
export type StyleComplet = {
  size: number;
  margin: number;
  errorCorrection: "L" | "M" | "Q" | "H";
  foreground: string;
  background: string; // "#rrggbb" ou "transparent"
  gradient: {
    type: "linear" | "radial";
    from: string;
    to: string;
    angle: number;
  } | null;
  dots: "square" | "rounded" | "dots" | "diamond";
  eyes: {
    frame: "square" | "rounded" | "circle";
    pupil: "square" | "rounded" | "circle";
    frameColor: string | null;
    pupilColor: string | null;
  };
  logo: {
    dataUrl: string;
    sizePct: number;
    shape: "square" | "circle";
    backgroundColor: string | null; // null = reprend le fond du QR
  } | null;
  label: { text: string; color: string; fontSizePx: number } | null;
};

// Fusionne plusieurs couches de style : la dernière gagne, les objets sont fusionnés en profondeur.
// (comme array_replace_recursive en PHP)
function fusion(...couches: Array<Record<string, any> | undefined>) {
  const out: Record<string, any> = {};
  for (const couche of couches) {
    if (!couche) continue;
    for (const [k, v] of Object.entries(couche)) {
      if (v === undefined) continue;
      if (
        v && typeof v === "object" && !Array.isArray(v) &&
        out[k] && typeof out[k] === "object"
      )
        out[k] = fusion(out[k], v);
      else out[k] = v;
    }
  }
  return out;
}

// ───────── Contraste (un QR illisible ne sert à rien) ─────────
function luminance(hex: string) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map(c => c + c).join("");
  const [r, g, b] = [0, 2, 4]
    .map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string) {
  const [haut, bas] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (haut + 0.05) / (bas + 0.05);
}
const couleursDuCode = (s: StyleComplet) =>
  [
    s.foreground,
    s.gradient?.from,
    s.gradient?.to,
    s.eyes.frameColor,
    s.eyes.pupilColor,
  ].filter((c): c is string => !!c);

// Applique les valeurs par défaut et contrôle la cohérence.
// Usage : resoudreStyle(styleEnregistre, reglagesEnvoyes) → la dernière couche l'emporte.
export function resoudreStyle(...couches: Array<Style | undefined>): StyleComplet {
  const s = fusion(...couches) as Style;
  const foreground = s.foreground ?? "#000000";

  if (s.logo && !s.logo.dataUrl)
    throw unprocessable("LOGO_MANQUANT", "Le logo est configuré mais aucune image n'est fournie");

  const complet: StyleComplet = {
    size: s.size ?? 1024,
    margin: s.margin ?? 4,
    // Un logo cache une partie des points : on force la correction maximale.
    errorCorrection: s.logo ? "H" : s.errorCorrection ?? "Q",
    foreground,
    background: s.background ?? "#ffffff",
    gradient: s.gradient
      ? { type: s.gradient.type, from: s.gradient.from, to: s.gradient.to, angle: s.gradient.angle ?? 45 }
      : null,
    dots: s.dots ?? "square",
    eyes: {
      frame: s.eyes?.frame ?? "square",
      pupil: s.eyes?.pupil ?? "square",
      frameColor: s.eyes?.frameColor ?? null,
      pupilColor: s.eyes?.pupilColor ?? null,
    },
    logo: s.logo
      ? {
          dataUrl: s.logo.dataUrl!,
          sizePct: s.logo.sizePct ?? 20,
          shape: s.logo.shape ?? "square",
          backgroundColor: s.logo.backgroundColor ?? null,
        }
      : null,
    label: s.label
      ? { text: s.label.text, color: s.label.color ?? foreground, fontSizePx: s.label.fontSizePx ?? 36 }
      : null,
  };

  if (complet.background !== "transparent") {
    const fond = complet.background;
    const trop_clair = couleursDuCode(complet).find(c => contraste(c, fond) < 3);
    if (trop_clair)
      throw unprocessable(
        "CONTRASTE_INSUFFISANT",
        `La couleur ${trop_clair} n'est pas assez contrastée avec le fond ${fond} : le QR code ne serait pas lisible`
      );
  }
  return complet;
}

// Conseils non bloquants affichés par le front à côté de l'aperçu.
export function avertissements(s: StyleComplet): string[] {
  const out: string[] = [];
  if (s.margin < 2)
    out.push("Une marge de moins de 2 modules peut empêcher certains lecteurs de détecter le code.");
  if (s.logo && s.logo.sizePct > 25)
    out.push("Un logo de plus de 25 % rend le code plus difficile à lire : teste-le avec plusieurs téléphones.");
  if (s.size < 256)
    out.push("Moins de 256 px : l'image sera floue à l'impression. Préfère le SVG ou une taille plus grande.");
  if (
    s.background !== "transparent" &&
    luminance(s.foreground) > luminance(s.background)
  )
    out.push("Code clair sur fond foncé (inversé) : certains lecteurs ne le lisent pas.");
  if (s.background === "transparent")
    out.push("Fond transparent : la lisibilité dépendra de la couleur du support.");
  return out;
}

// ───────── Matrice de points ─────────
function matrice(contenu: string, ecc: StyleComplet["errorCorrection"]) {
  try {
    const qr = QRCode.create(contenu, { errorCorrectionLevel: ecc });
    const n = qr.modules.size;
    return { n, estNoir: (r: number, c: number) => !!qr.modules.get(r, c) };
  } catch {
    throw unprocessable(
      "CONTENU_TROP_LONG",
      "Ce lien contient trop de données pour un QR code (essaie un lien plus court ou une correction d'erreur plus basse)"
    );
  }
}

// ───────── Dessin SVG ─────────
const f = (n: number) => Number(n.toFixed(3));
const echapper = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Un point = un morceau de chemin SVG. Tous les points vont dans UN SEUL <path> :
// c'est léger, et ça évite les fines lignes blanches entre carrés voisins.
function point(x: number, y: number, style: StyleComplet["dots"]) {
  switch (style) {
    case "rounded": {
      const r = 0.3;
      const w = 1 - 2 * r;
      return `M${f(x + r)} ${f(y)}h${w}a${r} ${r} 0 0 1 ${r} ${r}v${w}a${r} ${r} 0 0 1 ${-r} ${r}h${-w}a${r} ${r} 0 0 1 ${-r} ${-r}v${-w}a${r} ${r} 0 0 1 ${r} ${-r}z`;
    }
    case "dots": {
      const r = 0.45;
      return `M${f(x + 0.5 - r)} ${f(y + 0.5)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
    }
    case "diamond":
      return `M${f(x + 0.5)} ${f(y)}l0.5 0.5l-0.5 0.5l-0.5-0.5z`;
    default:
      return `M${f(x)} ${f(y)}h1v1h-1z`;
  }
}

// Les 3 « yeux » (grands carrés dans les coins) : 7×7 modules, dessinés à part.
function oeil(ex: number, ey: number, s: StyleComplet, couleurCadre: string, couleurCentre: string) {
  let cadre: string;
  if (s.eyes.frame === "circle")
    cadre = `<circle cx="${f(ex + 3.5)}" cy="${f(ey + 3.5)}" r="3" fill="none" stroke="${couleurCadre}" stroke-width="1"/>`;
  else if (s.eyes.frame === "rounded")
    cadre = `<rect x="${f(ex + 0.5)}" y="${f(ey + 0.5)}" width="6" height="6" rx="1.6" fill="none" stroke="${couleurCadre}" stroke-width="1"/>`;
  else
    cadre = `<path fill-rule="evenodd" fill="${couleurCadre}" d="M${f(ex)} ${f(ey)}h7v7h-7zM${f(ex + 1)} ${f(ey + 1)}v5h5v-5z"/>`;

  let centre: string;
  if (s.eyes.pupil === "circle")
    centre = `<circle cx="${f(ex + 3.5)}" cy="${f(ey + 3.5)}" r="1.5" fill="${couleurCentre}"/>`;
  else
    centre = `<rect x="${f(ex + 2)}" y="${f(ey + 2)}" width="3" height="3" rx="${s.eyes.pupil === "rounded" ? 0.8 : 0}" fill="${couleurCentre}"/>`;
  return cadre + centre;
}

export function rendreSvg(contenu: string, s: StyleComplet, logoHref: string | null) {
  const { n, estNoir } = matrice(contenu, s.errorCorrection);
  const m = s.margin;
  const total = n + 2 * m; // largeur du dessin, en modules
  const px = s.size / total; // pixels par module
  const hauteurTexte = s.label ? (s.label.fontSizePx * 2) / px : 0;
  const H = total + hauteurTexte;
  const width = s.size;
  const height = Math.round(s.size * (H / total));

  const remplissage = s.gradient ? "url(#qr-grad)" : s.foreground;
  const couleurCadre = s.eyes.frameColor ?? remplissage;
  const couleurCentre = s.eyes.pupilColor ?? remplissage;

  // Zone du logo : on enlève les points dessous (alignée sur la grille, centrée).
  let L = 0;
  let debut = 0;
  if (logoHref && s.logo) {
    L = Math.round((n * s.logo.sizePct) / 100);
    if ((n - L) % 2 !== 0) L += 1;
    debut = (n - L) / 2;
  }
  const dansLogo = (r: number, c: number) =>
    L > 0 && r >= debut && r < debut + L && c >= debut && c < debut + L;
  const dansOeil = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  let d = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (!estNoir(r, c) || dansOeil(r, c) || dansLogo(r, c)) continue;
      d += point(m + c, m + r, s.dots);
    }

  // <defs> : dégradé + découpe ronde du logo
  let defs = "";
  if (s.gradient) {
    const centre = m + n / 2;
    const demi = n / 2;
    if (s.gradient.type === "radial")
      defs += `<radialGradient id="qr-grad" gradientUnits="userSpaceOnUse" cx="${f(centre)}" cy="${f(centre)}" r="${f(demi * 1.42)}"><stop offset="0" stop-color="${s.gradient.from}"/><stop offset="1" stop-color="${s.gradient.to}"/></radialGradient>`;
    else {
      const a = (s.gradient.angle * Math.PI) / 180;
      const dx = Math.cos(a) * demi;
      const dy = Math.sin(a) * demi;
      defs += `<linearGradient id="qr-grad" gradientUnits="userSpaceOnUse" x1="${f(centre - dx)}" y1="${f(centre - dy)}" x2="${f(centre + dx)}" y2="${f(centre + dy)}"><stop offset="0" stop-color="${s.gradient.from}"/><stop offset="1" stop-color="${s.gradient.to}"/></linearGradient>`;
    }
  }

  // Logo : pastille de fond + image
  let logo = "";
  if (logoHref && s.logo && L > 0) {
    const lx = m + debut;
    const pad = L * 0.08;
    const fondLogo =
      s.logo.backgroundColor ?? (s.background === "transparent" ? "#ffffff" : s.background);
    const cx = lx + L / 2;
    if (fondLogo !== "transparent")
      logo +=
        s.logo.shape === "circle"
          ? `<circle cx="${f(cx)}" cy="${f(cx)}" r="${f(L / 2)}" fill="${fondLogo}"/>`
          : `<rect x="${f(lx)}" y="${f(lx)}" width="${L}" height="${L}" rx="0.4" fill="${fondLogo}"/>`;
    let clip = "";
    if (s.logo.shape === "circle") {
      defs += `<clipPath id="qr-logo-clip"><circle cx="${f(cx)}" cy="${f(cx)}" r="${f(L / 2 - pad)}"/></clipPath>`;
      clip = ` clip-path="url(#qr-logo-clip)"`;
    }
    logo += `<image xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="${logoHref}" x="${f(lx + pad)}" y="${f(lx + pad)}" width="${f(L - 2 * pad)}" height="${f(L - 2 * pad)}" preserveAspectRatio="xMidYMid meet"${clip}/>`;
  }

  const texte = s.label
    ? `<text x="${f(total / 2)}" y="${f(total + hauteurTexte * 0.62)}" text-anchor="middle" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-weight="bold" font-size="${f(s.label.fontSizePx / px)}" fill="${s.label.color}">${echapper(s.label.text)}</text>`
    : "";

  const fond =
    s.background === "transparent"
      ? ""
      : `<rect width="${f(total)}" height="${f(H)}" fill="${s.background}"/>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${f(total)} ${f(H)}">` +
    (defs ? `<defs>${defs}</defs>` : "") +
    fond +
    `<path fill="${remplissage}" d="${d}"/>` +
    oeil(m, m, s, couleurCadre, couleurCentre) +
    oeil(m + n - 7, m, s, couleurCadre, couleurCentre) +
    oeil(m, m + n - 7, s, couleurCadre, couleurCentre) +
    logo +
    texte +
    `</svg>`;

  return { svg, width, height };
}

// ───────── Conversion vers les autres formats ─────────
function pngVersPdf(png: Buffer, width: number, height: number): Promise<Buffer> {
  // Page à la taille exacte du QR, calculée pour une impression à 300 dpi.
  const pw = (width * 72) / 300;
  const ph = (height * 72) / 300;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [pw, ph], margin: 0 });
    const morceaux: Buffer[] = [];
    doc.on("data", (c: Buffer) => morceaux.push(c));
    doc.on("end", () => resolve(Buffer.concat(morceaux)));
    doc.on("error", reject);
    doc.image(png, 0, 0, { width: pw, height: ph });
    doc.end();
  });
}

export async function convertir(
  rendu: { svg: string; width: number; height: number },
  s: StyleComplet,
  format: Format
): Promise<Buffer> {
  const source = Buffer.from(rendu.svg);
  if (format === "svg") return source;

  // density 72 : 1 unité du SVG = 1 pixel, donc l'image sort à la taille demandée.
  const image = () => sharp(source, { density: 72 });
  const fondPlein = s.background === "transparent" ? "#ffffff" : s.background;

  switch (format) {
    case "png":
      return image().png().toBuffer();
    case "jpeg":
      return image().flatten({ background: fondPlein }).jpeg({ quality: 95 }).toBuffer();
    case "webp":
      return image().webp({ lossless: true }).toBuffer();
    case "pdf":
      return pngVersPdf(await image().png().toBuffer(), rendu.width, rendu.height);
  }
}
