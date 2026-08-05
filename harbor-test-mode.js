import { REAL_BANK_PROFILES, TEST_BANK_PROFILE } from './harbor-ledger.js';

const BRIDGE_URL = 'http://127.0.0.1:4317';

function button(label, onClick, className = 'button button-secondary') {
  const element = document.createElement('button');
  element.className = className;
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
}

function listRow(label, value) {
  const row = document.createElement('div');
  row.className = 'settings-list-row';
  const name = document.createElement('span');
  name.textContent = label;
  const detail = document.createElement('strong');
  detail.textContent = value;
  row.append(name, detail);
  return row;
}

async function updateBridgeStatus(status) {
  try {
    const response = await fetch(BRIDGE_URL + '/health');
    const health = await response.json();
    status.textContent = health.ok && health.databaseReadable && health.helperAvailable ? 'Ready' : 'Unavailable';
    status.className = health.ok && health.databaseReadable && health.helperAvailable
      ? 'source-chip source-chip-bank'
      : 'source-chip source-chip-review';
  } catch {
    status.textContent = 'Start local bridge';
    status.className = 'source-chip source-chip-review';
  }
}

async function scanMacMessages(scanButton) {
  scanButton.disabled = true;
  scanButton.textContent = 'Scanning local Messages...';
  try {
    const response = await fetch(BRIDGE_URL + '/messages?limit=500');
    if (!response.ok) throw new Error('bridge-unavailable');
    const payload = await response.json();
    const counts = { approved: 0, review: 0, ignored: 0, duplicate: 0 };
    payload.messages.forEach((message) => {
      const result = window.__harborLedger.ingest(message);
      if (result.kind === 'auto_approved') counts.approved += 1;
      else if (result.kind === 'needs_review') counts.review += 1;
      else if (result.kind === 'ignored') counts.ignored += 1;
      else if (result.kind === 'duplicate') counts.duplicate += 1;
    });
    window.__harborRender();
    window.__harborShowToast(
      'Scanned ' + payload.messages.length + ' local alerts: ' +
      counts.approved + ' approved, ' + counts.review + ' sent to review.'
    );
  } catch {
    window.__harborShowToast('Messages scan unavailable. Start the local bridge with npm run messages:bridge.');
  } finally {
    scanButton.disabled = false;
    scanButton.textContent = 'Scan Mac Messages';
  }
}

function renderTestMode() {
  const settings = document.querySelector('.settings-layout');
  if (!settings || document.querySelector('#automatic-approval-test-mode')) return;

  const card = document.createElement('section');
  card.id = 'automatic-approval-test-mode';
  card.className = 'card settings-section';
  card.setAttribute('aria-labelledby', 'automatic-approval-test-title');

  const heading = document.createElement('div');
  heading.className = 'card-header';
  const headingCopy = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.className = 'card-label';
  eyebrow.textContent = 'Messages source';
  const title = document.createElement('h2');
  title.id = 'automatic-approval-test-title';
  title.textContent = 'Bank alerts on this Mac Mini';
  headingCopy.append(eyebrow, title);
  const status = document.createElement('span');
  status.className = 'source-chip source-chip-review';
  status.textContent = 'Checking...';
  heading.append(headingCopy, status);

  const description = document.createElement('p');
  description.textContent = 'Read-only source for Bank Al Ahly and Banque Misr. Zoid Bank does not send, mark read, edit, or delete Messages.';

  const details = document.createElement('div');
  details.className = 'settings-list';
  details.append(
    listRow('Approved profiles', REAL_BANK_PROFILES.map((profile) => profile.displayName).join(' · ')),
    listRow('Bank Al Ahly sender', REAL_BANK_PROFILES[0].senders.join(' · ')),
    listRow('Banque Misr sender', REAL_BANK_PROFILES[1].senders.join(' · ')),
    listRow('Validated parsers', REAL_BANK_PROFILES.map((profile) => profile.parserVersion).join(' · ')),
    listRow('Access boundary', 'Local read-only')
  );

  const actions = document.createElement('div');
  actions.className = 'detail-buttons';
  const scanButton = button('Scan Mac Messages', () => scanMacMessages(scanButton), 'button button-primary');
  actions.append(scanButton);

  const fixtureLabel = document.createElement('p');
  fixtureLabel.className = 'card-note';
  fixtureLabel.textContent = 'Fixture controls for safe testing';
  const fixtureActions = document.createElement('div');
  fixtureActions.className = 'detail-buttons';
  fixtureActions.append(
    button('Run fixture approval', () => {
      const result = window.__harborLedger.runAutoApprovalTest();
      window.__harborRender();
      window.__harborShowToast(result.kind === 'auto_approved'
        ? 'Fixture alert auto-approved and added to the local ledger.'
        : 'Fixture alert was routed to review.');
    }),
    button('Run exception test', () => {
      window.__harborLedger.runExceptionTest();
      window.__harborRender();
      window.__harborShowToast('Unexpected sender kept out of automatic approval.');
    })
  );

  card.append(heading, description, details, actions, fixtureLabel, fixtureActions);
  settings.append(card);
  updateBridgeStatus(status);
}

new MutationObserver(renderTestMode).observe(document.body, { childList: true, subtree: true });
renderTestMode();
