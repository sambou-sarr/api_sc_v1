// Usage :  npm run create-admin -- admin@exemple.sn "MotDePasseSolide123" "Nom (facultatif)"
// Un ADMIN ne peut être créé que par ce script (jamais via l'API d'inscription).
import "dotenv/config"; // charge le .env (DATABASE_URL) : ce script tourne sans passer par le serveur
import { prisma } from "../src/database/prisma/prisma-client";
import { hashPassword } from "../src/lib/password";

async function main() {
  const [email, password, nom] = process.argv.slice(2);
  if (!email || !password || password.length < 10) {
    console.error(
      'Usage : npm run create-admin -- <email> "<mot de passe (10 caractères min)>" ["<nom>"]'
    );
    process.exit(1);
  }

  const emailNormalise = email.toLowerCase();
  const passwordHash = await hashPassword(password);

  // upsert = updateOrCreate() de Laravel :
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
      emailVerifiedAt: new Date(), // e-mail considéré comme vérifié : pas besoin de lien de confirmation
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