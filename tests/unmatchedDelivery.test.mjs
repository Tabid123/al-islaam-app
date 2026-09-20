import test from 'node:test';
import assert from 'node:assert/strict';
import { queueUnmatchedDelivery } from '../src/lib/unmatchedDelivery.ts';

const input = () => ({
  payment: { id: 'receipt-1', tx_id: 'carrier-transaction-1', sender_phone: '252619999999' },
  receiverPhone: '626880252', providerId: 'somtel-id', providerName: 'Somtel',
  pkg: { id: 'package-1', package_name: 'Unlimited data & voice', data_amount: 'internet kaliya', selling_price: 0.18 },
});

function fixture() {
  const db = { payment_receipts: [{ id: 'receipt-1', status: 'unmatched', matched_order_id: null }], orders: [], delivery_queue: [] };
  const state = { calls: [], activationError: null, invalidQueue: false, failReceiptUpdate: false, loseActivationReply: false };
  const client = {
    from(table) {
      let action = 'read', payload, single = false;
      const filters = [];
      const inFilters = [];
      const q = {
        select() { return q; },
        eq(k, v) { filters.push([k, v]); return q; },
        in(k, values) { inFilters.push([k, values]); return q; },
        single() { single = true; return q; },
        maybeSingle() { single = true; return q; },
        insert(v) { action = 'insert'; payload = v; return q; },
        update(v) { action = 'update'; payload = v; return q; },
        delete() { action = 'delete'; return q; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            state.calls.push(`${table}:${action}`);
            if (action === 'insert') {
              assert.notEqual(table, 'delivery_queue', 'the UI must never insert an incomplete delivery');
              if (db.orders.some(o => o.tx_id === payload.tx_id)) return { data: null, error: { code: '23505' } };
              const row = { id: `order-${db.orders.length + 1}`, ...payload };
              db[table].push(row);
              return { data: single ? row : [row], error: null };
            }
            const matches = (row) =>
              filters.every(([k, v]) => row[k] === v) &&
              inFilters.every(([k, values]) => values.includes(row[k]));
            const rows = db[table].filter(matches);
            if (action === 'delete') {
              db[table] = db[table].filter(row => !matches(row));
              return { data: rows, error: null };
            }
            if (action === 'update') {
              if (state.failReceiptUpdate) return { data: null, error: new Error('Receipt write unavailable') };
              rows.forEach(row => Object.assign(row, payload));
            }
            return { data: single ? rows[0] || null : rows, error: null };
          }).then(resolve, reject);
        },
      };
      return q;
    },
    functions: { async invoke(name, { body }) {
      state.calls.push('activate');
      assert.equal(name, 'activate-package');
      assert.deepEqual(body, { orderId: 'order-1', providerName: 'Somtel', receiverPhone: '626880252' });
      if (state.activationError) return { data: null, error: state.activationError };
      db.delivery_queue.push({ id: `queue-${db.delivery_queue.length + 1}`, order_id: body.orderId, status: 'pending', ussd_code: state.invalidQueue ? null : '*831*626880252*0*20#', dispatched_at: null });
      if (state.loseActivationReply) return { data: null, error: new Error('Network response lost') };
      return { data: { success: true, queueId: db.delivery_queue.at(-1).id }, error: null };
    } },
  };
  return { db, state, client };
}

test('unmatched order is activated before its receipt is marked matched', async () => {
  const f = fixture();
  assert.equal(await queueUnmatchedDelivery(f.client, input()), 'order-1');
  assert.equal(f.db.payment_receipts[0].status, 'matched');
  assert.equal(f.db.payment_receipts[0].matched_order_id, 'order-1');
  assert.ok(f.state.calls.indexOf('activate') < f.state.calls.indexOf('payment_receipts:update'));
});

test('activation failure leaves receipt unmatched; retry reuses the same order', async () => {
  const f = fixture();
  f.state.activationError = new Error('Missing delivery instruction');
  await assert.rejects(queueUnmatchedDelivery(f.client, input()), /Missing delivery instruction/);
  assert.equal(f.db.payment_receipts[0].status, 'unmatched');
  assert.equal(f.db.delivery_queue.length, 0);
  f.state.activationError = null;
  await queueUnmatchedDelivery(f.client, input());
  assert.equal(f.db.orders.length, 1);
});

test('receipt update failure is surfaced; retry does not dispatch again', async () => {
  const f = fixture();
  f.state.failReceiptUpdate = true;
  await assert.rejects(queueUnmatchedDelivery(f.client, input()), /Receipt write/);
  f.state.failReceiptUpdate = false;
  await queueUnmatchedDelivery(f.client, input());
  assert.equal(f.state.calls.filter(x => x === 'activate').length, 1);
  assert.equal(f.db.orders.length, 1);
});

