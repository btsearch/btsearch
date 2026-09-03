import { escapeHtml } from "./html.js";

export type AuthEmailLocale = "en-US" | "pl-PL";

export type AuthEmailTemplateInput = {
  url: string;
  name?: string | null;
  locale?: string | null;
};

export type RenderedAuthEmail = {
  subject: string;
  html: string;
  text: string;
};

type AuthEmailKind = "passwordReset" | "verification";

type AuthEmailCopy = {
  subject: string;
  preheader: string;
  heading: string;
  introduction: string;
  action: string;
  expiry: string;
  securityNote: string;
  fallback: string;
  greeting: string;
  footer: string;
};

type SharedAuthEmailCopy = Pick<AuthEmailCopy, "expiry" | "fallback" | "footer" | "greeting">;
type AuthEmailKindCopy = Omit<AuthEmailCopy, keyof SharedAuthEmailCopy>;
type LocalizedAuthEmailCopy = Record<AuthEmailKind, AuthEmailKindCopy> & { shared: SharedAuthEmailCopy };

const copy: Record<AuthEmailLocale, LocalizedAuthEmailCopy> = {
  "pl-PL": {
    shared: {
      expiry: "Link jest ważny przez 1 godzinę",
      fallback: "Jeśli przycisk nie działa, skopiuj ten adres do przeglądarki:",
      greeting: "Cześć",
      footer: "Ta wiadomość została wysłana automatycznie przez BTSearch",
    },
    verification: {
      subject: "Potwierdź adres e-mail",
      preheader: "Potwierdź adres e-mail używany w BTSearch",
      heading: "Potwierdź adres e-mail",
      introduction: "Kliknij poniższy przycisk, aby potwierdzić ten adres w serwisie BTSearch",
      action: "Potwierdź adres e-mail",
      securityNote: "Jeśli nie próbowałeś potwierdzić tego adresu, możesz zignorować tę wiadomość",
    },
    passwordReset: {
      subject: "Ustaw nowe hasło",
      preheader: "Ustaw nowe hasło do konta BTSearch.",
      heading: "Ustaw nowe hasło",
      introduction: "Otrzymaliśmy prośbę o zmianę hasła do Twojego konta BTSearch",
      action: "Ustaw nowe hasło",
      securityNote: "Jeśli to nie Ty wysłałeś tę prośbę, zignoruj wiadomość. Twoje hasło pozostanie bez zmian",
    },
  },
  "en-US": {
    shared: {
      expiry: "This link is valid for 1 hour",
      fallback: "If the button does not work, copy this address into your browser:",
      greeting: "Hi",
      footer: "This email was sent automatically by BTSearch",
    },
    verification: {
      subject: "Confirm your email address",
      preheader: "Confirm the email address used with BTSearch",
      heading: "Confirm your email address",
      introduction: "Use the button below to confirm this email address in BTSearch",
      action: "Confirm email address",
      securityNote: "If you did not try to confirm this address, you can ignore this email",
    },
    passwordReset: {
      subject: "Set a new password",
      preheader: "Set a new password for your BTSearch account",
      heading: "Set a new password",
      introduction: "We received a request to change the password for your BTSearch account",
      action: "Set a new password",
      securityNote: "If you did not make this request, ignore this email. Your password will remain unchanged",
    },
  },
};

function resolveLocale(locale: string | null | undefined): AuthEmailLocale {
  return locale?.toLowerCase().startsWith("en") ? "en-US" : "pl-PL";
}

function normalizeName(name: string | null | undefined) {
  const normalizedName = name?.replace(/\s+/g, " ").trim();
  return normalizedName === "" ? undefined : normalizedName;
}

