import { Router } from "express";
import { requireAuth } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { QrcodeController } from "./qrcode.controller";
import {
  createStyleSchema,
  patchStyleSchema,
  renderSchema,
  styleParams,
  telechargerQuery,
} from "./qrcode.schemas";

// Monté sur /api/client/qrcodes. Chaque utilisateur ne voit et ne modifie que SES styles.
// Utilise le même middleware d'auth que les routes client de ton collègue.
export const qrcodeRouter = Router();
qrcodeRouter.use(requireAuth);

// GET  /api/client/qrcodes/formats
//      formats d'export disponibles : png, svg, jpeg, webp, pdf
qrcodeRouter.get("/formats", QrcodeController.formats);

// POST /api/client/qrcodes/apercu
//      Lien :  { "contenu": { "type": "lien", "url": "https://exemple.com", "utm": { "source": "flyer" } },
//                "style": { "dots": "rounded", "foreground": "#1d4ed8",
//                           "eyes": { "frame": "rounded", "pupil": "circle" },
//                           "logo": { "dataUrl": "data:image/png;base64,...", "sizePct": 20, "shape": "circle" },
//                           "label": { "text": "Scannez-moi" } } }
//      Wi-Fi : { "contenu": { "type": "wifi", "ssid": "MonReseau", "password": "motdepasse123",
//                             "encryption": "WPA", "hidden": false },
//                "styleId": 3 }
//      → { contenu, width, height, svg, dataUrl, avertissements[] }  (rien n'est enregistré)
qrcodeRouter.post("/apercu", validate({ body: renderSchema }), QrcodeController.apercu);

// POST /api/client/qrcodes/telecharger?format=png|svg|jpeg|webp|pdf
//      même body que /apercu ; + "nom": "carte-visite" pour nommer le fichier
//      → le fichier lui-même (Content-Disposition: attachment)
qrcodeRouter.post(
  "/telecharger",
  validate({ query: telechargerQuery, body: renderSchema }),
  QrcodeController.telecharger
);

// ───────── Styles enregistrés ─────────
// GET    /api/client/qrcodes/styles          liste (id, nom, avecLogo)
qrcodeRouter.get("/styles", QrcodeController.listStyles);

// POST   /api/client/qrcodes/styles          { "nom": "Charte bleue", "style": { ... } }
qrcodeRouter.post(
  "/styles",
  validate({ body: createStyleSchema }),
  QrcodeController.createStyle
);

// GET    /api/client/qrcodes/styles/:id      un style complet
qrcodeRouter.get(
  "/styles/:id",
  validate({ params: styleParams }),
  QrcodeController.getStyle
);

// PATCH  /api/client/qrcodes/styles/:id      { "nom"?: "...", "style"?: { ... } }
//        `style` remplace tout le style enregistré
qrcodeRouter.patch(
  "/styles/:id",
  validate({ params: styleParams, body: patchStyleSchema }),
  QrcodeController.updateStyle
);

// DELETE /api/client/qrcodes/styles/:id
qrcodeRouter.delete(
  "/styles/:id",
  validate({ params: styleParams }),
  QrcodeController.deleteStyle
);
