import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TEST_BANK_PROFILE,
  createHarborLedger,
  createMemoryStorage,
  parseBankAlAhlyMessage,
  parseBanqueMisrMessage,
  parseDebitFixture
} from '../harbor-ledger.js';
import {
  createManualRecurringRule,
  detectRecurringPatterns,
  normalizeMerchantName,
  setManualRecurringRulePaused,
  updateManualRecurringRule
} from '../harbor-recurring.js';

test('parses an allow-listed debit fixture', () => {
  const parsed = parseDebitFixture('Zoid Bank Test Bank: Debit EGP 1,240.00 at Nile Air Store on 31/07/2026.');

  assert.equal(parsed.ok, true);
  assert.equal(parsed.amount, 1240);
  assert.equal(parsed.merchant, 'Nile Air Store');
  assert.equal(parsed.category, 'Transport');
  assert.equal(parsed.date, '31 Jul 2026');
});

test('automatically approves a valid fixture from the approved sender', () => {
  const ledger = createHarborLedger(createMemoryStorage());
  const result = ledger.ingest({
    id: 'valid-message-001',
    sender: TEST_BANK_PROFILE.sender,
    receivedAt: '2026-08-04T12:00:00.000Z',
    body: 'Zoid Bank Test Bank: Debit EGP 1,240.00 at Nile Air Store on 31/07/2026.'
  });

  assert.equal(result.kind, 'auto_approved');
  assert.equal(result.event.status, 'auto_approved');
  assert.equal(result.event.decision.mode, 'automatic');
  assert.equal(ledger.snapshot().events.length, 1);
  assert.equal(ledger.snapshot().reviewCandidates.length, 0);
});

test('parses Bank Al Ahly Arabic card debits and ignores OTP alerts', () => {
  const parsed = parseBankAlAhlyMessage(
    'تم خصم 725 جم من بطاقة الائتمان رقم 4939 عند McDonalds Egypt يوم 04-08 الساعة 17:35 المتاح 560763.13 جم للمزيد اتصل ب 19623',
    '2026-08-04T15:35:00.000Z'
  );

  assert.equal(parsed.ok, true);
  assert.equal(parsed.amount, 725);
  assert.equal(parsed.merchant, 'McDonalds Egypt');
  assert.equal(parsed.direction, 'debit');

  const otp = parseBankAlAhlyMessage('هذا الكود سري وهو مخصص لعملية الشراء بمبلغ EGP 725 عند التاجر McDonalds NBE OTP: 123456', '2026-08-04T15:35:00.000Z');
  assert.equal(otp.ok, false);
  assert.match(otp.reasons[0], /Security-code/);

  const foreign = parseBankAlAhlyMessage('تم خصم USD 12.50 من بطاقة الائتمان رقم 4939 عند APPLE.COM/BILL يوم 04-08', '2026-08-04T15:35:00.000Z');
  assert.equal(foreign.ok, false);
  assert.match(foreign.reasons[0], /Currency/);
});

test('parses Banque Misr instant transfer debit and credit alerts', () => {
  const outgoing = parseBanqueMisrMessage('تم تحويل مبلغ 100EGP من حساب رقم xxx0709 فى JUL-2026 عن طريق التحويل اللحظي', '2026-07-02T20:42:00.000Z');
  const incoming = parseBanqueMisrMessage('تم اضافة مبلغ 1000EGP الى حساب رقم xxx0709 فى JUL-2026 عن طريق التحويل اللحظي', '2026-07-03T00:44:00.000Z');

  assert.equal(outgoing.direction, 'debit');
  assert.equal(outgoing.amount, 100);
  assert.equal(incoming.direction, 'credit');
  assert.equal(incoming.amount, 1000);
});