function renderAuthEmail(kind: AuthEmailKind, input: AuthEmailTemplateInput): RenderedAuthEmail {
  const locale = resolveLocale(input.locale);
  const localeCopy = copy[locale];
  const content = { ...localeCopy.shared, ...localeCopy[kind] };
  const normalizedName = normalizeName(input.name);
  const htmlGreeting = normalizedName ? `${content.greeting}, ${escapeHtml(normalizedName)}!` : `${content.greeting}!`;
  const textGreeting = normalizedName ? `${content.greeting}, ${normalizedName}!` : `${content.greeting}!`;
  const safeUrl = escapeHtml(input.url);

  const html = `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark only">
    <meta name="supported-color-schemes" content="dark only">
    <title>${escapeHtml(content.subject)}</title>
    <style>
      @media only screen and (max-width: 620px) {
        .email-shell { padding: 16px 8px !important; }
        .email-content { padding: 24px 20px !important; }
        .email-heading { font-size: 25px !important; line-height: 32px !important; }
        .email-button { display: block !important; text-align: center !important; }
      }
      a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
    </style>
  </head>
  <body style="margin:0; padding:0; background:#070b0d; color:#f3f5f7; font-family:'Nunito Sans', Arial, Helvetica, sans-serif;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${escapeHtml(content.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#070b0d" style="width:100%; background:#070b0d;">
      <tr>
        <td class="email-shell" align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; max-width:600px;">
            <tr>
              <td class="email-content" style="padding:30px 32px; border-bottom:1px solid #2a2f31;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding:0 0 22px; border-bottom:1px solid #2a2f31;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td style="color:#f3f5f7; font-size:18px; line-height:24px; font-weight:800;">
                            <img src="https://btsearch.pl/btsearch.webp" width="148" height="52" alt="BTSearch" style="display:block; width:148px; height:52px; border:0; color:#f3f5f7; font-size:18px; line-height:24px; font-weight:800; filter:brightness(0) invert(1);">
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:30px 0 0;">
                      <p style="margin:0 0 14px; color:#81878a; font-size:16px; line-height:25px;">${htmlGreeting}</p>
                      <h1 class="email-heading" style="margin:0 0 14px; color:#f3f5f7; font-size:28px; line-height:35px; font-weight:750; letter-spacing:-0.7px;">${escapeHtml(content.heading)}</h1>
                      <p style="margin:0 0 24px; color:#d6dadd; font-size:16px; line-height:25px;">${escapeHtml(content.introduction)}</p>
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
                        <tr>
                          <td bgcolor="#449ac0" style="border-radius:8px; mso-padding-alt:14px 22px;">
                            <a class="email-button" href="${safeUrl}" style="display:inline-block; padding:14px 22px; color:#050809; font-size:16px; line-height:20px; font-weight:750; text-decoration:none; border-radius:8px;">${escapeHtml(content.action)}</a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:0 0 22px; color:#f3f5f7; font-size:15px; line-height:23px; font-weight:650;">${escapeHtml(content.expiry)}</p>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; margin:0 0 24px;">
                        <tr>
                          <td style="padding:15px 16px; background:#212628; border:1px solid #2a2f31; border-radius:8px;">
                            <p style="margin:0 0 7px; color:#aeb4b7; font-size:13px; line-height:20px;">${escapeHtml(content.fallback)}</p>
                            <p style="margin:0; font-size:13px; line-height:20px; word-break:break-all;"><a href="${safeUrl}" style="color:#68b7d9; text-decoration:underline; text-underline-offset:2px;">${safeUrl}</a></p>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:0; color:#aeb4b7; font-size:14px; line-height:22px;">${escapeHtml(content.securityNote)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px 20px 0; color:#81878a; font-size:12px; line-height:18px;">${escapeHtml(content.footer)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${textGreeting}

${content.heading}

${content.introduction}

${content.action}: ${input.url}

${content.expiry}

${content.securityNote}

${content.footer}`;

  return { subject: content.subject, html, text };
}

export function renderVerificationEmail(input: AuthEmailTemplateInput) {
  return renderAuthEmail("verification", input);
}

export function renderPasswordResetEmail(input: AuthEmailTemplateInput) {
  return renderAuthEmail("passwordReset", input);
}
