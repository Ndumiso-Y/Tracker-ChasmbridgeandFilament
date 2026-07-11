import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collaborationService } from '../services/collaborationService';
import { FileStack, Clock, CheckCircle, ChevronRight, Save, Send, Plus, X } from 'lucide-react';
import { cx } from '../utils/cx';
import { GUIDED_REVIEW_CONFIGS } from '../data/guidedReviewConfigs';
import GuidedReviewForm from '../components/GuidedReviewForm';
import { PROGRAMME_ENTITIES, INPUT_URGENCY, GUIDED_REVIEW_ACTION_LABELS, RETIRED_TEMPLATE_IDS, SECURE_SIGN_IN_ENABLED } from '../data/programmeContext';
import { requestResponsibility, RESPONSIBILITY } from '../utils/responsibility';
import { ResponsibilityBadge } from '../components/Badge';
import { displayRequestStatus, REQUEST_ORIGIN_SHORT } from '../utils/statusLanguage';
import { explainDbError } from '../utils/dbErrors';

// Helper: returns a template-specific contextual label for the primary action
// button when a guided review template is selected. Returns defaultLabel for
// non-guided templates, ensuring no generic 'Start Guided Review' copy leaks.
function getRequestPrimaryActionLabel(templateId, defaultLabel) {
  if (!templateId) return defaultLabel;
  return GUIDED_REVIEW_ACTION_LABELS[templateId] || (GUIDED_REVIEW_CONFIGS[templateId] ? 'Next: Review' : defaultLabel);
}

// Deterministic title suggestion for the fast intake paths (V4A.14): the
// first sentence/line of "what did the client ask?", trimmed to a readable
// length. No AI, no mutation of the ask text — just a draft the user can
// edit under More Details before logging.
function suggestTitleFromAsk(text) {
  if (!text) return '';
  let t = text.trim().split(/\n/)[0].replace(/\s+/g, ' ');
  const sentenceEnd = t.search(/[.!?](\s|$)/);
  if (sentenceEnd > 0) t = t.slice(0, sentenceEnd);
  t = t.trim();
  if (t.length > 70) t = t.slice(0, 70).replace(/\s+\S*$/, '').trim() + '…';
  return t;
}

// The default request type for a normal (unstructured) request — structured
// types (Company Profile Review, Presentation Review, Website Requirements,
// Graphic / Flyer) stay one select away under More Details, so complexity
// follows the work instead of fronting every intake.
const GENERAL_REQUEST_TEMPLATE_ID = 'template-general';

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
  'template-filament-slides-review': 'Filament Presentation Review (43-slide, historical)',
  'template-filament-slides-review-v2': 'Filament Presentation Review',
};

