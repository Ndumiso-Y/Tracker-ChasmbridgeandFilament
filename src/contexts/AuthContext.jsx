import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { collaborationService } from '../services/collaborationService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const currentSession = await collaborationService.getSession();
        if (!mounted) return;
        
        setSession(currentSession);
        
        if (currentSession?.user) {
          const userProfile = await collaborationService.getUserProfile(currentSession.user.id);
          if (mounted) setProfile(userProfile);
        } else {
          if (mounted) setProfile(null);
        }
      } catch (err) {
        console.error("Auth error:", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        const userProfile = await collaborationService.getUserProfile(newSession.user.id);
        setProfile(userProfile);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const value = {
    session,
    profile,
    isLoading,
    isAdmin: profile?.role === 'admin' && profile?.is_active,
    isClient: profile?.role === 'client_contributor' && profile?.is_active,
    hasAccess: !!profile && profile.is_active,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
