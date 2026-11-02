import { type Transporter, createTransport } from 'nodemailer';

import { env } from '~/env';
import { INVITE_EMAIL_SUBJECT, buildInviteEmailText } from '~/lib/inviteMessage';
import { escapeHtml } from '~/lib/utils';

import { sendToDiscord } from './service-notification';

// oxlint-disable-next-line init-declarations
let transporter: Transporter;

export const mailServerConfig = {
  host: env.EMAIL_SERVER_HOST,
  port: parseInt(env.EMAIL_SERVER_PORT ?? ''),
  auth: { user: env.EMAIL_SERVER_USER, pass: env.EMAIL_SERVER_PASSWORD },
  tls: {
    rejectUnauthorized: env.NODE_ENV !== 'development' ? env.EMAIL_TLS_REJECT_UNAUTHORIZED : false,
  },
};

const getTransporter = () => {
  if (transporter) {
    return transporter;
  }

  if (!mailServerConfig.host) {
    return undefined;
  }

  const transport = {
    ...mailServerConfig,
    secure: 465 === mailServerConfig.port,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  };

  transporter = createTransport(transport);
  return transporter;
};

export async function sendSignUpEmail(email: string, url: string, token: string) {
  const { host } = new URL(url);

  console.log(env.NODE_ENV);

  if ('development' === env.NODE_ENV) {
    console.log('Sign in link : ', email, url, token);
    return true;
  }

  const subject = 'Sign in to Safi';
  const text = `Hey,\n\nYou can sign in to Safi by clicking the below URL:\n${url}\n\nYou can also use this OTP: ${token}\n\nThanks,\nSafi Team`;
  const html = `<p>Hey,</p> <p>You can sign in to Safi by clicking the below URL:</p><p><a href="${url}">Sign in to ${host}</a></p><p>You can also use this OTP: <b>${token}</b></p><br /><br /><p>Thanks,</p><br/>Safi Team</p>`;

  return await sendMail(email, subject, text, html);
}

export async function sendInviteEmail(email: string, name: string, url: string = env.NEXTAUTH_URL) {
  if (!env.ENABLE_SENDING_INVITES) {
    throw new Error('Sending invites is not enabled');
  }

  const { host } = new URL(url);

  if ('development' === env.NODE_ENV) {
    console.log('Sending invite email', email, name);
    return true;
  }

  const subject = INVITE_EMAIL_SUBJECT;
  const text = buildInviteEmailText(name, url);
  const html = `<p>Hey,</p> <p>You have been invited to Safi by ${escapeHtml(name)}. Safi keeps your team's expenses, receipts and project budgets in one place. You can sign in to Safi by clicking the below URL:</p><p><a href="${escapeHtml(url)}">Sign in to ${host}</a></p><br><p>Thanks,<br/>Safi Team</p>`;

  return await sendMail(email, subject, text, html);
}

export async function sendFeedbackEmail(
  feedback: string,
  user: { name?: string | null; email?: string | null },
) {
  console.log('Received feedback from: ', user.email, 'Feedback: ', feedback);

  if (!env.FEEDBACK_EMAIL) {
    return;
  }

  const subject = `Feedback received on Safi from ${user.name}`;
  const text = `Feedback created by ${user.name} :\n\nFeedback: ${feedback}\n\nemail: ${user.email}`;

  await sendMail(env.FEEDBACK_EMAIL, subject, text, text, user.email ?? undefined);
}

/** Renewal reminder email, used when a participant has no push subscription. */
export async function sendRenewalReminderEmail(
  email: string,
  message: { subject: string; line: string; openLabel: string; footer: string; dir: 'ltr' | 'rtl' },
) {
  if (!env.NEXTAUTH_URL) {
    return false;
  }
  const url = new URL('/subscriptions', env.NEXTAUTH_URL).toString();

  if ('development' === env.NODE_ENV) {
    console.log('Sending renewal reminder email', message.line);
    return true;
  }

  const text = `${message.line}\n\n${message.openLabel}: ${url}\n\n${message.footer}\n\nSafi`;
  const html = `<div dir="${message.dir}"><p>${escapeHtml(message.line)}</p><p><a href="${url}">${escapeHtml(message.openLabel)}</a></p><p style="font-size:12px">${escapeHtml(message.footer)}</p><p>Safi</p></div>`;

  return await sendMail(email, message.subject, text, html);
}

async function sendMail(
  email: string,
  subject: string,
  text: string,
  html: string,
  replyTo?: string,
) {
  const mailTransporter = getTransporter();
  try {
    if (mailTransporter) {
      await mailTransporter.sendMail({
        to: email,
        from: env.FROM_EMAIL,
        subject,
        text,
        html,
        replyTo,
      });

      console.log('Email sent');
      return true;
    } else {
      console.log('SMTP server not configured, so skipping');
    }
  } catch (error) {
    console.log('Error sending email', error);
    await Promise.resolve(
      sendToDiscord(
        `Error sending email: ${
          error instanceof Error
            ? `error.message: ${error.message}\nerror.stack: ${error.stack}`
            : 'Unknown error'
        }`,
      ),
    ).catch((notificationError: unknown) => {
      console.error('Failed to report email error to Discord', notificationError);
    });
  }

  return false;
}
