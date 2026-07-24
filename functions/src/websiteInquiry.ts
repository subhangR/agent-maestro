import { createHash } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';

const REGION = 'asia-southeast1';
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

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && (
      url.hostname === 'maestro-web-fleet.web.app'
      || url.hostname === 'maestro-web-fleet.firebaseapp.com'
      || url.hostname.endsWith('--maestro-web-fleet.web.app')
    ) || url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function clientFingerprint(request: { ip?: string; headers: Record<string, unknown> }): string {
  const forwarded = request.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : request.ip ?? 'unknown';
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
    if (request.method !== 'POST') {
      response.set('Allow', 'POST').status(405).json({ ok: false, error: 'Method not allowed.' });
      return;
    }
    if (!originAllowed(request.get('origin'))) {
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
      if (!await consumeRateLimit(fingerprint)) {
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
      response.status(201).json({ ok: true, reference: reference.id.slice(0, 8).toUpperCase() });
    } catch (error) {
      logger.error('Website enquiry submission failed.', error);
      response.status(500).json({ ok: false, error: 'We could not send your message. Please try again.' });
    }
  },
);
