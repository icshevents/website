'use client';

import { useState, useTransition } from 'react';
import type { ConnectionConfiguration, ConnectionResult } from '@/lib/zoho/check';
import styles from './connections.module.css';

export default function ConnectionCheck({ service, configuration }: { service: 'bigin' | 'campaigns'; configuration: ConnectionConfiguration }) {
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const currentConfiguration = result && !result.ok && result.configuration ? result.configuration : configuration;
  const title = service === 'bigin' ? 'Zoho Bigin' : 'Zoho Campaigns';

  function check() {
    startTransition(async () => {
      setResult(null);
      try {
        const response = await fetch('/api/zoho/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service }),
          cache: 'no-store',
          signal: AbortSignal.timeout(65000),
        });
        const data = await response.json() as ConnectionResult;
        if (typeof data.ok !== 'boolean' || (data.ok && data.service !== service) || (!data.ok && typeof data.error?.message !== 'string')) throw new Error('Unexpected response');
        setResult(data);
      } catch {
        setResult({ ok: false, error: { code: 'NETWORK_ERROR', message: 'The connection check did not finish. Please retry shortly.' } });
      }
    });
  }

  return <article className={`panel ${styles.card}`}>
    <span className="eyebrow">{service === 'bigin' ? 'Membership records' : 'Email preferences and lists'}</span>
    <h2>{title}</h2>
    <p>{service === 'bigin' ? 'Confirm access to your organisation and discover the fields we will map to website membership checks.' : 'Confirm access and find the mailing lists, topics and fields for website signups and event communications.'}</p>
    <p className={styles.status} aria-live="polite">{pending ? 'Checking connection…' : result?.ok ? 'Connection verified' : !currentConfiguration.configured ? 'Awaiting connection settings' : result ? 'Connection needs attention' : 'Settings present · ready to test'}</p>
    {!currentConfiguration.configured ? <div className={styles.setup}>
      <p>Save the missing settings securely in the website’s Vercel project.</p>
      {currentConfiguration.missing.length > 0 ? <details><summary>Missing settings ({currentConfiguration.missing.length})</summary><ul>{currentConfiguration.missing.map(key => <li key={key}><code>{key}</code></li>)}</ul></details> : null}
      {currentConfiguration.issues.length > 0 ? <ul>{currentConfiguration.issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : null}
    </div> : null}
    <button className="button" type="button" disabled={pending || !currentConfiguration.configured} onClick={check}>{pending ? 'Checking…' : `Check ${service === 'bigin' ? 'Bigin' : 'Campaigns'} connection`}</button>
    <div className={styles.result} aria-live="polite" aria-busy={pending}>
      {result && !result.ok ? <p role="alert" className={styles.error}>{result.error.message}</p> : null}
      {result?.ok ? <>
        <p className={styles.success}>Read access verified at {new Date(result.data.checkedAt).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })} (London time).</p>
        {result.service === 'bigin' ? <>
          <p><strong>Organisation:</strong> {result.data.organisation?.name || 'Organisation returned by Bigin'}</p>
          <details><summary>Contact fields ({result.data.fields.length})</summary><div className={styles.tableWrap}><table><caption>Bigin fields available for mapping</caption><thead><tr><th scope="col">Field</th><th scope="col">API name</th><th scope="col">Type</th></tr></thead><tbody>{result.data.fields.map(field => <tr key={field.apiName}><td>{field.label}{field.required ? ' (required)' : ''}</td><td><code>{field.apiName}</code></td><td>{field.dataType}</td></tr>)}</tbody></table></div></details>
          <p className={styles.note}>Next, map the membership status, category and validity dates against the organisation shown above.</p>
        </> : <>
          <Inventory title="Mailing lists" items={result.data.lists}/>
          <Inventory title="Topics" items={result.data.topics}/>
          <Inventory title="Contact fields" items={result.data.fields.map(field => ({ id: field.apiName, name: field.label }))}/>
          {result.data.truncated ? <p className={styles.note}>This is a limited inventory. Review the full account before choosing a list or topic.</p> : null}
          <p className={styles.note}>Next, choose the intended list and topic and review consent settings and existing automations.</p>
        </>}
      </> : null}
    </div>
  </article>;
}

function Inventory({ title, items }: { title: string; items: { id: string; name: string }[] }) {
  return <details><summary>{title} ({items.length})</summary>{items.length ? <ul className={styles.inventory}>{items.map(item => <li key={item.id}><strong>{item.name}</strong><code>{item.id}</code></li>)}</ul> : <p>No items were returned for this account.</p>}</details>;
}
