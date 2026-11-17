export type EntryKind='membership'|'donation'|'rishta'|'event'|'iftari';
export type EntryManagement={kind:EntryKind;eventId?:string;demo?:boolean};
export type EntryState={kind:EntryKind;entry_id:string;event_id:string|null;status:'cancelled'|'refunded'|null;deleted_at:string|null;version:number;updated_at:string};
