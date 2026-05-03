#!/usr/bin/env node

/**
 * Read-marker smoke test
 *
 * Purpose:
 * 1) capture receiver read-marker baseline
 * 2) send a message as sender
 * 3) verify receiver unread marker increments
 * 4) mark thread as read as receiver
 * 5) verify unread marker clears
 *
 * Required env vars:
 * - SMOKE_SENDER_TOKEN
 * - SMOKE_RECEIVER_TOKEN
 * - SMOKE_MARKER_CHAT_TYPE          (project-professional | project-general | assist | private-foh)
 * - SMOKE_MARKER_THREAD_ID
 * - SMOKE_SEND_ENDPOINT             (absolute URL or API-relative path)
 *
 * Optional env vars:
 * - SMOKE_API_BASE_URL              default: http://localhost:3001
 * - SMOKE_MARK_READ_ENDPOINT        default: /updates/messages/mark-read
 * - SMOKE_MESSAGE_CONTENT
 * - SMOKE_THREAD_SCOPE
 * - SMOKE_THREAD_SCOPE_ID
 * - SMOKE_POLL_ATTEMPTS             default: 8
 * - SMOKE_POLL_DELAY_MS             default: 1200
 */

const API_BASE_URL = (process.env.SMOKE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const SENDER_TOKEN = process.env.SMOKE_SENDER_TOKEN || '';
const RECEIVER_TOKEN = process.env.SMOKE_RECEIVER_TOKEN || '';
const MARKER_CHAT_TYPE = process.env.SMOKE_MARKER_CHAT_TYPE || '';
const MARKER_THREAD_ID = process.env.SMOKE_MARKER_THREAD_ID || '';
const SEND_ENDPOINT = process.env.SMOKE_SEND_ENDPOINT || '';
const MARK_READ_ENDPOINT = process.env.SMOKE_MARK_READ_ENDPOINT || '/updates/messages/mark-read';
const THREAD_SCOPE = process.env.SMOKE_THREAD_SCOPE || '';
const THREAD_SCOPE_ID = process.env.SMOKE_THREAD_SCOPE_ID || '';
const MESSAGE_CONTENT =
  process.env.SMOKE_MESSAGE_CONTENT ||
  `Smoke marker check @ ${new Date().toISOString()}`;
const POLL_ATTEMPTS = Number(process.env.SMOKE_POLL_ATTEMPTS || '8');
const POLL_DELAY_MS = Number(process.env.SMOKE_POLL_DELAY_MS || '1200');

function ensureRequired() {
  const missing = [];
  if (!SENDER_TOKEN) missing.push('SMOKE_SENDER_TOKEN');
  if (!RECEIVER_TOKEN) missing.push('SMOKE_RECEIVER_TOKEN');
  if (!MARKER_CHAT_TYPE) missing.push('SMOKE_MARKER_CHAT_TYPE');
  if (!MARKER_THREAD_ID) missing.push('SMOKE_MARKER_THREAD_ID');
  if (!SEND_ENDPOINT) missing.push('SMOKE_SEND_ENDPOINT');

  if (missing.length > 0) {
    console.error('Missing required env vars:');
    for (const key of missing) console.error(`- ${key}`);
    process.exit(1);
  }
}

function toUrl(input) {
  if (/^https?:\/\//i.test(input)) return input;
  if (!input.startsWith('/')) return `${API_BASE_URL}/${input}`;
  return `${API_BASE_URL}${input}`;
}

async function apiFetch(url, options = {}, label = 'request') {
  const response = await fetch(url, options);
  const raw = await response.text();
  let body = raw;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    // Keep raw text
  }

  if (!response.ok) {
    const printable = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`${label} failed (${response.status}): ${printable}`);
  }

  return body;
}

async function getReadMarker(token) {
  const url = new URL(`${API_BASE_URL}/updates/messages/read-marker`);
  url.searchParams.set('chatType', MARKER_CHAT_TYPE);
  url.searchParams.set('threadId', MARKER_THREAD_ID);
  if (THREAD_SCOPE && THREAD_SCOPE_ID) {
    url.searchParams.set('threadScope', THREAD_SCOPE);
    url.searchParams.set('threadScopeId', THREAD_SCOPE_ID);
  }

  const marker = await apiFetch(
    url.toString(),
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    'read-marker'
  );

  return {
    lastReadMessageId: marker?.lastReadMessageId ?? null,
    firstUnreadMessageId: marker?.firstUnreadMessageId ?? null,
    unreadCount: Number(marker?.unreadCount || 0),
  };
}

async function sendMessage() {
  const sendUrl = toUrl(SEND_ENDPOINT);
  const payload = {
    content: MESSAGE_CONTENT,
    attachments: [],
  };

  if (THREAD_SCOPE && THREAD_SCOPE_ID) {
    payload.threadScope = THREAD_SCOPE;
    payload.threadScopeId = THREAD_SCOPE_ID;
  }

  const result = await apiFetch(
    sendUrl,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SENDER_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    'send-message'
  );

  return result;
}

async function markAsRead() {
  const markReadUrl = toUrl(MARK_READ_ENDPOINT);
  return apiFetch(
    markReadUrl,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RECEIVER_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatType: MARKER_CHAT_TYPE,
        threadId: MARKER_THREAD_ID,
      }),
    },
    'mark-read'
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntil(label, predicate) {
  for (let i = 1; i <= POLL_ATTEMPTS; i += 1) {
    const marker = await getReadMarker(RECEIVER_TOKEN);
    const ok = predicate(marker);
    console.log(
      `[poll ${i}/${POLL_ATTEMPTS}] ${label} unread=${marker.unreadCount} firstUnread=${marker.firstUnreadMessageId || 'null'}`
    );
    if (ok) return marker;
    if (i < POLL_ATTEMPTS) await sleep(POLL_DELAY_MS);
  }
  return null;
}

async function main() {
  ensureRequired();

  console.log('=== Read-Marker Smoke Test ===');
  console.log(`API base: ${API_BASE_URL}`);
  console.log(`chatType: ${MARKER_CHAT_TYPE}`);
  console.log(`threadId: ${MARKER_THREAD_ID}`);
  console.log(`sendEndpoint: ${toUrl(SEND_ENDPOINT)}`);

  const baseline = await getReadMarker(RECEIVER_TOKEN);
  console.log(
    `[baseline] unread=${baseline.unreadCount} firstUnread=${baseline.firstUnreadMessageId || 'null'} lastRead=${baseline.lastReadMessageId || 'null'}`
  );

  await sendMessage();
  console.log('[send] message posted');

  const afterSend = await pollUntil('after-send', (marker) => {
    return marker.unreadCount > baseline.unreadCount;
  });

  if (!afterSend) {
    throw new Error('Unread did not increase after send within polling window');
  }

  console.log(
    `[assert] unread increased: ${baseline.unreadCount} -> ${afterSend.unreadCount}`
  );

  await markAsRead();
  console.log('[mark-read] receiver mark-read posted');

  const afterRead = await pollUntil('after-mark-read', (marker) => {
    return marker.unreadCount === 0 && !marker.firstUnreadMessageId;
  });

  if (!afterRead) {
    throw new Error('Unread did not clear after mark-read within polling window');
  }

  console.log('[assert] unread cleared to 0 and firstUnreadMessageId is null');
  console.log('PASS');
}

main().catch((err) => {
  console.error('FAIL');
  console.error(err?.message || err);
  process.exit(1);
});
