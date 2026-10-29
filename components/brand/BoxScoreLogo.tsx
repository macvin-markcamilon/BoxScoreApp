import React from "react";

interface BoxScoreLogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "light-bg" | "dark-bg";
  showTagline?: boolean;
}

/**
 * Official "BOX SCORE" Brand Identity Component
 * - "BOX" in Brand Crimson (#8B0D0E), where 'O' is a custom SVG basketball with white seam arcs
 * - "SCORE" in Brand Navy Blue (#0B2F5C)
 */
export function BoxScoreLogo({
  size = "md",
  variant = "light-bg",
  showTagline = false,
}: BoxScoreLogoProps) {
  const dimensions = {
    sm: { text: "text-xl", ball: 20, pad: "px-2.5 py-1" },
    md: { text: "text-2xl", ball: 25, pad: "px-3 py-1.5" },
    lg: { text: "text-4xl", ball: 36, pad: "px-4 py-2" },
  }[size];

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <div
        className={`inline-flex items-center rounded-lg font-black tracking-tight uppercase ${dimensions.pad} ${
          variant === "dark-bg"
            ? "bg-white shadow-sm ring-1 ring-slate-200/80"
            : "bg-white shadow-xs ring-1 ring-slate-200"
        }`}
      >
        {/* B */}
        <span
          className={`${dimensions.text} leading-none`}
          style={{ color: "#8B0D0E" }}
        >
          B
        </span>

        {/* O as Styled Basketball SVG in #8B0D0E with white seam arcs */}
        <span className="inline-flex items-center justify-center mx-0.5">
          <svg
            width={dimensions.ball}
            height={dimensions.ball}
            viewBox="0 0 36 36"
            role="img"
            aria-label="O shaped basketball emblem"
            className="shrink-0"
          >
            <circle cx="18" cy="18" r="16.5" fill="#8B0D0E" />
            {/* Horizontal & Vertical Basketball Seams */}
            <path
              d="M2 18 H34"
              stroke="#FFFFFF"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              d="M18 2 V34"
              stroke="#FFFFFF"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            {/* Left & Right Curved Basketball Seam Arcs */}
            <path
              d="M7 5.5 C14.5 11.5, 14.5 24.5, 7 30.5"
              stroke="#FFFFFF"
              strokeWidth="2.2"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M29 5.5 C21.5 11.5, 21.5 24.5, 29 30.5"
              stroke="#FFFFFF"
              strokeWidth="2.2"
              fill="none"
              strokeLinecap="round"
            />
            {/* Outer Rim Highlight */}
            <circle
              cx="18"
              cy="18"
              r="16.2"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.2"
              strokeOpacity="0.35"
            />
          </svg>
        </span>

        {/* X */}
        <span
          className={`${dimensions.text} leading-none`}
          style={{ color: "#8B0D0E" }}
        >
          X
        </span>

        {/* Spacer */}
        <span className="w-1.5" />

        {/* SCORE in Brand Navy Blue #0B2F5C */}
        <span
          className={`${dimensions.text} leading-none`}
          style={{ color: "#0B2F5C" }}
        >
          SCORE
        </span>
      </div>
    </div>
  );
}
