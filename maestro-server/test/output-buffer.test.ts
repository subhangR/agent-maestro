import { OutputBuffer } from '../src/application/services/OutputBuffer';

const buf = (s: string) => Buffer.from(s, 'utf8');

describe('OutputBuffer', () => {
  describe('offset accounting', () => {
    it('starts empty at offset 0', () => {
      const b = new OutputBuffer();
      expect(b.totalBytes).toBe(0);
      expect(b.startOffset).toBe(0);
    });

    it('tracks total bytes across appends', () => {
      const b = new OutputBuffer();
      b.append(buf('hello')); // 5
      b.append(buf(' world')); // 6
      expect(b.totalBytes).toBe(11);
      expect(b.startOffset).toBe(0);
    });
  });

  describe('replayFrom — no eviction', () => {
    it('replays the whole stream from offset 0', () => {
      const b = new OutputBuffer();
      b.append(buf('hello'));
      const r = b.replayFrom(0);
      expect(r.base).toBe(0);
      expect(r.gap).toBe(0);
      expect(r.next).toBe(5); // raw total, authoritative resume offset
      expect(r.data.toString('utf8')).toBe('hello');
    });

    it('replays only the delta from a mid-stream offset', () => {
      const b = new OutputBuffer();
      b.append(buf('hel'));
      b.append(buf('lo')); // total "hello"
      const r = b.replayFrom(3);
      expect(r.base).toBe(3);
      expect(r.gap).toBe(0);
      expect(r.next).toBe(5);
      expect(r.data.toString('utf8')).toBe('lo');
    });

    it('returns nothing when the client is already caught up, but next still points at the end', () => {
      const b = new OutputBuffer();
      b.append(buf('hello'));
      const r = b.replayFrom(5);
      expect(r.base).toBe(5);
      expect(r.gap).toBe(0);
      expect(r.next).toBe(5);
      expect(r.data.length).toBe(0);
    });

    it('slices across a chunk boundary at an exact byte offset', () => {
      const b = new OutputBuffer();
      b.append(buf('abc'));
      b.append(buf('def'));
      b.append(buf('ghi')); // "abcdefghi", total 9
      const r = b.replayFrom(4); // mid second chunk
      expect(r.base).toBe(4);
      expect(r.gap).toBe(0);
      expect(r.next).toBe(9);
      expect(r.data.toString('utf8')).toBe('efghi');
    });
  });

  describe('replayFrom — next is the raw total, independent of base/gap', () => {
    it('reports next === totalBytes on every replay shape', () => {
      const b = new OutputBuffer();
      b.append(buf('abcdef')); // total 6
      expect(b.replayFrom(0).next).toBe(6);
      expect(b.replayFrom(3).next).toBe(6);
      expect(b.replayFrom(6).next).toBe(6);
      b.append(buf('ghi')); // total 9
      expect(b.replayFrom(0).next).toBe(9);
      expect(b.replayFrom(9).next).toBe(9);
    });
  });

  describe('replayFrom — eviction produces an explicit gap', () => {
    it('evicts oldest bytes over the cap and reports the gap', () => {
      const b = new OutputBuffer(8); // tiny cap
      b.append(buf('abcd')); // total 4, buffered 4
      b.append(buf('efgh')); // total 8, buffered 8
      b.append(buf('ijkl')); // total 12 — evicts "abcd", buffered 8 -> startOffset 4
      expect(b.totalBytes).toBe(12);
      expect(b.startOffset).toBe(4);

      // Client that had 0 bytes asks to resume from 0: bytes [0,4) are gone.
      const r = b.replayFrom(0);
      expect(r.gap).toBe(4); // "abcd" lost
      expect(r.base).toBe(4); // resume at first retained byte
      expect(r.next).toBe(12); // still the raw end of stream
      expect(r.data.toString('utf8')).toBe('efghijkl');
    });

    it('reports no gap when the requested offset is still retained', () => {
      const b = new OutputBuffer(8);
      b.append(buf('abcd'));
      b.append(buf('efgh'));
      b.append(buf('ijkl')); // startOffset 4
      const r = b.replayFrom(6); // still within the retained window
      expect(r.gap).toBe(0);
      expect(r.base).toBe(6);
      expect(r.next).toBe(12);
      expect(r.data.toString('utf8')).toBe('ghijkl');
    });
  });

  describe('replayFrom — defensive offsets', () => {
    it('treats a negative offset as a full replay from the retained start', () => {
      const b = new OutputBuffer();
      b.append(buf('hello'));
      const r = b.replayFrom(-5);
      expect(r.base).toBe(0);
      expect(r.gap).toBe(0);
      expect(r.next).toBe(5);
      expect(r.data.toString('utf8')).toBe('hello');
    });

    it('treats a NaN offset as a full replay from the retained start', () => {
      const b = new OutputBuffer();
      b.append(buf('hello'));
      const r = b.replayFrom(Number.NaN);
      expect(r.base).toBe(0);
      expect(r.next).toBe(5);
      expect(r.data.toString('utf8')).toBe('hello');
    });

    it('treats an offset strictly beyond the stream as a fresh full replay', () => {
      // A client cannot have received more bytes than were produced within one
      // stream, so offset > total means a stale offset carried over from a
      // previous (respawned) stream. Full-replay the new stream from the start
      // rather than clamping to the end and skipping its initial output.
      const b = new OutputBuffer();
      b.append(buf('hello')); // total 5
      const r = b.replayFrom(999);
      expect(r.base).toBe(0);
      expect(r.gap).toBe(0);
      expect(r.next).toBe(5);
      expect(r.data.toString('utf8')).toBe('hello');
    });

    it('still treats an offset exactly at the end as caught up (not a rewind)', () => {
      // Boundary: from === total is a legitimate caught-up reconnect, distinct
      // from from > total (cross-stream). Must stay caught up, not full-replay.
      const b = new OutputBuffer();
      b.append(buf('hello')); // total 5
      const r = b.replayFrom(5);
      expect(r.base).toBe(5);
      expect(r.gap).toBe(0);
      expect(r.next).toBe(5);
      expect(r.data.length).toBe(0);
    });
  });

  describe('never drops the only chunk even if it exceeds the cap', () => {
    it('keeps a single oversized chunk so live output is not lost', () => {
      const b = new OutputBuffer(4);
      b.append(buf('abcdefghij')); // 10 bytes, cap 4
      expect(b.totalBytes).toBe(10);
      // The single chunk is retained; startOffset stays 0.
      expect(b.startOffset).toBe(0);
      const r = b.replayFrom(0);
      expect(r.gap).toBe(0);
      expect(r.next).toBe(10);
      expect(r.data.toString('utf8')).toBe('abcdefghij');
    });
  });

  describe('default cap is 1 MiB', () => {
    it('retains up to 1 MiB of raw output before evicting', () => {
      const b = new OutputBuffer();
      const half = Buffer.alloc(512 * 1024, 0x61); // 'a'
      b.append(half);
      b.append(half); // exactly 1 MiB buffered — nothing evicted yet
      expect(b.startOffset).toBe(0);
      b.append(buf('x')); // 1 MiB + 1 → evicts the first 512 KiB chunk
      expect(b.startOffset).toBe(512 * 1024);
      expect(b.totalBytes).toBe(1024 * 1024 + 1);
    });
  });
});
