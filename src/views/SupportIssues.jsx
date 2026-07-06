import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collaborationService } from '../services/collaborationService';
import { ShieldCheck, MessageSquare, AlertCircle, CheckCircle, Clock, ChevronRight } from 'lucide-react';
import { cx } from '../utils/cx';
import { isMoreThanTwoBusinessDaysOld } from '../utils/businessDays';

export default function SupportIssues() {
  const { profile, isAdmin } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadTickets();
  }, [profile]);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const data = await collaborationService.getTickets().catch(() => []);
      setTickets(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (statusUpdate) => {
    setActionLoading(true);
    try {
      await collaborationService.updateTicket(selectedTicket.id, statusUpdate).catch(console.warn);
      setSelectedTicket(prev => ({ ...prev, ...statusUpdate }));
      await loadTickets();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const isStale = (ticket) => {
    if (['Closed'].includes(ticket.status)) return false;
    return isMoreThanTwoBusinessDaysOld(ticket.updated_at);
  };

  const isEmbarkDelay = (ticket) => {
    if (!isStale(ticket)) return false;
    if (['Waiting on Client', 'Awaiting Client Confirmation', 'Waiting on Third Party', 'Resolved'].includes(ticket.status)) return false;
    return true;
  };

  if (loading && !selectedTicket) {
    return <div className="p-8 text-slate-400">Loading support issues...</div>;
  }

  if (selectedTicket) {
    return (
      <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto">
        <button 
          onClick={() => setSelectedTicket(null)}
          className="text-amber-500 hover:text-amber-400 text-sm font-medium mb-6 flex items-center gap-2"
        >
          <ChevronRight className="w-4 h-4 rotate-180" /> Back to Tickets
        </button>

        <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden mb-8">
          <div className="p-6 border-b border-slate-700 bg-slate-800/50">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">{selectedTicket.title}</h2>
                <div className="flex items-center gap-3 text-sm text-slate-400">
                  <span className="bg-slate-700 px-2.5 py-1 rounded-full text-slate-200">{selectedTicket.category}</span>
                  <span className="bg-slate-700 px-2.5 py-1 rounded-full text-slate-200">{selectedTicket.entity}</span>
                  <span className={cx(
                    "px-2.5 py-1 rounded-full font-medium border",
                    selectedTicket.status === 'Resolved' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                    selectedTicket.status === 'Closed' ? "bg-slate-700 text-slate-300 border-slate-600" :
                    "bg-amber-500/10 text-amber-500 border-amber-500/20"
                  )}>
                    {selectedTicket.status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wider">Description</h3>
              <div className="bg-slate-900 rounded-lg p-4 text-slate-200 border border-slate-700">
                {selectedTicket.description}
              </div>
            </div>

            {selectedTicket.investigation_summary && (
              <div>
                <h3 className="text-sm font-semibold text-emerald-400 mb-2 uppercase tracking-wider">Embark Digitals Response</h3>
                <div className="bg-emerald-900/10 rounded-lg p-4 text-slate-200 border border-emerald-500/20">
                  {selectedTicket.investigation_summary}
                </div>
              </div>
            )}
          </div>

          <div className="p-6 bg-slate-800/80 border-t border-slate-700 flex items-center justify-end gap-4">
            {isAdmin && selectedTicket.status !== 'Resolved' && selectedTicket.status !== 'Closed' && (
              <button
                onClick={() => handleAction({ status: 'Resolved', resolution_proposed_at: new Date().toISOString() })}
                disabled={actionLoading}
                className="px-6 py-2 text-sm font-bold text-slate-900 bg-emerald-500 hover:bg-emerald-400 rounded-lg shadow-lg shadow-emerald-500/20 transition-all"
              >
                Mark as Resolved (Embark)
              </button>
            )}

            {!isAdmin && selectedTicket.status === 'Resolved' && (
              <>
                <button
                  onClick={() => handleAction({ status: 'Investigating', client_confirmed_at: null })}
                  disabled={actionLoading}
                  className="px-6 py-2 text-sm font-bold text-slate-200 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  Still Not Resolved
                </button>
                <button
                  onClick={() => handleAction({ status: 'Closed', client_confirmed_at: new Date().toISOString() })}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-slate-900 bg-emerald-500 hover:bg-emerald-400 rounded-lg shadow-lg shadow-emerald-500/20 transition-all"
                >
                  <CheckCircle className="w-4 h-4" /> Confirm Resolved
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white tracking-tight mb-2">Support & Issues</h1>
        <p className="text-slate-400">Track and confirm resolution of project-blocking issues.</p>
      </div>

      <div className="grid gap-4">
        {tickets.length === 0 ? (
          <div className="text-center p-12 bg-slate-800/50 rounded-xl border border-slate-700 border-dashed">
            <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-300">No support tickets</h3>
            <p className="text-slate-500 mt-2">There are currently no active support issues.</p>
          </div>
        ) : (
          tickets.map(ticket => (
            <div 
              key={ticket.id}
              onClick={() => setSelectedTicket(ticket)}
              className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-amber-500/50 cursor-pointer transition-colors group flex items-center justify-between"
            >
              <div className="flex items-start gap-4">
                <div className={cx(
                  "p-3 rounded-lg flex-shrink-0 mt-1",
                  ticket.status === 'Resolved' ? "bg-emerald-500/20 text-emerald-400" :
                  ticket.status === 'Closed' ? "bg-slate-700 text-slate-400" :
                  "bg-amber-500/20 text-amber-500"
                )}>
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-amber-500 transition-colors flex items-center gap-2">
                    {ticket.title}
                    {isAdmin && isStale(ticket) && (
                      <span className={cx(
                        "text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border",
                        isEmbarkDelay(ticket) 
                          ? "bg-red-500/20 text-red-400 border-red-500/20" 
                          : "bg-amber-500/20 text-amber-500 border-amber-500/20"
                      )}>
                        {isEmbarkDelay(ticket) ? 'Embark Overdue' : 'Follow-up Required'}
                      </span>
                    )}
                  </h3>
                  <div className="flex items-center gap-3 mt-2 text-sm text-slate-400">
                    <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {ticket.status}</span>
                    <span>•</span>
                    <span>{ticket.category}</span>
                    {ticket.acknowledged_at && (
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
