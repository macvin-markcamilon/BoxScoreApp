"use client";

import React, { useEffect, useState } from "react";
import { AuthScreens } from "@/components/auth/AuthScreens";
import { BoxScoreLogo } from "@/components/brand/BoxScoreLogo";
import { AppDashboardBlank } from "@/components/dashboard/AppDashboardBlank";
import { LeagueDashboard } from "@/components/dashboard/LeagueDashboard";
import { UserProfileWorkspace } from "@/components/profile/UserProfileWorkspace";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopHeaderBar } from "@/components/layout/TopHeaderBar";
import { supabase } from "@/lib/supabase-client";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";

export default function HomePage() {
  const {
    isAuthLoading,
    userProfile,
    activeSection,
    initializeSession,
    refreshProfileFromSession,
    setupRealtimeSubscriptions,
  } = useBoxScoreStore();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    initializeSession();

    // Setup Supabase Realtime & broadcast subscription for instantaneous cross-user role invitations
    const cleanupRealtime = setupRealtimeSubscriptions();

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
      cleanupRealtime();
      subscription.unsubscribe();
    };
  }, [initializeSession, refreshProfileFromSession, setupRealtimeSubscriptions]);

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
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* 1. Dedicated Left-Hand Navigation Sidebar */}
      <AppSidebar
        isMobileOpen={isMobileMenuOpen}
        setIsMobileOpen={setIsMobileMenuOpen}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
      />

      {/* 2. Main Content Layout (Responsive Margin that adjusts when Sidebar is compressed/expanded) */}
      <div
        className={`flex flex-1 flex-col transition-all duration-300 min-w-0 ${
          isSidebarCollapsed ? "lg:pl-20" : "lg:pl-72"
        }`}
      >
        {/* Dynamic Top Header Bar with Context & Back Buttons */}
        <TopHeaderBar onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          {activeSection === "dashboard" ? (
            <AppDashboardBlank />
          ) : activeSection === "profile" ? (
            <UserProfileWorkspace />
          ) : (
            <LeagueDashboard />
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white py-4 px-4 sm:px-6 text-xs text-slate-500">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
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
    </div>
  );
}
