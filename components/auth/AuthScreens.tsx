"use client";

import React, { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MapPin,
  Ruler,
  Scale,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { BoxScoreLogo } from "@/components/brand/BoxScoreLogo";
import { supabase } from "@/lib/supabase-client";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";
import { PlayerPosition, UserAccountRole } from "@/types/boxscore";

const ALL_POSITIONS: {
  code: PlayerPosition;
  label: string;
  desc: string;
}[] = [
  { code: "PG", label: "Point Guard", desc: "Floor General / Playmaker" },
  { code: "SG", label: "Shooting Guard", desc: "Perimeter Scorer" },
  { code: "SF", label: "Small Forward", desc: "Two-Way Wing" },
  { code: "PF", label: "Power Forward", desc: "Stretch / Interior Forward" },
  { code: "C", label: "Center", desc: "Rim Protector / Post Anchor" },
];

const ALL_ROLES: {
  role: UserAccountRole;
  desc: string;
}[] = [
  { role: "Player", desc: "Compete on team rosters & track box scores" },
  { role: "Coach", desc: "Manage lineups, rotations & tactical sets" },
  { role: "Referee", desc: "Officiate league games & enforce rulebooks" },
  { role: "Manager", desc: "Organize franchises, logistics & registrations" },
];

interface AuthScreensProps {
  initialMode?: "login" | "register";
}

export function AuthScreens({ initialMode = "login" }: AuthScreensProps) {
  const router = useRouter();
  const { refreshProfileFromSession } = useBoxScoreStore();
  const [mode, setMode] = useState<"login" | "register">(initialMode);

  // Shared credentials
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Create Account (Register) fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [address, setAddress] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [selectedPositions, setSelectedPositions] = useState<PlayerPosition[]>([
    "PG",
  ]);
  const [selectedRoles, setSelectedRoles] = useState<UserAccountRole[]>([
    "Player",
  ]);

  // Submission & validation states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const addressHintId = useId();
  const passwordHintId = useId();
  const toggleWarningId = useId();

  const togglePosition = (pos: PlayerPosition) => {
    setErrorMsg(null);
    setSelectedPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  const toggleRole = (role: UserAccountRole) => {
    setErrorMsg(null);
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessNotice(null);
    setIsSubmitting(true);

    // Defensive precaution: If localStorage is nearing quota or has large vault items, clean them before setting auth token
    if (typeof window !== "undefined") {
      try {
        const rawVault = window.localStorage.getItem("boxscore_image_vault_v1");
        if (rawVault && rawVault.length > 200_000) {
          window.localStorage.removeItem("boxscore_image_vault_v1");
        }
      } catch {
        // Ignore
      }
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (
          error.message?.includes("504") ||
          error.status === 504 ||
          (error as unknown as { statusCode?: number }).statusCode === 504
        ) {
          setErrorMsg(
            "Supabase cloud database is warming up or experiencing high latency (HTTP 504 Gateway Timeout). Please wait a few seconds and try signing in again."
          );
        } else {
          setErrorMsg(error.message);
        }
        setIsSubmitting(false);
        return;
      }

      if (data.session) {
        await refreshProfileFromSession();
        router.push("/");
        // If on the home page root, also trigger a router refresh or window navigation so the dashboard mounts
        if (typeof window !== "undefined" && (window.location.pathname === "/" || window.location.pathname === "")) {
          router.refresh();
        }
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Unable to sign in right now."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessNotice(null);

    if (selectedPositions.length === 0) {
      setErrorMsg(
        "Please select at least one basketball position (PG, SG, SF, PF, or C)."
      );
      return;
    }

    if (selectedRoles.length === 0) {
      setErrorMsg(
        "Please select at least one role (Player, Coach, Referee, or Manager)."
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const profilePayload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        birthday,
        address: address.trim(),
        height_cm: heightCm.trim(),
        weight_kg: weightKg.trim(),
        positions: selectedPositions,
        account_roles: selectedRoles,
      };

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: profilePayload,
        },
      });

      if (error) {
        if (
          error.message?.includes("504") ||
          error.status === 504 ||
          (error as unknown as { statusCode?: number }).statusCode === 504
        ) {
          setErrorMsg(
            "Supabase cloud database is warming up or experiencing high latency (HTTP 504 Gateway Timeout). Please wait a few seconds and try signing in again."
          );
        } else {
          setErrorMsg(error.message);
        }
        setIsSubmitting(false);
        return;
      }

      // If `public.profiles` table exists in Supabase, upsert the structured profile row as well
      if (data.user) {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          email: email.trim(),
          first_name: profilePayload.first_name,
          last_name: profilePayload.last_name,
          birthday: profilePayload.birthday || null,
          address: profilePayload.address,
          height_cm: Number(profilePayload.height_cm) || null,
          weight_kg: Number(profilePayload.weight_kg) || null,
          positions: profilePayload.positions,
          account_roles: profilePayload.account_roles,
        });
      }

      if (data.session) {
        await refreshProfileFromSession();
        router.push("/");
        // If on the home page root, also trigger a router refresh or window navigation so the dashboard mounts
        if (typeof window !== "undefined" && (window.location.pathname === "/" || window.location.pathname === "")) {
          router.refresh();
        }
      } else {
        setSuccessNotice(
          "Account registered in Supabase! Please check your email inbox to confirm your address, or sign in directly once confirmed."
        );
        setMode("login");
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to register account."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Top Bar */}
      <header
        className="w-full py-3.5 px-4 sm:px-8 text-white shadow-sm"
        style={{ backgroundColor: "#0B2F5C" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="focus:outline-none">
            <BoxScoreLogo size="md" variant="dark-bg" showTagline />
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setErrorMsg(null);
              }}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                mode === "login"
                  ? "bg-white text-[#0B2F5C]"
                  : "text-slate-200 hover:bg-white/10"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setErrorMsg(null);
              }}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                mode === "register"
                  ? "bg-[#8B0D0E] text-white ring-1 ring-white/30"
                  : "text-slate-200 hover:bg-white/10"
              }`}
            >
              Create Account
            </button>
          </div>
        </div>
      </header>

      {/* Main Split-Screen Container */}
      <main className="mx-auto my-auto w-full max-w-6xl px-4 py-8 sm:px-8">
        <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl lg:grid-cols-12">
          {/* Left Brand Panel (#0B2F5C) */}
          <div
            className="lg:col-span-5 flex flex-col justify-between p-8 text-white"
            style={{ backgroundColor: "#0B2F5C" }}
          >
            <div className="space-y-6">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-300">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Connected to Supabase Auth
              </span>

              <div className="space-y-2">
                <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-none">
                  {mode === "login"
                    ? "Welcome Back to Box Score"
                    : "Create Your Official Basketball Profile"}
                </h1>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {mode === "login"
                    ? "Sign in with your Supabase account to access your App Dashboard, manage created leagues, follow community tournaments, and build team rosters."
                    : "Complete your athlete, coach, referee, or league manager profile. Your position, physical measurables, and court location preferences sync directly with Supabase."}
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <div className="rounded-xl bg-white/10 p-4 border border-white/15">
                  <div className="text-xs font-black uppercase tracking-wider text-amber-300">
                    Multi-Role & Multi-Position Athlete Identity
                  </div>
                  <p className="mt-1 text-xs text-slate-200 leading-relaxed">
                    Select all positions you play (PG, SG, SF, PF, C) and all
                    roles you hold across leagues (Player, Coach, Referee,
                    Manager).
                  </p>
                </div>

                <div className="rounded-xl bg-white/10 p-4 border border-white/15">
                  <div className="text-xs font-black uppercase tracking-wider text-rose-300">
                    Nearby Court Discovery Ready
                  </div>
                  <p className="mt-1 text-xs text-slate-200 leading-relaxed">
                    Your home address powers upcoming nearby court discovery,
                    local league matching, and tournament venue routing.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-white/15 pt-4 text-xs text-slate-300 flex items-center justify-between">
              <span>Supabase Instance: sbqnrxqgahfhbmlevtgf</span>
              <span className="font-bold text-emerald-300">● Live</span>
            </div>
          </div>

          {/* Right Form Panel */}
          <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 bg-white">
            {/* Mode Switcher */}
            <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setErrorMsg(null);
                }}
                className={`rounded-lg py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  mode === "login"
                    ? "bg-[#0B2F5C] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Sign In to Account
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setErrorMsg(null);
                }}
                className={`rounded-lg py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  mode === "register"
                    ? "bg-[#8B0D0E] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Create New Account
              </button>
            </div>

            {/* Dynamic Error / Success Announcements */}
            <div aria-live="polite">
              {errorMsg && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-[#8B0D0E]"
                >
                  <AlertCircle
                    className="h-4 w-4 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successNotice && (
                <div
                  role="status"
                  className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-900"
                >
                  <CheckCircle2
                    className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600"
                    aria-hidden="true"
                  />
                  <span>{successNotice}</span>
                </div>
              )}
            </div>

            {mode === "login" ? (
              <form
                method="POST"
                action="/login"
                onSubmit={handleLoginSubmit}
                className="space-y-5"
              >
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-black uppercase tracking-wider text-slate-800 mb-1.5"
                  >
                    Email Address *
                  </label>
                  <div className="relative">
                    <Mail
                      className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setErrorMsg(null);
                      }}
                      placeholder="you@example.com"
                      className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-4 py-2.5 text-base font-medium text-slate-900 focus:border-[#0B2F5C] focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-black uppercase tracking-wider text-slate-800"
                    >
                      Password *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-pressed={showPassword}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-describedby={toggleWarningId}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#0B2F5C] hover:underline"
                    >
                      {showPassword ? (
                        <>
                          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                          Hide
                        </>
                      ) : (
                        <>
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          Show
                        </>
                      )}
                    </button>
                    <span id={toggleWarningId} className="sr-only">
                      Warning: this will display your password on the screen.
                    </span>
                  </div>
                  <div className="relative">
                    <Lock
                      className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setErrorMsg(null);
                      }}
                      placeholder="Enter your password"
                      className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-4 py-2.5 text-base font-medium text-slate-900 focus:border-[#0B2F5C] focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full min-h-[48px] rounded-xl py-3 text-sm font-black uppercase tracking-wider text-white shadow-md hover:opacity-95 disabled:opacity-50 cursor-pointer transition-all"
                  style={{ backgroundColor: "#0B2F5C" }}
                >
                  {isSubmitting ? "Signing In..." : "Sign In to Box Score"}
                </button>

                <p className="text-center text-xs text-slate-600">
                  Don&apos;t have an account yet?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("register");
                      setErrorMsg(null);
                    }}
                    className="font-black uppercase text-[#8B0D0E] underline cursor-pointer"
                  >
                    Create Account
                  </button>
                </p>
              </form>
            ) : (
              /* CREATE ACCOUNT FORM */
              <form
                method="POST"
                action="/register"
                onSubmit={handleRegisterSubmit}
                className="space-y-5"
              >
                {/* 1. First and Last Name */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="reg-first-name"
                      className="block text-xs font-black uppercase tracking-wider text-slate-800 mb-1.5"
                    >
                      First Name *
                    </label>
                    <div className="relative">
                      <User
                        className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
                        aria-hidden="true"
                      />
                      <input
                        id="reg-first-name"
                        name="first_name"
                        type="text"
                        autoComplete="given-name"
                        required
                        value={firstName}
                        onChange={(e) => {
                          setFirstName(e.target.value);
                          setErrorMsg(null);
                        }}
                        placeholder="e.g. Kiefer"
                        className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-3 py-2 text-base font-medium text-slate-900 focus:border-[#0B2F5C] focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="reg-last-name"
                      className="block text-xs font-black uppercase tracking-wider text-slate-800 mb-1.5"
                    >
                      Last Name *
                    </label>
                    <div className="relative">
                      <User
                        className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
                        aria-hidden="true"
                      />
                      <input
                        id="reg-last-name"
                        name="last_name"
                        type="text"
                        autoComplete="family-name"
                        required
                        value={lastName}
                        onChange={(e) => {
                          setLastName(e.target.value);
                          setErrorMsg(null);
                        }}
                        placeholder="e.g. Ravena"
                        className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-3 py-2 text-base font-medium text-slate-900 focus:border-[#0B2F5C] focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Email & Password */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="reg-email"
                      className="block text-xs font-black uppercase tracking-wider text-slate-800 mb-1.5"
                    >
                      Email Address *
                    </label>
                    <div className="relative">
                      <Mail
                        className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
                        aria-hidden="true"
                      />
                      <input
                        id="reg-email"
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        required
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setErrorMsg(null);
                        }}
                        placeholder="athlete@boxscore.ph"
                        className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-3 py-2 text-base font-medium text-slate-900 focus:border-[#0B2F5C] focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="reg-password"
                        className="block text-xs font-black uppercase tracking-wider text-slate-800"
                      >
                        Password *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-pressed={showPassword}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        className="text-xs font-bold text-[#0B2F5C] hover:underline"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock
                        className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
                        aria-hidden="true"
                      />
                      <input
                        id="reg-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        minLength={6}
                        aria-describedby={passwordHintId}
                        required
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setErrorMsg(null);
                        }}
                        placeholder="At least 6 characters"
                        className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-3 py-2 text-base font-medium text-slate-900 focus:border-[#0B2F5C] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <span
                      id={passwordHintId}
                      className="mt-1 block text-[0.7rem] text-slate-500"
                    >
                      Minimum 6 characters required by Supabase Auth.
                    </span>
                  </div>
                </div>

                {/* 3. Birthday, Height & Weight */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="reg-birthday"
                      className="block text-xs font-black uppercase tracking-wider text-slate-800 mb-1.5"
                    >
                      Birthday *
                    </label>
                    <div className="relative">
                      <Calendar
                        className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
                        aria-hidden="true"
                      />
                      <input
                        id="reg-birthday"
                        name="birthday"
                        type="date"
                        autoComplete="bday"
                        required
                        value={birthday}
                        onChange={(e) => setBirthday(e.target.value)}
                        className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-3 py-2 text-base font-medium text-slate-900 focus:border-[#0B2F5C] focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="reg-height"
                      className="block text-xs font-black uppercase tracking-wider text-slate-800 mb-1.5"
                    >
                      Height (cm) *
                    </label>
                    <div className="relative">
                      <Ruler
                        className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
                        aria-hidden="true"
                      />
                      <input
                        id="reg-height"
                        name="height_cm"
                        type="number"
                        step="0.5"
                        min={100}
                        max={250}
                        required
                        value={heightCm}
                        onChange={(e) => setHeightCm(e.target.value)}
                        placeholder="e.g. 185"
                        className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-3 py-2 text-base font-medium text-slate-900 focus:border-[#0B2F5C] focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="reg-weight"
                      className="block text-xs font-black uppercase tracking-wider text-slate-800 mb-1.5"
                    >
                      Weight (kg) *
                    </label>
                    <div className="relative">
                      <Scale
                        className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
                        aria-hidden="true"
                      />
                      <input
                        id="reg-weight"
                        name="weight_kg"
                        type="number"
                        step="0.5"
                        min={30}
                        max={200}
                        required
                        value={weightKg}
                        onChange={(e) => setWeightKg(e.target.value)}
                        placeholder="e.g. 82"
                        className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-3 py-2 text-base font-medium text-slate-900 focus:border-[#0B2F5C] focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Address (For Nearby Courts Discovery) */}
                <div>
                  <label
                    htmlFor="reg-address"
                    className="block text-xs font-black uppercase tracking-wider text-slate-800 mb-1.5"
                  >
                    Home / Court Address *
                  </label>
                  <div className="relative">
                    <MapPin
                      className="h-4 w-4 text-slate-400 absolute left-3.5 top-3.5"
                      aria-hidden="true"
                    />
                    <textarea
                      id="reg-address"
                      name="address"
                      rows={2}
                      autoComplete="street-address"
                      aria-describedby={addressHintId}
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street, Barangay, City / Province"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-4 py-2.5 text-base font-medium text-slate-900 focus:border-[#0B2F5C] focus:bg-white focus:outline-none"
                    />
                  </div>
                  <span
                    id={addressHintId}
                    className="mt-1 block text-xs font-semibold text-slate-500"
                  >
                    Used to recommend nearby basketball courts and local
                    tournaments in your area.
                  </span>
                </div>

                {/* 5. Position — Multi-select Checkboxes (PG, SG, SF, PF, C) */}
                <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <legend className="px-1 text-xs font-black uppercase tracking-wider text-slate-800">
                    Basketball Position (Multi-Select: PG, SG, SF, PF, C) *
                  </legend>
                  <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                    {ALL_POSITIONS.map((pos) => {
                      const isChecked = selectedPositions.includes(pos.code);
                      return (
                        <label
                          key={pos.code}
                          className={`flex flex-col items-center justify-center rounded-xl border-2 p-2.5 text-center transition-all cursor-pointer select-none min-h-[56px] ${
                            isChecked
                              ? "border-[#8B0D0E] bg-[#8B0D0E] text-white shadow-xs"
                              : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            name="positions"
                            value={pos.code}
                            checked={isChecked}
                            onChange={() => togglePosition(pos.code)}
                            className="sr-only"
                          />
                          <span className="text-base font-black leading-none">
                            {pos.code}
                          </span>
                          <span
                            className={`mt-1 text-[0.65rem] font-bold leading-tight ${
                              isChecked ? "text-rose-100" : "text-slate-500"
                            }`}
                          >
                            {pos.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {/* 6. Account Roles — Multi-select Checkboxes (Player, Coach, Referee, Manager) */}
                <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <legend className="px-1 text-xs font-black uppercase tracking-wider text-slate-800">
                    Are you a Player, Coach, Referee, or Manager? (Multi-Select)
                    *
                  </legend>
                  <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {ALL_ROLES.map((item) => {
                      const isChecked = selectedRoles.includes(item.role);
                      return (
                        <label
                          key={item.role}
                          className={`flex items-start gap-3 rounded-xl border-2 p-3 transition-all cursor-pointer select-none min-h-[52px] ${
                            isChecked
                              ? "border-[#0B2F5C] bg-[#0B2F5C]/8 text-slate-900"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            name="account_roles"
                            value={item.role}
                            checked={isChecked}
                            onChange={() => toggleRole(item.role)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300"
                          />
                          <div>
                            <div className="flex items-center gap-1.5 text-sm font-black uppercase tracking-tight text-slate-900">
                              <Users
                                className="h-3.5 w-3.5 text-[#0B2F5C]"
                                aria-hidden="true"
                              />
                              {item.role}
                            </div>
                            <div className="text-[0.7rem] font-medium text-slate-500">
                              {item.desc}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full min-h-[48px] rounded-xl py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-md hover:opacity-95 disabled:opacity-50 cursor-pointer transition-all"
                  style={{ backgroundColor: "#8B0D0E" }}
                >
                  {isSubmitting
                    ? "Creating Official Account..."
                    : "Create Box Score Account"}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-slate-500">
        BOX SCORE • Connected to Real Supabase Project (
        <code>https://sbqnrxqgahfhbmlevtgf.supabase.co</code>)
      </footer>
    </div>
  );
}
