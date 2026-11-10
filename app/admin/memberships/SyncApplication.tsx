'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SyncApplication({ id, disabled, verifyOnly = false, interrupted = false }: { id: string; disabled: boolean; verifyOnly?: boolean; interrupted?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  async function sync() {
    if (pending || disabled) return;
    setPending(true); setMessage('');
    try {
      const response = await fetch(`/api/membership/admin/${id}/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error?.message || 'The sync result could not be confirmed. Reload this page before trying again.');
      const status = body.application?.biginSyncStatus;
      setMessage(status === 'synced' ? 'Contact verified in Bigin.' : status === 'review_required' ? 'Manual review is needed. No existing member was changed.' : status === 'outcome_unknown' ? 'The result needs review. Do not create another contact.' : 'Application remains saved. Check the updated delivery status.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The result could not be confirmed. Reload before trying again.');
      router.refresh();
    } finally { setPending(false); }
  }
  return <div><button type="button" className="button outline" disabled={disabled || pending} onClick={sync}>{pending ? 'Checking…' : interrupted ? 'Review interrupted Bigin check' : verifyOnly ? 'Verify saved Bigin contact' : 'Retry Bigin delivery'}</button>{message ? <p role="status">{message}</p> : null}</div>;
}

