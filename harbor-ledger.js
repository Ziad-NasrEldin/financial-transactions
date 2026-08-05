const STORAGE_KEY = 'harbor.test-ledger.v1';

export const TEST_BANK_PROFILE = {
  id: 'harbor-test-bank-debit-v1',
  displayName: 'Zoid Bank Test Bank',
  sender: '+201000001234',
  senders: ['+201000001234'],
  parserVersion: 'demo-debit-v1',
  autoApprove: true,
  kind: 'debit'
};

export const REAL_BANK_PROFILES = [
  {
    id: 'bank-al-ahly',
    displayName: 'Bank Al Ahly',
    senders: ['BanK-AlAhly', 'Bank-AlAhly'],
    parserVersion: 'bank-al-ahly-ar-v1',
    autoApprove: true,
    kind: 'card-debit'
  },
  {
    id: 'banque-misr',
    displayName: 'Banque Misr',
    senders: ['Banque Misr'],
    parserVersion: 'banque-misr-transfer-ar-v1',
    autoApprove: true,
    kind: 'transfer'
  }
];

const BANK_PROFILES = [TEST_BANK_PROFILE, ...REAL_BANK_PROFILES];

const defaultState = {
  version: 1,
  messageIds: [],
  events: [],
  reviewCandidates: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSender(value) {
  const sender = String(value || '').trim();
  if (/\d/.test(sender)) return sender.replace(/[^\d+]/g, '');
  return sender.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, '');
}

function profileForSender(sender) {
  const normalized = normalizeSender(sender);
  return BANK_PROFILES.find((profile) => profile.senders.some((candidate) => normalizeSender(candidate) === normalized));
}

