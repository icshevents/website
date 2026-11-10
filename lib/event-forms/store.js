import { currentContext } from './context.js';
import { AppError } from './domain.js';
import { formRow, submissionRow, FESTIVAL_FORM_ID } from './migration.js';

const categories = [['tickets', 'events', 'registrations'], ['participation', 'festivalConfig', 'festivalRegistrations'], ['stall', 'stallForms', 'stallApplications']];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function databaseError(error) {
  if (error?.code === '40001' || error?.code === '23505') return new AppError('This record or link changed elsewhere. Reload before continuing.', 409);
  if (error?.code === 'P0001') return new AppError('The form changed, closed, or has no remaining capacity. Reload before continuing.', 409);
  return new AppError('The event database is temporarily unavailable or awaiting setup.', 503);
}
async function readRows(query, all = false) {
  const rows = []; let total = 0;
  for (let offset = 0; ; offset += 500) {
    const result = await query().range(offset, offset + 499);
    if (result.error) throw databaseError(result.error);
    rows.push(...result.data); total = result.count ?? rows.length;
    if (!all || result.data.length < 500 || rows.length >= total) return { rows, total };
  }
}
export async function readState() {
  const context = currentContext(), db = context.db, path = context.path, body = context.body;
  const forms = await db.from('icsh_forms').select('id,kind,configuration');
  if (forms.error) throw databaseError(forms.error);
  const state = { events: [], registrations: [], festivalConfig: null, festivalRegistrations: [], stallForms: [], stallApplications: [], audit: [], rateLimits: {} };
  for (const row of forms.data) {
    const entry = categories.find(c => c[0] === row.kind);
    if (row.kind === 'participation') state.festivalConfig = row.configuration;
    else if (entry) state[entry[1]].push(row.configuration);
  }
  if (!state.festivalConfig) throw new AppError('The event forms are awaiting migration. Please try again shortly.', 503);
  const kinds = path.includes('festival') ? ['participation'] : path.includes('stall') ? ['stall'] : ['tickets'];
  const needsRecords = /registrations|applications|admin\/(?:data|events|export|festival|stalls)(?:$|\/review|\/export|\/email|\/payment-link)/.test(path) || /^(?:events(?:\/|$)|directory)/.test(path);
  const onlyForms = /(?:config|duplicate)$/.test(path) || path === 'stalls/forms';
  if (needsRecords && !onlyForms) {
    const ids = forms.data.filter(f => kinds.includes(f.kind)).map(f => f.id);
    const id = path.match(/(?:registrations|applications)\/([a-f0-9-]{36})(?:\/|$)/)?.[1] || (/admin\/.+(review|payment-link)$/.test(path) || path === 'admin/registrations' ? body.id : null) || context.url.searchParams.get('id');
    if (ids.length) {
      const query = () => {
        let q = db.from('icsh_submissions').select('id,form_id,answers', { count: 'exact' }).in('form_id', ids).order('submitted_at', { ascending: false }).order('id');
        if (id) q = q.eq('id', id);
        else if (body.idempotencyKey && context.method === 'POST' && !path.startsWith('admin/')) q = q.eq('request_key', body.idempotencyKey);
        if (path === 'admin/stalls/export' && context.url.searchParams.get('formId')) q = q.eq('form_id', context.url.searchParams.get('formId'));
        if (path === 'admin/export' && context.url.searchParams.get('eventId')) q = q.eq('form_id', context.url.searchParams.get('eventId'));
        return q;
      };
      const all = path.endsWith('export') || path === 'directory' || path.startsWith('events');
      const { rows, total } = await readRows(query, all);
      for (const row of rows.reverse()) {
        const kind = forms.data.find(f => f.id === row.form_id)?.kind;
        const entry = categories.find(c => c[0] === kind);
        if (entry && row.answers?.record) state[entry[2]].push(row.answers.record);
      }
      if (path.startsWith('admin/') && total > rows.length) context.req.migrationWindow = { shown: rows.length, total };
    }
  }
  if (path === 'admin/data') {
    const result = await db.from('icsh_audit_events').select('action,record_id,occurred_at').order('occurred_at', { ascending: false }).limit(50);
    if (result.error) throw databaseError(result.error);
    state.audit = result.data.reverse().map(a => ({ action: a.action, id: a.record_id, at: a.occurred_at }));
  }
  return { state, etag: null };
}

export function changedRows(before, after) {
  const changes = [];
  for (const [kind, formKey, recordKey] of categories) {
    const oldForms = kind === 'participation' ? [before.festivalConfig] : before[formKey];
    const newForms = kind === 'participation' ? [after.festivalConfig] : after[formKey];
    for (const config of newForms) {
      if (!config) continue;
      const previous = oldForms.find(c => kind === 'participation' || c.id === config.id);
      if (!same(previous, config)) changes.push({ table: 'forms', data: formRow(kind, config), expected_version: previous ? previous.version ?? 0 : null });
    }
    for (const record of after[recordKey]) {
      const previous = before[recordKey].find(r => r.id === record.id);
      if (!same(previous, record)) {
        record.version = previous ? (previous.version ?? 0) + 1 : record.version || 1;
        const formId = kind === 'participation' ? FESTIVAL_FORM_ID : kind === 'stall' ? record.formId : record.eventId;
        const config = newForms.find(c => kind === 'participation' || c.id === formId);
        changes.push({ table: 'submissions', data: submissionRow(kind, record), expected_version: previous ? previous.version ?? 0 : null, form_version: config?.version ?? 0 });
      }
    }
  }
  return changes;
}

export async function mutate(action) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { state } = await readState(), before = structuredClone(state);
    const result = action(state), changes = changedRows(before, state);
    if (!changes.length) return result;
    const audit = state.audit.slice(before.audit.length);
    const saved = await currentContext().db.rpc('icsh_event_write', { p_changes: changes, p_audit: audit });
    if (!saved.error) return result;
    if (['40001', '23505'].includes(saved.error.code) && attempt < 2) continue;
    throw databaseError(saved.error);
  }
  throw new AppError('The record changed elsewhere. Reload before saving.', 409);
}
export function audit(state, action, id) { state.audit.push({ action, id, at: new Date().toISOString() }); }
// The API adapter applies the persistent database limiter before every mutation.
export function limit() {}
