import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collaborationService } from '../services/collaborationService';
import { FileStack, Clock, CheckCircle, ChevronRight, Save, Send, Plus, X } from 'lucide-react';
import { cx } from '../utils/cx';
import { GUIDED_REVIEW_CONFIGS } from '../data/guidedReviewConfigs';
import GuidedReviewForm from '../components/GuidedReviewForm';

const ENTITY_OPTIONS = ['Chasm Bridge Charity', 'Filament', 'Both'];
const URGENCY_OPTIONS = ['Normal', 'Time Sensitive', 'Urgent'];
const URGENCY_BADGE = {
  'Normal': 'bg-slate-100 text-slate-600 border-slate-200',
  'Time Sensitive': 'bg-amber-50 text-amber-700 border-amber-200',
  'Urgent': 'bg-red-50 text-red-700 border-red-200',
};

// Operator-facing labels for the live client_input_templates records — the
// underlying template_id/template architecture is unchanged; this is a
// display-only relabelling so the operator sees "what do you need from the
// client" instead of the technical word "template". Falls back to the
// template's own DB title for any id not listed here, so nothing is hidden.
const TEMPLATE_DISPLAY_LABELS = {
  'template-presentation': 'Presentation Review',
  'template-website': 'Website Requirements',
  'template-graphic': 'Graphic / Flyer Direction',
  'template-social': 'Social Content Input',
  'template-testimonial': 'Testimonial',
  'template-technical': 'Technical Setup',
  'template-general': 'General Request',
  'template-filament-profile-review': 'Filament Company Profile Review',
  'template-filament-slides-review': 'Filament Slides Review',
};

