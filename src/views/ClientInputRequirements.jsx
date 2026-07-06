import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collaborationService } from '../services/collaborationService';
import { FileStack, Clock, CheckCircle, AlertCircle, ChevronRight, MessageSquare, History, Save, Send } from 'lucide-react';
import { cx } from '../utils/cx';

export default function ClientInputRequirements() {
  const { profile, isAdmin } = useAuth();
  const [requests, setRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [responses, setResponses] = useState({}); // mapped by template_section_id
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRequests();
  }, [profile]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      // In a real app, collaborationService.getRequests() fetches from Supabase.
      // For now, we simulate fetching.
      const data = await collaborationService.getRequests().catch(() => []);
      setRequests(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRequest = async (req) => {
    setSelectedRequest(req);
    setLoading(true);
    try {
      const templateSections = await collaborationService.getTemplateSections(req.template_id).catch(() => []);
      setSections(templateSections);
      
      const resps = await collaborationService.getResponses(req.id).catch(() => []);
      const respMap = {};
      resps.forEach(r => {
        respMap[r.template_section_id] = r.content;
      });
      setResponses(respMap);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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

  if (loading && !selectedRequest) {
    return <div className="p-8 text-slate-400">Loading requests...</div>;
  }

  if (selectedRequest) {
    const isReadOnly = ['Ready for Embark Review', 'Requirements Confirmed', 'In Production', 'Approved', 'Delivered'].includes(selectedRequest.status) && !isAdmin;

    return (
      <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto">
        <button 
          onClick={() => setSelectedRequest(null)}
          className="text-amber-500 hover:text-amber-400 text-sm font-medium mb-6 flex items-center gap-2"
        >
          <ChevronRight className="w-4 h-4 rotate-180" /> Back to Requests
        </button>

        <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden mb-8">
          <div className="p-6 border-b border-slate-700 bg-slate-800/50">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">{selectedRequest.title}</h2>
                <div className="flex items-center gap-3 text-sm text-slate-400">
                  <span className="bg-slate-700 px-2.5 py-1 rounded-full text-slate-200">
                    {selectedRequest.client_input_templates?.title || 'Template'}
                  </span>
                  <span className="bg-slate-700 px-2.5 py-1 rounded-full text-slate-200">
                    {selectedRequest.entity}
                  </span>
                  <span className={cx(
                    "px-2.5 py-1 rounded-full font-medium border",
                    selectedRequest.status.includes('Required') || selectedRequest.status.includes('Progress') ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                    selectedRequest.status === 'Ready for Embark Review' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                    selectedRequest.status === 'Requirements Confirmed' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                    "bg-slate-700 text-slate-300 border-slate-600"
                  )}>
                    {selectedRequest.status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-8">
            {sections.length === 0 ? (
              <p className="text-slate-400">No template sections found for this request.</p>
            ) : (
              sections.map(section => (
                <div key={section.id} className="space-y-3">
                  <label className="block">
                    <span className="text-lg font-semibold text-slate-200">{section.section_label}</span>
                    {section.is_required && <span className="text-red-400 ml-2">*</span>}
                    {section.help_text && (
                      <p className="text-sm text-slate-400 mt-1">{section.help_text}</p>
                    )}
                  </label>
                  
                  {section.section_type === 'Long Text' || section.section_type === 'Exact Copy' ? (
                    <textarea
                      value={responses[section.id] || ''}
                      onChange={(e) => handleResponseChange(section.id, e.target.value)}
                      disabled={isReadOnly}
                      rows={5}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:opacity-50"
                      placeholder="Type your response here..."
                    />
                  ) : section.section_type === 'Short Text' ? (
                    <input
                      type="text"
                      value={responses[section.id] || ''}
                      onChange={(e) => handleResponseChange(section.id, e.target.value)}
                      disabled={isReadOnly}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:opacity-50"
                    />
                  ) : section.section_type === 'Select' || section.section_type === 'Yes / No' ? (
                    <select
                      value={responses[section.id] || ''}
                      onChange={(e) => handleResponseChange(section.id, e.target.value)}
                      disabled={isReadOnly}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:opacity-50"
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
                          <label key={opt} className="flex items-center gap-3 text-slate-200">
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
                              className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500"
                            />
                            {opt}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-400 text-sm">
                      [ {section.section_type} rendering not fully implemented in V4A demo ]
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {!isReadOnly && sections.length > 0 && (
            <div className="p-6 bg-slate-800/80 border-t border-slate-700 flex items-center justify-end gap-4">
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" /> Save Draft
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-lg shadow-amber-500/20 transition-all"
              >
                <Send className="w-4 h-4" /> Submit to Embark
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white tracking-tight mb-2">Client Input & Requirements</h1>
        <p className="text-slate-400">Provide exact copy, structure, and approvals required for delivery.</p>
      </div>

      <div className="grid gap-4">
        {requests.length === 0 ? (
          <div className="text-center p-12 bg-slate-800/50 rounded-xl border border-slate-700 border-dashed">
            <FileStack className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-300">No requests assigned</h3>
            <p className="text-slate-500 mt-2">You currently have no pending input requests.</p>
          </div>
        ) : (
          requests.map(req => (
            <div 
              key={req.id}
              onClick={() => handleSelectRequest(req)}
              className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-amber-500/50 cursor-pointer transition-colors group flex items-center justify-between"
            >
              <div className="flex items-start gap-4">
                <div className={cx(
                  "p-3 rounded-lg flex-shrink-0 mt-1",
                  req.status.includes('Required') || req.status.includes('Changes') ? "bg-amber-500/20 text-amber-500" :
                  req.status.includes('Review') ? "bg-blue-500/20 text-blue-400" :
                  "bg-emerald-500/20 text-emerald-400"
                )}>
                  <FileStack className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-amber-500 transition-colors">{req.title}</h3>
                  <div className="flex items-center gap-3 mt-2 text-sm text-slate-400">
                    <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {req.status}</span>
                    <span>•</span>
                    <span>{req.entity}</span>
                    {req.review_acknowledged_at && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Acknowledged</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-amber-500" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
