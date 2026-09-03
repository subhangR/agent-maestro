import { createHash } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineString } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { createTransport } from 'nodemailer';

const REGION = 'asia-southeast1';

// Email notification config. CONTACT_MAIL_PASS is a Gmail App Password supplied via
// an env param (kept in the git-ignored functions/.env.maestro-5f3fc). While it is
// the "PENDING" placeholder, email is skipped and enquiries are still stored.
const MAIL_USER = defineString('CONTACT_MAIL_USER', { default: 'manzilshaik95@gmail.com' });
const MAIL_TO = defineString('CONTACT_MAIL_TO', { default: 'manzilshaik95@gmail.com' });
const MAIL_PASS = defineString('CONTACT_MAIL_PASS', { default: 'PENDING' });
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 4;
const TYPES = new Set(['general', 'demo', 'partnership', 'contributor', 'support']);

type Inquiry = {
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  type: string;
  message: string;
};

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseInquiry(value: unknown): { inquiry?: Inquiry; error?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'Invalid request.' };
  const body = value as Record<string, unknown>;
  if (text(body.website, 200)) return { error: 'Unable to accept this request.' };

  const name = text(body.name, 100);
  const email = text(body.email, 254).toLowerCase();
  const phone = text(body.phone, 40);
  const company = text(body.company, 120);
  const type = text(body.type, 30);
  const message = text(body.message, 4000);

  if (name.length < 2) return { error: 'Please enter your name.' };
  if (!validEmail(email)) return { error: 'Please enter a valid email address.' };
  if (!TYPES.has(type)) return { error: 'Please choose a reach-out type.' };
  if (message.length < 20) return { error: 'Please include at least 20 characters in your message.' };
  if (body.consent !== true) return { error: 'Please consent to being contacted about this enquiry.' };

  return { inquiry: { name, email, phone: phone || null, company: company || null, type, message } };
}

export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    // Production hosts (the canonical domain and the Firebase site), Firebase preview
    // channels (SITE_ID--CHANNEL_ID-HASH.web.app), and local previews.
    return url.protocol === 'https:' && (
      url.hostname === 'tm8.sh'
      || url.hostname === 'www.tm8.sh'
      || url.hostname === 'maestro-web-fleet.web.app'
      || url.hostname === 'maestro-web-fleet.firebaseapp.com'
      || /^maestro-web-fleet--[a-z0-9-]+\.web\.app$/.test(url.hostname)
    ) || url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function applyCors(response: { set(key: string, value: string): unknown }, origin: string | undefined): void {
  if (!originAllowed(origin) || !origin) return;
  response.set('Access-Control-Allow-Origin', origin);
  response.set('Vary', 'Origin');
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
  response.set('Access-Control-Max-Age', '3600');
}

async function sendInquiryEmail(inquiry: Inquiry, referenceId: string): Promise<void> {
  const pass = MAIL_PASS.value();
  const user = MAIL_USER.value();
  // Skip quietly until a real Gmail App Password replaces the placeholder.
  if (!user || !pass || pass === 'PENDING') return;
  const transporter = createTransport({ service: 'gmail', auth: { user, pass } });
  const to = MAIL_TO.value() || user;
  const reference = referenceId.slice(0, 8).toUpperCase();
  const lines = [
    `New enquiry from the Maestro website`,
    ``,
    `Reference: ${reference}`,
    `Type:      ${inquiry.type}`,
    `Name:      ${inquiry.name}`,
    `Email:     ${inquiry.email}`,
    inquiry.phone ? `Phone:     ${inquiry.phone}` : '',
    inquiry.company ? `Company:   ${inquiry.company}` : '',
    ``,
    `Message:`,
    inquiry.message,
  ].filter((line) => line !== '');
  await transporter.sendMail({
    from: `Maestro Website <${user}>`,
    to,
    replyTo: inquiry.email,
    subject: `Maestro enquiry · ${inquiry.type} · ${inquiry.name} [${reference}]`,
    text: lines.join('\n'),
  });
}

function clientFingerprint(request: { ip?: string; headers: Record<string, unknown> }): string {
  // Under the functions framework's trust-proxy setting request.ip is the left-most
  // X-Forwarded-For hop, which a caller can set; this key is best effort and is backed
  // by a second bucket keyed on the submitted email address.
  const ip = request.ip ?? (() => {
    const forwarded = request.headers['x-forwarded-for'];
    return typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';
  })();
  const agent = typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : 'unknown';
  return createHash('sha256').update(`maestro-contact-v1|${ip}|${agent}`).digest('hex');
}

async function consumeRateLimit(key: string): Promise<boolean> {
  const db = getFirestore();
  const ref = db.collection('websiteInquiryRateLimits').doc(key);
  const now = Date.now();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    const windowStartedAt = typeof data?.windowStartedAt === 'number' ? data.windowStartedAt : 0;
    const count = typeof data?.count === 'number' ? data.count : 0;
    if (now - windowStartedAt < RATE_WINDOW_MS && count >= RATE_LIMIT) return false;
    transaction.set(ref, {
      windowStartedAt: now - windowStartedAt >= RATE_WINDOW_MS ? now : windowStartedAt,
      count: now - windowStartedAt >= RATE_WINDOW_MS ? 1 : count + 1,
      expiresAt: new Date(now + RATE_WINDOW_MS * 2),
    });
    return true;
  });
}

export const submitWebsiteInquiry = onRequest(
  { region: REGION, cors: false, timeoutSeconds: 15, maxInstances: 10 },
  async (request, response) => {
    response.set('Cache-Control', 'no-store');
    response.set('X-Content-Type-Options', 'nosniff');
    const origin = request.get('origin');
    applyCors(response, origin);
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }
    if (request.method !== 'POST') {
      response.set('Allow', 'POST, OPTIONS').status(405).json({ ok: false, error: 'Method not allowed.' });
      return;
    }
    if (!originAllowed(origin)) {
      response.status(403).json({ ok: false, error: 'Request origin is not allowed.' });
      return;
    }

    const parsed = parseInquiry(request.body);
    if (!parsed.inquiry) {
      response.status(400).json({ ok: false, error: parsed.error });
      return;
    }

    try {
      const fingerprint = clientFingerprint(request);
      const emailKey = createHash('sha256').update(`maestro-contact-email-v1|${parsed.inquiry.email}`).digest('hex');
      if (!await consumeRateLimit(fingerprint) || !await consumeRateLimit(emailKey)) {
        response.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
        return;
      }
      const reference = await getFirestore().collection('websiteInquiries').add({
        ...parsed.inquiry,
        status: 'new',
        source: 'marketing-website',
        createdAt: FieldValue.serverTimestamp(),
      });
      logger.info('Website enquiry received.', { inquiryId: reference.id, type: parsed.inquiry.type });
      try {
        await sendInquiryEmail(parsed.inquiry, reference.id);
      } catch (mailError) {
        // The enquiry is already durably stored; a mail failure must not fail the request.
        logger.error('Website enquiry email notification failed.', mailError);
      }
      response.status(201).json({ ok: true, reference: reference.id.slice(0, 8).toUpperCase() });
    } catch (error) {
      logger.error('Website enquiry submission failed.', error);
      response.status(500).json({ ok: false, error: 'We could not send your message. Please try again.' });
    }
  },
);
