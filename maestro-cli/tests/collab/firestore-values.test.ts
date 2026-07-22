import { describe, expect, it } from 'vitest';
import { decode, encode } from '../../src/collab/firestore.js';

describe('Firestore value round trips', () => {
  it('preserves timestamps as timestamp values through transaction re-encoding', () => {
    const timestamp = { timestampValue: '2030-01-01T00:00:00.000Z' };
    const decoded = decode(timestamp);
    expect(decoded).toBeInstanceOf(Date);
    expect(encode(decoded)).toEqual(timestamp);
  });
});
