import { Resend } from "resend";

import { type AuthEmailTemplateInput, type RenderedAuthEmail, renderPasswordResetEmail, renderVerificationEmail } from "./authEmailTemplates.ts";

export const resend = new Resend(process.env.RESEND_API_KEY);

export const MAIL_FROM = process.env.RESEND_FROM ?? "noreply@openbts.sakilabs.com";

type AuthEmailRecipient = Omit<AuthEmailTemplateInput, "url">;

async function sendAuthEmail(to: string, email: RenderedAuthEmail): Promise<void> {
  const { error } = await resend.emails.send({
    from: MAIL_FROM,
    to,
    ...email,
  });

  if (error) throw new Error(error.message, { cause: error });
}

export function getAuthEmailRecipient(user: { name?: string | null }): AuthEmailRecipient {
  const locale = Reflect.get(user, "locale");

  return {
    name: user.name,
    locale: typeof locale === "string" ? locale : undefined,
  };
}

export async function sendVerificationEmail(to: string, url: string, recipient: AuthEmailRecipient = {}): Promise<void> {
  const email = renderVerificationEmail({ ...recipient, url });
  await sendAuthEmail(to, email);
}

export async function sendPasswordResetEmail(to: string, url: string, recipient: AuthEmailRecipient = {}): Promise<void> {
  const email = renderPasswordResetEmail({ ...recipient, url });
  await sendAuthEmail(to, email);
}
