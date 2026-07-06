import React, { useEffect, useState } from 'react';
import { ShieldCheck, FileStack, AlertCircle, Clock } from 'lucide-react';
import { collaborationService } from '../services/collaborationService';
import { useAuth } from '../contexts/AuthContext';

export function AssurancePanel() {
  const { profile, isAdmin } = useAuth();
  const [stats, setStats] = useState({
    staleTickets: 0,
    awaitingConfirmation: 0,
    revisions: 0
  });

  useEffect(() => {
    // In a real app, we would fetch these counts from Supabase.
    // We are simulating the counts for the V4A demo.
    setStats({
      staleTickets: isAdmin ? 2 : 0,
      awaitingConfirmation: 3,
      revisions: 1
    });
  }, [profile, isAdmin]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <div className="bg-slate-800/80 rounded-lg p-4 border border-slate-700 flex items-center gap-4">
        <div className="p-3 bg-red-500/10 text-red-400 rounded-lg">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-400">Tickets Needing Follow-Up</p>
          <p className="text-2xl font-bold text-white">{stats.staleTickets}</p>
        </div>
      </div>
      
      <div className="bg-slate-800/80 rounded-lg p-4 border border-slate-700 flex items-center gap-4">
        <div className="p-3 bg-amber-500/10 text-amber-500 rounded-lg">
          <FileStack className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-400">Input Awaiting Confirmation</p>
          <p className="text-2xl font-bold text-white">{stats.awaitingConfirmation}</p>
        </div>
      </div>

      <div className="bg-slate-800/80 rounded-lg p-4 border border-slate-700 flex items-center gap-4">
        <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg">
          <Clock className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-400">Revisions This Week</p>
          <p className="text-2xl font-bold text-white">{stats.revisions}</p>
        </div>
      </div>
    </div>
  );
}