test('lost activation response recovers the existing queue without resending', async () => {
  const f = fixture();
  f.state.loseActivationReply = true;
  await assert.rejects(queueUnmatchedDelivery(f.client, input()), /Network response lost/);
  await queueUnmatchedDelivery(f.client, input());
  assert.equal(f.state.calls.filter(x => x === 'activate').length, 1);
});

test('legacy bare pending queue is removed and rebuilt through activate-package', async () => {
  const f = fixture();
  f.db.orders.push({
    id: 'order-1', tx_id: 'carrier-transaction-1', package_id: 'package-1', provider_id: 'somtel-id',
    receiver_phone: '626880252', payment_source: 'offline_unmatched_retry', delivery_status: 'pending',
  });
  f.db.delivery_queue.push({ id: 'legacy-null', order_id: 'order-1', status: 'pending', ussd_code: null, dispatched_at: null });
  await queueUnmatchedDelivery(f.client, input());
  assert.ok(!f.db.delivery_queue.some(q => q.id === 'legacy-null'));
  assert.equal(f.state.calls.filter(x => x === 'activate').length, 1);
  assert.equal(f.db.delivery_queue.length, 1);
  assert.match(f.db.delivery_queue[0].ussd_code, /^\*831\*/);
  assert.equal(f.db.payment_receipts[0].status, 'matched');
});

test('dispatched code-less queue is ambiguous and is never deleted or reactivated', async () => {
  const f = fixture();
  f.db.orders.push({
    id: 'order-1', tx_id: 'carrier-transaction-1', package_id: 'package-1', provider_id: 'somtel-id',
    receiver_phone: '626880252', payment_source: 'offline_unmatched_retry', delivery_status: 'pending',
  });
  f.db.delivery_queue.push({ id: 'ambiguous', order_id: 'order-1', status: 'processing', ussd_code: null, dispatched_at: '2026-09-16T18:00:00Z' });
  await assert.rejects(queueUnmatchedDelivery(f.client, input()), /natiijadu ma cadda/);
  assert.equal(f.db.delivery_queue.length, 1);
  assert.equal(f.db.delivery_queue[0].id, 'ambiguous');
  assert.equal(f.state.calls.filter(x => x === 'activate').length, 0);
  assert.equal(f.db.payment_receipts[0].status, 'unmatched');
});

test('a newly-created null USSD queue is rejected and remains unmatched', async () => {
  const f = fixture();
  f.state.invalidQueue = true;
  await assert.rejects(queueUnmatchedDelivery(f.client, input()), /code ma jiro/);
  assert.equal(f.db.payment_receipts[0].status, 'unmatched');
});

test('verification-required queue is preserved and never reactivated', async () => {
  const f = fixture();
  f.state.failReceiptUpdate = true;
  await assert.rejects(queueUnmatchedDelivery(f.client, input()));
  f.db.delivery_queue[0].status = 'verification_required';
  f.state.failReceiptUpdate = false;
  await assert.rejects(queueUnmatchedDelivery(f.client, input()), /natiijadu ma cadda/);
  assert.equal(f.state.calls.filter(x => x === 'activate').length, 1);
});

test('concurrent clicks in the same client share one activation', async () => {
  const f = fixture();
  await Promise.all([queueUnmatchedDelivery(f.client, input()), queueUnmatchedDelivery(f.client, input())]);
  assert.equal(f.state.calls.filter(x => x === 'activate').length, 1);
  assert.equal(f.db.orders.length, 1);
});

test('missing carrier transaction ID still has a stable retry identity', async () => {
  const f = fixture();
  const i = input(); i.payment.tx_id = null;
  f.state.activationError = new Error('offline');
  await assert.rejects(queueUnmatchedDelivery(f.client, i));
  f.state.activationError = null;
  await queueUnmatchedDelivery(f.client, i);
  assert.equal(f.db.orders.length, 1);
  assert.equal(f.db.orders[0].tx_id, 'unmatched:receipt-1');
});

test('changing the recipient during a retry cannot repurpose an existing order', async () => {
  const f = fixture();
  f.state.activationError = new Error('offline');
  await assert.rejects(queueUnmatchedDelivery(f.client, input()));
  const changed = input(); changed.receiverPhone = '626880253';
  await assert.rejects(queueUnmatchedDelivery(f.client, changed), /dalab kale/);
  assert.equal(f.db.orders.length, 1);
});

test('already-matched receipts and invalid phones never activate', async () => {
  const f = fixture();
  f.db.payment_receipts[0].status = 'matched';
  await assert.rejects(queueUnmatchedDelivery(f.client, input()), /hore ayaa/);
  const invalid = input(); invalid.receiverPhone = '';
  await assert.rejects(queueUnmatchedDelivery(f.client, invalid), /lambar sax ah/);
  assert.equal(f.db.orders.length, 0);
  assert.ok(!f.state.calls.includes('activate'));
});
