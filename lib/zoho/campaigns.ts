import { ZohoError, zohoGet, type ZohoQuery } from './client.ts';

type JsonObject = Record<string, unknown>;
export type CampaignsReader = (path: string, params?: ZohoQuery) => Promise<unknown>;
type NamedItem = { id: string; name: string };
type Field = { apiName: string; label: string };

export type CampaignsConnection = {
  status: 'connected';
  checkedAt: string;
  lists: NamedItem[];
  topics: NamedItem[];
  fields: Field[];
  truncated: boolean;
};

const PAGE_SIZE = 100;
const MAX_PAGES = 3;
const MAX_FIELDS = 500;
const PATHS = {
  lists: '/api/v1.1/getmailinglists',
  topics: '/api/v1.1/topics',
  fields: '/api/v1.1/contact/allfields',
} as const;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ZohoError('ZOHO_INVALID_RESPONSE');
  }
  return value as JsonObject;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) {
    throw new ZohoError('ZOHO_INVALID_RESPONSE');
  }
  return value.trim();
}

function id(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return text(value);
}

function code(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new ZohoError('ZOHO_INVALID_RESPONSE');
  }
  return String(value);
}

function checkEnvelope(value: JsonObject, allowEmptyLists = false): void {
  const resultCode = code(value.code);
  if (allowEmptyLists && resultCode === '2401') return;
  const status = typeof value.status === 'string' ? value.status.toLowerCase() : undefined;
  if (value.error || (status && status !== 'success') ||
      (resultCode !== undefined && !['0', '200', 'SUCCESS'].includes(resultCode))) {
    throw new ZohoError('ZOHO_PROVIDER_REJECTED');
  }
}

function records(value: unknown, key: string, allowEmptyLists = false): unknown[] {
  const root = object(value);
  checkEnvelope(root, allowEmptyLists);
  const payload = root.response === undefined ? root : object(root.response);
  checkEnvelope(payload, allowEmptyLists);
  if (allowEmptyLists && [code(root.code), code(payload.code)].includes('2401')) return [];
  // Some accounts wrap the field array in response.fieldnames.fieldname.
  const collection = key === 'fieldname' && payload[key] === undefined && payload.fieldnames !== undefined
    ? object(payload.fieldnames)[key]
    : payload[key];
  if (!Array.isArray(collection)) throw new ZohoError('ZOHO_INVALID_RESPONSE');
  return collection;
}

async function readNamedPages(
  read: CampaignsReader,
  kind: 'lists' | 'topics',
): Promise<{ items: NamedItem[]; truncated: boolean }> {
  const items = new Map<string, NamedItem>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const params: ZohoQuery = kind === 'lists'
      ? { resfmt: 'JSON', sort: 'asc', fromindex: page * PAGE_SIZE + 1, range: PAGE_SIZE }
      : { details: JSON.stringify({ from_index: page * PAGE_SIZE, range: PAGE_SIZE }) };
    const payload = await read(PATHS[kind], params);
    const rows = records(payload, kind === 'lists' ? 'list_of_details' : 'topicDetails', kind === 'lists');
    const countBefore = items.size;
    for (const value of rows.slice(0, PAGE_SIZE)) {
      const row = object(value);
      const item = kind === 'lists'
        ? { id: id(row.listkey), name: text(row.listname) }
        : { id: id(row.topicId), name: text(row.topicName) };
      items.set(item.id, item);
    }
    // A repeated page may mean the provider ignored its pagination parameters.
    if (rows.length > PAGE_SIZE || (rows.length > 0 && items.size === countBefore)) {
      return { items: [...items.values()], truncated: true };
    }
    if (rows.length < PAGE_SIZE) return { items: [...items.values()], truncated: false };
  }
  // A full final page cannot prove that the inventory is complete.
  return { items: [...items.values()], truncated: true };
}

async function readFields(read: CampaignsReader): Promise<{ items: Field[]; truncated: boolean }> {
  const payload = await read(PATHS.fields, { type: 'json' });
  const rows = records(payload, 'fieldname');
  const items = rows.slice(0, MAX_FIELDS).map((value) => {
    const row = object(value);
    return { apiName: text(row.FIELD_NAME), label: text(row.DISPLAY_NAME) };
  });
  return { items, truncated: rows.length > MAX_FIELDS };
}

/** Organiser-only metadata check. It never subscribes contacts or starts workflows. */
export async function checkCampaignsConnection(
  read: CampaignsReader = (path, params) => zohoGet('campaigns', path, params),
): Promise<CampaignsConnection> {
  const [lists, topics, fields] = await Promise.all([
    readNamedPages(read, 'lists'),
    readNamedPages(read, 'topics'),
    readFields(read),
  ]);
  return {
    status: 'connected',
    checkedAt: new Date().toISOString(),
    lists: lists.items,
    topics: topics.items,
    fields: fields.items,
    truncated: lists.truncated || topics.truncated || fields.truncated,
  };
}
