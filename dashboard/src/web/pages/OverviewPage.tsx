import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { equipmentState, STATE_LABELS, type EquipmentState, type LiveSnapshot } from '../../shared/live';

function dateLabel(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded';
  return new Date(value).toLocaleString();
}

export function OverviewPage() {
  const [data, setData] = useState<LiveSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<EquipmentState | 'all' | 'issues'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [changed, setChanged] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());
  const previous = useRef<LiveSnapshot | null>(null);
  const request = useRef<AbortController | null>(null);
  const receivedAt = useRef(0);

  const refresh = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setBusy(true);
    try {
      const next = await api<LiveSnapshot>('/live', { cache: 'no-store', signal: controller.signal });
      const fingerprint = (snapshot: LiveSnapshot, id: string) => JSON.stringify([
        snapshot.equipment.find(e => e.equipmentId === id),
        snapshot.claims.filter(c => c.equipmentId === id).sort((a, b) => a.claimId.localeCompare(b.claimId)),
        snapshot.issues.filter(i => i.equipmentId === id).sort((a, b) => a.issueId.localeCompare(b.issueId)),
      ]);
      setChanged(previous.current ? next.equipment.filter(e => fingerprint(previous.current!, e.equipmentId) !== fingerprint(next, e.equipmentId)).map(e => e.equipmentId) : []);
      previous.current = next;
      receivedAt.current = Date.now();
      setData(next);
      setError('');
    } catch (e) {
      setError(e instanceof Error && e.name !== 'AbortError' ? e.message : 'Database request timed out. Try refreshing.');
    } finally {
      window.clearTimeout(timeout);
      request.current = null;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(clock); request.current?.abort(); };
  }, [refresh]);
  useEffect(() => {
    if (paused) return;
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', visible); };
  }, [paused, refresh]);
  useEffect(() => {
    document.body.classList.toggle('presenting', presenting);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPresenting(false); };
    window.addEventListener('keydown', escape);
    return () => { document.body.classList.remove('presenting'); window.removeEventListener('keydown', escape); };
  }, [presenting]);

  const rows = (data?.equipment ?? []).map(equipment => ({
    equipment,
    state: equipmentState(equipment, data?.claims ?? [], new Date(now)),
    claims: data!.claims.filter(c => c.equipmentId === equipment.equipmentId && c.status === 'active'),
    issues: data!.issues.filter(i => i.equipmentId === equipment.equipmentId && i.status !== 'resolved'),
  })).sort((a, b) => a.equipment.name.localeCompare(b.equipment.name));
  const shown = rows.filter(row => (filter === 'all' || (filter === 'issues' ? row.issues.length > 0 : row.state === filter)) &&
    [row.equipment.name, row.equipment.internalSerial, row.equipment.equipmentId, row.equipment.activeTagId ?? ''].some(v => v.toLowerCase().includes(query.toLowerCase())));
  const detail = rows.find(r => r.equipment.equipmentId === selected);
  const age = Math.max(0, Math.floor((now - receivedAt.current) / 1000));
  const stale = !!data && age > 20;
  const events = data ? [
    ...data.equipment.map(e => ({ id: `enroll-${e.equipmentId}`, equipmentId: e.equipmentId, label: 'Enrolled', at: e.enrolledAt })),
    ...data.claims.flatMap(c => [
      { id: `checkout-${c.claimId}`, equipmentId: c.equipmentId, label: 'Checked out', at: c.checkedOutAt },
      { id: `return-${c.claimId}`, equipmentId: c.equipmentId, label: 'Returned', at: c.returnedAt },
    ]),
    ...data.issues.flatMap(i => [
      { id: `issue-${i.issueId}`, equipmentId: i.equipmentId, label: 'Issue reported', at: i.reportedAt },
      { id: `resolved-${i.issueId}`, equipmentId: i.equipmentId, label: 'Issue resolved', at: i.resolvedAt },
    ]),
  ].filter(e => e.at && Number.isFinite(Date.parse(e.at))).sort((a, b) => Date.parse(b.at!) - Date.parse(a.at!)).slice(0, 8) : [];

  return <div className="live-board">
    <header className="live-header">
      <div><p className="eyebrow">TRAKR / EQUIPMENT MONITOR</p><h1>Every item. In view.</h1><p>Check out on your phone. Watch the equipment state change here.</p></div>
      <button className="btn btn-secondary" onClick={() => setPresenting(!presenting)}>{presenting ? 'Exit presentation' : 'Present dashboard'}</button>
    </header>
    <section className={`connection-strip ${error || stale ? 'connection-warning' : ''}`} aria-label="Database connection">
      <div><strong role="status">{error ? 'Connection interrupted' : !data ? 'Connecting to Firestore…' : paused ? 'Auto-refresh paused' : stale ? 'Data is stale' : 'Connected to Firestore'}</strong>
        <span>{data ? `${data.projectId} · Last successful read ${age}s ago` : 'Waiting for a successful database read'}</span></div>
      <div className="live-actions"><button className="btn btn-secondary btn-sm" onClick={() => setPaused(!paused)}>{paused ? 'Resume updates' : 'Pause updates'}</button><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void refresh()}>{busy ? 'Reading…' : 'Refresh now'}</button></div>
    </section>
    {error && <div role="alert" className="alert alert-error">{error} {data ? 'Showing the last successful read; equipment states may be out of date.' : 'No equipment data has been loaded.'}</div>}
    <div className="live-counts" aria-label="Equipment totals">
      {(['all', 'available', 'checked-out', 'overdue', 'retired', 'issues'] as const).map(key => <button key={key} aria-pressed={filter === key} className={`live-count ${filter === key ? 'selected' : ''}`} onClick={() => setFilter(key)}><span>{key === 'all' ? 'All equipment' : key === 'issues' ? 'With issues' : STATE_LABELS[key]}</span><strong>{data ? rows.filter(r => key === 'all' || (key === 'issues' ? r.issues.length > 0 : r.state === key)).length : '—'}</strong></button>)}
    </div>
    <div className="live-layout"><section aria-label="Equipment inventory">
      <div className="inventory-heading"><h2>Equipment <span>{data ? `${shown.length} / ${rows.length}` : ''}</span></h2><input aria-label="Search equipment" placeholder="Search name, serial or tag…" value={query} onChange={e => setQuery(e.target.value)} /></div>
      {!data && !error && <p className="loading-block">Reading equipment, claims and issues…</p>}
      {data && rows.length === 0 && <div className="live-empty"><h3>No equipment in this database yet</h3><p>Enroll an item using the teacher app. It will appear here after the next refresh.</p></div>}
      {rows.length > 0 && shown.length === 0 && <div className="live-empty"><p>No equipment matches these filters.</p><button className="btn btn-secondary" onClick={() => { setFilter('all'); setQuery(''); }}>Clear filters</button></div>}
      <div className="equipment-grid">{shown.map(({ equipment: e, state, claims, issues }) => <button key={e.equipmentId} className={`equipment-tile state-${state} ${changed.includes(e.equipmentId) ? 'recently-changed' : ''}`} onClick={() => setSelected(selected === e.equipmentId ? null : e.equipmentId)} aria-expanded={selected === e.equipmentId}>
        <div className="tile-top"><span className={`state-label state-${state}`}>{STATE_LABELS[state]}</span>{changed.includes(e.equipmentId) && <span className="changed-label">Updated</span>}</div>
        <h3>{e.name || 'Unnamed equipment'}</h3><p className="serial">{e.internalSerial || e.equipmentId}</p>
        <div className="tile-facts"><span>{claims.length} active {claims.length === 1 ? 'claim' : 'claims'}</span><span className={issues.length ? 'issue-count' : ''}>{issues.length ? `${issues.length} unresolved ${issues.length === 1 ? 'issue' : 'issues'}` : 'No reported issues'}</span></div>
        <div className="tile-footer"><span>{e.activeTagId ? 'NFC tag assigned' : 'No active NFC tag'}</span><span>Details ↗</span></div>
      </button>)}</div>
      {detail && <section className="equipment-detail" aria-label="Equipment details"><div className="inventory-heading"><h2>{detail.equipment.name}</h2><button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>Close details</button></div>
        <dl><dt>Equipment document</dt><dd>equipment/{detail.equipment.equipmentId}</dd><dt>NFC tag</dt><dd>{detail.equipment.activeTagId ?? 'Not assigned'}</dd><dt>Enrolled</dt><dd>{dateLabel(detail.equipment.enrolledAt)}</dd><dt>Equipment last edited</dt><dd>{dateLabel(detail.equipment.updatedAt)}</dd></dl>
        <h3>Active claims</h3>{detail.claims.length ? detail.claims.map(c => <p key={c.claimId}><code>{c.claimId}</code><br />Checked out {dateLabel(c.checkedOutAt)} · {c.condition === 'has_issue' ? 'Issue reported at checkout' : 'No issues at checkout'}</p>) : <p>No active claims.</p>}
        <h3>Unresolved issues</h3>{detail.issues.length ? detail.issues.map(i => <p key={i.issueId}><code>{i.issueId}</code> · {i.status}<br />Reported {dateLabel(i.reportedAt)}</p>) : <p>No unresolved issues.</p>}
      </section>}
    </section><aside className="activity-panel"><p className="eyebrow">FROM DATABASE RECORDS</p><h2>Recent activity</h2>{events.length ? <ol>{events.map(event => <li key={event.id}><span className="activity-event">{event.label}</span><strong>{data?.equipment.find(e => e.equipmentId === event.equipmentId)?.name || event.equipmentId}</strong><time dateTime={event.at!}>{dateLabel(event.at)}</time></li>)}</ol> : <p className="empty-note">{data ? 'Activity will appear after equipment is enrolled, checked out or returned.' : 'Waiting for database records…'}</p>}<p className="activity-note">Refreshes every 5 seconds while this tab is visible. Overdue means an active claim is at least 24 hours old.</p></aside></div>
    <footer className="live-footnote">{data ? `Firestore read completed ${dateLabel(data.readAt)}. ` : ''}Use the Firebase-connected mobile app for demos; local-only demo changes do not reach this dashboard.</footer>
  </div>;
}
