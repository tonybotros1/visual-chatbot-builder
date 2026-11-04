"use client";

import type { CSSProperties } from "react";

export type RobotMood = "idle" | "typing" | "cover" | "peek" | "sad" | "happy";

/**
 * The sign-in robot: a chatbot mascot drawn in SVG and animated with CSS keyframes keyed off
 * `data-mood` (see ".auth-robot" in globals.css).
 *
 * - typing: the eyes follow the caret across the e-mail field (`lookX`, -1 = far left, 1 = far right)
 * - cover: puts both hands over his eyes (and whistles) while the password is typed
 * - peek: lifts one hand and peeks with that eye when the password is shown
 * - sad: shakes his head on a wrong password · happy: nods on sign-in
 */
export function LoginRobot({ mood, lookX = 0, size = 150 }: { mood: RobotMood; lookX?: number; size?: number }) {
  const clamped = Math.max(-1, Math.min(1, lookX));
  const style = { "--look-x": clamped.toFixed(3), width: size, height: Math.round(size * 0.86) } as CSSProperties;
  return (
    <div className="auth-robot" data-mood={mood} style={style} aria-hidden="true">
      <svg viewBox="0 0 200 172" width="100%" height="100%" role="img">
        <defs>
          <linearGradient id="robot-head" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6f8fb" />
            <stop offset="1" stopColor="#dde4ec" />
          </linearGradient>
          <linearGradient id="robot-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#eef2f6" />
            <stop offset="1" stopColor="#cfd8e2" />
          </linearGradient>
          <radialGradient id="robot-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="var(--brand)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* shadow */}
        <ellipse className="robot-shadow" cx="100" cy="166" rx="46" ry="5" fill="rgba(31, 41, 51, 0.12)" />

        <g className="robot-rig">
          {/* body */}
          <g className="robot-body">
            <rect x="58" y="118" width="84" height="44" rx="18" fill="url(#robot-body)" stroke="#b9c5d3" strokeWidth="2" />
            {/* chat bubble badge on the chest */}
            <g className="robot-badge">
              <path d="M88 131h24a7 7 0 0 1 7 7v8a7 7 0 0 1-7 7h-9l-7 6v-6h-8a7 7 0 0 1-7-7v-8a7 7 0 0 1 7-7z" fill="var(--brand)" />
              <circle cx="93" cy="142" r="2" fill="#fff" />
              <circle cx="100" cy="142" r="2" fill="#fff" />
              <circle cx="107" cy="142" r="2" fill="#fff" />
            </g>
          </g>

          {/* head */}
          <g className="robot-head">
            {/* antenna */}
            <line x1="100" y1="30" x2="100" y2="16" stroke="#9aa7b6" strokeWidth="3" strokeLinecap="round" />
            <circle className="robot-antenna-light" cx="100" cy="12" r="6" fill="var(--brand)" />
            <circle className="robot-antenna-halo" cx="100" cy="12" r="12" fill="url(#robot-glow)" />
            {/* ears */}
            <rect x="34" y="62" width="12" height="28" rx="6" fill="#d6dee7" stroke="#b9c5d3" strokeWidth="2" />
            <rect x="154" y="62" width="12" height="28" rx="6" fill="#d6dee7" stroke="#b9c5d3" strokeWidth="2" />
            {/* face plate */}
            <rect x="44" y="30" width="112" height="90" rx="26" fill="url(#robot-head)" stroke="#b9c5d3" strokeWidth="2" />
            {/* visor */}
            <rect x="58" y="48" width="84" height="44" rx="16" fill="#1f2933" />
            <rect x="62" y="52" width="76" height="12" rx="6" fill="rgba(255,255,255,0.06)" />

            {/* eyes */}
            <g className="robot-eyes">
              <g className="robot-eye robot-eye-left">
                <circle cx="82" cy="70" r="10" fill="#fff" />
                <g className="robot-pupil">
                  <circle cx="82" cy="70" r="5.5" fill="var(--brand)" />
                  <circle cx="84" cy="68" r="1.8" fill="#fff" />
                </g>
                <rect className="robot-lid" x="70" y="58" width="24" height="24" rx="12" fill="#1f2933" />
              </g>
              <g className="robot-eye robot-eye-right">
                <circle cx="118" cy="70" r="10" fill="#fff" />
                <g className="robot-pupil">
                  <circle cx="118" cy="70" r="5.5" fill="var(--brand)" />
                  <circle cx="120" cy="68" r="1.8" fill="#fff" />
                </g>
                <rect className="robot-lid" x="106" y="58" width="24" height="24" rx="12" fill="#1f2933" />
              </g>
            </g>

            {/* mouths: one per mood, toggled in CSS */}
            <g className="robot-mouths">
              <g className="robot-mouth robot-mouth-idle" fill="var(--brand)">
                <rect x="88" y="100" width="5" height="4" rx="2" />
                <rect x="97.5" y="100" width="5" height="4" rx="2" />
                <rect x="107" y="100" width="5" height="4" rx="2" />
              </g>
              <path className="robot-mouth robot-mouth-happy" d="M86 99q14 12 28 0" fill="none" stroke="var(--brand)" strokeWidth="3.5" strokeLinecap="round" />
              <path className="robot-mouth robot-mouth-sad" d="M86 106q14 -11 28 0" fill="none" stroke="#c0392b" strokeWidth="3.5" strokeLinecap="round" />
              <circle className="robot-mouth robot-mouth-whistle" cx="100" cy="102" r="4" fill="none" stroke="var(--brand)" strokeWidth="3" />
            </g>
          </g>

          {/* hands: rest beside the body, rise to cover the eyes while the password is typed */}
          <g className="robot-hands">
            <rect x="44" y="128" width="14" height="26" rx="7" fill="#d6dee7" stroke="#b9c5d3" strokeWidth="2" className="robot-arm robot-arm-left" />
            <rect x="142" y="128" width="14" height="26" rx="7" fill="#d6dee7" stroke="#b9c5d3" strokeWidth="2" className="robot-arm robot-arm-right" />
            <g className="robot-hand robot-hand-left">
              <circle cx="51" cy="150" r="12" fill="#dfe6ee" stroke="#b9c5d3" strokeWidth="2" />
              <circle cx="44" cy="141" r="3.5" fill="#dfe6ee" stroke="#b9c5d3" strokeWidth="1.5" />
              <circle cx="51" cy="138" r="3.5" fill="#dfe6ee" stroke="#b9c5d3" strokeWidth="1.5" />
              <circle cx="58" cy="141" r="3.5" fill="#dfe6ee" stroke="#b9c5d3" strokeWidth="1.5" />
            </g>
            <g className="robot-hand robot-hand-right">
              <circle cx="149" cy="150" r="12" fill="#dfe6ee" stroke="#b9c5d3" strokeWidth="2" />
              <circle cx="142" cy="141" r="3.5" fill="#dfe6ee" stroke="#b9c5d3" strokeWidth="1.5" />
              <circle cx="149" cy="138" r="3.5" fill="#dfe6ee" stroke="#b9c5d3" strokeWidth="1.5" />
              <circle cx="156" cy="141" r="3.5" fill="#dfe6ee" stroke="#b9c5d3" strokeWidth="1.5" />
            </g>
          </g>

          {/* whistle notes */}
          <g className="robot-notes" fill="var(--brand)">
            <text className="robot-note robot-note-1" x="128" y="100" fontSize="14" fontWeight="700">♪</text>
            <text className="robot-note robot-note-2" x="140" y="92" fontSize="12" fontWeight="700">♫</text>
          </g>
        </g>
      </svg>
    </div>
  );
}