function numberFromCurrency(value) {
  if (!value) return null;
  const normalized = value.replace(/,/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function categoryForMerchant(merchant) {
  const candidate = merchant.toLowerCase();
  if (candidate.includes('transfer')) return 'Transfers';
  if (candidate.includes('air') || candidate.includes('metro') || candidate.includes('transport')) return 'Transport';
  if (candidate.includes('market') || candidate.includes('grocery')) return 'Groceries';
  if (candidate.includes('internet') || candidate.includes('utilities')) return 'Home & utilities';
  if (candidate.includes('coffee') || candidate.includes('cafe')) return 'Eating out';
  return 'Other';
}

function formatFixtureDate(value) {
  const [day, month, year] = value.split('/');
  const date = new Date(year + '-' + month + '-' + day + 'T12:00:00Z');
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function formatMessageDate(receivedAt) {
  const date = new Date(receivedAt);
  if (Number.isNaN(date.getTime())) return 'Unresolved date';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function parsedResult({ amount, merchant, receivedAt, direction, currency = 'EGP', category }) {
  const reasons = [];
  if (!amount) reasons.push('Amount is missing or invalid');
  if (!merchant) reasons.push('Merchant or transfer description is missing');
  if (currency !== 'EGP') reasons.push('Currency is not supported by the EGP ledger');
  if (reasons.length) {
    return {
      ok: false,
      reasons,
      amount,
      merchant,
      date: formatMessageDate(receivedAt),
      category: category || categoryForMerchant(merchant || ''),
      direction,
      currency
    };
  }
  return {
    ok: true,
    amount,
    merchant,
    date: formatMessageDate(receivedAt),
    category: category || categoryForMerchant(merchant),
    direction,
    currency
  };
}

export function parseBankAlAhlyMessage(body, receivedAt) {
  if (/هذا الكود|OTP|رمز/i.test(body)) {
    return { ok: false, ignore: true, reasons: ['Security-code alert is not a transaction'] };
  }

  const debitMatch = body.match(/تم\s+خصم\s+(?:(EGP|USD)\s*)?([\d,]+(?:\.\d{1,2})?)\s*(?:(ج\.?\s*م)|(EGP|USD))?/i);
  const creditMatch = body.match(/تم\s+إضافة\s+تحويل\s+لحظي[\s\S]*?بمبلغ\s+([\d,]+(?:\.\d{1,2})?)\s*(?:ج\.?\s*م|EGP)/i);
  const refundMatch = body.match(/تم\s+رد\s+مبلغ\s+(?:(EGP|USD|EUR)\s*)?((?:[\d,]+(?:\.\d{1,2})?)|(?:\.\d{1,2}))\s*(?:(ج\.?\s*م)|(EGP|USD|EUR))?[\s\S]*?خصمه\s+من\s+(.+)/i);
  if (creditMatch) {
    return parsedResult({
      amount: numberFromCurrency(creditMatch[1]),
      merchant: 'Incoming instant transfer',
      receivedAt,
      direction: 'credit',
      currency: 'EGP',
      category: 'Transfers'
    });
  }
  if (refundMatch) {
    const currency = (refundMatch[1] || refundMatch[4] || 'EGP').toUpperCase();
    return parsedResult({
      amount: numberFromCurrency(refundMatch[2]),
      merchant: refundMatch[5]?.trim(),
      receivedAt,
      direction: 'credit',
      currency,
      category: 'Refunds'
    });
  }
  if (!debitMatch) {
    return {
      ok: false,
      ignore: !/تم\s+(?:خصم(?![\u0600-\u06ff])|رد\s+مبلغ|إضافة\s+تحويل)/i.test(body),
      reasons: ['Recognized sender but no supported debit or credit pattern']
    };
  }

  const currency = (debitMatch[1] || debitMatch[4] || 'EGP').toUpperCase();
  const merchantMatch = body.match(/عند\s+(?:التاجر\s*)?(.+?)(?=\s+يوم(?:\s|$)|\s+الرصيد(?:\s|$)|\s+المتاح(?:\s|$)|\s+والمتبقي(?:\s|$)|\s+للمزيد(?:\s|$)|$)/i);
  return parsedResult({
    amount: numberFromCurrency(debitMatch[2]),
    merchant: merchantMatch?.[1]?.trim(),
    receivedAt,
    direction: 'debit',
    currency
  });
}

export function parseBanqueMisrMessage(body, receivedAt) {
  const transferMatch = body.match(/تم\s+(تحويل|إضافة|اضافة)\s+مبلغ\s+([\d,]+(?:\.\d{1,2})?)\s*EGP/i);
  if (!transferMatch) {
    const cardAddition = body.match(/تم\s+إضافة\s+مبلغ\s*(?:(EGP|USD)\s*)?([\d,]+(?:\.\d{1,2})?)\s*(?:(EGP|USD))?/i);
    if (cardAddition) {
      const merchantMatch = body.match(/\s([A-Z][A-Z0-9 .-]{2,}?)\s+يوم/i);
      const currency = (cardAddition[1] || cardAddition[3] || 'EGP').toUpperCase();
      return {
        ok: false,
        reasons: ['Card transaction format requires a human check'],
        amount: numberFromCurrency(cardAddition[2]),
        merchant: merchantMatch?.[1]?.trim() || 'Card transaction',
        date: formatMessageDate(receivedAt),
        category: 'Other',
        direction: 'debit',
        currency
      };
    }
    return {
      ok: false,
      ignore: !/تم\s+(?:تحويل|إضافة|اضافة)\s+مبلغ/i.test(body),
      reasons: ['Recognized sender but no supported transfer pattern']
    };
  }
  return parsedResult({
    amount: numberFromCurrency(transferMatch[2]),
    merchant: 'Instant transfer',
    receivedAt,
    direction: transferMatch[1] === 'تحويل' ? 'debit' : 'credit',
    currency: 'EGP',
    category: 'Transfers'
  });
}

export function parseMessageForProfile(profile, body, receivedAt) {
  if (profile.id === TEST_BANK_PROFILE.id) return parseDebitFixture(body);
  if (profile.id === 'bank-al-ahly') return parseBankAlAhlyMessage(body, receivedAt);
  if (profile.id === 'banque-misr') return parseBanqueMisrMessage(body, receivedAt);
  return { ok: false, reasons: ['No parser is registered for this sender profile'] };
}

function redactPreview(body) {
  return String(body || '')
    .replace(/[0-9٠-٩][0-9٠-٩,.:/-]{2,}/g, '••••')
    .slice(0, 180);
}

export function parseDebitFixture(body) {
  const amountMatch = body.match(/\b(?:EGP|ج\.?م)\s*([\d,]+(?:\.\d{1,2})?)/i);
  const merchantMatch = body.match(/\bat\s+(.+?)\s+on\s+\d{2}\/\d{2}\/\d{4}\b/i);
  const dateMatch = body.match(/\bon\s+(\d{2}\/\d{2}\/\d{4})\b/i);
  const isDebit = /\b(?:debit|purchase|card purchase)\b/i.test(body);
  const amount = numberFromCurrency(amountMatch?.[1]);
  const merchant = merchantMatch?.[1]?.trim();

  if (!isDebit || !amount || !merchant || !dateMatch) {
    return {
      ok: false,
      reasons: [
        !isDebit && 'Debit direction is missing',
        !amount && 'Amount is missing or invalid',
        !merchant && 'Merchant is missing',
        !dateMatch && 'Transaction date is missing'
      ].filter(Boolean)
    };
  }

  return {
    ok: true,
    amount,
    merchant,
    date: formatFixtureDate(dateMatch[1]),
    category: categoryForMerchant(merchant),
    direction: 'debit'
  };
}

export function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

export function createHarborLedger(storage = window.localStorage) {
  const saved = storage.getItem(STORAGE_KEY);
  let state = saved ? JSON.parse(saved) : clone(defaultState);

  function persist() {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function snapshot() {
    return clone(state);
  }

  function addCandidate(message, reasons, parsed = {}, profile = null) {
    const existingCandidate = state.reviewCandidates.find((candidate) => candidate.sourceId === message.id);
    if (existingCandidate) {
      return { kind: 'duplicate', candidate: clone(existingCandidate) };
    }
    const candidate = {
      id: 'candidate-' + message.id,
      sourceId: message.id,
      sender: message.sender,
      senderProfileId: profile?.id || 'unknown-sender',
      senderProfileName: profile?.displayName || message.sender,
      parserVersion: profile?.parserVersion || 'unrecognized',
      receivedAt: message.receivedAt,
      preview: redactPreview(message.body),
      merchant: parsed.merchant || 'Unresolved merchant',
      amount: parsed.amount || 0,
      date: parsed.date || 'Unresolved date',
      category: parsed.category || 'Unresolved category',
      direction: parsed.direction || 'debit',
      currency: parsed.currency || 'EGP',
      reasons,
      status: 'needs_review'
    };
    state.reviewCandidates.unshift(candidate);
    state.messageIds.push(message.id);
    persist();
    return { kind: 'needs_review', candidate: clone(candidate) };
  }

  function ingest(message) {
    if (state.messageIds.includes(message.id)) {
      const existingEvent = state.events.find((event) => event.sourceId === message.id);
      const existingCandidate = state.reviewCandidates.find((candidate) => candidate.sourceId === message.id);
      return {
        kind: 'duplicate',
        event: existingEvent ? clone(existingEvent) : undefined,
        candidate: existingCandidate ? clone(existingCandidate) : undefined
      };
    }

    const profile = profileForSender(message.sender);
    if (!profile) {
      return addCandidate(message, ['Sender is not on the approved bank list']);
    }

    const parsed = parseMessageForProfile(profile, message.body, message.receivedAt);
    if (!parsed.ok) {
      if (parsed.ignore) {
        state.messageIds.push(message.id);
        persist();
        return { kind: 'ignored', reasons: parsed.reasons };
      }
      return addCandidate(message, parsed.reasons, parsed, profile);
    }

    if (!profile.autoApprove) {
      return addCandidate(message, ['Automatic approval is disabled for this sender profile'], parsed, profile);
    }

    const event = {
      id: 'event-' + message.id,
      sourceId: message.id,
      senderProfileId: profile.id,
      senderProfileName: profile.displayName,
      parserVersion: profile.parserVersion,
      receivedAt: message.receivedAt,
      preview: redactPreview(message.body),
      merchant: parsed.merchant,
      amount: parsed.amount,
      date: parsed.date,
      category: parsed.category,
      direction: parsed.direction,
      currency: parsed.currency || 'EGP',
      source: profile.id === TEST_BANK_PROFILE.id ? 'Bank SMS · auto-approved' : 'Messages · auto-approved',
      status: 'auto_approved',
      decision: {
        mode: 'automatic',
        reason: 'Allow-listed sender and validated parser',
        decidedAt: new Date().toISOString()
      }
    };
    state.events.unshift(event);
    state.messageIds.push(message.id);
    persist();
    return { kind: 'auto_approved', event: clone(event) };
  }

  function approveCandidate(candidateId) {
    const candidateIndex = state.reviewCandidates.findIndex((candidate) => candidate.id === candidateId);
    if (candidateIndex < 0) return { kind: 'missing' };
    const candidate = state.reviewCandidates[candidateIndex];
    const event = {
      id: 'event-' + candidate.sourceId,
      sourceId: candidate.sourceId,
      senderProfileId: candidate.senderProfileId,
      senderProfileName: candidate.senderProfileName,
      parserVersion: candidate.parserVersion,
      receivedAt: candidate.receivedAt,
      preview: candidate.preview,
      merchant: candidate.merchant,
      amount: candidate.amount,
      date: candidate.date,
      category: candidate.category,
      direction: candidate.direction,
      currency: candidate.currency || 'EGP',
      source: 'Messages · manually approved',
      status: 'approved',
      decision: {
        mode: 'manual',
        reason: 'Human review approval',
        decidedAt: new Date().toISOString()
      }
    };
    state.reviewCandidates.splice(candidateIndex, 1);
    state.events.unshift(event);
    persist();
    return { kind: 'approved', event: clone(event) };
  }

  function runAutoApprovalTest() {
    const suffix = Date.now() + '-' + (state.events.length + 1);
    return ingest({
      id: 'harbor-test-debit-' + suffix,
      sender: TEST_BANK_PROFILE.sender,
      receivedAt: '2026-08-04T12:00:00.000Z',
      body: 'Debit EGP 1,240.00 at Nile Air Store on 31/07/2026.'
    });
  }

  function runExceptionTest() {
    const suffix = Date.now() + '-' + (state.reviewCandidates.length + 1);
    return ingest({
      id: 'harbor-test-exception-' + suffix,
      sender: '+201000008888',
      receivedAt: '2026-08-04T12:01:00.000Z',
      body: 'Zoid Bank alert EGP 500.00 on 04/08/2026.'
    });
  }

  function reset() {
    state = clone(defaultState);
    persist();
  }

  return {
    profiles: () => clone(BANK_PROFILES),
    ingest,
    approveCandidate,
    reset,
    runAutoApprovalTest,
    runExceptionTest,
    snapshot
  };
}
