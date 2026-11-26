import { useState } from 'react';
import {
  createWebBlueprint, editWebBlueprint, getWebBlueprintPlans, getWebGenerationReadiness,
  reviewWebBlueprint, WebBlueprintPlan, WebGenerationReadiness,
} from '../services/webApi';

interface Props { projectId: string; role: string }

export function ApplicationBlueprintPanel({ projectId, role }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [readiness, setReadiness] = useState<WebGenerationReadiness | null>(null);
  const [plans, setPlans] = useState<WebBlueprintPlan[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState('');
  const canApprove = role === 'Owner' || role === 'Admin';
  const selectedPlan = plans.find((item) => item.id === selectedId);
  const questions = Array.isArray(selectedPlan?.plan.clarification_questions) ? selectedPlan.plan.clarification_questions as { topic?: string; question?: string; status?: string; resolution?: string }[] : [];
  const unresolvedCount = questions.filter((item) => !(['Resolved', 'Not applicable'].includes(item.status ?? '') && item.resolution?.trim())).length;

  async function load() {
    const [nextReadiness, nextPlans] = await Promise.all([getWebGenerationReadiness(projectId), getWebBlueprintPlans(projectId)]);
    setReadiness(nextReadiness);
    setPlans(nextPlans);
    const active = nextPlans.find((item) => item.id === selectedId) ?? nextPlans[0];
    setSelectedId(active?.id ?? '');
    setDraft(active ? JSON.stringify(editableSections(active.plan), null, 2) : '');
  }

  async function perform(action: () => Promise<unknown>, shouldReload = true) {
    setBusy(true); setError('');
    try { await action(); if (shouldReload) await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Application blueprint action failed.'); }
    finally { setBusy(false); }
  }

  function choosePlan(planId: string) {
    const item = plans.find((candidate) => candidate.id === planId);
    setSelectedId(planId);
    setDraft(item ? JSON.stringify(editableSections(item.plan), null, 2) : '');
  }

  function saveDraft() {
    const plan = plans.find((item) => item.id === selectedId);
    if (!plan) return;
    void perform(async () => {
      const blueprint = JSON.parse(draft) as Record<string, unknown>;
      const updated = await editWebBlueprint(plan.id, blueprint);
      setPlans((items) => items.map((item) => item.id === updated.id ? updated : item));
      setDraft(JSON.stringify(editableSections(updated.plan), null, 2));
    }, false);
  }

  return <section className="blueprint-panel">
    <button type="button" className="blueprint-toggle" aria-expanded={open} onClick={() => {
      const next = !open; setOpen(next);
      if (next && !readiness) void perform(load, false);
    }}>Application intelligence</button>
    {open && <div className="blueprint-content">
      <p className="portal-note">Build an editable Application Blueprint from approved project sources. Unspecified business decisions appear as clarification questions.</p>
      {error && <div className="portal-error" role="alert">{error}</div>}
      {readiness && <div className="blueprint-readiness" role="status">
        <strong>{readiness.approved_requirement_count} approved requirements · {readiness.approved_srs_count ?? 0} approved SRS documents · {readiness.approved_designs.length} approved designs</strong>
        {!readiness.ready && <p>Before a blueprint can be created, add approved requirements and designs for: {readiness.missing_design_kinds.join(', ') || 'approved project inputs'}.</p>}
        {readiness.ready && <button type="button" disabled={busy} onClick={() => void perform(async () => {
          const created = await createWebBlueprint(projectId);
          setPlans((items) => [created, ...items]); setSelectedId(created.id); setDraft(JSON.stringify(editableSections(created.plan), null, 2));
        }, false)}>Generate blueprint</button>}
      </div>}
      {plans.length > 0 && <label className="blueprint-selector">Blueprint version
        <select value={selectedId} onChange={(event) => choosePlan(event.target.value)}>
          {plans.map((item) => <option value={item.id} key={item.id}>v{item.version} · {item.state}</option>)}
        </select>
      </label>}
      {plans.find((item) => item.id === selectedId) && <>
        <div className="blueprint-status">{selectedPlan?.state} · source hash {selectedPlan?.source_hash.slice(0, 12)}</div>
        {questions.length > 0 && <section className="blueprint-questions" aria-label="Clarification questions">
          <h4>Clarifications to resolve ({unresolvedCount} remaining)</h4>
          <ul>{questions.map((item) => <li key={item.topic}>{item.question} <span>{item.status ?? 'Needs clarification'}{item.resolution ? ` · ${item.resolution}` : ''}</span></li>)}</ul>
        </section>}
        <label className="blueprint-editor">Editable blueprint sections (JSON)
          <textarea aria-label="Editable blueprint sections (JSON)" spellCheck={false} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={selectedPlan?.state !== 'Pending review'} rows={18} />
        </label>
        <div className="portal-actions">
          {selectedPlan?.state === 'Pending review' && <button type="button" disabled={busy} onClick={saveDraft}>Save edits</button>}
          {canApprove && selectedPlan?.state === 'Pending review' && <>
            <button type="button" disabled={busy || unresolvedCount > 0} onClick={() => void perform(() => reviewWebBlueprint(selectedId, 'approve'))}>Approve blueprint</button>
            <button type="button" disabled={busy} onClick={() => void perform(() => reviewWebBlueprint(selectedId, 'reject'))}>Reject</button>
          </>}
        </div>
        <p className="portal-note">Resolve each clarification question, or mark it not applicable with a reason. Project scaffolding and code generation remain blocked until an Owner or Admin approves this blueprint.</p>
      </>}
    </div>}
  </section>;
}

function editableSections(plan: Record<string, unknown>): Record<string, unknown> {
  const keys = ['application_overview', 'analysis', 'application_structure', 'implementation_sequence', 'clarification_questions'];
  return Object.fromEntries(keys.filter((key) => key in plan).map((key) => [key, plan[key]]));
}