export default function ClientInputRequirements({ selectedAuthorId = "", updateAuthors = [], onSelectAuthor = null, targetRecordId = null, onRecordTargetConsumed = null }) {
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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [templateLoadError, setTemplateLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [newRequestForm, setNewRequestForm] = useState({
    title: '', entity: 'Both', templateId: '', contributorUserId: '', approverAuthorId: '', contextNote: '', referenceLink: '', clientReportedUrgency: 'Normal', linkedTrackerItemId: '', requirementSource: 'Platform',
  });
  const canOperateInternally = isAdmin || !!selectedAuthorId || !profile;

  // Tracker items for Related Delivery Item picker in request creation
  const [trackerItemsForLinking, setTrackerItemsForLinking] = useState([]);

  // Later contributor assignment (internal operator only)
  const [activeContributors, setActiveContributors] = useState([]);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [assignSelection, setAssignSelection] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState(null);

  // Two-tab information architecture (V4A.9): "Client Input" (the client
  // has a requirement and tells Embark) vs "Client Flow" (Embark asks the
  // client for structured input) are two different intentions that were
  // Register lens (V4A.12): the primary operational question is WHO NEEDS
  // TO ACT, not which database origin a request carries. The register is
  // one list filtered by responsibility; request_origin stays visible as
  // metadata on every card and in the detail view — provenance is never
  // destroyed, it just no longer gates navigation.
  const [activeFilter, setActiveFilter] = useState('active');

  // Client-originated requirement/change submission (authenticated
  // client_contributor only) — the opposite direction from "Request Client
  // Input" above, reusing the same seven-template architecture.
  const [showClientSubmitModal, setShowClientSubmitModal] = useState(false);
  const [clientSubmitting, setClientSubmitting] = useState(false);
  const [clientSubmitError, setClientSubmitError] = useState(null);
  const [clientSubmitForm, setClientSubmitForm] = useState({
    title: '', templateId: '', clientReportedUrgency: 'Normal', contextNote: '', referenceLink: '', dateNeeded: '',
  });
  // Progressive disclosure (V4A.14): the primary surface is "what do you
  // need?" — everything else (title, request type, reference link) lives
  // under a collapsed More Details section. titleEdited tracks whether the
  // user has taken over the auto-suggested title.
  const [showClientMoreDetails, setShowClientMoreDetails] = useState(false);
  const [clientTitleEdited, setClientTitleEdited] = useState(false);

  // Register load states (V4A.10) — silent empty registers are forbidden;
  // "no rows", "no identity selected yet", and "load failed" are three
  // different situations and each gets its own visible state.
  const [loadError, setLoadError] = useState(null);
  const [needsAuthorSelection, setNeedsAuthorSelection] = useState(false);

  // Visible response-write errors (V4A.15) — replaces the retired silent
  // .catch(console.warn) persistence pattern. responseSaved is the matching
  // positive signal: a confirmed server write says so out loud.
  const [responseError, setResponseError] = useState(null);
  const [responseSaved, setResponseSaved] = useState(false);

  // Request retention actions (archive / draft delete) working state.
  const [retentionBusy, setRetentionBusy] = useState(false);

  // Internal request edit (V4A.18) — narrow, lifecycle-guarded, matching
  // the ticket edit contract.
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [editRequestForm, setEditRequestForm] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);

  const openEditPanel = () => {
    setEditError(null);
    setEditRequestForm({
      title: selectedRequest.title || '',
      entity: selectedRequest.entity || 'Both',
      clientReportedUrgency: selectedRequest.client_reported_urgency || 'Normal',
      requirementSource: selectedRequest.requirement_source || 'Platform',
      additionalContext: '',
    });
    setShowEditPanel(true);
  };

  const handleSaveRequestEdit = async () => {
    if (!selectedAuthorId) {
      setEditError('Choose a team member (Active Editor) first.');
      return;
    }
    if (!editRequestForm.title.trim()) {
      setEditError('A request title is required.');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const updated = await collaborationService.updateInternalClientInputRequest({
        authorId: selectedAuthorId,
        requestId: selectedRequest.id,
        title: editRequestForm.title.trim(),
        entity: editRequestForm.entity,
        clientReportedUrgency: editRequestForm.clientReportedUrgency,
        requirementSource: editRequestForm.requirementSource,
        additionalContext: editRequestForm.additionalContext.trim() || null,
      });
      setSelectedRequest(prev => ({ ...prev, ...updated }));
      setShowEditPanel(false);
      await loadRequests();
    } catch (err) {
      console.error(err);
      setEditError(explainDbError(err, 'supabase/client_input_request_edit.sql'));
    } finally {
      setEditSaving(false);
    }
  };

  // Internal operator: log a client requirement communicated outside the
  // platform (WhatsApp / Email / Meeting / Phone Call / Other).
  const [showLogModal, setShowLogModal] = useState(false);
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState(null);
  const [logForm, setLogForm] = useState({
    title: '', entity: 'Both', requirementSource: 'WhatsApp', templateId: '',
    sourcePersonUserId: '', clientReportedUrgency: 'Normal', contextNote: '', referenceLink: '',
    linkedTrackerItemId: '', dateNeeded: '',
  });
  // Progressive disclosure (V4A.14): the normal WhatsApp/Email request logs
  // from four visible fields (what did the client ask / related delivery
  // item / source / urgency); provenance fields stay in the model under a
  // collapsed More Details section — nothing is removed, only deferred.
  const [showLogMoreDetails, setShowLogMoreDetails] = useState(false);
  const [logTitleEdited, setLogTitleEdited] = useState(false);

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

  // Direct record navigation (V4A.14): consume a targeted request id once
  // the persona-correct register has loaded — select the real loaded row
  // via the canonical handleSelectRequest (which resolves guided vs
  // structured detail), then clear the consumed target.
  useEffect(() => {
    if (!targetRecordId || loading) return;
    const found = requests.find(r => r.id === targetRecordId);
    if (found) handleSelectRequest(found);
    if (onRecordTargetConsumed) onRecordTargetConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRecordId, loading, requests]);

  // Internal RPC rows are flat (template_title, counts, labels); reshape
  // them to the same shape the rest of the view already renders.
  // The extended RPC (client_input_tracker_link.sql migration) also returns
  // flat linked-item fields — these are already reshaped into tracker_items
  // by collaborationService.getInternalClientInputRequests() before reaching here.
  const mapInternalRegisterRow = (r) => ({
    ...r,
    client_input_templates: { title: r.template_title },
    // tracker_items is already nested by collaborationService — preserve it.
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
    setShowEditPanel(false);
    setResponseError(null);
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

  // Request retention (V4A.15): archive/unarchive real records (reversible,
  // provenance-commented server-side); permanent delete only for
  // never-assigned Drafts via the status-guarded RPC.
  const handleArchiveToggle = async (req, archive) => {
    if (!selectedAuthorId) {
      showNotice('warning', 'Select an Active Editor in the sidebar to manage the register.');
      return;
    }
    setRetentionBusy(true);
    try {
      if (archive) {
        await collaborationService.archiveInternalClientInputRequest({ authorId: selectedAuthorId, requestId: req.id });
        showNotice('success', 'Request archived. Find it under the Archived filter.');
      } else {
        await collaborationService.unarchiveInternalClientInputRequest({ authorId: selectedAuthorId, requestId: req.id });
        showNotice('success', 'Request restored from archive.');
      }
      setSelectedRequest(null);
      await loadRequests();
    } catch (err) {
      console.error(err);
      showNotice('warning', explainDbError(err, 'supabase/client_access_and_request_retention.sql'));
    } finally {
      setRetentionBusy(false);
    }
  };

  const handleDeleteDraft = async (req) => {
    if (!selectedAuthorId) {
      showNotice('warning', 'Select an Active Editor in the sidebar to manage the register.');
      return;
    }
    if (!window.confirm(`Permanently delete the draft "${req.title}"? This cannot be undone.`)) return;
    setRetentionBusy(true);
    try {
      await collaborationService.deleteInternalDraftClientInputRequest({ authorId: selectedAuthorId, requestId: req.id });
      showNotice('success', 'Draft deleted.');
      if (selectedRequest?.id === req.id) setSelectedRequest(null);
      await loadRequests();
    } catch (err) {
      console.error(err);
      showNotice('warning', explainDbError(err, 'supabase/client_access_and_request_retention.sql'));
    } finally {
      setRetentionBusy(false);
    }
  };

  const handleResponseChange = (sectionId, value) => {
    setResponses(prev => ({ ...prev, [sectionId]: value }));
  };

  // Honest persistence (V4A.15): a failed save is a visible error, never a
  // silently swallowed promise — the UI must not imply persistence that
  // did not happen. Local status only advances on a confirmed server write.
  const handleSaveDraft = async () => {
    setSaving(true);
    setResponseError(null);
    setResponseSaved(false);
    try {
      for (const sectionId of Object.keys(responses)) {
        await collaborationService.upsertResponse({
          input_request_id: selectedRequest.id,
          template_section_id: sectionId,
          content: responses[sectionId],
          updated_by: profile?.user_id
        });
      }

      // Update status to In Progress if it was just Required
      if (selectedRequest.status === 'Client Input Required') {
        const updated = await collaborationService.updateRequest(selectedRequest.id, {
          status: 'Client Input In Progress'
        });
        setSelectedRequest(prev => ({ ...prev, ...updated }));
      }
      setResponseSaved(true);
      setTimeout(() => setResponseSaved(false), 5000);
      return true;
    } catch (err) {
      console.error(err);
      setResponseError(err.message || 'Your responses could not be saved. Nothing was lost on screen — please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleUrgencyChange = async (value) => {
    setResponseError(null);
    try {
      const updated = await collaborationService.updateRequest(selectedRequest.id, { client_reported_urgency: value });
      setSelectedRequest(updated);
    } catch (err) {
      console.error(err);
      setResponseError(err.message || 'The urgency change could not be saved.');
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setResponseError(null);
    try {
      const saved = await handleSaveDraft();
      if (!saved) return;

      // Freeze revisions (history snapshot — a failure here must not block
      // the submission itself, but is still logged).
      await collaborationService.freezeRevisions(selectedRequest.id).catch(console.warn);

      // Status advances ONLY on a confirmed server write.
      const updated = await collaborationService.updateRequest(selectedRequest.id, {
        status: 'Ready for Embark Review',
        submitted_at: new Date().toISOString()
      });

      setSelectedRequest(prev => ({ ...prev, ...updated }));
      await loadRequests();
    } catch (err) {
      console.error(err);
      setResponseError(err.message || 'Your submission could not be completed. Your responses are saved as a draft — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openCreateModal = async () => {
    setCreateError(null);
    setTemplateLoadError(null);
    setNewRequestForm({ title: '', entity: 'Both', templateId: '', contributorUserId: '', approverAuthorId: selectedAuthorId || '', contextNote: '', referenceLink: '', clientReportedUrgency: 'Normal', linkedTrackerItemId: '', requirementSource: 'Platform' });
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

    // Load tracker items for Related Delivery Item picker
    // (entity-filtered client-side; Phase 2/3 are the relevant delivery items).
    try {
      const items = await collaborationService.searchTrackerItemsForLinking();
      setTrackerItemsForLinking(items || []);
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
      setCreateError('Choose who is creating this under "Created by" first.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      // Reference link and non-platform source are folded into the same
      // truthful provenance comment (client_input_comments) — the create
      // RPC's physical contract is unchanged.
      const referenceLink = newRequestForm.referenceLink.trim();
      const contextText = newRequestForm.contextNote.trim();
      const combinedContext = [
        newRequestForm.requirementSource !== 'Platform' ? `Source: ${newRequestForm.requirementSource}` : '',
        referenceLink ? `Reference: ${referenceLink}` : '',
        contextText,
      ].filter(Boolean).join('\n\n');

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

      // If a Related Delivery Item was selected, link it atomically before
      // entering the guided wizard. Failure must block wizard entry.
      if (created && newRequestForm.linkedTrackerItemId) {
        await collaborationService.linkInternalClientInputRequestTrackerItem({
          authorId: selectedAuthorId,
          requestId: created.id,
          trackerItemId: newRequestForm.linkedTrackerItemId,
        });
      }

      setShowCreateModal(false);
      await reloadAfterCreate(created);
      if (GUIDED_REVIEW_CONFIGS[newRequestForm.templateId] && created) {
        await handleSelectRequest(created);
      }
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
      linkedTrackerItemId: '', dateNeeded: '',
    });
    setShowLogMoreDetails(false);
    setLogTitleEdited(false);
    setShowLogModal(true);
    setLoadingCreateData(true);
    try {
      const tpls = await collaborationService.getTemplates();
      setTemplates(tpls || []);
      if (!tpls || tpls.length === 0) {
        setTemplateLoadError('No request types are currently available. Please try again, or contact Embark Digitals if this persists.');
      } else if (tpls.some(t => t.id === GENERAL_REQUEST_TEMPLATE_ID)) {
        // A normal WhatsApp/Email request defaults to General Request so the
        // primary surface needs no type decision; structured types remain
        // selectable under More Details.
        setLogForm(prev => ({ ...prev, templateId: prev.templateId || GENERAL_REQUEST_TEMPLATE_ID }));
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
    // Related Delivery Item picker — the same live tracker_items truth the
    // Request Client Input form already uses; optional, never blocking.
    try {
      const items = await collaborationService.searchTrackerItemsForLinking();
      setTrackerItemsForLinking(items || []);
    } catch (err) {
      console.error(err);
    }
    setLoadingCreateData(false);
  };

  const handleLogRequirement = async (e) => {
    e.preventDefault();
    // The ask is the only mandatory intake field; title auto-suggests.
    const askText = logForm.contextNote.trim();
    const resolvedTitle = logForm.title.trim() || suggestTitleFromAsk(askText);
    if (!askText || !resolvedTitle || !logForm.templateId) {
      setLogError(!askText ? 'Please describe what the client asked.' : 'A request type is required — choose one under More Details.');
      return;
    }
    if (!selectedAuthorId) {
      setLogError('Choose who is recording this under "Recorded by" first.');
      return;
    }
    setLogging(true);
    setLogError(null);
    try {
      // Requester resolution: a provisioned client sign-in links formally
      // (contributor uuid); a team/client name is honest provenance recorded
      // in the request context — the two identity systems never collapse.
      let requesterContributorId = null;
      let requesterLine = '';
      if (logForm.sourcePersonUserId.startsWith('contrib:')) {
        requesterContributorId = logForm.sourcePersonUserId.slice(8);
      } else if (logForm.sourcePersonUserId.startsWith('author:')) {
        const reqAuthor = updateAuthors.find(a => a.id === logForm.sourcePersonUserId.slice(7));
        if (reqAuthor) requesterLine = `Requested by: ${reqAuthor.display_name}`;
      }

      const referenceLink = logForm.referenceLink.trim();
      const combinedContext = [
        requesterLine,
        logForm.dateNeeded ? `Needed by: ${logForm.dateNeeded} (client's preferred timing, not a confirmed delivery date)` : '',
        referenceLink ? `Reference: ${referenceLink}` : '',
        askText,
      ].filter(Boolean).join('\n\n');

      // Entity derives from the linked delivery item when one is selected;
      // the manual Entity field (More Details) only applies to unlinked
      // general requests.
      const linkedItem = logForm.linkedTrackerItemId
        ? trackerItemsForLinking.find(t => t.id === logForm.linkedTrackerItemId)
        : null;
      const resolvedEntity = (linkedItem && linkedItem.entity) || logForm.entity;

      const created = await collaborationService.logInternalClientRequirement({
        authorId: selectedAuthorId,
        title: resolvedTitle,
        entity: resolvedEntity,
        requirementSource: logForm.requirementSource,
        clientReportedUrgency: logForm.clientReportedUrgency,
        templateId: logForm.templateId,
        contextNote: combinedContext || null,
        guidedReview: !!GUIDED_REVIEW_CONFIGS[logForm.templateId],
        contributorUserId: requesterContributorId,
      });

      // Link the Related Delivery Item through the narrow link RPC — same
      // contract as the Request Client Input flow.
      if (created && logForm.linkedTrackerItemId) {
        await collaborationService.linkInternalClientInputRequestTrackerItem({
          authorId: selectedAuthorId,
          requestId: created.id,
          trackerItemId: logForm.linkedTrackerItemId,
        });
      }

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
    setClientSubmitForm({ title: '', templateId: '', clientReportedUrgency: 'Normal', contextNote: '', referenceLink: '', dateNeeded: '' });
    setShowClientMoreDetails(false);
    setClientTitleEdited(false);
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
      } else if (tpls.some(t => t.id === GENERAL_REQUEST_TEMPLATE_ID)) {
        // A normal request defaults to General Request; structured review
        // types stay one select away under More Details.
        setClientSubmitForm(prev => ({ ...prev, templateId: prev.templateId || GENERAL_REQUEST_TEMPLATE_ID }));
      }
    } catch (err) {
      console.error(err);
      setTemplateLoadError('Failed to load request types. Please try again.');
    }
    setLoadingCreateData(false);
  };

  const handleClientSubmitRequirement = async (e) => {
    e.preventDefault();
    const clientAskText = clientSubmitForm.contextNote.trim();
    const clientResolvedTitle = clientSubmitForm.title.trim() || suggestTitleFromAsk(clientAskText);
    if (!clientAskText || !clientResolvedTitle || !clientSubmitForm.templateId) {
      setClientSubmitError(!clientAskText ? 'Please describe your request.' : 'A request type is required — choose one under More Details.');
      return;
    }
    if (!profile?.user_id) {
      setClientSubmitError('Your account could not be verified. Please sign in again.');
      return;
    }
    setClientSubmitting(true);
    setClientSubmitError(null);
    try {
      // Reference link and preferred timing use the same truthful storage
      // contract — folded into the provenance comment, never a fabricated
      // column against the live schema. Preferred timing is client
      // information, never a delivery promise.
      const referenceLink = clientSubmitForm.referenceLink.trim();
      const combinedContext = [
        clientSubmitForm.dateNeeded ? `Needed by: ${clientSubmitForm.dateNeeded} (preferred timing, not a confirmed delivery date)` : '',
        referenceLink ? `Reference: ${referenceLink}` : '',
        clientAskText,
      ].filter(Boolean).join('\n\n');

      // Direct authenticated insert (RLS-enforced by "Contributors create
      // own requests" in client_originated_requirement_workflow.sql) — the
      // client is the authenticated source identity for this path, never
      // the internal Active Editor / SECURITY DEFINER bridge.
      const newRequest = await collaborationService.createRequest({
        id: `req-client-${Date.now()}`,
        title: clientResolvedTitle,
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

  // In-form team-member attribution (V4A.17): choosing "Recorded by" inside
  // the form sets the same global Active Editor the sidebar controls — one
  // identity truth, no detour to the sidebar, no "select an Active Editor"
  // dead end mid-form.
  const RecordedByPicker = ({ label = 'Recorded by (team member)' }) => (
    <div>
      <label className="block text-sm font-bold text-navy mb-1.5">{label}</label>
      <select
        value={selectedAuthorId}
        onChange={(e) => onSelectAuthor && onSelectAuthor(e.target.value)}
        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
      >
        <option value="">Select team member...</option>
        {updateAuthors.filter(a => a.is_active).map(a => (
          <option key={a.id} value={a.id}>{a.display_name}</option>
        ))}
      </select>
      {!selectedAuthorId && (
        <p className="text-xs text-amber-700 mt-1">Required — this attributes the update (it also sets the Active Editor for the session).</p>
      )}
    </div>
  );

  if (loading && !selectedRequest) {
    return <div className="p-8 text-slate-500">Loading requests...</div>;
  }

  if (selectedRequest) {
    const isReadOnly = ['Ready for Embark Review', 'Requirements Confirmed', 'In Production', 'Approved', 'Delivered'].includes(selectedRequest.status) && !isAdmin;

    // Final state grammar (V4A.15): structured responses are EDITED only by
    // an authenticated persona whose writes are real under RLS (the client
    // contributor in the editable lifecycle window, or an admin). Everyone
    // else — including the no-session internal operator, whose direct
    // response writes would be silently RLS-denied — gets a readable VIEW
    // MODE, never disabled input chrome.
    const canEditResponses = !!profile && !isReadOnly;
    const lockReason = isReadOnly
      ? `Submitted to Embark${selectedRequest.submitted_at ? ` on ${new Date(selectedRequest.submitted_at).toLocaleDateString('en-ZA')}` : ''} — responses are locked. ${
          requestResponsibility(selectedRequest) === RESPONSIBILITY.DONE
            ? 'This request is completed.'
            : 'Embark is reviewing and will act next.'
        }`
      : !profile
        ? (SECURE_SIGN_IN_ENABLED
            ? 'Responses are completed by the client from their secure sign-in. You are viewing this request as an internal editor.'
            : 'Structured responses are view-only here for now — capture the client’s answers with Edit Request → additional context, and the full record stays on this request.')
        : null;

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
                    {TEMPLATE_DISPLAY_LABELS[selectedRequest.template_id] || selectedRequest.client_input_templates?.title || 'Request'}
                  </span>
                  <span className="bg-slate-100 px-2.5 py-1 rounded-full text-slate-600 font-medium">
                    {selectedRequest.entity}
                  </span>
                  {selectedRequest.tracker_items && (
                    <span className="bg-navy text-slate-100 px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 shadow-sm" title="Related Delivery Item — live tracker truth">
                      <FileStack className="w-3 h-3 text-gold" />
                      {selectedRequest.tracker_items.title}
                      {(selectedRequest.tracker_items.phase || selectedRequest.tracker_items.status) && (
                        <span className="text-slate-300 font-normal">
                          · {[selectedRequest.tracker_items.phase, selectedRequest.tracker_items.status].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                  )}
                  <span className={cx(
                    "px-2.5 py-1 rounded-full font-medium border",
                    selectedRequest.status.includes('Required') || selectedRequest.status.includes('Progress') ? "bg-amber-50 text-amber-700 border-amber-200" :
                    selectedRequest.status === 'Ready for Embark Review' ? "bg-blue-50 text-blue-700 border-blue-200" :
                    selectedRequest.status === 'Requirements Confirmed' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    "bg-slate-100 text-slate-600 border-slate-200"
                  )}>
                    {displayRequestStatus(selectedRequest.status, isClient)}
                  </span>
                  {/* Urgency: only the authenticated client edits their own
                      urgency (a real RLS write); every other persona reads. */}
                  {isClient && !isReadOnly ? (
                    <label className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">Urgency:</span>
                      <select
                        value={selectedRequest.client_reported_urgency || 'Normal'}
                        onChange={(e) => handleUrgencyChange(e.target.value)}
                        className="text-xs font-bold border border-slate-300 rounded-full px-2 py-1 bg-white text-slate-700 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                      >
                        {INPUT_URGENCY.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </label>
                  ) : (
                    selectedRequest.client_reported_urgency && selectedRequest.client_reported_urgency !== 'Normal' && (
                      <span className={cx("px-2.5 py-1 rounded-full font-medium border", URGENCY_BADGE[selectedRequest.client_reported_urgency])}>
                        Urgency: {selectedRequest.client_reported_urgency}
                      </span>
                    )
                  )}
                  {selectedRequest.archived_at && (
                    <span className="px-2.5 py-1 rounded-full font-medium border bg-slate-100 text-slate-500 border-slate-200">Archived</span>
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
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {/* Narrow internal edit (V4A.18) — title/entity/urgency/
                      source only; anything except Approved/Delivered. */}
                  {!['Approved', 'Delivered'].includes(selectedRequest.status) && (
                    <button
                      type="button"
                      onClick={openEditPanel}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-navy bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      Edit Request
                    </button>
                  )}
                  {/* Contributor assignment routes work to client SIGN-IN
                      accounts — parked with SECURE_SIGN_IN_ENABLED. */}
                  {!SECURE_SIGN_IN_ENABLED ? null : assignmentLifecycleLocked ? (
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
                  {/* Retention: real records archive (reversible); only a
                      never-assigned Draft may be permanently deleted. */}
                  {selectedRequest.status === 'Draft' && !selectedRequest.assigned_contributor_user_id ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(selectedRequest)}
                      disabled={retentionBusy}
                      className="px-4 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-60"
                    >
                      Delete Draft
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleArchiveToggle(selectedRequest, !selectedRequest.archived_at)}
                      disabled={retentionBusy}
                      className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-60"
                    >
                      {selectedRequest.archived_at ? 'Unarchive' : 'Archive'}
                    </button>
                  )}
                </div>
              </div>

              {showEditPanel && editRequestForm && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                  {editError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{editError}</div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-bold text-navy mb-1.5">Title</label>
                      <input
                        type="text"
                        value={editRequestForm.title}
                        onChange={(e) => setEditRequestForm(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-navy mb-1.5">Entity</label>
                      <select
                        value={editRequestForm.entity}
                        onChange={(e) => setEditRequestForm(prev => ({ ...prev, entity: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                      >
                        {PROGRAMME_ENTITIES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-navy mb-1.5">Urgency</label>
                      <select
                        value={editRequestForm.clientReportedUrgency}
                        onChange={(e) => setEditRequestForm(prev => ({ ...prev, clientReportedUrgency: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                      >
                        {INPUT_URGENCY.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-navy mb-1.5">Source</label>
                      <select
                        value={editRequestForm.requirementSource}
                        onChange={(e) => setEditRequestForm(prev => ({ ...prev, requirementSource: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                      >
                        {['Platform', 'WhatsApp', 'Email', 'Meeting', 'Phone Call', 'Other'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-bold text-navy mb-1.5">Add Context <span className="font-normal text-slate-400">(optional — appended to the request history, the original ask is never rewritten)</span></label>
                      <textarea
                        value={editRequestForm.additionalContext}
                        onChange={(e) => setEditRequestForm(prev => ({ ...prev, additionalContext: e.target.value }))}
                        rows={2}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSaveRequestEdit}
                      disabled={editSaving}
                      className="px-4 py-2 text-sm font-bold text-navy bg-gold hover:bg-gold/90 rounded-lg shadow-md shadow-gold/20 transition-all disabled:opacity-60"
                    >
                      {editSaving ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEditPanel(false)}
                      className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-navy bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

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
            {/* Lifecycle lock / view-mode explanation — grey chrome never
                stands in for an explanation. */}
            {lockReason && (
              <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <span aria-hidden="true">🔒</span>
                <p>{lockReason}</p>
              </div>
            )}
            {responseError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{responseError}</div>
            )}
            {responseSaved && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm font-bold">✓ Responses saved successfully.</div>
            )}
            {sections.length === 0 ? (
              <p className="text-slate-500">No template sections found for this request.</p>
            ) : !canEditResponses ? (
              // VIEW MODE: readable answers, no disabled input chrome.
              sections.map(section => {
                const raw = responses[section.id];
                let display = raw;
                if (section.section_type === 'Checklist' && raw) {
                  try { display = JSON.parse(raw).join(', '); } catch { display = raw; }
                }
                return (
                  <div key={section.id} className="space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{section.section_label}</p>
                    <p className={cx("whitespace-pre-wrap text-slate-800", !display && "text-slate-400 italic")}>
                      {display || 'No response provided.'}
                    </p>
                  </div>
                );
              })
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

          {!isGuidedReview && canEditResponses && sections.length > 0 && (
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

  // One register, filtered by who needs to act (responsibility model).
  // V4A.15: the Filament guided review programmes (Company Profile /
  // Presentation) live in their own Filament Reviews lens — the generic
  // register shows transactional requests only. Archived records leave
  // every active lens and remain recoverable under Archived (internal).
  const registerRequests = requests.filter(r => !GUIDED_REVIEW_CONFIGS[r.template_id]);
  const guidedCount = requests.filter(r => GUIDED_REVIEW_CONFIGS[r.template_id] && !r.archived_at).length;
  const notArchived = (r) => !r.archived_at;
  const FILTERS = [
    { key: 'active', label: 'Active', match: (r) => notArchived(r) && requestResponsibility(r) !== RESPONSIBILITY.DONE },
    { key: 'embark', label: 'Needs Embark', match: (r) => notArchived(r) && requestResponsibility(r) === RESPONSIBILITY.EMBARK },
    { key: 'client', label: 'Needs Client', match: (r) => notArchived(r) && requestResponsibility(r) === RESPONSIBILITY.CLIENT },
    { key: 'drafts', label: 'Drafts', match: (r) => notArchived(r) && requestResponsibility(r) === RESPONSIBILITY.DRAFT },
    { key: 'completed', label: 'Completed', match: (r) => notArchived(r) && requestResponsibility(r) === RESPONSIBILITY.DONE },
    // Archived is an internal recovery lens, never client navigation.
    ...(isClient ? [] : [{ key: 'archived', label: 'Archived', match: (r) => !!r.archived_at }]),
  ];
  const activeFilterDef = FILTERS.find(f => f.key === activeFilter) || FILTERS[0];
  const visibleRequests = registerRequests.filter(activeFilterDef.match);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-navy tracking-tight mb-2">Requests</h1>
          <p className="text-slate-500 max-w-xl">Everything the client has asked Embark for, and everything Embark is waiting on from the client — in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isClient && (
            <button
              onClick={openClientSubmitModal}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:bg-gold/90 transition-all whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> I Have a Request
            </button>
          )}
          {canOperateInternally && !isClient && (
            <>
              <button
                onClick={openLogModal}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-slate-200 text-navy font-bold text-sm hover:border-gold transition-all whitespace-nowrap"
              >
                <Plus className="w-4 h-4" /> Log Request
              </button>
              <button
                onClick={openCreateModal}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:bg-gold/90 transition-all whitespace-nowrap"
              >
                <Plus className="w-4 h-4" /> Request Client Input
              </button>
            </>
          )}
        </div>
      </div>

      {guidedCount > 0 && (
        <div className="mb-4 rounded-lg border border-navy/15 bg-navy/[0.04] px-4 py-2.5 text-sm text-navy">
          The Filament Company Profile and Presentation review programmes live under <span className="font-bold">Filament Reviews</span> in the sidebar.
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FILTERS.map(f => {
          const count = registerRequests.filter(f.match).length;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveFilter(f.key)}
              className={cx(
                "px-3.5 py-1.5 rounded-full text-sm font-bold border transition-colors",
                activeFilter === f.key ? "bg-navy border-navy text-white" : "bg-white border-slate-200 text-slate-500 hover:border-gold hover:text-navy"
              )}
            >
              {f.label} <span className={cx("ml-1", activeFilter === f.key ? "text-white/60" : "text-slate-400")}>{count}</span>
            </button>
          );
        })}
      </div>

      {loadError && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>{loadError}</span>
          <button type="button" onClick={loadRequests} className="text-xs font-bold underline">Retry</button>
        </div>
      )}
      {needsAuthorSelection && !loadError && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <span>Choose a team member to load the register:</span>
          <select
            value={selectedAuthorId}
            onChange={(e) => onSelectAuthor && onSelectAuthor(e.target.value)}
            className="h-9 rounded-lg border border-amber-300 bg-white px-2 text-xs font-bold text-navy focus:border-gold focus:ring-2 focus:ring-gold/30"
          >
            <option value="">Select team member...</option>
            {updateAuthors.filter(a => a.is_active).map(a => (
              <option key={a.id} value={a.id}>{a.display_name}</option>
            ))}
          </select>
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
              {activeFilter === 'active'
                ? (isClient ? 'No active requests.' : 'No active requests or client input.')
                : activeFilter === 'embark' ? 'Nothing needs Embark right now.'
                : activeFilter === 'client' ? 'Nothing is waiting on the client.'
                : activeFilter === 'drafts' ? 'No draft requests.'
                : activeFilter === 'archived' ? 'Nothing has been archived.'
                : 'No completed requests yet.'}
            </h3>
            <p className="text-slate-500 mt-2">
              {isClient
                ? 'Have a change or requirement for Embark? Submit it directly above.'
                : activeFilter === 'active'
                  ? 'Log what a client asked for, or request structured input from a client, using the actions above.'
                  : 'Switch filters above to see the rest of the register.'}
            </p>
            {activeFilter === 'active' && isClient && (
              <button
                onClick={openClientSubmitModal}
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:bg-gold/90 transition-all"
              >
                <Plus className="w-4 h-4" /> I Have a Request
              </button>
            )}
            {activeFilter === 'active' && canOperateInternally && !isClient && !needsAuthorSelection && (
              <button
                onClick={openCreateModal}
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:bg-gold/90 transition-all"
              >
                <Plus className="w-4 h-4" /> Request Client Input
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
                    <ResponsibilityBadge value={requestResponsibility(req)} />
                    <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {displayRequestStatus(req.status, isClient)}</span>
                    <span>•</span>
                    <span>{req.entity}</span>
                    {req.client_input_templates?.title && (
                      <>
                        <span>•</span>
                        <span>{TEMPLATE_DISPLAY_LABELS[req.template_id] || req.client_input_templates.title}</span>
                      </>
                    )}
                    {req.tracker_items && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-navy font-medium"><FileStack className="w-3 h-3 text-gold" /> {req.tracker_items.title}</span>
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
                    {/* Provenance stays stored and visible — as a small human
                        caption, never a raw database enum badge. The full
                        request_origin value ('Internal Requested Input',
                        'Client-Originated Requirement' or
                        'Internally Logged Client Requirement') remains in the
                        record and the detail metadata. */}
                    {req.request_origin && (
                      <span className={cx(
                        "font-bold",
                        req.request_origin === 'Client-Originated Requirement' ? "text-blue-600" :
                        req.request_origin === 'Internally Logged Client Requirement' ? "text-violet-600" :
                        "text-slate-500"
                      )}>
                        {REQUEST_ORIGIN_SHORT[req.request_origin] || req.request_origin}
                      </span>
                    )}
                    {req.requirement_source && req.requirement_source !== 'Platform' && (
                      <span>via {req.requirement_source}</span>
                    )}
                    {(req.created_by_label || (req.created_by_author_id && updateAuthors.find(a => a.id === req.created_by_author_id)?.display_name)) && (
                      <span>Recorded by {req.created_by_label || updateAuthors.find(a => a.id === req.created_by_author_id)?.display_name}</span>
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
                    {req.status === 'Draft' && !req.assigned_contributor_user_id && (
                      <span className="italic">Not yet assigned — not visible to the client</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!isClient && req.status === 'Draft' && !req.assigned_contributor_user_id && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteDraft(req); }}
                    disabled={retentionBusy}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-60"
                  >
                    Delete Draft
                  </button>
                )}
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-gold" />
              </div>
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

              <RecordedByPicker label="Created by (team member)" />

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
                  {PROGRAMME_ENTITIES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
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
                  {templates.filter(t => !RETIRED_TEMPLATE_IDS.includes(t.id)).map(t => <option key={t.id} value={t.id}>{TEMPLATE_DISPLAY_LABELS[t.id] || t.title}</option>)}
                </select>
                <p className="text-xs text-slate-400 mt-1">This determines the exact structured questions the client will be asked to answer.</p>
                {templateLoadError && (
                  <p className="text-sm text-red-600 mt-1.5">{templateLoadError}</p>
                )}
              </div>

              {/* Assignment moved off the primary intake (V4A.16): the
                  request is created first; "who at the client answers this"
                  (Requested From) is a post-create triage action — the
                  existing Assign Contributor control on the request detail.
                  The backend fields (assigned_contributor_user_id,
                  primary_approver_author_id) are preserved unchanged. */}
              {SECURE_SIGN_IN_ENABLED && (
                <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  You can choose who at the client answers this after creating it (Assign Contributor on the request).
                </p>
              )}

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Related Delivery Item <span className="font-normal text-slate-400">(optional)</span></label>
                <select
                  value={newRequestForm.linkedTrackerItemId}
                  onChange={(e) => setNewRequestForm(prev => ({ ...prev, linkedTrackerItemId: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                >
                  <option value="">No linked delivery item</option>
                  {trackerItemsForLinking
                    .filter(t => t.entity === 'Both' || newRequestForm.entity === 'Both' || t.entity === newRequestForm.entity)
                    .map(t => <option key={t.id} value={t.id}>{t.title} ({t.phase})</option>)
                  }
                </select>
                <p className="text-xs text-slate-400 mt-1.5">Link this request directly to an active Phase 2 or Phase 3 delivery task.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-navy mb-1.5">Source <span className="font-normal text-slate-400">(where did this need come from?)</span></label>
                  <select
                    value={newRequestForm.requirementSource}
                    onChange={(e) => setNewRequestForm(prev => ({ ...prev, requirementSource: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                  >
                    {['Platform', 'WhatsApp', 'Email', 'Meeting', 'Phone Call', 'Other'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-navy mb-1.5">Urgency</label>
                  <select
                    value={newRequestForm.clientReportedUrgency}
                    onChange={(e) => setNewRequestForm(prev => ({ ...prev, clientReportedUrgency: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                  >
                    {INPUT_URGENCY.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Brief / Context of Request <span className="font-normal text-slate-400">(optional)</span></label>
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
                  {creating ? 'Creating...' : getRequestPrimaryActionLabel(newRequestForm.templateId, 'Create Request')}
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
              <h2 className="text-xl font-bold text-navy">I Have a Request</h2>
              <button onClick={() => setShowClientSubmitModal(false)} className="text-slate-400 hover:text-navy">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleClientSubmitRequirement} className="p-6 space-y-5">
              {clientSubmitError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{clientSubmitError}</div>
              )}

              {/* PRIMARY SURFACE — the request in the client's own words,
                  preferred timing, urgency, reference */}
              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">What is your request?</label>
                <textarea
                  value={clientSubmitForm.contextNote}
                  onChange={(e) => {
                    const value = e.target.value;
                    setClientSubmitForm(prev => ({
                      ...prev,
                      contextNote: value,
                      title: clientTitleEdited ? prev.title : suggestTitleFromAsk(value),
                    }));
                  }}
                  rows={4}
                  autoFocus
                  placeholder="Describe what you need from Embark in your own words — e.g. 'We need a job post for a junior analyst role.'"
                  className="w-full bg-white border border-slate-300 rounded-lg p-3 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-navy mb-1.5">When do you need this? <span className="font-normal text-slate-400">(optional)</span></label>
                  <input
                    type="date"
                    value={clientSubmitForm.dateNeeded}
                    onChange={(e) => setClientSubmitForm(prev => ({ ...prev, dateNeeded: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                  />
                  <p className="text-xs text-slate-400 mt-1">Helps Embark understand your preferred timing — not a confirmed delivery date.</p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-navy mb-1.5">Urgency</label>
                  <select
                    value={clientSubmitForm.clientReportedUrgency}
                    onChange={(e) => setClientSubmitForm(prev => ({ ...prev, clientReportedUrgency: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                  >
                    {INPUT_URGENCY.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
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

              {/* MORE DETAILS — title + structured request type, collapsed */}
              <div className="rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowClientMoreDetails(v => !v)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-bold text-navy hover:bg-slate-50 rounded-lg"
                >
                  More Details
                  <ChevronRight className={cx('w-4 h-4 text-slate-400 transition-transform', showClientMoreDetails && 'rotate-90')} />
                </button>
                {showClientMoreDetails && (
                  <div className="border-t border-slate-100 p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-navy mb-1.5">Title <span className="font-normal text-slate-400">(auto-suggested — edit if needed)</span></label>
                      <input
                        type="text"
                        value={clientSubmitForm.title}
                        onChange={(e) => {
                          setClientTitleEdited(true);
                          setClientSubmitForm(prev => ({ ...prev, title: e.target.value }));
                        }}
                        placeholder="Suggested from your request text"
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
                        {templates.filter(t => !RETIRED_TEMPLATE_IDS.includes(t.id)).map(t => <option key={t.id} value={t.id}>{TEMPLATE_DISPLAY_LABELS[t.id] || t.title}</option>)}
                      </select>
                      <p className="text-xs text-slate-400 mt-1">This determines the exact structured questions you'll be asked next.</p>
                      {templateLoadError && (
                        <p className="text-sm text-red-600 mt-1.5">{templateLoadError}</p>
                      )}
                    </div>
                  </div>
                )}
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
                  {clientSubmitting ? 'Submitting...' : getRequestPrimaryActionLabel(clientSubmitForm.templateId, 'Submit Request')}
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
                <h2 className="text-xl font-bold text-navy">Log Request</h2>
                <p className="text-xs text-slate-400 mt-0.5">Capture a request the client communicated outside the platform.</p>
              </div>
              <button onClick={() => setShowLogModal(false)} className="text-slate-400 hover:text-navy">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleLogRequirement} className="p-6 space-y-5">
              {logError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{logError}</div>
              )}

              <RecordedByPicker />

              {/* PRIMARY SURFACE — a normal WhatsApp request needs only these */}
              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Request</label>
                <textarea
                  value={logForm.contextNote}
                  onChange={(e) => {
                    const value = e.target.value;
                    setLogForm(prev => ({
                      ...prev,
                      contextNote: value,
                      // Auto-suggested title tracks the ask until the user
                      // takes it over in More Details.
                      title: logTitleEdited ? prev.title : suggestTitleFromAsk(value),
                    }));
                  }}
                  rows={4}
                  autoFocus
                  placeholder="Describe the request in the client's own practical terms."
                  className="w-full bg-white border border-slate-300 rounded-lg p-3 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Related Delivery Item <span className="font-normal text-slate-400">(optional)</span></label>
                <select
                  value={logForm.linkedTrackerItemId}
                  onChange={(e) => setLogForm(prev => ({ ...prev, linkedTrackerItemId: e.target.value }))}
                  disabled={loadingCreateData}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold disabled:bg-slate-50"
                >
                  <option value="">No linked delivery item</option>
                  {trackerItemsForLinking.map(t => <option key={t.id} value={t.id}>{t.title} ({t.phase})</option>)}
                </select>
                {logForm.linkedTrackerItemId && (
                  <p className="text-xs text-slate-400 mt-1">
                    Entity derives from this delivery item{(() => {
                      const li = trackerItemsForLinking.find(t => t.id === logForm.linkedTrackerItemId);
                      return li?.entity ? `: ${li.entity}` : '';
                    })()}.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Urgency</label>
                <select
                  value={logForm.clientReportedUrgency}
                  onChange={(e) => setLogForm(prev => ({ ...prev, clientReportedUrgency: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                >
                  {INPUT_URGENCY.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              {/* MORE DETAILS — provenance fields deferred, never removed */}
              <div className="rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowLogMoreDetails(v => !v)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-bold text-navy hover:bg-slate-50 rounded-lg"
                >
                  More Details
                  <ChevronRight className={cx('w-4 h-4 text-slate-400 transition-transform', showLogMoreDetails && 'rotate-90')} />
                </button>
                {showLogMoreDetails && (
                  <div className="border-t border-slate-100 p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-navy mb-1.5">Title <span className="font-normal text-slate-400">(auto-suggested — edit if needed)</span></label>
                      <input
                        type="text"
                        value={logForm.title}
                        onChange={(e) => {
                          setLogTitleEdited(true);
                          setLogForm(prev => ({ ...prev, title: e.target.value }));
                        }}
                        placeholder="Suggested from the request text"
                        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                      />
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
                        {templates.filter(t => !RETIRED_TEMPLATE_IDS.includes(t.id)).map(t => <option key={t.id} value={t.id}>{TEMPLATE_DISPLAY_LABELS[t.id] || t.title}</option>)}
                      </select>
                      {templateLoadError && (
                        <p className="text-sm text-red-600 mt-1.5">{templateLoadError}</p>
                      )}
                    </div>

                    {!logForm.linkedTrackerItemId && (
                      <div>
                        <label className="block text-sm font-bold text-navy mb-1.5">Entity</label>
                        <select
                          value={logForm.entity}
                          onChange={(e) => setLogForm(prev => ({ ...prev, entity: e.target.value }))}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                        >
                          {PROGRAMME_ENTITIES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-bold text-navy mb-1.5">Requester <span className="font-normal text-slate-400">(optional — who asked for this?)</span></label>
                      <select
                        value={logForm.sourcePersonUserId}
                        onChange={(e) => setLogForm(prev => ({ ...prev, sourcePersonUserId: e.target.value }))}
                        disabled={loadingCreateData}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold disabled:bg-slate-50"
                      >
                        <option value="">Unspecified</option>
                        <optgroup label="Team / client people">
                          {updateAuthors.filter(a => a.is_active).map(a => (
                            <option key={a.id} value={`author:${a.id}`}>{a.display_name}</option>
                          ))}
                        </optgroup>
                        {contributors.length > 0 && (
                          <optgroup label="Client sign-in accounts">
                            {contributors.map(c => (
                              <option key={c.user_id} value={`contrib:${c.user_id}`}>{c.display_name || 'Unnamed contributor'}{c.entity_scope ? ` (${c.entity_scope})` : ''}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <p className="text-xs text-slate-400 mt-1">
                        {SECURE_SIGN_IN_ENABLED
                          ? 'A client sign-in account links the requester formally; a team/client name is recorded in the request context.'
                          : 'The requester’s name is recorded in the request context.'}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-navy mb-1.5">Source <span className="font-normal text-slate-400">(how did this reach Embark?)</span></label>
                      <select
                        value={logForm.requirementSource}
                        onChange={(e) => setLogForm(prev => ({ ...prev, requirementSource: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                      >
                        {['WhatsApp', 'Email', 'Meeting', 'Phone Call', 'Other'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-navy mb-1.5">When does the client need this? <span className="font-normal text-slate-400">(optional)</span></label>
                      <input
                        type="date"
                        value={logForm.dateNeeded}
                        onChange={(e) => setLogForm(prev => ({ ...prev, dateNeeded: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                      />
                      <p className="text-xs text-slate-400 mt-1">The client's preferred timing — recorded as context, not a confirmed delivery date.</p>
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
                  </div>
                )}
              </div>

              {GUIDED_REVIEW_CONFIGS[logForm.templateId] && (
                <p className="text-xs text-slate-400">This is a guided review — after logging, you can capture the client's feedback page by page / slide by slide.</p>
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
                  {logging ? 'Logging...' : getRequestPrimaryActionLabel(logForm.templateId, 'Log Request')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