test('automatically approves the two confirmed real sender profiles', () => {
  const ledger = createHarborLedger(createMemoryStorage());
  const ahly = ledger.ingest({
    id: 'ahly-real-001',
    sender: 'BanK-AlAhly',
    receivedAt: '2026-08-05T00:07:09.000Z',
    body: 'تم خصم 165 جم من بطاقة الائتمان رقم 4939 بإستخدام Mobile payment عند Orange يوم 05-08 الساعة 00:06 المتاح 560598.13 جم للمزيد اتصل ب 19623'
  });
  const misr = ledger.ingest({
    id: 'misr-real-001',
    sender: 'Banque Misr',
    receivedAt: '2026-07-03T00:44:00.000Z',
    body: 'تم اضافة مبلغ 1000EGP الى حساب رقم xxx0709 فى JUL-2026 عن طريق التحويل اللحظي'
  });

  assert.equal(ahly.kind, 'auto_approved');
  assert.equal(ahly.event.senderProfileId, 'bank-al-ahly');
  assert.equal(misr.kind, 'auto_approved');
  assert.equal(misr.event.senderProfileId, 'banque-misr');
  assert.equal(misr.event.direction, 'credit');
});

test('routes an unknown sender to review instead of automatically approving it', () => {
  const ledger = createHarborLedger(createMemoryStorage());
  const result = ledger.ingest({
    id: 'unknown-sender-001',
    sender: '+201000008888',
    receivedAt: '2026-08-04T12:01:00.000Z',
    body: 'Debit EGP 500.00 at Unverified Market on 04/08/2026.'
  });

  assert.equal(result.kind, 'needs_review');
  assert.match(result.candidate.reasons[0], /approved bank list/);
  assert.equal(ledger.snapshot().events.length, 0);
});

test('lets a human approve a held candidate into the local ledger', () => {
  const ledger = createHarborLedger(createMemoryStorage());
  const result = ledger.ingest({
    id: 'manual-review-001',
    sender: '+201000008888',
    receivedAt: '2026-08-04T12:01:00.000Z',
    body: 'Debit EGP 500.00 at Unverified Market on 04/08/2026.'
  });

  const approved = ledger.approveCandidate(result.candidate.id);

  assert.equal(approved.kind, 'approved');
  assert.equal(approved.event.status, 'approved');
  assert.equal(approved.event.decision.mode, 'manual');
  assert.equal(approved.event.source, 'Messages · manually approved');
  assert.equal(ledger.snapshot().reviewCandidates.length, 0);
  assert.equal(ledger.snapshot().events.length, 1);
});

test('routes duplicate source messages to review and never creates a second event', () => {
  const ledger = createHarborLedger(createMemoryStorage());
  const message = {
    id: 'duplicate-message-001',
    sender: TEST_BANK_PROFILE.sender,
    receivedAt: '2026-08-04T12:00:00.000Z',
    body: 'Zoid Bank Test Bank: Debit EGP 1,240.00 at Nile Air Store on 31/07/2026.'
  };

  assert.equal(ledger.ingest(message).kind, 'auto_approved');
  const duplicate = ledger.ingest(message);

  assert.equal(duplicate.kind, 'duplicate');
  assert.equal(ledger.snapshot().events.length, 1);
  assert.equal(ledger.snapshot().reviewCandidates.length, 0);
});

function approvedDebit(id, merchant, date, amount, extra = {}) {
  return {
    id,
    sourceId: id,
    senderProfileId: 'bank-al-ahly',
    merchant,
    amount,
    date,
    category: 'Home & utilities',
    currency: 'EGP',
    direction: 'debit',
    status: 'auto_approved',
    ...extra
  };
}

test('detects a normalized monthly pattern from approved debit evidence and excludes manual entries', () => {
  const patterns = detectRecurringPatterns([
    approvedDebit('home-001', 'Home Internet Payment', '1 Jan 2026', 860),
    approvedDebit('home-002', 'home internet', '31 Jan 2026', 865),
    approvedDebit('home-003', 'HOME INTERNET', '2 Mar 2026', 855),
    approvedDebit('manual-home', 'Home internet', '1 Apr 2026', 860, { sourceType: 'manual' })
  ], { asOf: '5 Mar 2026' });

  assert.equal(normalizeMerchantName('Home Internet Payment'), 'home internet');
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].evidenceCount, 3);
  assert.equal(patterns[0].status, 'confirmed');
  assert.equal(patterns[0].cadence, 'Monthly');
  assert.equal(patterns[0].cadenceDays, 30);
  assert.equal(patterns[0].amount, 860);
  assert.equal(patterns[0].amountTolerance, 86);
  assert.equal(patterns[0].nextObservedDate, '2026-04-01');
});

