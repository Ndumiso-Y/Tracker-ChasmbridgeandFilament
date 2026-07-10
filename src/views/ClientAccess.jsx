import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collaborationService } from '../services/collaborationService';
import { PROGRAMME_ENTITIES } from '../data/programmeContext';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { cx } from '../utils/cx';

// Client Access (V4A.15) — the missing provisioning journey. This is the
// master operational unblock: weekly reviewer assignment, review claiming,
// the client 1–10 scorecard, request assignment and Confirm Resolution all
// depend on active client_contributor profiles existing, and until now
// nothing in the product could create one.
//
// Security model (deliberate):
// - Everything here runs under an AUTHENTICATED ADMIN session only.
// - Listing/activating profiles rides the existing "Admin full access"
//   RLS policy on user_access_profiles directly.
// - Provisioning by exact email goes through the narrow, is_admin()-gated
//   provision_client_contributor RPC, which activates access for a person
//   who has ALREADY signed in via Magic Link. It never fabricates
//   identities, never browses auth.users from the frontend, never touches
//   admin profiles, and is never granted to anon.
// - Active Editors (internal update attribution) are a separate concept and
//   are deliberately untouched by this surface.

export default function ClientAccess() {
  const { session, isAdmin } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [busyUserId, setBusyUserId] = useState(null);

  const [form, setForm] = useState({ email: '', displayName: '', entityScope: 'Filament' });
  const [provisioning, setProvisioning] = useState(false);
  const [notice, setNotice] = useState(null); // { type: 'success'|'error', text }

  const canOperate = !!session && isAdmin;

  const loadProfiles = async () => {
    setState('loading');
    try {
      const rows = await collaborationService.getClientAccessProfiles();
      setProfiles(rows || []);
      setState('ready');
    } catch (err) {
      console.error(err);
      setState('error');
    }
  };

  useEffect(() => {
    if (canOperate) loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canOperate]);

  const handleProvision = async (e) => {
    e.preventDefault();
    setNotice(null);
    if (!form.email.trim() || !form.displayName.trim()) {
      setNotice({ type: 'error', text: 'Email and display name are both required.' });
      return;
    }
    setProvisioning(true);
    try {
      const row = await collaborationService.provisionClientContributor({
        email: form.email.trim(),
        displayName: form.displayName.trim(),
        entityScope: form.entityScope,
      });
      setNotice({ type: 'success', text: `${row?.display_name || form.displayName} is now an active client collaborator.` });
      setForm({ email: '', displayName: '', entityScope: 'Filament' });
      await loadProfiles();
    } catch (err) {
      console.error(err);
      setNotice({ type: 'error', text: err.message || 'Provisioning failed.' });
    } finally {
      setProvisioning(false);
    }
  };

  const handleToggleActive = async (p) => {
    setBusyUserId(p.user_id);
    setNotice(null);
    try {
      await collaborationService.setClientAccessActive(p.user_id, !p.is_active);
      await loadProfiles();
    } catch (err) {
      console.error(err);
      setNotice({ type: 'error', text: err.message || 'The access change could not be saved.' });
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-black text-navy tracking-tight mb-2">Client Access</h1>
        <p className="text-slate-500 max-w-2xl">
          Client collaborators sign in with a Magic Link email. After a person's first sign-in, activate them here — they can then
          submit requests, complete guided reviews, score weekly delivery reviews and confirm ticket resolutions.
          This is separate from Active Editors, which only attribute internal updates.
        </p>
      </div>

      {!session ? (
        <div className="flex flex-col items-center justify-center rounded-xl bg-white p-12 text-center shadow-sm border border-slate-200">
          <ShieldCheck size={40} className="mb-3 text-navy/40" />
          <h2 className="text-xl font-bold text-navy">Secure admin sign-in required</h2>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            Managing client access changes who can see client data, so it requires an authenticated admin session — the Active Editor selector is not enough.
          </p>
          <a href="#/login" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-2.5 text-sm font-bold text-navy shadow-md shadow-gold/20 hover:bg-gold/90 transition-all">
            <ShieldCheck size={15} /> Secure Sign In
          </a>
        </div>
      ) : !isAdmin ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Your account is signed in but does not have admin access. Client access can only be managed by an administrator.
        </div>
      ) : (
        <>
          {notice && (
            <div className={cx(
              'mb-4 rounded-lg border p-3 text-sm',
              notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'
            )}>
              {notice.text}
            </div>
          )}

          {/* Provision */}
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-lift">
            <div className="mb-3 flex items-center gap-2">
              <UserPlus size={16} className="text-gold" />
              <h2 className="text-sm font-black uppercase tracking-wide text-navy">Activate a Client Collaborator</h2>
            </div>
            <p className="mb-4 text-xs text-slate-500">
              Step 1: the person signs in once at this site via Magic Link (their email creates a secure identity).
              Step 2: enter that exact email below and activate them.
            </p>
            <form onSubmit={handleProvision} className="grid gap-3 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="person@example.com"
                className="rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800 focus:border-gold focus:ring-2 focus:ring-gold/30"
              />
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => setForm(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder="Display name (e.g. Dr. Rudy)"
                className="rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800 focus:border-gold focus:ring-2 focus:ring-gold/30"
              />
              <select
                value={form.entityScope}
                onChange={(e) => setForm(prev => ({ ...prev, entityScope: e.target.value }))}
                className="rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800 focus:border-gold focus:ring-2 focus:ring-gold/30"
              >
                {PROGRAMME_ENTITIES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
              <button
                type="submit"
                disabled={provisioning}
                className="rounded-lg bg-gold px-5 py-2.5 text-sm font-bold text-navy shadow-md shadow-gold/20 hover:bg-gold/90 transition-all disabled:opacity-60"
              >
                {provisioning ? 'Activating…' : 'Activate Access'}
              </button>
            </form>
          </div>

          {/* Existing profiles */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-lift">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-black uppercase tracking-wide text-navy">Access Profiles</h2>
            </div>
            {state === 'loading' ? (
              <p className="p-5 text-sm text-slate-400">Loading profiles…</p>
            ) : state === 'error' ? (
              <p className="p-5 text-sm text-red-600">Profiles could not be loaded. Refresh to try again.</p>
            ) : profiles.length === 0 ? (
              <p className="p-5 text-sm text-slate-400">
                No access profiles exist yet. Once you activate the first client collaborator above, they will appear here —
                and the weekly review reviewer list will stop being empty.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {profiles.map(p => (
                  <div key={p.user_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm font-bold text-navy">{p.display_name || 'Unnamed profile'}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {p.role === 'admin' ? 'Administrator' : p.role === 'client_contributor' ? 'Client collaborator' : p.role} · {p.entity_scope}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cx(
                        'rounded-full border px-2.5 py-0.5 text-xs font-bold',
                        p.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'
                      )}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {p.role !== 'admin' && (
                        <button
                          type="button"
                          onClick={() => handleToggleActive(p)}
                          disabled={busyUserId === p.user_id}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-navy hover:border-gold transition-colors disabled:opacity-60"
                        >
                          {p.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
