import sharp from "sharp";
import type { Prisma } from "../../database/prisma/generated/prisma/client";
import { prisma } from "../../database/prisma/prisma-client";
import { notFound, unprocessable } from "../../lib/httpError";
import {
  avertissements,
  convertir,
  FORMATS_INFO,
  rendreSvg,
  resoudreStyle,
} from "./qrcode.render";
import type {
  CreateStyleInput,
  Format,
  PatchStyleInput,
  RenderInput,
  Style,
} from "./qrcode.schemas";

// Les « styles » enregistrés sont des modèles de personnalisation réutilisables (couleurs,
// points, yeux, logo, texte). Ils ne contiennent JAMAIS le contenu du QR : ni lien, ni mot
// de passe Wi-Fi. Le contenu est fourni à chaque génération et n'est ni stocké ni journalisé.
const MAX_STYLES = 20;

const STYLE_NON_TROUVE = () => notFound("Style introuvable");

// ───────── Outils ─────────
const slug = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "code";

// Wi-Fi : \ ; , : " doivent être précédés d'un \ ; une valeur qui ressemble à de l'hexadécimal
// (ex. "12345678") doit être mise entre guillemets pour ne pas être mal interprétée.
const echapperWifi = (v: string) => {
  const e = v.replace(/([\\;,:"])/g, "\\$1");
  return /^[0-9a-f]+$/i.test(v) ? `"${e}"` : e;
};

// Transforme le « contenu » demandé en texte à encoder dans le QR code.
function construireContenu(c: RenderInput["contenu"]) {
  if (c.type === "wifi") {
    const securise = c.encryption !== "nopass";
    const texte =
      `WIFI:T:${c.encryption};S:${echapperWifi(c.ssid)};` +
      (securise && c.password ? `P:${echapperWifi(c.password)};` : "") +
      (c.hidden ? "H:true;" : "") +
      ";";
    return { texte, libelle: `Wi-Fi « ${c.ssid} »`, nomParDefaut: `wifi-${c.ssid}` };
  }

  let url = c.url;
  if (c.utm) {
    const u = new URL(c.url);
    for (const [k, v] of Object.entries(c.utm)) if (v) u.searchParams.set(`utm_${k}`, v);
    url = u.toString();
  }
  return { texte: url, libelle: url, nomParDefaut: new URL(url).hostname };
}

// Le logo envoyé est relu par sharp : on vérifie que c'est une vraie image, on retire ses
// métadonnées, on le réduit (512 px max) et on le convertit en PNG.
async function normaliserLogo(dataUrl: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  try {
    const png = await sharp(Buffer.from(base64, "base64"), {
      density: 300, // utile pour les logos SVG
      limitInputPixels: 25_000_000,
    })
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    throw unprocessable("LOGO_INVALIDE", "Le logo n'est pas une image lisible");
  }
}

// Valide un style avant de l'enregistrer et allège son logo.
async function preparerStyle(style: Style): Promise<Style> {
  resoudreStyle(style); // lève une erreur si incohérent (contraste, logo sans image...)
  if (!style.logo?.dataUrl) return style;
  return {
    ...style,
    logo: { ...style.logo, dataUrl: await normaliserLogo(style.logo.dataUrl) },
  };
}

const toDto = (s: {
  id: number;
  nom: string;
  style: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: s.id,
  nom: s.nom,
  style: s.style as unknown as Style,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

async function chargerStyle(userId: number, styleId?: number) {
  if (!styleId) return undefined;
  const s = await prisma.qrStyle.findFirst({
    where: { id: styleId, userId },
    select: { style: true },
  });
  if (!s) throw STYLE_NON_TROUVE();
  return s.style as unknown as Style;
}

// Étapes communes à l'aperçu et au téléchargement :
// style enregistré + réglages envoyés → style complet → texte du QR → dessin SVG.
async function produire(userId: number, input: RenderInput) {
  const enregistre = await chargerStyle(userId, input.styleId);
  const style = resoudreStyle(enregistre, input.style);
  const { texte, libelle, nomParDefaut } = construireContenu(input.contenu);
  const logoHref = style.logo ? await normaliserLogo(style.logo.dataUrl) : null;
  const rendu = rendreSvg(texte, style, logoHref);
  return { style, libelle, nomParDefaut, rendu };
}

export const QrcodeService = {
  // ───────── Formats disponibles (pour remplir le menu « Télécharger » du front) ─────────
  formats() {
    return {
      formats: Object.entries(FORMATS_INFO).map(([format, i]) => ({ format, ...i })),
    };
  },

  // ───────── Aperçu en direct : SVG léger, rien n'est enregistré ─────────
  async apercu(userId: number, input: RenderInput) {
    const { style, libelle, rendu } = await produire(userId, input);
    return {
      contenu: libelle, // le mot de passe Wi-Fi n'est jamais renvoyé
      width: rendu.width,
      height: rendu.height,
      svg: rendu.svg,
      dataUrl: `data:image/svg+xml;base64,${Buffer.from(rendu.svg).toString("base64")}`,
      avertissements: avertissements(style),
    };
  },

  // ───────── Téléchargement dans le format choisi ─────────
  async telecharger(userId: number, input: RenderInput, format: Format) {
    const { style, nomParDefaut, rendu } = await produire(userId, input);
    const info = FORMATS_INFO[format];
    return {
      buffer: await convertir(rendu, style, format),
      mime: info.mime,
      filename: `qrcode-${slug(input.nom ?? nomParDefaut)}.${info.extension}`,
    };
  },

  // ───────── Styles enregistrés (CRUD, propres à chaque utilisateur) ─────────
  async listStyles(userId: number) {
    const styles = await prisma.qrStyle.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return {
      styles: styles.map(s => {
        const dto = toDto(s);
        // La liste reste légère : pas de logo en base64, juste un indicateur.
        return {
          id: dto.id,
          nom: dto.nom,
          avecLogo: !!dto.style.logo?.dataUrl,
          createdAt: dto.createdAt,
          updatedAt: dto.updatedAt,
        };
      }),
    };
  },

  async getStyle(userId: number, id: number) {
    const s = await prisma.qrStyle.findFirst({ where: { id, userId } });
    if (!s) throw STYLE_NON_TROUVE();
    return { style: toDto(s) };
  },

  async createStyle(userId: number, input: CreateStyleInput) {
    const total = await prisma.qrStyle.count({ where: { userId } });
    if (total >= MAX_STYLES)
      throw unprocessable(
        "TROP_DE_STYLES",
        `Tu peux enregistrer ${MAX_STYLES} styles au maximum`
      );
    const style = await preparerStyle(input.style);
    const cree = await prisma.qrStyle.create({
      data: {
        userId,
        nom: input.nom,
        style: style as unknown as Prisma.InputJsonValue,
      },
    });
    return { style: toDto(cree) };
  },

  async updateStyle(userId: number, id: number, input: PatchStyleInput) {
    const existe = await prisma.qrStyle.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existe) throw STYLE_NON_TROUVE();

    // `style` REMPLACE tout le style enregistré (comme `durees` / `remises` dans paramètres).
    const style = input.style ? await preparerStyle(input.style) : undefined;
    const maj = await prisma.qrStyle.update({
      where: { id },
      data: {
        ...(input.nom !== undefined && { nom: input.nom }),
        ...(style && { style: style as unknown as Prisma.InputJsonValue }),
      },
    });
    return { style: toDto(maj) };
  },

  async deleteStyle(userId: number, id: number) {
    const { count } = await prisma.qrStyle.deleteMany({ where: { id, userId } });
    if (count === 0) throw STYLE_NON_TROUVE();
  },
};
