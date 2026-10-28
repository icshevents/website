import { zohoGet, ZohoError, type ZohoQuery } from './client.ts';

export type BiginField = { apiName: string; label: string; dataType: string; required: boolean; options: string[] };
export type BiginConnection = {
  status: 'connected';
  organisation: { name: string; id: string } | null;
  fields: BiginField[];
  checkedAt: string;
};
type Reader = (path: string, params?: ZohoQuery) => Promise<unknown>;

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function text(value: unknown, maxLength = 300): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw new ZohoError('ZOHO_INVALID_RESPONSE');
  return value.trim();
}

export async function checkBiginConnection(reader: Reader = (path, params) => zohoGet('bigin', path, params)): Promise<BiginConnection> {
  const [organisationData, fieldsData] = await Promise.all([
    reader('/bigin/v2/org'),
    reader('/bigin/v2/settings/fields', { module: 'Contacts' }),
  ]);
  if (!object(organisationData) || !Array.isArray(organisationData.org) || organisationData.org.length !== 1 ||
    !object(fieldsData) || !Array.isArray(fieldsData.fields)) throw new ZohoError('ZOHO_INVALID_RESPONSE');
  const organisationItem: unknown = organisationData.org[0];
  if (!object(organisationItem)) throw new ZohoError('ZOHO_INVALID_RESPONSE');
  const organisation = { name: text(organisationItem.company_name), id: text(organisationItem.id, 100) };
  const fields = fieldsData.fields.map((item: unknown): BiginField => {
    if (!object(item)) throw new ZohoError('ZOHO_INVALID_RESPONSE');
    if (item.pick_list_values !== undefined && !Array.isArray(item.pick_list_values)) throw new ZohoError('ZOHO_INVALID_RESPONSE');
    const options = (item.pick_list_values ?? []) as unknown[];
    return {
      apiName: text(item.api_name, 160),
      label: text(item.display_label || item.field_label),
      dataType: text(item.data_type, 80),
      required: item.system_mandatory === true || item.mandatory === true,
      options: options.map(option => {
        if (!object(option)) throw new ZohoError('ZOHO_INVALID_RESPONSE');
        return text(option.display_value ?? option.actual_value, 1_000);
      }),
    };
  });
  // Only organization identity and field definitions leave this boundary. Member
  // records, organisation email addresses and field-owner details are not read.
  return { status: 'connected', organisation, fields, checkedAt: new Date().toISOString() };
}
