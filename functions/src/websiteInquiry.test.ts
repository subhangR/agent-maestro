import assert from 'node:assert/strict';
import test from 'node:test';
import { originAllowed } from './websiteInquiry';

test('originAllowed accepts the production, preview and local origins only', () => {
  assert.equal(originAllowed('https://tm8.sh'), true);
  assert.equal(originAllowed('https://www.tm8.sh'), true);
  assert.equal(originAllowed('https://tm8-site.web.app'), true);
  assert.equal(originAllowed('https://maestro-web-fleet.web.app'), true);
  assert.equal(originAllowed('https://maestro-web-fleet.firebaseapp.com'), true);
  assert.equal(originAllowed('https://maestro-web-fleet--pr12-ab12cd34.web.app'), true);
  assert.equal(originAllowed('http://localhost:4173'), true);
  assert.equal(originAllowed('http://127.0.0.1:4173'), true);
  assert.equal(originAllowed('https://pr12-ab12cd34--maestro-web-fleet.web.app'), false);
  assert.equal(originAllowed('https://evil.example'), false);
  assert.equal(originAllowed('http://tm8.sh'), false);
  assert.equal(originAllowed(undefined), false);
  assert.equal(originAllowed('not a url'), false);
});