export default function ClientInputRequirements({ selectedAuthorId = "", updateAuthors = [] }) {
  const { profile, isAdmin, isClient } = useAuth();
  const [requests, setRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [responses, setResponses] = useState({}); // mapped by template_section_id
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Admin: create-request orchestration
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loadingCreateData, setLoadingCreateData] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [contributors, setContributors] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [templateLoadError, setTemplateLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [newRequestForm, setNewRequestForm] = useState({
    title: '', entity: 'Both', templateId: '', contributorUserId: '', approverAuthorId: '', contextNote: '', referenceLink: '', clientReportedUrgency: 'Normal',
  });
  const canOperateInternally = isAdmin || !!selectedAuthorId || !profile;

  // Later contributor assignment (internal operator only)
  const [activeContributors, setActiveContributors] = useState([]);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [assignSelection, setAssignSelection] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState(null);

  // Two-tab information architecture (V4A.9): "Client Input" (the client
  // has a requirement and tells Embark) vs "Client Flow" (Embark asks the
  // client for structured input) are two different intentions that were
  // previously mixed into one undifferentiated list. Defaults to the tab
  // matching the resolved identity — an authenticated client lands on
  // Client Input, the internal operator (including the no-session case,
  // where profile never resolves) lands on Client Flow — but either
  // identity may switch tabs to view the other direction.
  const [activeTab, setActiveTab] = useState('client-flow');
  const [tabInitialized, setTabInitialized] = useState(false);
  useEffect(() => {
    if (!tabInitialized && profile) {
      setActiveTab(isClient ? 'client-input' : 'client-flow');
      setTabInitialized(true);
    }
  }, [profile, isClient, tabInitialized]);

  // Client-originated requirement/change submission (authenticated
  // client_contributor only) — the opposite direction from "Request Client
  // Input" above, reusing the same seven-template architecture.
  const [showClientSubmitModal, setShowClientSubmitModal] = useState(false);
  const [clientSubmitting, setClientSubmitting] = useState(false);
  const [clientSubmitError, setClientSubmitError] = useState(null);
  const [clientSubmitForm, setClientSubmitForm] = useState({
    title: '', templateId: '', clientReportedUrgency: 'Normal', contextNote: '', referenceLink: '',
  });

  // Register load states (V4A.10) — silent empty registers are forbidden;
  // "no rows", "no identity selected yet", and "load failed" are three
  // different situations and each gets its own visible state.
  const [loadError, setLoadError] = useState(null);
  const [needsAuthorSelection, setNeedsAuthorSelection] = useState(false);

  // Internal operator: log a client requirement communicated outside the
  // platform (WhatsApp / Email / Meeting / Phone Call / Other).
  const [showLogModal, setShowLogModal] = useState(false);
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState(null);
  const [logForm, setLogForm] = useState({
    title: '', entity: 'Both', requirementSource: 'WhatsApp', templateId: '',
    sourcePersonUserId: '', clientReportedUrgency: 'Normal', contextNote: '', referenceLink: '',
  });

  // Detail-view provenance comments ("what exactly did the client say?"),
  // loaded via the internal comments RPC for the no-session operator.
  const [detailComments, setDetailComments] = useState([]);

  const showNotice = (type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 8000);
  };

  useEffect(() => {
    loadRequests();
    // selectedAuthorId is a real dependency: the no-session internal
    // operator's register loads through the author-validated RPC.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, selectedAuthorId]);

  // Internal RPC rows are flat (template_title, counts, labels); reshape
  // them to the same shape the rest of the view already renders.
  const mapInternalRegisterRow = (r) => ({
    ...r,
    client_input_templates: { title: r.template_title },
  });

  // The real persistence read contract (V4A.10):
  // - authenticated admin/client -> existing RLS-owned direct read
  // - no-session internal Active Editor -> narrow author-validated
  //   SECURITY DEFINER register RPC (anon direct SELECT correctly returns
  //   zero rows and must never be used for this persona)
  const fetchRegister = async () => {
    if (profile) {
      const data = await collaborationService.getRequests();
      return data || [];
    }
    if (selectedAuthorId) {
      const rows = await collaborationService.getInternalClientInputRequests(selectedAuthorId);
      return (rows || []).map(mapInternalRegisterRow);
    }
    return null; // no identity yet — distinct from "zero requests"
  };

  const loadRequests = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchRegister();
      setRequests(rows || []);
      setNeedsAuthorSelection(rows === null);
    } catch (err) {
      console.error(err);
      setRequests([]);
      setLoadError('Unable to load requests. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // After a create, reload through the real persisted read path and verify
  // the new row actually came back — optimistic state is never treated as
  // proof of persistence. If the reload cannot see the row, say so.
  const reloadAfterCreate = async (created) => {
    try {
      const rows = await fetchRegister();
      if (created && rows !== null && !rows.some(r => r.id === created.id)) {
        setRequests([created, ...rows]);
        showNotice('warning', 'Request saved, but it could not be reloaded from the register. It is stored — refresh to confirm.');
      } else {
        setRequests(rows || (created ? [created] : []));
      }
    } catch (err) {
      console.error(err);
      if (created) setRequests(prev => (prev.some(r => r.id === created.id) ? prev : [created, ...prev]));
      showNotice('warning', 'Request created but the register could not be reloaded. Please refresh.');
    }
  };

  const handleSelectRequest = async (req) => {
    setSelectedRequest(req);
    setShowAssignPicker(false);
    setAssignError(null);
    setAssignSelection(req.assigned_contributor_user_id || '');
    setDetailComments([]);
    setLoading(true);
    try {
      const templateSections = await collaborationService.getTemplateSections(req.template_id).catch(() => []);
      setSections(templateSections);

      // Responses: authenticated personas read directly under RLS; the
      // no-session operator reads through the author-validated detail RPC
      // (a direct anon read would silently return zero rows).
      let resps = [];
      if (profile) {
        resps = await collaborationService.getResponses(req.id).catch(() => []);
      } else if (selectedAuthorId) {
        resps = await collaborationService.getInternalClientInputResponses(selectedAuthorId, req.id).catch(() => []);
      }
      const respMap = {};
      resps.forEach(r => {
        respMap[r.template_section_id] = r.content;
      });
      setResponses(respMap);

      // Provenance/context comments — "what exactly did the client say?".
      // The authenticated register already nests comments on the row; the
      // internal operator loads them through the comments RPC.
      if (profile) {
        setDetailComments(req.client_input_comments || []);
      } else if (selectedAuthorId) {
        const comments = await collaborationService.getInternalClientInputComments(selectedAuthorId, req.id).catch(() => []);
        setDetailComments(comments || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }

    // The active contributor list backs both the read-only "Assigned
    // Contributor" name display and the assignment picker below — only
    // needed for the internal operator view, never for a client contributor
    // viewing their own request (who gets no assignment controls at all).
    // The RPC is Active-Editor validated, so it can only be called once one
    // is selected.
    if (canOperateInternally && selectedAuthorId) {
      collaborationService.getInternalActiveClientContributors(selectedAuthorId)
        .then(list => setActiveContributors(list || []))
        .catch(err => { console.error(err); setActiveContributors([]); });
    } else {
      setActiveContributors([]);
    }
  };

  const handleOpenAssignPicker = () => {
    setAssignError(null);
    setAssignSelection(selectedRequest.assigned_contributor_user_id || '');
    setShowAssignPicker(true);
  };

  const handleAssignContributor = async () => {
    if (!selectedAuthorId) {
      setAssignError('Please select an Active Editor in the sidebar to enable editing.');
      return;
    }
    setAssigning(true);
    setAssignError(null);
    try {
      const updated = await collaborationService.assignInternalClientInputContributor({
        authorId: selectedAuthorId,
        requestId: selectedRequest.id,
        contributorUserId: assignSelection || null,
      });
      setSelectedRequest(prev => ({ ...prev, ...updated }));
      setShowAssignPicker(false);
    } catch (err) {
      console.error(err);
      setAssignError(err.message || 'Failed to update assigned contributor.');
    } finally {
      setAssigning(false);
    }
  };

  const handleResponseChange = (sectionId, value) => {
    setResponses(prev => ({ ...prev, [sectionId]: value }));
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      // Save all current responses
      for (const sectionId of Object.keys(responses)) {
        await collaborationService.upsertResponse({
          input_request_id: selectedRequest.id,
          template_section_id: sectionId,
          content: responses[sectionId],
          updated_by: profile?.user_id
        }).catch(console.warn);
      }

      // Update status to In Progress if it was just Required
      if (selectedRequest.status === 'Client Input Required') {
        await collaborationService.updateRequest(selectedRequest.id, {
          status: 'Client Input In Progress'
        }).catch(console.warn);
        setSelectedRequest(prev => ({ ...prev, status: 'Client Input In Progress' }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleUrgencyChange = async (value) => {
    try {
      const updated = await collaborationService.updateRequest(selectedRequest.id, { client_reported_urgency: value });
      setSelectedRequest(updated);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await handleSaveDraft();

      // Freeze revisions
      await collaborationService.freezeRevisions(selectedRequest.id).catch(console.warn);

      // Update status
      await collaborationService.updateRequest(selectedRequest.id, {
        status: 'Ready for Embark Review',
        submitted_at: new Date().toISOString()
      }).catch(console.warn);

      setSelectedRequest(prev => ({ ...prev, status: 'Ready for Embark Review' }));
      await loadRequests();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const openCreateModal = async () => {
    setCreateError(null);
    setTemplateLoadError(null);
    setNewRequestForm({ title: '', entity: 'Both', templateId: '', contributorUserId: '', approverAuthorId: selectedAuthorId || '', contextNote: '', referenceLink: '', clientReportedUrgency: 'Normal' });
    setShowCreateModal(true);
    setLoadingCreateData(true);

    // Template load failure is a real, visible error state — the operator
    // cannot create a request without a request type. Contributors/authors
    // are supporting data only: a failed or empty load must not block the
    // form (an active contributor may simply not exist yet, which is an
    // expected, non-error state — see "Unassigned" below).
    try {
      const tpls = await collaborationService.getTemplates();
      setTemplates(tpls || []);
      if (!tpls || tpls.length === 0) {
        setTemplateLoadError('No request types are currently available. Please try again, or contact Embark Digitals if this persists.');
      }
    } catch (err) {
      console.error(err);
      setTemplateLoadError('Failed to load request types. Please try again.');
    }

    try {
      const contribs = await collaborationService.getActiveClientContributors();
      setContributors(contribs || []);
    } catch (err) {
      console.error(err);
    }

    try {
      const auths = await collaborationService.getActiveUpdateAuthors();
      setAuthors(auths || []);
    } catch (err) {
      console.error(err);
    }

    setLoadingCreateData(false);
  };

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    if (!newRequestForm.title.trim() || !newRequestForm.templateId) {
      setCreateError('Title and request type are required.');
      return;
    }
    if (!selectedAuthorId) {
      setCreateError('Please select an Active Editor in the sidebar to enable editing.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      // Reference link is not a dedicated physical field on
      // client_input_requests — it is folded into the same provenance
      // comment as the brief/context, the existing truthful storage
      // mechanism (client_input_comments), rather than fabricating a column.
      const referenceLink = newRequestForm.referenceLink.trim();
      const contextText = newRequestForm.contextNote.trim();
      const combinedContext = referenceLink
        ? `Reference: ${referenceLink}${contextText ? `\n\n${contextText}` : ''}`
        : contextText;

      const created = await collaborationService.createInternalClientInputRequest({
        authorId: selectedAuthorId,
        title: newRequestForm.title.trim(),
        entity: newRequestForm.entity,
        templateId: newRequestForm.templateId,
        contributorUserId: newRequestForm.contributorUserId || null,
        approverAuthorId: newRequestForm.approverAuthorId || null,
        contextNote: combinedContext || null,
        clientReportedUrgency: newRequestForm.clientReportedUrgency,
      });
      setShowCreateModal(false);
      await reloadAfterCreate(created);
    } catch (err) {
      console.error(err);
      setCreateError(err.message || 'Failed to create request.');
    } finally {
      setCreating(false);
    }
  };

  const openLogModal = async () => {
    setLogError(null);
    setTemplateLoadError(null);
    setLogForm({
      title: '', entity: 'Both', requirementSource: 'WhatsApp', templateId: '',
      sourcePersonUserId: '', clientReportedUrgency: 'Normal', contextNote: '', referenceLink: '',
    });
    setShowLogModal(true);
    setLoadingCreateData(true);
    try {
      const tpls = await collaborationService.getTemplates();
      setTemplates(tpls || []);
      if (!tpls || tpls.length === 0) {
        setTemplateLoadError('No request types are currently available. Please try again, or contact Embark Digitals if this persists.');
      }
    } catch (err) {
      console.error(err);
      setTemplateLoadError('Failed to load request types. Please try again.');
    }
    // Known client contributors, for attributing the source person — an
    // optional lookup; a missing/failed list must never block logging.
    if (selectedAuthorId) {
      try {
        const contribs = await collaborationService.getInternalActiveClientContributors(selectedAuthorId);
        setContributors(contribs || []);
      } catch (err) {
        console.error(err);
        setContributors([]);
      }
    }
    setLoadingCreateData(false);
  };

  const handleLogRequirement = async (e) => {
    e.preventDefault();
    if (!logForm.title.trim() || !logForm.templateId) {
      setLogError('Title and request type are required.');
      return;
    }
    if (!selectedAuthorId) {
      setLogError('Please select an Active Editor in the sidebar to enable editing.');
      return;
    }
    setLogging(true);
    setLogError(null);
    try {
      const referenceLink = logForm.referenceLink.trim();
      const contextText = logForm.contextNote.trim();
      const combinedContext = referenceLink
        ? `Reference: ${referenceLink}${contextText ? `\n\n${contextText}` : ''}`
        : contextText;

      const created = await collaborationService.logInternalClientRequirement({
        authorId: selectedAuthorId,
        title: logForm.title.trim(),
        entity: logForm.entity,
        requirementSource: logForm.requirementSource,
        clientReportedUrgency: logForm.clientReportedUrgency,
        templateId: logForm.templateId,
        contextNote: combinedContext || null,
        guidedReview: !!GUIDED_REVIEW_CONFIGS[logForm.templateId],
        contributorUserId: logForm.sourcePersonUserId || null,
      });
      setShowLogModal(false);
      await reloadAfterCreate(created);
      // Guided templates open straight into the step-by-step review so the
      // operator can capture the client's page/slide feedback immediately.
      if (GUIDED_REVIEW_CONFIGS[logForm.templateId] && created) {
        await handleSelectRequest(created);
      }
    } catch (err) {
      console.error(err);
      setLogError(err.message || 'Failed to log the client requirement.');
    } finally {
      setLogging(false);
    }
  };

  const openClientSubmitModal = async () => {
    setClientSubmitError(null);
    setTemplateLoadError(null);
    setClientSubmitForm({ title: '', templateId: '', clientReportedUrgency: 'Normal', contextNote: '', referenceLink: '' });
    setShowClientSubmitModal(true);
    setLoadingCreateData(true);
    // Same live client_input_templates architecture as the internal form —
    // reloaded here (rather than reusing a stale list) so a genuine load
    // failure is always surfaced, never a silently empty picker.
    try {
      const tpls = await collaborationService.getTemplates();
      setTemplates(tpls || []);
      if (!tpls || tpls.length === 0) {
        setTemplateLoadError('No request types are currently available. Please try again, or contact Embark Digitals if this persists.');
      }
    } catch (err) {
      console.error(err);
      setTemplateLoadError('Failed to load request types. Please try again.');
    }
    setLoadingCreateData(false);
  };

  const handleClientSubmitRequirement = async (e) => {
    e.preventDefault();
    if (!clientSubmitForm.title.trim() || !clientSubmitForm.templateId) {
      setClientSubmitError('Title and request type are required.');
      return;
    }
    if (!profile?.user_id) {
      setClientSubmitError('Your account could not be verified. Please sign in again.');
      return;
    }
    setClientSubmitting(true);
    setClientSubmitError(null);
    try {
      // Reference link uses the same truthful storage contract as the
      // internal flow — folded into the provenance comment, never a
      // fabricated column.
      const referenceLink = clientSubmitForm.referenceLink.trim();
      const contextText = clientSubmitForm.contextNote.trim();
      const combinedContext = referenceLink
        ? `Reference: ${referenceLink}${contextText ? `\n\n${contextText}` : ''}`
        : contextText;

      // Direct authenticated insert (RLS-enforced by "Contributors create
      // own requests" in client_originated_requirement_workflow.sql) — the
      // client is the authenticated source identity for this path, never
      // the internal Active Editor / SECURITY DEFINER bridge.
      const newRequest = await collaborationService.createRequest({
        id: `req-client-${Date.now()}`,
        title: clientSubmitForm.title.trim(),
        entity: profile.entity_scope,
        template_id: clientSubmitForm.templateId,
        status: 'Client Input Required',
        assigned_contributor_user_id: profile.user_id,
        client_reported_urgency: clientSubmitForm.clientReportedUrgency,
        request_origin: 'Client-Originated Requirement',
        requirement_source: 'Platform',
      });

      if (combinedContext) {
        await collaborationService.addRequestComment(newRequest.id, {
          user_id: profile.user_id,
          comment: combinedContext,
        }).catch(console.warn);
      }

      setShowClientSubmitModal(false);
      await reloadAfterCreate(newRequest);
      await handleSelectRequest(newRequest);
    } catch (err) {
      console.error(err);
      setClientSubmitError(err.message || 'Failed to submit your requirement.');
    } finally {
      setClientSubmitting(false);
    }
  };

  if (loading && !selectedRequest) {
    return <div className="p-8 text-slate-500">Loading requests...</div>;
  }

  if (selectedRequest) {
    const isReadOnly = ['Ready for Embark Review', 'Requirements Confirmed', 'In Production', 'Approved', 'Delivered'].includes(selectedRequest.status) && !isAdmin;

    // Created/Logged By provenance: prefer the honest created_by column
    // (created_by_label from the internal register RPC, or resolved from the
    // updateAuthors prop for authenticated personas), falling back to the
    // legacy comment parse for rows created before the column existed.
    const createdByComment = (selectedRequest.client_input_comments || detailComments || [])
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(c => /^(?:Input request created by|Client requirement logged by) (.+?)(?: \(source:.*)?\./.exec(c.comment || ''))
      .find(m => m);
    const createdByLabel = selectedRequest.created_by_label
      || (selectedRequest.created_by_author_id && updateAuthors.find(a => a.id === selectedRequest.created_by_author_id)?.display_name)
      || (createdByComment ? createdByComment[1] : null);

    const isGuidedReview = !!GUIDED_REVIEW_CONFIGS[selectedRequest.template_id];

    const assignedContributorLabel = selectedRequest.assigned_contributor_user_id
      ? (activeContributors.find(c => c.user_id === selectedRequest.assigned_contributor_user_id)?.display_name || 'Assigned (contributor not currently active)')
      : 'Unassigned';
    const assignmentLifecycleLocked = !['Draft', 'Client Input Required', 'Client Input In Progress', 'Clarification Required'].includes(selectedRequest.status);

    return (
      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto">
        <button
          onClick={() => setSelectedRequest(null)}
          className="text-navy hover:text-gold text-sm font-bold mb-6 flex items-center gap-2"
        >
          <ChevronRight className="w-4 h-4 rotate-180" /> Back to Requests
        </button>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
          <div className="p-6 border-b border-slate-200 bg-slate-50/60">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-navy mb-2">{selectedRequest.title}</h2>
                {!canOperateInternally && selectedRequest.request_origin === 'Client-Originated Requirement' && (
                  <p className="text-xs text-slate-400 mb-2">
                    Submitted by: <span className="font-bold text-slate-600">{profile?.display_name || 'You'}</span>
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <span className="bg-slate-100 px-2.5 py-1 rounded-full text-slate-600 font-medium">
                    {selectedRequest.client_input_templates?.title || 'Template'}
                  </span>
                  <span className="bg-slate-100 px-2.5 py-1 rounded-full text-slate-600 font-medium">
                    {selectedRequest.entity}
                  </span>
                  <span className={cx(
                    "px-2.5 py-1 rounded-full font-medium border",
                    selectedRequest.status.includes('Required') || selectedRequest.status.includes('Progress') ? "bg-amber-50 text-amber-700 border-amber-200" :
                    selectedRequest.status === 'Ready for Embark Review' ? "bg-blue-50 text-blue-700 border-blue-200" :
                    selectedRequest.status === 'Requirements Confirmed' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    "bg-slate-100 text-slate-600 border-slate-200"
                  )}>
                    {selectedRequest.status}
                  </span>
                  {isAdmin ? (
                    selectedRequest.client_reported_urgency && selectedRequest.client_reported_urgency !== 'Normal' && (
                      <span className={cx("px-2.5 py-1 rounded-full font-medium border", URGENCY_BADGE[selectedRequest.client_reported_urgency])}>
                        Client Urgency: {selectedRequest.client_reported_urgency}
                      </span>
                    )
                  ) : (
                    <label className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">Urgency:</span>
                      <select
                        value={selectedRequest.client_reported_urgency || 'Normal'}
                        onChange={(e) => handleUrgencyChange(e.target.value)}
                        disabled={isReadOnly}
                        className="text-xs font-bold border border-slate-300 rounded-full px-2 py-1 bg-white text-slate-700 focus:ring-2 focus:ring-gold/30 focus:border-gold disabled:bg-slate-50"
                      >
                        {URGENCY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>

          {canOperateInternally && (
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/40">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-6 text-sm">
                  <div>
                    <span className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Created By</span>
                    <span className="text-slate-700 font-medium">{createdByLabel || 'Not recorded'}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Assigned Contributor</span>
                    <span className="text-slate-700 font-medium">{assignedContributorLabel}</span>
                  </div>
                </div>
                {assignmentLifecycleLocked ? (
                  <p className="text-xs text-slate-400 max-w-xs text-right">Contributor assignment is locked — this request has already been submitted.</p>
                ) : (
                  <button
                    type="button"
                    onClick={handleOpenAssignPicker}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-navy bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    {selectedRequest.assigned_contributor_user_id ? 'Change Contributor' : 'Assign Contributor'}
                  </button>
                )}
              </div>

              {showAssignPicker && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                  {assignError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{assignError}</div>
                  )}
                  <div>
                    <label className="block text-sm font-bold text-navy mb-1.5">Assigned Contributor</label>
                    <select
                      value={assignSelection}
                      onChange={(e) => setAssignSelection(e.target.value)}
                      className="w-full max-w-sm bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                    >
                      <option value="">Unassigned</option>
                      {activeContributors.map(c => (
                        <option key={c.user_id} value={c.user_id}>{c.display_name || 'Unnamed contributor'}</option>
                      ))}
                    </select>
                    {activeContributors.length === 0 && (
                      <p className="text-xs text-slate-400 mt-1.5">No active client contributors available yet.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleAssignContributor}
                      disabled={assigning}
                      className="px-4 py-2 text-sm font-bold text-navy bg-gold hover:bg-gold/90 rounded-lg shadow-md shadow-gold/20 transition-all disabled:opacity-60"
                    >
                      {assigning ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAssignPicker(false)}
                      className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-navy bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {canOperateInternally && detailComments.length > 0 && (
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/40">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Context & Provenance</h3>
              <div className="space-y-2">
                {detailComments.map((c, i) => (
                  <p key={i} className="text-sm text-slate-700 bg-white border border-slate-200 rounded-lg p-3 whitespace-pre-wrap">{c.comment}</p>
                ))}
              </div>
            </div>
          )}

          {isGuidedReview ? (
            <GuidedReviewForm
              request={selectedRequest}
              config={GUIDED_REVIEW_CONFIGS[selectedRequest.template_id]}
              isInternal={!profile}
              selectedAuthorId={selectedAuthorId}
              onSubmitted={async (updated) => {
                setSelectedRequest(prev => ({ ...prev, ...(updated || {}) }));
                await loadRequests();
              }}
            />
          ) : (
          <div className="p-6 space-y-8">
            {sections.length === 0 ? (
              <p className="text-slate-500">No template sections found for this request.</p>
            ) : (
              sections.map(section => (
                <div key={section.id} className="space-y-3">
                  <label className="block">
                    <span className="text-base font-bold text-navy">{section.section_label}</span>
                    {section.is_required && <span className="text-red-500 ml-2">*</span>}
                    {section.help_text && (
                      <p className="text-sm text-slate-500 mt-1">{section.help_text}</p>
                    )}
                  </label>

                  {section.section_type === 'Long Text' || section.section_type === 'Exact Copy' ? (
                    <textarea
                      value={responses[section.id] || ''}
                      onChange={(e) => handleResponseChange(section.id, e.target.value)}
                      disabled={isReadOnly}
                      rows={5}
                      className="w-full bg-white border border-slate-300 rounded-lg p-3 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold disabled:bg-slate-50 disabled:text-slate-400"
                      placeholder="Type your response here..."
                    />
                  ) : section.section_type === 'Short Text' ? (
                    <input
                      type="text"
                      value={responses[section.id] || ''}
                      onChange={(e) => handleResponseChange(section.id, e.target.value)}
                      disabled={isReadOnly}
                      className="w-full bg-white border border-slate-300 rounded-lg p-3 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  ) : section.section_type === 'Select' || section.section_type === 'Yes / No' ? (
                    <select
                      value={responses[section.id] || ''}
                      onChange={(e) => handleResponseChange(section.id, e.target.value)}
                      disabled={isReadOnly}
                      className="w-full bg-white border border-slate-300 rounded-lg p-3 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="" disabled>Select an option...</option>
                      {section.section_type === 'Yes / No' ? (
                        <>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </>
                      ) : (
                        (Array.isArray(section.controlled_options) ? section.controlled_options : []).map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))
                      )}
                    </select>
                  ) : section.section_type === 'Checklist' ? (
                    <div className="space-y-2">
                      {(Array.isArray(section.controlled_options) ? section.controlled_options : []).map(opt => {
                        const checkedList = (() => {
                          try { return JSON.parse(responses[section.id] || '[]'); } catch { return []; }
                        })();
                        const isChecked = checkedList.includes(opt);
                        return (
                          <label key={opt} className="flex items-center gap-3 text-slate-700">
                            <input
                              type="checkbox"
                              disabled={isReadOnly}
                              checked={isChecked}
                              onChange={(e) => {
                                const newList = e.target.checked
                                  ? [...checkedList, opt]
                                  : checkedList.filter(i => i !== opt);
                                handleResponseChange(section.id, JSON.stringify(newList));
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-gold focus:ring-gold"
                            />
                            {opt}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-sm">
                      [ {section.section_type} rendering not fully implemented in V4A demo ]
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          )}

          {!isGuidedReview && !isReadOnly && sections.length > 0 && (
            <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-4">
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-700 hover:text-navy bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" /> Save Draft
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-navy bg-gold hover:bg-gold/90 rounded-lg shadow-md shadow-gold/20 transition-all"
              >
                <Send className="w-4 h-4" /> Submit to Embark
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Client Requests = everything that originated from the client, whether
  // submitted directly on the platform or logged internally from WhatsApp/
  // email/meetings/calls. Input Needed from Client = Embark-initiated
  // structured input requests (plus legacy rows with no origin recorded).
  const CLIENT_ORIGINS = ['Client-Originated Requirement', 'Internally Logged Client Requirement'];
  const clientOriginatedRequests = requests.filter(r => CLIENT_ORIGINS.includes(r.request_origin));
  const internallyRequestedRequests = requests.filter(r => !CLIENT_ORIGINS.includes(r.request_origin));
  const visibleRequests = activeTab === 'client-input' ? clientOriginatedRequests : internallyRequestedRequests;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-black text-navy tracking-tight mb-2">Client Input & Requirements</h1>
        <p className="text-slate-500">Provide exact copy, structure, and approvals required for delivery.</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('client-input')}
          className={cx(
            "px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors",
            activeTab === 'client-input' ? "border-gold text-navy" : "border-transparent text-slate-400 hover:text-navy"
          )}
        >
          Client Requests
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('client-flow')}
          className={cx(
            "px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors",
            activeTab === 'client-flow' ? "border-gold text-navy" : "border-transparent text-slate-400 hover:text-navy"
          )}
        >
          Input Needed from Client
        </button>
      </div>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <p className="text-sm text-slate-500 max-w-xl">
          {activeTab === 'client-input'
            ? 'Requirements and change requests submitted by clients to Embark.'
            : 'Embark requests structured input from a client before work can continue.'}
        </p>
        {activeTab === 'client-flow' && canOperateInternally && !isClient && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:bg-gold/90 transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Request Client Input
          </button>
        )}
        {activeTab === 'client-input' && isClient && (
          <button
            onClick={openClientSubmitModal}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:bg-gold/90 transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Submit Requirement / Change
          </button>
        )}
        {activeTab === 'client-input' && canOperateInternally && !isClient && (
          <button
            onClick={openLogModal}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:bg-gold/90 transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Log Client Requirement
          </button>
        )}
      </div>

      {loadError && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>{loadError}</span>
          <button type="button" onClick={loadRequests} className="text-xs font-bold underline">Retry</button>
        </div>
      )}
      {needsAuthorSelection && !loadError && (
        <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          Select an Active Editor in the sidebar to load the Client Input register.
        </div>
      )}

      {notice && (
        <div className={cx(
          "mb-4 p-3 rounded-lg border text-sm",
          notice.type === 'warning' ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"
        )}>
          {notice.text}
        </div>
      )}

      <div className="grid gap-4">
        {visibleRequests.length === 0 ? (
          <div className="text-center p-12 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
            <FileStack className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-navy">
              {activeTab === 'client-input'
                ? (isClient ? 'No requirements submitted yet.' : 'No client-submitted requirements or change requests yet.')
                : (canOperateInternally ? 'No client input requests yet.' : 'No requests assigned')}
            </h3>
            <p className="text-slate-500 mt-2">
              {activeTab === 'client-input'
                ? (isClient ? 'Have a change or requirement for Embark? Submit it directly below.' : 'Requirements submitted directly by client contributors will appear here.')
                : (canOperateInternally ? 'Create a structured request to capture exact client instructions and approvals.' : 'You currently have no pending input requests.')}
            </p>
            {activeTab === 'client-flow' && canOperateInternally && (
              <button
                onClick={openCreateModal}
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:bg-gold/90 transition-all"
              >
                <Plus className="w-4 h-4" /> Request Client Input
              </button>
            )}
            {activeTab === 'client-input' && isClient && (
              <button
                onClick={openClientSubmitModal}
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:bg-gold/90 transition-all"
              >
                <Plus className="w-4 h-4" /> Submit Requirement / Change
              </button>
            )}
            {activeTab === 'client-input' && canOperateInternally && !isClient && !needsAuthorSelection && (
              <button
                onClick={openLogModal}
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:bg-gold/90 transition-all"
              >
                <Plus className="w-4 h-4" /> Log Client Requirement
              </button>
            )}
          </div>
        ) : (
          visibleRequests.map(req => (
            <div
              key={req.id}
              onClick={() => handleSelectRequest(req)}
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-gold/50 hover:shadow-md cursor-pointer transition-all group flex items-center justify-between"
            >
              <div className="flex items-start gap-4">
                <div className={cx(
                  "p-3 rounded-lg flex-shrink-0 mt-1",
                  req.status.includes('Required') || req.status.includes('Changes') ? "bg-amber-50 text-amber-600" :
                  req.status.includes('Review') ? "bg-blue-50 text-blue-600" :
                  "bg-emerald-50 text-emerald-600"
                )}>
                  <FileStack className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-navy">{req.title}</h3>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-500">
                    <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {req.status}</span>
                    <span>•</span>
                    <span>{req.entity}</span>
                    {req.client_input_templates?.title && (
                      <>
                        <span>•</span>
                        <span>{TEMPLATE_DISPLAY_LABELS[req.template_id] || req.client_input_templates.title}</span>
                      </>
                    )}
                    {req.review_acknowledged_at && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Acknowledged</span>
                      </>
                    )}
                    {(isAdmin || canOperateInternally) && req.client_reported_urgency && req.client_reported_urgency !== 'Normal' && (
                      <span className={cx("px-2 py-0.5 rounded-full text-xs font-bold border", URGENCY_BADGE[req.client_reported_urgency])}>
                        {req.client_reported_urgency}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400">
                    {req.request_origin && (
                      <span className={cx(
                        "px-2 py-0.5 rounded-full font-bold border",
                        req.request_origin === 'Client-Originated Requirement' ? "bg-blue-50 text-blue-700 border-blue-200" :
                        req.request_origin === 'Internally Logged Client Requirement' ? "bg-violet-50 text-violet-700 border-violet-200" :
                        "bg-slate-100 text-slate-600 border-slate-200"
                      )}>
                        {req.request_origin}
                      </span>
                    )}
                    {req.requirement_source && req.requirement_source !== 'Platform' && (
                      <span>via {req.requirement_source}</span>
                    )}
                    {(req.created_by_label || (req.created_by_author_id && updateAuthors.find(a => a.id === req.created_by_author_id)?.display_name)) && (
                      <span>Logged by {req.created_by_label || updateAuthors.find(a => a.id === req.created_by_author_id)?.display_name}</span>
                    )}
                    {req.assigned_contributor_name && (
                      <span>Assigned: {req.assigned_contributor_name}</span>
                    )}
                    {req.created_at && (
                      <span>Created {new Date(req.created_at).toLocaleDateString('en-ZA')}</span>
                    )}
                    {req.submitted_at && (
                      <span className="text-emerald-600 font-bold">Submitted {new Date(req.submitted_at).toLocaleDateString('en-ZA')}</span>
                    )}
                    {GUIDED_REVIEW_CONFIGS[req.template_id] && typeof req.review_completed !== 'undefined' && (
                      <span className="font-bold text-navy">
                        {Number(req.review_completed)} / {GUIDED_REVIEW_CONFIGS[req.template_id].items.length} reviewed
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-gold" />
            </div>
          ))
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-navy">Request Client Input</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-navy">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateRequest} className="p-6 space-y-5">
              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{createError}</div>
              )}

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Request Title</label>
                <input
                  type="text"
                  value={newRequestForm.title}
                  onChange={(e) => setNewRequestForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Filament Presentation Review — July Update"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Entity</label>
                <select
                  value={newRequestForm.entity}
                  onChange={(e) => setNewRequestForm(prev => ({ ...prev, entity: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                >
                  {ENTITY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">What do you need from the client?</label>
                <select
                  value={newRequestForm.templateId}
                  onChange={(e) => setNewRequestForm(prev => ({ ...prev, templateId: e.target.value }))}
                  disabled={loadingCreateData}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold disabled:bg-slate-50"
                >
                  <option value="">{loadingCreateData ? 'Loading request types...' : 'Select a request type...'}</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{TEMPLATE_DISPLAY_LABELS[t.id] || t.title}</option>)}
                </select>
                <p className="text-xs text-slate-400 mt-1">This determines the exact structured questions the client will be asked to answer.</p>
                {templateLoadError && (
                  <p className="text-sm text-red-600 mt-1.5">{templateLoadError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Assigned Contributor <span className="font-normal text-slate-400">(optional)</span></label>
                <select
                  value={newRequestForm.contributorUserId}
                  onChange={(e) => setNewRequestForm(prev => ({ ...prev, contributorUserId: e.target.value }))}
                  disabled={loadingCreateData}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold disabled:bg-slate-50"
                >
                  <option value="">Unassigned</option>
                  {contributors.map(c => (
                    <option key={c.user_id} value={c.user_id}>{c.display_name || c.user_id} ({c.entity_scope})</option>
                  ))}
                </select>
                {!loadingCreateData && contributors.length === 0 ? (
                  <p className="text-xs text-slate-400 mt-1.5">No active client contributors available yet. You can create this request now and assign a contributor later.</p>
                ) : (
                  <p className="text-xs text-slate-400 mt-1.5">You can create this request now and assign a contributor later.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Primary Approver <span className="font-normal text-slate-400">(optional)</span></label>
                <select
                  value={newRequestForm.approverAuthorId}
                  onChange={(e) => setNewRequestForm(prev => ({ ...prev, approverAuthorId: e.target.value }))}
                  disabled={loadingCreateData}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold disabled:bg-slate-50"
                >
                  <option value="">No approver set</option>
                  {authors.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Client-Reported Urgency</label>
                <select
                  value={newRequestForm.clientReportedUrgency}
                  onChange={(e) => setNewRequestForm(prev => ({ ...prev, clientReportedUrgency: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                >
                  {URGENCY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Brief / Context for the Client <span className="font-normal text-slate-400">(optional)</span></label>
                <p className="text-xs text-slate-400 mb-1.5">Explain what you need the client to review, provide, confirm, or correct.</p>
                <textarea
                  value={newRequestForm.contextNote}
                  onChange={(e) => setNewRequestForm(prev => ({ ...prev, contextNote: e.target.value }))}
                  rows={3}
                  placeholder="Please review the current Filament business profile and identify exact wording changes, sections to remove, content to replace, and any visual direction required."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Reference Link <span className="font-normal text-slate-400">(optional)</span></label>
                <input
                  type="url"
                  value={newRequestForm.referenceLink}
                  onChange={(e) => setNewRequestForm(prev => ({ ...prev, referenceLink: e.target.value }))}
                  placeholder="https://..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-500">Supporting Files</p>
                <p className="text-xs text-slate-400 mt-0.5">Attachments coming in V4A.1 — secure screenshot, PDF and document uploads will be added in the next collaboration enhancement.</p>
              </div>

              {selectedAuthorId && (
                <p className="text-xs text-slate-400">
                  Created By: <span className="font-bold text-slate-600">
                    {updateAuthors.find(a => a.id === selectedAuthorId)?.display_name || 'Selected Active Editor'}
                  </span>
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-navy bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || loadingCreateData}
                  className="px-5 py-2 text-sm font-bold text-navy bg-gold hover:bg-gold/90 rounded-lg shadow-md shadow-gold/20 transition-all disabled:opacity-60"
                >
                  {creating ? 'Creating...' : 'Create Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showClientSubmitModal && (
        <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-navy">Submit Requirement / Change</h2>
              <button onClick={() => setShowClientSubmitModal(false)} className="text-slate-400 hover:text-navy">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleClientSubmitRequirement} className="p-6 space-y-5">
              {clientSubmitError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{clientSubmitError}</div>
              )}

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Request Title</label>
                <input
                  type="text"
                  value={clientSubmitForm.title}
                  onChange={(e) => setClientSubmitForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Homepage wording change"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">What do you need help with?</label>
                <select
                  value={clientSubmitForm.templateId}
                  onChange={(e) => setClientSubmitForm(prev => ({ ...prev, templateId: e.target.value }))}
                  disabled={loadingCreateData}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold disabled:bg-slate-50"
                >
                  <option value="">{loadingCreateData ? 'Loading request types...' : 'Select a request type...'}</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{TEMPLATE_DISPLAY_LABELS[t.id] || t.title}</option>)}
                </select>
                <p className="text-xs text-slate-400 mt-1">This determines the exact structured questions you'll be asked next.</p>
                {templateLoadError && (
                  <p className="text-sm text-red-600 mt-1.5">{templateLoadError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Urgency</label>
                <select
                  value={clientSubmitForm.clientReportedUrgency}
                  onChange={(e) => setClientSubmitForm(prev => ({ ...prev, clientReportedUrgency: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                >
                  {URGENCY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Brief / Context for Embark <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea
                  value={clientSubmitForm.contextNote}
                  onChange={(e) => setClientSubmitForm(prev => ({ ...prev, contextNote: e.target.value }))}
                  rows={3}
                  placeholder="A short introduction before the structured questions on the next screen."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Reference Link <span className="font-normal text-slate-400">(optional)</span></label>
                <input
                  type="url"
                  value={clientSubmitForm.referenceLink}
                  onChange={(e) => setClientSubmitForm(prev => ({ ...prev, referenceLink: e.target.value }))}
                  placeholder="https://..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-500">Supporting Files</p>
                <p className="text-xs text-slate-400 mt-0.5">Attachments coming in V4A.1 — secure screenshot, PDF and document uploads will be added in the next collaboration enhancement.</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClientSubmitModal(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-navy bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={clientSubmitting || loadingCreateData}
                  className="px-5 py-2 text-sm font-bold text-navy bg-gold hover:bg-gold/90 rounded-lg shadow-md shadow-gold/20 transition-all disabled:opacity-60"
                >
                  {clientSubmitting ? 'Submitting...' : 'Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLogModal && (
        <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-navy">Log Client Requirement</h2>
                <p className="text-xs text-slate-400 mt-0.5">Capture a requirement the client communicated outside the platform.</p>
              </div>
              <button onClick={() => setShowLogModal(false)} className="text-slate-400 hover:text-navy">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleLogRequirement} className="p-6 space-y-5">
              {logError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{logError}</div>
              )}

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Request Title</label>
                <input
                  type="text"
                  value={logForm.title}
                  onChange={(e) => setLogForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Business profile wording corrections"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-navy mb-1.5">Entity</label>
                  <select
                    value={logForm.entity}
                    onChange={(e) => setLogForm(prev => ({ ...prev, entity: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                  >
                    {ENTITY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-navy mb-1.5">Requirement Source</label>
                  <select
                    value={logForm.requirementSource}
                    onChange={(e) => setLogForm(prev => ({ ...prev, requirementSource: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                  >
                    {['WhatsApp', 'Email', 'Meeting', 'Phone Call', 'Other'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Client / Source Person <span className="font-normal text-slate-400">(optional)</span></label>
                <select
                  value={logForm.sourcePersonUserId}
                  onChange={(e) => setLogForm(prev => ({ ...prev, sourcePersonUserId: e.target.value }))}
                  disabled={loadingCreateData}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold disabled:bg-slate-50"
                >
                  <option value="">Unspecified</option>
                  {contributors.map(c => (
                    <option key={c.user_id} value={c.user_id}>{c.display_name || 'Unnamed contributor'}{c.entity_scope ? ` (${c.entity_scope})` : ''}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Who communicated this requirement, where a client profile exists.</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">What do you need help with?</label>
                <select
                  value={logForm.templateId}
                  onChange={(e) => setLogForm(prev => ({ ...prev, templateId: e.target.value }))}
                  disabled={loadingCreateData}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold disabled:bg-slate-50"
                >
                  <option value="">{loadingCreateData ? 'Loading request types...' : 'Select a request type...'}</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{TEMPLATE_DISPLAY_LABELS[t.id] || t.title}</option>)}
                </select>
                {templateLoadError && (
                  <p className="text-sm text-red-600 mt-1.5">{templateLoadError}</p>
                )}
                {GUIDED_REVIEW_CONFIGS[logForm.templateId] && (
                  <p className="text-xs text-slate-400 mt-1">This is a guided review — after logging, you can capture the client's feedback page by page / slide by slide.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Client-Reported Urgency</label>
                <select
                  value={logForm.clientReportedUrgency}
                  onChange={(e) => setLogForm(prev => ({ ...prev, clientReportedUrgency: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                >
                  {URGENCY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Brief / Context <span className="font-normal text-slate-400">(what exactly did the client say?)</span></label>
                <textarea
                  value={logForm.contextNote}
                  onChange={(e) => setLogForm(prev => ({ ...prev, contextNote: e.target.value }))}
                  rows={3}
                  placeholder="Capture the client's requirement as accurately as possible, in their own words where you can."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Reference Link <span className="font-normal text-slate-400">(optional)</span></label>
                <input
                  type="url"
                  value={logForm.referenceLink}
                  onChange={(e) => setLogForm(prev => ({ ...prev, referenceLink: e.target.value }))}
                  placeholder="https://..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              {selectedAuthorId && (
                <p className="text-xs text-slate-400">
                  Logged By: <span className="font-bold text-slate-600">
                    {updateAuthors.find(a => a.id === selectedAuthorId)?.display_name || 'Selected Active Editor'}
                  </span>
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-navy bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={logging || loadingCreateData}
                  className="px-5 py-2 text-sm font-bold text-navy bg-gold hover:bg-gold/90 rounded-lg shadow-md shadow-gold/20 transition-all disabled:opacity-60"
                >
                  {logging ? 'Logging...' : 'Log Requirement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
