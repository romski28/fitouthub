/**
 * Smoke test — address system + persona cardinality + worker invite/magic link.
 *
 * Run against the deployed API by default; override with:
 *   node smoke-test-worker-address.js
 *   API_BASE=http://localhost:3001/api node smoke-test-worker-address.js
 *
 * Uses timestamped emails so it is safe to re-run without collisions.
 * Leaves a few Property rows behind (no delete endpoint); canonical-key dedup
 * means re-runs reuse the same rows. Address links are unlinked at the end.
 */
'use strict';

const API_BASE = process.env.API_BASE || 'https://fitouthub.onrender.com/api';
const RUN_ID = Date.now().toString(36);

const results = [];
const state = {};

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ''}`);
}

function skip(name, detail) {
  results.push({ name, ok: null, detail });
  console.log(`⏭️  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, json };
}

const email = (tag) => `${tag}+${RUN_ID}@smoketest.local`;
const PASSWORD = 'Password123!';

async function registerClient(tag, role) {
  const r = await api('/auth/register', {
    method: 'POST',
    body: {
      email: email(tag),
      password: PASSWORD,
      firstName: 'Smoke',
      surname: tag,
      role,
      requireOtpVerification: false,
    },
  });
  if (!r.ok) throw new Error(`register ${tag} failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
}

async function registerPro(tag, professionType, extra = {}) {
  const r = await api('/professional/auth/register', {
    method: 'POST',
    body: {
      email: email(tag),
      password: PASSWORD,
      fullName: `Pro ${tag}`,
      businessName: `Smoke ${tag} Co`,
      professionType,
      requireOtpVerification: false,
      ...extra,
    },
  });
  if (!r.ok) throw new Error(`register pro ${tag} failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
}

async function main() {
  console.log(`🔍 Smoke test — address + persona + worker invite/magic link`);
  console.log(`   API_BASE: ${API_BASE}`);
  console.log(`   RUN_ID:   ${RUN_ID}\n`);

  // ────────────────────────────────────────────────────────────────────────
  // SECTION A — Auth / persona registration
  // ────────────────────────────────────────────────────────────────────────
  console.log('── Section A: auth + persona registration ──');
  let client, ownerOcc, landlord;
  try {
    client = await registerClient('client', 'client');
    state.clientToken = client.accessToken;
    state.clientPersona = client.persona?.id || client.user?.personaId || null;
    record('Register client persona', true, `persona=${state.clientPersona}`);
  } catch (e) {
    record('Register client persona', false, e.message);
  }

  try {
    ownerOcc = await registerClient('ownerocc', 'owner_occupier');
    state.ownerOccToken = ownerOcc.accessToken;
    state.ownerOccPersona = ownerOcc.persona?.id || null;
    record('Register owner-occupier persona', true, `persona=${state.ownerOccPersona}`);
  } catch (e) {
    record('Register owner-occupier persona', false, e.message);
  }

  try {
    landlord = await registerClient('landlord', 'landlord');
    state.landlordToken = landlord.accessToken;
    state.landlordPersona = landlord.persona?.id || null;
    record('Register landlord persona', true, `persona=${state.landlordPersona}`);
  } catch (e) {
    record('Register landlord persona', false, e.message);
  }

  try {
    const login = await api('/auth/login', {
      method: 'POST',
      body: { email: email('client'), password: PASSWORD },
    });
    record('Login resolves persona', login.ok && !!login.json?.accessToken, login.ok ? `personaType=${login.json?.persona?.type}` : `${login.status} ${JSON.stringify(login.json)}`);
  } catch (e) {
    record('Login resolves persona', false, e.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // SECTION B — Address system (canonical + search + gazetteer)
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n── Section B: canonical property-address system ──');
  if (!state.clientToken) {
    skip('Address system', 'no client token — skipping section B');
  } else {
    let districtAreaId = null;
    try {
      const d = await api('/properties/districts', { token: state.clientToken });
      const list = d.json;
      if (d.ok && Array.isArray(list) && list.length > 0) {
        districtAreaId = list[0].id;
        record('List districts', true, `${list.length} districts, using ${list[0].name} (${districtAreaId})`);
      } else {
        record('List districts', false, `status=${d.status}`);
      }
    } catch (e) {
      record('List districts', false, e.message);
    }

    let propA;
    try {
      const body = {
        buildingName: 'Smoke Test Tower',
        blockTower: 'Block A',
        floorLevel: '12',
        unitNumber: 'A',
        street: '1 Test Road',
        ...(districtAreaId ? { districtAreaId } : {}),
        addressVisible: true,
      };
      const r = await api('/properties', { method: 'POST', token: state.clientToken, body });
      propA = r.json?.property;
      if (!r.ok || !propA?.id) throw new Error(`${r.status} ${JSON.stringify(r.json)}`);
      record('Upsert property (created)', true, `id=${propA.id} canonical=${propA.canonicalKey}`);
    } catch (e) {
      record('Upsert property (created)', false, e.message);
    }

    try {
      const body = {
        buildingName: 'smoke test tower', // different case — same canonical
        blockTower: 'block a',
        floorLevel: '12',
        unitNumber: 'A',
        ...(districtAreaId ? { districtAreaId } : {}),
      };
      const r = await api('/properties', { method: 'POST', token: state.clientToken, body });
      const p = r.json?.property;
      const sameId = r.ok && p?.id === propA?.id;
      record('Upsert duplicate dedups', sameId, r.json?.matched ? `matched=${r.json.matched} id=${p?.id}` : `status=${r.status}`);
    } catch (e) {
      record('Upsert duplicate dedups', false, e.message);
    }

    let propB;
    try {
      const body = {
        buildingName: 'Smoke Test Tower',
        blockTower: 'Block A',
        floorLevel: '13',
        unitNumber: 'B',
        ...(districtAreaId ? { districtAreaId } : {}),
      };
      const r = await api('/properties', { method: 'POST', token: state.clientToken, body });
      propB = r.json?.property;
      if (!r.ok || !propB?.id || propB.id === propA?.id) throw new Error(`expected new row, got ${r.status} ${JSON.stringify(r.json)}`);
      record('Upsert second unit (new row)', true, `id=${propB.id}`);
    } catch (e) {
      record('Upsert second unit (new row)', false, e.message);
    }

    try {
      const r = await api('/properties/search?q=' + encodeURIComponent('Smoke Test'), { token: state.clientToken });
      const hits = r.json?.results || [];
      record('Fuzzy search', r.ok && hits.length > 0, `${hits.length} results`);
    } catch (e) {
      record('Fuzzy search', false, e.message);
    }

    try {
      const r = await api('/properties/gazetteer/search?q=' + encodeURIComponent('test'), { token: state.clientToken });
      if (!r.ok) throw new Error(`status=${r.status}`);
      const hits = r.json?.results || [];
      // Gazetteer may legitimately be empty if no residential CSDI rows match.
      record('Gazetteer search', true, `${hits.length} results (empty is OK if no CSDI rows)`);
    } catch (e) {
      record('Gazetteer search', false, e.message);
    }

    if (propA?.id) {
      try {
        const r = await api(`/properties/${propA.id}`, { token: state.clientToken });
        record('Get property by id', r.ok && !!r.json?.id, r.ok ? `building=${r.json.buildingName}` : `status=${r.status}`);
      } catch (e) {
        record('Get property by id', false, e.message);
      }
    } else {
      skip('Get property by id', 'no property id');
    }

    // ──────────────────────────────────────────────────────────────────────
    // SECTION C — Persona address cardinality
    // ──────────────────────────────────────────────────────────────────────
    console.log('\n── Section C: persona address cardinality ──');
    if (!propA?.id || !propB?.id) {
      skip('Cardinality checks', 'missing property ids');
    } else {
      // CLIENT = single
      try {
        const r = await api(`/properties/${propA.id}/link`, { method: 'POST', token: state.clientToken, body: {} });
        if (!r.ok) throw new Error(`status=${r.status} ${JSON.stringify(r.json)}`);
        const me = await api('/properties/me', { token: state.clientToken });
        const n = me.json?.properties?.length;
        record('Client links single address', n === 1, `me=${n}`);
      } catch (e) {
        record('Client links single address', false, e.message);
      }
      try {
        await api(`/properties/${propB.id}/link`, { method: 'POST', token: state.clientToken, body: {} });
        const me = await api('/properties/me', { token: state.clientToken });
        const n = me.json?.properties?.length;
        record('Client second link replaces (single)', n === 1, `me=${n}`);
      } catch (e) {
        record('Client second link replaces (single)', false, e.message);
      }

      // LANDLORD = multi
      try {
        await api(`/properties/${propA.id}/link`, { method: 'POST', token: state.landlordToken, body: {} });
        await api(`/properties/${propB.id}/link`, { method: 'POST', token: state.landlordToken, body: {} });
        const me = await api('/properties/me', { token: state.landlordToken });
        const n = me.json?.properties?.length;
        record('Landlord links multiple addresses', n === 2, `me=${n}`);
      } catch (e) {
        record('Landlord links multiple addresses', false, e.message);
      }

      try {
        const me = await api('/properties/me', { token: state.landlordToken });
        const props = me.json?.properties || [];
        const target = props.find((p) => p.isPrimary) || props[0];
        if (!target) throw new Error('no linked property');
        const r = await api(`/properties/${target.id}/primary`, { method: 'POST', token: state.landlordToken, body: {} });
        record('Set primary address', r.ok, r.ok ? `primary=${target.id}` : `status=${r.status}`);
      } catch (e) {
        record('Set primary address', false, e.message);
      }

      try {
        const me = await api('/properties/me', { token: state.ownerOccToken });
        // OWNER_OCCUPIER is also single; just verify it can link one.
        const r = await api(`/properties/${propA.id}/link`, { method: 'POST', token: state.ownerOccToken, body: {} });
        const n = (await api('/properties/me', { token: state.ownerOccToken })).json?.properties?.length;
        record('Owner-occupier links single address', r.ok && n === 1, `me=${n}`);
      } catch (e) {
        record('Owner-occupier links single address', false, e.message);
      }

      // Cleanup: unlink everything we linked.
      for (const [name, token] of [['client', state.clientToken], ['landlord', state.landlordToken], ['owner-occupier', state.ownerOccToken]]) {
        try {
          const me = await api('/properties/me', { token });
          for (const p of me.json?.properties || []) {
            await api(`/properties/${p.id}/link`, { method: 'DELETE', token });
          }
          record(`Unlink ${name} addresses`, true, `${(me.json?.properties || []).length} unlinked`);
        } catch (e) {
          record(`Unlink ${name} addresses`, false, e.message);
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // SECTION D — Worker invite + project access magic link
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n── Section D: worker invite + magic link ──');

  let employerToken, workerToken, workerEmail, projectId;
  try {
    const emp = await registerPro('employer', 'company');
    employerToken = emp.accessToken;
    state.employerId = emp.professional?.id;
    record('Register employer professional', true, `id=${state.employerId}`);
  } catch (e) {
    record('Register employer professional', false, e.message);
  }

  let inviteToken;
  workerEmail = email('worker');
  if (employerToken) {
    try {
      const r = await api('/professional/worker-invites', { method: 'POST', token: employerToken, body: { email: workerEmail } });
      inviteToken = r.json?.invite?.token || r.json?.invite?.token;
      if (!r.ok || !inviteToken) throw new Error(`${r.status} ${JSON.stringify(r.json)}`);
      record('Create worker invite', true, `token=${inviteToken.slice(0, 8)}…`);
    } catch (e) {
      record('Create worker invite', false, e.message);
    }

    if (inviteToken) {
      try {
        const r = await api(`/worker-invites/${inviteToken}`);
        record('Resolve worker invite', r.ok && !!r.json?.email, r.ok ? `employer=${r.json.employer?.businessName}` : `status=${r.status}`);
      } catch (e) {
        record('Resolve worker invite', false, e.message);
      }
    }
  } else {
    skip('Worker invite', 'no employer token');
  }

  // Worker registers as a professional (professionType worker + employer).
  if (inviteToken) {
    try {
      const w = await registerPro('worker', 'worker', { employerProfessionalId: state.employerId });
      workerToken = w.accessToken;
      record('Register worker professional', true, `id=${w.professional?.id}`);
    } catch (e) {
      record('Register worker professional', false, e.message);
    }

    if (workerToken) {
      try {
        const r = await api(`/worker-invites/${inviteToken}/accept`, { method: 'POST', body: { email: workerEmail } });
        record('Accept worker invite', r.ok, r.ok ? `status=${r.json?.status}` : `status=${r.status} ${JSON.stringify(r.json)}`);
      } catch (e) {
        record('Accept worker invite', false, e.message);
      }

      try {
        const r = await api('/professional/workers', { token: employerToken });
        const list = r.json || [];
        const found = list.some((w) => w.email === workerEmail);
        record('List workers (employer)', r.ok && found, `${list.length} workers`);
      } catch (e) {
        record('List workers (employer)', false, e.message);
      }
    }
  } else {
    skip('Worker registration + accept', 'no invite token');
  }

  // Project creation (client) → project access grant (email magic link).
  if (state.clientToken) {
    try {
      const r = await api('/projects', {
        method: 'POST',
        token: state.clientToken,
        body: {
          projectName: `Smoke Worker Access ${RUN_ID}`,
          clientName: 'Smoke Client',
          region: 'Kowloon',
          budget: 500000,
        },
      });
      projectId = r.json?.id;
      if (!r.ok || !projectId) throw new Error(`${r.status} ${JSON.stringify(r.json)}`);
      record('Create project', true, `projectId=${projectId}`);
    } catch (e) {
      record('Create project', false, e.message);
    }
  } else {
    skip('Create project', 'no client token');
  }

  let magicToken;
  if (employerToken && projectId && workerEmail) {
    try {
      const r = await api(`/projects/${projectId}/worker-access`, {
        method: 'POST',
        token: employerToken,
        body: { email: workerEmail },
      });
      if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.json)}`);
      const url = r.json?.magicUrl || '';
      const m = url.match(/[?&]token=([^&]+)/);
      magicToken = m ? m[1] : null;
      record('Grant project access (48h magic link)', true, `magicUrl=${url}`);
    } catch (e) {
      record('Grant project access (48h magic link)', false, e.message);
    }

    if (magicToken) {
      try {
        const r = await api(`/auth/worker-project-magic?token=${encodeURIComponent(magicToken)}`);
        record(
          'Resolve magic link',
          r.ok && r.json?.projectId === projectId && r.json?.isRegisteredWorker === true,
          r.ok ? `projectId=${r.json?.projectId} isRegisteredWorker=${r.json?.isRegisteredWorker}` : `status=${r.status}`,
        );
      } catch (e) {
        record('Resolve magic link', false, e.message);
      }
    }
  } else {
    skip('Project access grant', 'missing employer/project/worker');
  }

  // Worker enforcement: list, open, act.
  if (workerToken && projectId) {
    try {
      const r = await api('/professional/worker-projects', { token: workerToken });
      const list = r.json || [];
      const found = list.some((p) => p.id === projectId || p.projectId === projectId);
      record('Worker lists granted projects', r.ok && found, `${list.length} projects`);
    } catch (e) {
      record('Worker lists granted projects', false, e.message);
    }

    try {
      const r = await api(`/professional/worker-project/${projectId}`, { token: workerToken });
      record('Worker opens granted project', r.ok && !!r.json?.project, r.ok ? `employer=${r.json?.employer?.businessName || 'none'}` : `status=${r.status}`);
    } catch (e) {
      record('Worker opens granted project', false, e.message);
    }

    try {
      const r = await api(`/professional/worker-project/${projectId}/check-in`, {
        method: 'POST',
        token: workerToken,
        body: { note: 'Smoke test check-in' },
      });
      record('Worker check-in posts to chat', r.ok && r.json?.success, r.ok ? `action=${r.json?.action}` : `status=${r.status} ${JSON.stringify(r.json)}`);
    } catch (e) {
      record('Worker check-in posts to chat', false, e.message);
    }
  } else {
    skip('Worker enforcement (list/open/act)', 'missing worker token or project');
  }

  // Negative enforcement tests.
  if (projectId) {
    try {
      const r = await api(`/professional/worker-project/${projectId}`, { token: state.clientToken });
      record('Client token blocked from worker project', r.status === 403, `status=${r.status}`);
    } catch (e) {
      record('Client token blocked from worker project', false, e.message);
    }

    if (state.employerId) {
      try {
        const stranger = await registerPro('strangerworker', 'worker', { employerProfessionalId: state.employerId });
        const r = await api(`/professional/worker-project/${projectId}`, { token: stranger.accessToken });
        record('Ungranted worker blocked (403)', r.status === 403, `status=${r.status}`);
      } catch (e) {
        record('Ungranted worker blocked (403)', false, e.message);
      }
    } else {
      skip('Ungranted worker blocked (403)', 'no employer id');
    }
  } else {
    skip('Negative enforcement', 'no project id');
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n────────────────────────────────────────────');
  const passed = results.filter((r) => r.ok === true).length;
  const failed = results.filter((r) => r.ok === false).length;
  const skipped = results.filter((r) => r.ok === null).length;
  console.log(`Summary: ${passed} passed · ${failed} failed · ${skipped} skipped`);
  if (failed > 0) {
    console.log('\nFailed steps:');
    results.filter((r) => r.ok === false).forEach((r) => console.log(`  ❌ ${r.name} — ${r.detail || ''}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('💥 Smoke test crashed:', e);
  process.exitCode = 1;
});
