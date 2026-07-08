import React, { useState } from 'react';
import { collaborationService } from '../services/collaborationService';
import { Mail, CheckCircle } from 'lucide-react';
import { cx } from '../utils/cx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await collaborationService.sendMagicLink(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send magic link. Please check your email and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-slate-200">
        <div className="bg-slate-800 p-8 rounded-xl shadow-xl max-w-md w-full border border-slate-700 text-center">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-6" />
          <h2 className="text-2xl font-semibold text-white mb-4">Check Your Email</h2>
          <p className="text-slate-400 mb-6">
            We've sent a magic link to <span className="font-semibold text-slate-300">{email}</span>. Click the link in the email to sign in securely.
          </p>
          <button 
            onClick={() => setSent(false)}
            className="text-amber-500 hover:text-amber-400 text-sm font-medium"
          >
            Try a different email address
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900 text-slate-200 px-4">
      <div className="bg-slate-800 p-8 rounded-xl shadow-xl max-w-md w-full border border-slate-700">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Chasm Bridge & Filament</h1>
          <h2 className="text-lg text-amber-500 font-medium">Secure Command Center Access</h2>
          <p className="text-sm text-slate-400 mt-3">
            Enter your approved email to receive a secure sign-in link. Your available workspace and controls are determined by your approved access profile.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-slate-500" />
              </div>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email to receive a secure link"
                required
                disabled={loading}
                className="block w-full pl-10 pr-3 py-3 border border-slate-600 rounded-lg bg-slate-900/50 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email}
            className={cx(
              "w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-slate-900",
              loading || !email 
                ? "bg-amber-600/50 text-slate-800 cursor-not-allowed" 
                : "bg-amber-500 hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 focus:ring-offset-slate-900 transition-colors"
            )}
          >
            {loading ? "Sending..." : "Send Magic Link"}
          </button>
        </form>
        
        <p className="mt-6 text-center text-xs text-slate-500">
          This system uses passwordless authentication. A secure, one-time link will be sent to your inbox.
        </p>
      </div>
    </div>
  );
}
