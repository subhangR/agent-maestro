import type { RequestHandler } from 'express';
import helmet from 'helmet';

/**
 * Security headers shared by the API and the browser SPA.
 *
 * Firebase's Google sign-in flow opens a cross-origin popup and reports the
 * result back to the SPA through window.opener. Helmet defaults COOP to
 * `same-origin`, which makes that popup appear closed as soon as it navigates
 * to Google/Firebase. `same-origin-allow-popups` preserves opener access for
 * popups opened by this document while retaining COOP isolation from unrelated
 * top-level pages.
 */
export function createSecurityHeaders(): RequestHandler {
  return helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'", 'https://apis.google.com', 'https://www.gstatic.com'],
        'connect-src': [
          "'self'",
          'https://*.googleapis.com',
          'https://identitytoolkit.googleapis.com',
          'https://securetoken.googleapis.com',
          'https://firestore.googleapis.com',
          'https://firebasestorage.googleapis.com',
          'https://*.firebaseio.com',
          'wss://*.firebaseio.com',
          'https://*.cloudfunctions.net',
          'https://accounts.google.com',
        ],
        'frame-src': ["'self'", 'https://*.firebaseapp.com', 'https://accounts.google.com'],
        'img-src': [
          "'self'",
          'data:',
          'blob:',
          'https://*.googleusercontent.com',
          'https://lh3.googleusercontent.com',
        ],
      },
    },
  });
}
