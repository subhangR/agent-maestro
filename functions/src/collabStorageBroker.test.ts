import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildObjectPath,
  validateContentType,
  validateFilename,
  validateObjectPath,
  validateSpaceId,
} from './collabStorageBroker.js';

const SPACE_ID = '018f0c20-5b9f-7d31-8a00-4f1e1a2b3c4d';

test('storage broker only accepts UUID space IDs and safe filenames', () => {
  assert.equal(validateSpaceId(SPACE_ID), SPACE_ID);
  assert.equal(validateFilename('report (final).pdf'), 'report (final).pdf');
  assert.throws(() => validateSpaceId('not-a-space'));
  assert.throws(() => validateFilename('../private-key.pem'));
  assert.throws(() => validateFilename('folder/file.txt'));
});

test('storage broker builds and confines paths to the authorized space', () => {
  const path = buildObjectPath(SPACE_ID, 'report.pdf', '00000000-0000-4000-8000-000000000001');
  assert.equal(path, `spaces/${SPACE_ID}/00000000-0000-4000-8000-000000000001-report.pdf`);
  assert.equal(validateObjectPath(SPACE_ID, path), path);
  assert.throws(() => validateObjectPath(SPACE_ID, `spaces/${SPACE_ID}2/file.pdf`));
  assert.throws(() => validateObjectPath(SPACE_ID, `spaces/${SPACE_ID}/../other-space/file.pdf`));
});

test('storage broker only accepts normal MIME types', () => {
  assert.equal(validateContentType('application/pdf'), 'application/pdf');
  assert.throws(() => validateContentType('text/plain; charset=utf-8'));
  assert.throws(() => validateContentType('not a MIME type'));
});
