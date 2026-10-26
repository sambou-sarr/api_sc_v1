# Support Connecté — API (Node.js · Express · TypeScript · Prisma · PostgreSQL)

Backend des fiches connectées : comptes clients (inscription libre), fiches, formules (Essentielle / Pro / Signature),
abonnements et contrôle des droits par formule.

## Démarrage

```bash
npm install
cp .env.example .env          # puis mets un vrai JWT_SECRET (voir le fichier)
docker compose up -d          # PostgreSQL local (ou utilise ta propre base : DATABASE_URL)

# 1) Créer les tables — en deux temps pour ajouter l'index unique partiel (voir plus bas)
npx prisma migrate dev --name init --create-only
#    -> ouvre prisma/migrations/<date>_init/migration.sql et ajoute à la fin :
#       CREATE UNIQUE INDEX "subscriptions_one_active_per_fiche"
#       ON "subscriptions" ("ficheId") WHERE "status" = 'ACTIVE';
npx prisma migrate dev        # applique la migration + génère le client Prisma

# 2) Remplir les formules et leurs limites
npm run prisma:seed

# 3) Créer un compte admin (le seul moyen d'en avoir un)
npm run create-admin -- admin@exemple.sn "UnMotDePasseSolide"

# 4) Lancer
npm run dev                   # http://localhost:4000/api/health
```

