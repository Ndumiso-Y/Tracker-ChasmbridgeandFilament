import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collaborationService } from '../services/collaborationService';
import { Rocket, MessageSquare, ChevronRight, AlertTriangle, ShieldCheck } from 'lucide-react';
import { cx } from '../utils/cx';

export default function WeeklyDeliveryReview() {
  const { profile, isAdmin } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [selectedReview, setSelectedReview] = useState(null);
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadReviews();
  }, [profile]);

  const loadReviews = async () => {
    setLoading(true);
    try {
      const data = await collaborationService.getReviews().catch(() => []);
      setReviews(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectReview = async (rev) => {
    setSelectedReview(rev);
    setLoading(true);
    try {
      const fItems = await collaborationService.getReviewFeedbackItems(rev.id).catch(() => []);
      setFeedbackItems(fItems);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDisposition = async (itemId, newDisposition) => {
    setActionLoading(true);
    try {
      await collaborationService.updateFeedbackItemDisposition(itemId, { disposition: newDisposition }).catch(console.warn);
      setFeedbackItems(prev => prev.map(fi => fi.id === itemId ? { ...fi, disposition: newDisposition } : fi));
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !selectedReview) {
    return <div className="p-8 text-slate-400">Loading weekly reviews...</div>;
  }

  if (selectedReview) {
    return (
      <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto">
        <button 
          onClick={() => setSelectedReview(null)}
          className="text-amber-500 hover:text-amber-400 text-sm font-medium mb-6 flex items-center gap-2"
        >
          <ChevronRight className="w-4 h-4 rotate-180" /> Back to Reviews
        </button>

        <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden mb-8">
          <div className="p-6 border-b border-slate-700 bg-slate-800/50">
            <h2 className="text-2xl font-bold text-white mb-2">Weekly Delivery Review</h2>
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <span className="bg-slate-700 px-2.5 py-1 rounded-full text-slate-200">{selectedReview.entity}</span>
              <span>•</span>
              <span>{selectedReview.review_period_start} to {selectedReview.review_period_end}</span>
            </div>
          </div>

          <div className="p-6 grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Overall Delivery</h3>
              <p className={cx(
                "text-xl font-bold",
                selectedReview.overall_delivery === 'Excellent' ? "text-emerald-400" :
                selectedReview.overall_delivery === 'Poor' ? "text-red-400" : "text-amber-400"
              )}>{selectedReview.overall_delivery}</p>
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Requirement Understanding</h3>
              <p className="text-slate-200">{selectedReview.requirement_understanding}</p>
            </div>
          </div>

          <div className="p-6 border-t border-slate-700 bg-slate-900/50">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Normalised Feedback Items</h3>
            {feedbackItems.length === 0 ? (
              <p className="text-slate-500">No normalised feedback items for this review.</p>
            ) : (
              <div className="space-y-4">
                {feedbackItems.map(item => (
                  <div key={item.id} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className={cx(
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                          item.sentiment === 'Positive' ? "bg-emerald-500/20 text-emerald-400" :
                          item.sentiment === 'Critical' ? "bg-red-500/20 text-red-400" :
                          item.sentiment === 'Negative' ? "bg-amber-500/20 text-amber-500" : "bg-slate-700 text-slate-300"
                        )}>{item.sentiment}</span>
                        <p className="mt-3 text-slate-200 font-medium">{item.feedback_text}</p>
                        <p className="mt-1 text-xs text-slate-400">Category: {item.feedback_category}</p>
                      </div>
                    </div>
                    
                    {isAdmin && (item.sentiment === 'Negative' || item.sentiment === 'Critical') && (
                      <div className="mt-4 pt-4 border-t border-slate-700 flex flex-col gap-2">
                        <label className="text-xs font-bold text-amber-500 uppercase tracking-wider">Admin Disposition Required</label>
                        <select
                          value={item.disposition || ''}
                          onChange={(e) => handleDisposition(item.id, e.target.value)}
                          disabled={actionLoading}
                          className="bg-slate-900 border border-slate-700 text-slate-200 rounded p-2 text-sm focus:ring-amber-500 focus:border-amber-500 w-full md:w-1/2"
                        >
                          <option value="" disabled>Select disposition...</option>
                          <option value="Acknowledged — No Separate Action">Acknowledged — No Separate Action</option>
                          <option value="Follow-Up Task Required">Follow-Up Task Required</option>
                          <option value="Support Ticket Required">Support Ticket Required</option>
                          <option value="Clarification Required">Clarification Required</option>
                          <option value="Process Improvement">Process Improvement</option>
                          <option value="Monitor Next Week">Monitor Next Week</option>
                        </select>
                      </div>
                    )}
                    {!isAdmin && item.disposition && (
                      <div className="mt-4 pt-4 border-t border-slate-700 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm text-slate-400">Embark Action: <span className="text-slate-300 font-medium">{item.disposition}</span></span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white tracking-tight mb-2">Weekly Delivery Review</h1>
        <p className="text-slate-400">Evaluate delivery speed, communication, and requirement understanding.</p>
      </div>

      <div className="grid gap-4">
        {reviews.length === 0 ? (
          <div className="text-center p-12 bg-slate-800/50 rounded-xl border border-slate-700 border-dashed">
            <Rocket className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-300">No reviews submitted</h3>
          </div>
        ) : (
          reviews.map(rev => (
            <div 
              key={rev.id}
              onClick={() => handleSelectReview(rev)}
              className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-amber-500/50 cursor-pointer transition-colors group flex items-center justify-between"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg flex-shrink-0 mt-1 bg-blue-500/20 text-blue-400">
                  <Rocket className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-amber-500 transition-colors">
                    Week of {rev.review_period_start}
                  </h3>
                  <div className="flex items-center gap-3 mt-2 text-sm text-slate-400">
                    <span>{rev.entity}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">Overall: <span className="font-bold text-slate-200">{rev.overall_delivery}</span></span>
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
