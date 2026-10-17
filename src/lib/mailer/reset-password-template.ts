// emails/password-reset.template.ts
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function resetPasswordEmailTemplate(
  logo_url: string,
  prenom: string,
  reset_url: string,
  expiration: string,
  annee: string = String(new Date().getFullYear()),
) {
  const safeLogo = escapeHtml(logo_url);
  const safePrenom = escapeHtml(prenom);
  const safeUrl = escapeHtml(reset_url);
  const safeExpiration = escapeHtml(expiration);

  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <title>Réinitialisation de votre mot de passe – Support Connecté</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;-webkit-text-size-adjust:100%;">

  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f4f6;">
    Vous avez demandé à réinitialiser votre mot de passe Support Connecté.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

          <tr>
            <td style="height:6px;background-color:#b91c1c;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <tr>
            <td align="center" style="padding:32px 24px 8px 24px;background-color:#ffffff;">
              <img src="${safeLogo}" alt="Support Connecté" width="200" style="display:block;width:200px;max-width:100%;height:auto;border:0;outline:none;" />
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px 8px 40px;font-family:Arial,Helvetica,sans-serif;color:#111111;">
              <h1 style="margin:0 0 16px 0;font-size:24px;line-height:32px;font-weight:700;color:#111111;">
                Réinitialisez votre mot de passe
              </h1>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#374151;">
                Bonjour ${safePrenom},
              </p>
              <p style="margin:0 0 24px 0;font-size:16px;line-height:24px;color:#374151;">
                Nous avons reçu une demande de réinitialisation du mot de passe de votre compte
                <strong style="color:#111111;">Support Connecté</strong>.
                Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:0 40px 24px 40px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safeUrl}" style="height:52px;v-text-anchor:middle;width:300px;" arcsize="15%" stroke="f" fillcolor="#b91c1c">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Choisir un nouveau mot de passe</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${safeUrl}" target="_blank"
                 style="display:inline-block;background-color:#b91c1c;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:52px;text-align:center;text-decoration:none;padding:0 40px;border-radius:8px;">
                Choisir un nouveau mot de passe
              </a>
              <!--<![endif]-->
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 24px 40px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0;font-size:14px;line-height:22px;color:#6b7280;text-align:center;">
                Ce lien est valable <strong>${safeExpiration}</strong> et ne peut être utilisé qu'une seule fois.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 24px 40px;font-family:Arial,Helvetica,sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;border-radius:8px;border-left:4px solid #b91c1c;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 8px 0;font-size:13px;line-height:20px;color:#374151;">
                      Le bouton ne fonctionne pas ? Copiez et collez ce lien dans votre navigateur :
                    </p>
                    <p style="margin:0;font-size:13px;line-height:20px;word-break:break-all;">
                      <a href="${safeUrl}" target="_blank" style="color:#b91c1c;text-decoration:underline;">${safeUrl}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Alerte sécurité -->
          <tr>
            <td style="padding:0 40px 32px 40px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 8px 0;font-size:13px;line-height:20px;color:#111111;font-weight:700;">
                Vous n'êtes pas à l'origine de cette demande ?
              </p>
              <p style="margin:0;font-size:13px;line-height:20px;color:#6b7280;">
                Ignorez cet e-mail : votre mot de passe actuel reste inchangé. Ne partagez ce lien avec personne,
                l'équipe Support Connecté ne vous demandera jamais votre mot de passe.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="background-color:#111111;padding:24px 40px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:3px;color:#ffffff;text-transform:uppercase;">
                Connecter <span style="color:#dc2626;">&bull;</span> Partager <span style="color:#dc2626;">&bull;</span> Simplifier
              </p>
              <p style="margin:0;font-size:12px;line-height:18px;color:#9ca3af;">
                &copy; ${annee} Support Connecté. Tous droits réservés.<br />
                Cet e-mail a été envoyé automatiquement, merci de ne pas y répondre.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}