Production : `npm run build && npm run prisma:deploy && npm start` (PM2 + Nginx comme d'habitude).

## Journalisation

Les logs sont produits par Winston sur la console (stdout/stderr), sans fichier local. En développement, ils sont affichés sur une ligne horodatée et colorée, avec les détails dans un format facile à lire (`INFO HTTP request completed | method="GET" statusCode=200`). En production, ils restent en JSON structuré pour les collecteurs de logs. Chaque requête HTTP est journalisée avec un identifiant de corrélation retourné dans l'en-tête `X-Request-Id`, la méthode, la route, le code HTTP et sa durée. Les authentifications, actions sur les fiches, opérations administrateur, erreurs et tâches d'expiration importantes sont également journalisées. Les corps de requête, mots de passe, jetons, adresses e-mail et références de paiement ne sont pas consignés.

## Médias

Les images et vidéos des fiches sont envoyées en binaire sur `POST /api/fiches/:id/media`, optimisées avec FFmpeg puis stockées sur un stockage compatible S3 (variables `S3_*` du `.env`). Elles sont servies publiquement par `GET /api/media/:ficheId/:key`. Détails dans `docs/media-storage.md`.

## Structure

```
prisma/
  schema.prisma        # tables (User, Fiche, Plan, PlanLimit, Subscription, blocs de contenu…)
  seed.ts              # les 3 formules et leurs quotas, repris de plans.js
src/
  server.ts            # démarrage + tâche horaire d'expiration des abonnements
  app.ts               # helmet, cors, rate limit, routes
  config/env.ts        # variables d'environnement validées (zod)
  lib/                 # prisma, jwt, mots de passe, erreurs HTTP, mails (simulés), tokens
  middlewares/         # requireAuth, requireRole, validate (zod), errorHandler
  modules/
    auth/              # register, login, me, vérification e-mail, mot de passe oublié
    plans/             # GET /plans (public)
    subscriptions/     # abonnement effectif, activation, expiration
    fiches/            # schémas zod, contrôle des limites, DTO, service, routes
    admin/             # slug avant création du compte, statut, activation d'une formule
scripts/create-admin.ts
```

## Routes (préfixe `/api`)

| Méthode | Route | Accès | Rôle |
|---|---|---|---|
| POST | `/auth/register` | public | crée un compte CLIENT (+ e-mail de confirmation) |
| POST | `/auth/login` | public | retourne `{ user, token }` |
| GET | `/auth/me` | connecté | profil |
| POST | `/auth/verify-email` · `/auth/resend-verification` | public · connecté | confirmation d'e-mail |
| POST | `/auth/forgot-password` · `/auth/reset-password` | public | mot de passe oublié |
| GET | `/plans` | public | formules et limites |
| GET | `/fiches/public/:slug` | public | la fiche affichée par le scan NFC/QR |
| GET | `/fiches` | connecté | mes fiches (admin : toutes) |
| GET | `/fiches/total-fiche` | connecté | nombre de fiches et places Essentielle gratuites restantes |
| POST | `/fiches` | connecté | crée une fiche Essentielle avec une place gratuite disponible |
| POST | `/fiches/purchases/quote` | client | calcule le devis d'une commande de fiches |
| POST | `/fiches/purchases` | client | réserve la commande; les fiches payantes sont créées après confirmation simulée |
| POST | `/fiches/purchases/:purchaseId/simulate-confirmation` | client | confirme la commande simulée et crée les fiches/abonnements atomiquement |
| GET | `/fiches/:id` | propriétaire / admin | une fiche |
| PATCH | `/fiches/:id` | propriétaire / admin | modifie l'identité et `data` (limites de la formule vérifiées) |
| PATCH | `/admin/fiches/:id` | admin | `slug`, `statut` (`active`/`suspendue`), `userId` |
| POST | `/admin/fiches/:id/subscription` | admin | active une formule `{ plan, endsAt?, amountFcfa?, paymentRef? }` |
| POST | `/fiches/public/:slug/passages` | public (auth facultative) | enregistre une ouverture `{ source: qr\|nfc\|direct, idempotencyKey }` ; ignorée si le propriétaire connecté ouvre sa propre fiche |
| POST | `/fiches/public/:slug/rappels` | public | demande de rappel `{ nom, telephone }` |
| GET | `/fiches/rappels` | connecté | mes demandes de rappel, paginées (`page`, `limit`) |
| GET | `/fiches/:id/rappels` | propriétaire / admin | demandes de rappel d'une fiche |
| GET | `/fiches/:id/stats` | propriétaire / admin | passages par source et historique (`granularity=day\|month`, `date` ou `month`) |
| POST | `/fiches/:id/media` | propriétaire / admin | upload binaire d'un média (`?purpose=`), optimisé puis stocké sur S3 |
| GET | `/media/:ficheId/:key` | public | lecture d'un média (Range supporté) |
| GET | `/client/dashboard/fiches` | connecté | fiches du client avec leur formule active |
| GET | `/client/parametres` | connecté | grille des formules, durées/remises et emplacements |
| POST | `/client/parametres/commande/tarif` | connecté | calcule un tarif pour une commande ou un upgrade unitaire |
| GET | `/subscription/kpi` | connecté | nombre de fiches, fiches actives, fiches payantes |
| POST | `/subscription/upgrade` | client | demande de changement de formule `{ ficheId, plan: pro\|signature, dureeMois? }` → paiement `PENDING` au prix serveur (désactivé en production) |
| POST | `/subscription/payments/:paymentId/simulate-confirmation` | client | confirme un paiement simulé et active la formule (désactivé en production) |

Authentification : en-tête `Authorization: Bearer <token>`.
Erreurs : toujours `{ "error": { "code", "message", "details?" } }`.

```bash
curl -X POST localhost:4000/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"awa@exemple.sn","password":"motdepasse123","nom":"Awa"}'
curl -X POST localhost:4000/api/fiches -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"prenom":"Awa","nom":"Ndiaye","fonction":"Coiffeuse","secteur":"beaute"}'
```

## Règles appliquées côté serveur

- **Propriété** : un client ne voit et ne modifie que ses fiches (sinon 404). L'admin voit tout.
- **Champs réservés** : `slug`, `formule`, `statut`, `dateEcheance`, `scansTotal`, `userId` sont ignorés si un client les envoie. Le slug ne peut être corrigé côté admin qu'avant la création du compte client associé, puis devient immuable afin de préserver les liens et QR codes.
- **Formule effective** d'une fiche = son abonnement `ACTIVE` non expiré. Sans abonnement valide : la fiche n'est plus publique et sa modification est bloquée (`ABONNEMENT_EXPIRE`). Une fiche `suspendue` n'est pas publique et sa modification est bloquée pour le client. Les brouillons restent privés et modifiables afin que le client puisse les compléter avant publication.
- **Création et emplacements** : jusqu'à `MAX_FICHES_PER_USER` fiches Essentielle gratuites par compte (3 par défaut). Une commande Essentielle consomme les places gratuites restantes avant de chiffrer les emplacements payants. Les fiches Pro/Signature utilisent le tarif configuré par durée et quantité, sans frais d'emplacement. Le devis et la confirmation sont recalculés/validés par l'API; les commandes payantes expirent après 30 minutes.
- **Confirmation d'achat** : aucun lot n'est créé avant la confirmation du paiement simulé; la confirmation vérifie le propriétaire et l'état de la commande, puis crée fiches, abonnements et reçus dans une seule transaction. Les fiches démarrent avec le nom « Nouvelle fiche », le thème et les onglets autorisés par leur formule. Les paiements simulés restent désactivés en production.
- **Limites par formule** (table `plan_limits`) : blocs autorisés, onglets libres, présentation, réseaux, liens, photos/vidéos, catalogue (sections, articles, prix), menu, biens, entête, thèmes. En cas de dépassement : 422 `LIMITES_DEPASSEES` avec la liste de **toutes** les violations.
- **`PATCH /fiches/:id`** : une liste fournie (liens, galerie, onglets, catalogue, menu, biens…) **remplace** l'existante ; une liste absente n'est pas touchée.
- **Format de la fiche** : `GET` renvoie `{ ...champs à plat, formule, dateEcheance, data: {...} }`, le même format que `src/data/fiches.js` du module front. Les ids des onglets viennent de la base (ne pas réutiliser les `o1`, `o2` du front).
- **Sécurité** : mots de passe bcrypt, rôle `CLIENT` forcé à l'inscription, `ADMIN` seulement via le script, JWT relu en base à chaque requête, URL `javascript:` refusées, rate limit (global + `/auth`), helmet, CORS limité à `CORS_ORIGIN`.

## Ce qui reste à faire / à décider

1. **Envoi des e-mails** : `src/lib/mailer.ts` affiche seulement dans la console. Brancher Resend, Brevo ou SMTP.
2. **Comptage des passages (scans)** : non implémenté. La page publique ne compte rien ; à faire sur une route dédiée NFC/QR, sans compter les aperçus admin.
3. **Upload d'images et vidéos** : l'API reçoit des URL. Prévoir un stockage (fichiers sur le VPS ou S3) avec limite de poids ; la durée max des vidéos du menu (30 s) ne peut être vérifiée que là.
4. **Réorganisation des blocs** (`canReorder`) : non contrôlée côté serveur ; pour l'instant l'ordre envoyé est conservé.
5. **Paiement** : l'activation d'une formule est manuelle (route admin). Brancher Wave / Orange Money quand tu seras prêt (`paymentRef` est déjà là).
6. **Ancien rattachement par carte** : les codes de rattachement et leur colonne historique ont été supprimés; aucun parcours de rattachement n'est proposé dans l'administration.
7. **Tarifs d’abonnement** : les valeurs initiales sont Pro à 2 500 FCFA/mois et Signature à 5 000 FCFA/mois, avec 0/10/20 % de remise pour 1/3/12 mois et 10/20 % dès 10/50 fiches. Elles restent modifiables depuis Formules; les réglages déjà présents ne sont pas écrasés par la seed.
8. **Paiement réel** : Wave / Orange Money restent hors périmètre; les commandes payantes sont désactivées en production jusqu’à l’intégration d’un fournisseur et de ses notifications vérifiées.
9. **Tests automatisés** : tests ciblés présents pour les créations/commandes de fiches, les capacités des formules et les validations.
# api-sc


## Séparation des connexions client et admin

- `POST /api/auth/client/login` : accepte uniquement un compte avec le rôle `CLIENT`.
- `POST /api/auth/admin/login` : accepte uniquement un compte avec le rôle `ADMIN`.
- `POST /api/auth/login` : ancienne route conservée pour compatibilité.
- Les routes d’administration restent protégées par `requireAuth` et `requireRole("ADMIN")` côté serveur. Masquer un lien dans l’interface ne remplace jamais ces contrôles.

Exemple de corps JSON pour les deux connexions : `{ "email": "...", "password": "..." }`.
Un compte admin doit être créé avec le script `npm run create-admin` ; l’inscription publique crée toujours un compte CLIENT.