test('marks amount changes and stale patterns without turning them into schedules', () => {
  const changed = detectRecurringPatterns([
    approvedDebit('changed-001', 'Gym membership', '1 Jan 2026', 500),
    approvedDebit('changed-002', 'Gym membership', '31 Jan 2026', 500),
    approvedDebit('changed-003', 'Gym membership', '2 Mar 2026', 700)
  ], { asOf: '5 Mar 2026' });
  const paused = detectRecurringPatterns([
    approvedDebit('paused-001', 'Old subscription', '1 Jun 2026', 120),
    approvedDebit('paused-002', 'Old subscription', '1 Jul 2026', 120),
    approvedDebit('paused-003', 'Old subscription', '1 Aug 2026', 120)
  ], { asOf: '15 Oct 2026' });

  assert.equal(changed[0].status, 'changed');
  assert.equal(changed[0].nextObservedDate, '2026-04-01');
  assert.equal(paused[0].status, 'paused');
  assert.equal(paused[0].nextObservedDate, null);
});

test('creates a local manual recurring rule from an approved debit without mutating evidence', () => {
  const transaction = {
    id: 'event-home-001',
    sourceType: 'bank',
    source: 'Messages · auto-approved',
    status: 'Approved',
    direction: 'debit',
    name: 'Home internet',
    category: 'Home & utilities',
    amount: -860,
    currency: 'EGP',
    dateValue: '2026-08-04'
  };
  const rule = createManualRecurringRule(transaction, {
    cadence: 'monthly',
    amount: 875,
    nextExpectedDate: '2026-09-03',
    createdAt: '2026-08-05T10:00:00.000Z'
  });

  assert.equal(rule.id, 'manual-recurring-event-home-001');
  assert.equal(rule.type, 'manual');
  assert.equal(rule.status, 'manual');
  assert.equal(rule.amount, 875);
  assert.equal(rule.cadence, 'Monthly');
  assert.equal(rule.nextExpectedDate, '2026-09-03');
  assert.equal(rule.evidenceCount, 0);
  assert.deepEqual(rule.evidenceIds, []);
  assert.throws(() => createManualRecurringRule({ ...transaction, sourceType: 'manual' }), /imported bank transaction/);
  assert.throws(() => createManualRecurringRule({ ...transaction, status: 'Needs review' }), /Review the imported transaction/);
});

test('updates, pauses, and resumes a manual recurring rule without changing its source evidence', () => {
  const transaction = {
    id: 'event-mobile-001',
    sourceType: 'bank',
    source: 'Messages · auto-approved',
    status: 'Auto-approved',
    direction: 'debit',
    name: 'Mobile plan',
    category: 'Utilities',
    amount: -480,
    currency: 'EGP',
    dateValue: '2026-08-04'
  };
  const original = createManualRecurringRule(transaction, {
    cadence: 'monthly',
    nextExpectedDate: '2026-09-03'
  });
  const updated = updateManualRecurringRule(original, {
    amount: 510,
    cadence: 'biweekly',
    nextExpectedDate: '2026-08-18',
    updatedAt: '2026-08-05T10:00:00.000Z'
  });
  const paused = setManualRecurringRulePaused(updated, true);
  const resumed = setManualRecurringRulePaused(paused, false);

  assert.equal(updated.id, original.id);
  assert.equal(updated.sourceEventId, original.sourceEventId);
  assert.equal(updated.amount, 510);
  assert.equal(updated.cadence, 'Every 2 weeks');
  assert.equal(updated.nextExpectedDate, '2026-08-18');
  assert.equal(updated.evidenceCount, 0);
  assert.equal(paused.paused, true);
  assert.equal(resumed.paused, false);
});
