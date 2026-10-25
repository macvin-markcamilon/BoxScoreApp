"use client";

import React, { useEffect } from "react";
import { AuthScreens } from "@/components/auth/AuthScreens";
import { BoxScoreLogo } from "@/components/brand/BoxScoreLogo";
import { AppDashboardBlank } from "@/components/dashboard/AppDashboardBlank";
import { LeagueDashboard } from "@/components/dashboard/LeagueDashboard";
import { UserProfileWorkspace } from "@/components/profile/UserProfileWorkspace";
import { TopNavigation } from "@/components/layout/TopNavigation";
import { supabase } from "@/lib/supabase-client";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";

export default function HomePage() {
  const {
    isAuthLoading,
    userProfile,
    activeSection,
    initializeSession,
    refreshProfileFromSession,
  } = useBoxScoreStore();

  useEffect(() => {
    initializeSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        useBoxScoreStore.setState({ userProfile: null, isAuthLoading: false });
      } else if (session?.user && (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED")) {
        refreshProfileFromSession();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [initializeSession, refreshProfileFromSession]);

  if (isAuthLoading) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center bg-slate-50 gap-4"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          backgroundColor: "#f8fafc",
        }}
      >
        <BoxScoreLogo size="lg" />
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">
          Connecting to Supabase...
        </p>
      </div>
    );
  }

  // If unauthenticated, show Login / Create Account screen
  if (!userProfile) {
    return <AuthScreens initialMode="login" />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <TopNavigation />

      <main className="flex-1">
        {activeSection === "dashboard" ? (
          <AppDashboardBlank />
        ) : activeSection === "profile" ? (
          <UserProfileWorkspace />
        ) : (
          <LeagueDashboard />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 px-4 sm:px-6 text-xs text-slate-500">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BoxScoreLogo size="sm" />
            <span className="font-semibold text-slate-600">
              Basketball League Management Platform • Connected to Supabase
            </span>
          </div>
          <div className="font-bold uppercase tracking-wider text-slate-500">
            Signed in as {userProfile.firstName} {userProfile.lastName} (
            {userProfile.email})
          </div>
        </div>
      </footer>
    </div>
  );
}
