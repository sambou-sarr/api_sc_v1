# Module `qrcode` : guide d'intégration

Dossier à copier dans `src/modules/qrcode/` (même profondeur que `modules/parametres/`).

| Fichier | Rôle | Équivalent Laravel |
|---|---|---|
| `qrcode.routes.ts` | URLs + middlewares | `routes/api.php` |
| `qrcode.controller.ts` | reçoit la requête, renvoie la réponse | Controller |
| `qrcode.service.ts` | logique métier + base de données | Service / Action |
| `qrcode.schemas.ts` | validation (zod) | FormRequest |
| `qrcode.render.ts` | dessin du QR + conversion de formats (sans BDD) | classe helper pure |

## 1. Installer les paquets

```bash
npm install qrcode sharp pdfkit
npm install -D @types/qrcode @types/pdfkit
```

- `qrcode` : calcule la matrice de points (on dessine le reste nous-mêmes en SVG).
- `sharp` : convertit le SVG en PNG / JPEG / WebP et vérifie les logos envoyés.
- `pdfkit` : fabrique le PDF.

## 2. Ajouter le modèle Prisma (seul fichier existant à toucher)

Dans `schema.prisma` :

```prisma
model QrStyle {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  nom       String
  style     Json
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("qr_styles")
}
```

Et dans le modèle `User`, ajoute la ligne : `qrStyles QrStyle[]`.
(Adapte le type de `userId` si l'id de `User` n'est pas un `Int`.)

```bash
npx prisma migrate dev --name add_qr_styles
```

## 3. Monter les routes

Là où `parametresClientRouter` est monté :

```ts
import { qrcodeRouter } from "./modules/qrcode/qrcode.routes";

app.use("/api/client/qrcodes", qrcodeRouter);
```

## 4. Trois points d'attention

1. **`req.user`** : dans `qrcode.controller.ts`, la fonction `userId(req)` suppose que
   `requireAuth` remplit `req.user.id`. Aligne-la sur les controllers client de ton collègue.
2. **Taille du body JSON** : un logo en base64 pèse jusqu'à ~1,4 Mo, mais `express.json()`
   refuse par défaut au-delà de 100 ko (erreur 413). Là où il est déclaré :
   `app.use(express.json({ limit: "2mb" }))`.
3. **Polices (texte sous le QR)** : le texte est dessiné avec les polices du serveur. Dans un
   Docker minimal elles manquent et le texte apparaît en carrés vides :
   - Alpine : `apk add fontconfig ttf-dejavu`
   - Debian/Ubuntu : `apt-get install -y fontconfig fonts-dejavu-core`

## 5. Exemples

Lien avec style complet :

```json
POST /api/client/qrcodes/telecharger?format=png
{
  "contenu": { "type": "lien", "url": "https://exemple.com", "utm": { "source": "flyer" } },
  "nom": "flyer-salon",
  "style": {
    "size": 1200,
    "foreground": "#1d4ed8",
    "gradient": { "type": "linear", "from": "#1d4ed8", "to": "#9333ea", "angle": 45 },
    "dots": "rounded",
    "eyes": { "frame": "rounded", "pupil": "circle", "frameColor": "#0f172a" },
    "logo": { "dataUrl": "data:image/png;base64,...", "sizePct": 20, "shape": "circle" },
    "label": { "text": "Scannez-moi" }
  }
}
```

Wi-Fi, avec un style enregistré puis ajusté :

```json
POST /api/client/qrcodes/apercu
{
  "contenu": { "type": "wifi", "ssid": "MonReseau", "password": "motdepasse123", "encryption": "WPA" },
  "styleId": 3,
  "style": { "label": { "text": "Wi-Fi invités" } }
}
```

## 6. Règles à connaître

- **Style enregistré + réglages** : `styleId` donne la base, `style` écrase seulement ce qu'il
  précise. `"logo": null` ou `"label": null` désactive l'option héritée.
- **Logo** : la correction d'erreur passe automatiquement à `H` (30 %) ; taille limitée à
  30 % de la largeur.
- **Contraste** : une couleur trop proche du fond (ratio < 3) est refusée
  (`CONTRASTE_INSUFFISANT`). Les autres risques (marge faible, code inversé, petite taille)
  sortent en `avertissements[]`, non bloquants.
- **Wi-Fi** : le mot de passe n'est ni stocké, ni journalisé, ni renvoyé par `/apercu`. Les
  styles enregistrés ne contiennent jamais le contenu du QR.
- **PDF** : page à la taille du QR, calculée pour une impression à 300 dpi (contenu en image,
  pas vectoriel : pour du vectoriel, utilise le SVG).
