import assert from 'node:assert/strict';
import test from 'node:test';

import { bangkokDate, defaultPickupSlotRows } from '../src/admin/pickup-slots.ts';

test('pickup schedule uses the Bangkok calendar date', () => {
  const beforeBangkokMidnight = new Date('2026-08-03T16:59:00.000Z');
  const afterBangkokMidnight = new Date('2026-08-03T17:01:00.000Z');
  assert.equal(bangkokDate(0, beforeBangkokMidnight), '2026-08-03');
  assert.equal(bangkokDate(0, afterBangkokMidnight), '2026-08-04');
});

test('default pickup schedule restores three slots per day for 14 days', () => {
  const rows = defaultPickupSlotRows(14, new Date('2026-08-03T17:01:00.000Z'));
  assert.equal(rows.length, 42);
  assert.deepEqual(rows[0], {
    slot_date: '2026-08-04',
    start_time: '09:00:00',
    end_time: '11:00:00',
    capacity: 8,
    enabled: true,
  });
  assert.equal(rows.at(-1)?.slot_date, '2026-08-17');
});
