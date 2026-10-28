// Usage :  npm run create-admin -- admin@exemple.sn "MotDePasseSolide123" "Nom (facultatif)"
// Un ADMIN ne peut être créé que par ce script (jamais via l'API d'inscription).
import "dotenv/config"; // charge le .env (DATABASE_URL) : ce script tourne sans passer par le serveur
import { prisma } from "../database/prisma/prisma-client";
import { hashPassword } from "../lib/password";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const nom = process.env.ADMIN_NAME?.trim();

  if (!email || !password) {
    console.error("✖ ADMIN_EMAIL et ADMIN_PASSWORD doivent être définis dans le .env");
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("✖ ADMIN_PASSWORD doit contenir au moins 10 caractères");
    process.exit(1);
  }

  const emailNormalise = email.toLowerCase();
  const passwordHash = await hashPassword(password);

  // upsert :
  //  - le compte n'existe pas -> il est créé directement en ADMIN
  //  - le compte existe déjà  -> il passe ADMIN et son mot de passe est remplacé
  const user = await prisma.user.upsert({
    where: { email: emailNormalise },
    update: {
      role: "ADMIN",
      passwordHash,
      emailVerifiedAt: new Date(),
      ...(nom ? { nom } : {}),
    },
    create: {
      email: emailNormalise,
      passwordHash,
      role: "ADMIN",
      emailVerifiedAt: new Date(), // e-mail considéré comme vérifié
      nom: nom ?? null,
    },
  });

  console.log(`✔ Admin prêt : ${user.email} (id ${user.id})`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());