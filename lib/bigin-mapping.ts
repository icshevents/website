// Mapping helper only. No OAuth credentials, CRM transport or live write is included in the preview.
import type {Applicant,PreviewRecord} from './membership-preview.ts';
import type {MembershipQuote} from './membership.ts';
export const membershipFields=['dateOfBirth','calculatedAge','membershipCategory','membershipFee','membershipStart','membershipExpiry','studentDeclaration','studentDeclarationTimestamp','paymentStatus','registrationDate','registrationKind'] as const;
export type MembershipField=typeof membershipFields[number];
export type ApprovedFieldMap=Record<MembershipField,string>;
export type FieldMetadata={api_name:string;read_only?:boolean};
export function validateFieldMap(map:Partial<ApprovedFieldMap>,metadata:FieldMetadata[]):ApprovedFieldMap {
 const standard=['First_Name','Last_Name','Email','Mobile'];const names=membershipFields.map(key=>map[key]);
 if(names.some(name=>!name||!/^\w+$/.test(name)))throw new Error('Every membership field requires an approved Bigin API field name.');
 if(new Set(names).size!==names.length||names.some(name=>standard.includes(name!)))throw new Error('Membership fields must map to distinct fields and must not overwrite contact identity fields.');
 for(const apiName of [...standard,...names]){
  const field=metadata.find(item=>item.api_name===apiName);if(!field||field.read_only)throw new Error(`Bigin field is missing or read-only: ${apiName}`);
 }
 return map as ApprovedFieldMap;
}
export function buildMappedRecord(applicant:Applicant,quote:MembershipQuote,record:PreviewRecord,map:ApprovedFieldMap) {
 const values:Record<MembershipField,unknown>={dateOfBirth:applicant.dob,calculatedAge:quote.age,membershipCategory:quote.label,membershipFee:quote.fee,membershipStart:record.startDate,membershipExpiry:record.expiryDate,studentDeclaration:record.studentDeclaration,studentDeclarationTimestamp:record.studentDeclarationAt,paymentStatus:record.paymentStatus,registrationDate:record.registeredAt,registrationKind:applicant.kind};
 return {First_Name:applicant.firstName,Last_Name:applicant.lastName,Email:applicant.email,Mobile:applicant.mobile,...Object.fromEntries(membershipFields.map(key=>[map[key],values[key]]))};
}
