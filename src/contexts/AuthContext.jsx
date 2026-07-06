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

    if (!supabase) {
      return () => {
        mounted = false;
      };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      try {
        if (newSession?.user) {
          const userProfile = await collaborationService.getUserProfile(newSession.user.id);
          if (mounted) setProfile(userProfile);
        } else {
          if (mounted) setProfile(null);
        }
      } catch (err) {
        console.error("Auth error:", err);
        if (mounted) setProfile(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const hasProfile = !!profile;
  const isProfileActive = hasProfile && profile.is_active;

  const value = {
    session,
    profile,
    isLoading,
    hasProfile,
    isProfileActive,
    isAdmin: isProfileActive && profile.role === 'admin',
    isClient: isProfileActive && profile.role === 'client_contributor',
    hasAccess: isProfileActive,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
