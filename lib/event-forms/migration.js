export const FESTIVAL_FORM_ID = '500893f1-5724-547a-bd5c-8eae0e648890';
export const FESTIVAL_SLUG = 'harrow-food-festival-2026';

export function formRow(kind, config) {
  return {
    id: kind === 'participation' ? FESTIVAL_FORM_ID : config.id,
    slug: kind === 'participation' ? FESTIVAL_SLUG : config.slug,
    title: config.formTitle || config.title,
    status: config.status === 'archived' ? 'closed' : config.status,
    kind, configuration: config, mode: 'test', created_at: config.createdAt || '2026-10-19T00:00:00.000Z',
  };
}

export function submissionRow(kind, record) {
  return {
    id: record.id,
    form_id: kind === 'participation' ? FESTIVAL_FORM_ID : kind === 'stall' ? record.formId : record.eventId,
    submitted_at: record.createdAt, status: 'new', answers: { record }, mode: 'test', request_key: record.idempotencyKey || null,
  };
}

export function prepareLegacyImport(state) {
  if (!state || !state.festivalConfig || !Array.isArray(state.festivalRegistrations) || !Array.isArray(state.stallForms) || !Array.isArray(state.stallApplications) || !Array.isArray(state.events) || !Array.isArray(state.registrations)) throw new Error('Invalid legacy backup');
  const forms = [formRow('participation', state.festivalConfig), ...state.stallForms.map(c => formRow('stall', c)), ...state.events.map(c => formRow('tickets', c))];
  const submissions = [...state.festivalRegistrations.map(r => submissionRow('participation', r)), ...state.stallApplications.map(r => submissionRow('stall', r)), ...state.registrations.map(r => submissionRow('tickets', r))];
  for (const row of forms) if (!row.id || !row.slug || !row.title || row.configuration.mode && row.configuration.mode !== 'test') throw new Error('Invalid form in backup');
  for (const row of submissions) if (!row.id || !forms.some(f => f.id === row.form_id) || !row.answers.record.capabilityHash || row.answers.record.mode !== 'test') throw new Error('Invalid registration in backup');
  if (new Set(forms.map(r => r.id)).size !== forms.length || new Set(forms.map(r => r.slug)).size !== forms.length || new Set(submissions.map(r => r.id)).size !== submissions.length) throw new Error('Duplicate source identifiers');
  return { forms, submissions, audit: (state.audit || []).map(a => ({ action: a.action, record_id: a.id, occurred_at: a.at })) };
}
