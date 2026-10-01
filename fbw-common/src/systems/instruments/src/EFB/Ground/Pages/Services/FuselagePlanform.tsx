// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { A380SeatOutlineBg } from '../../../Assets/A380SeatOutlineBg';
import { SeatOutlineBg } from '../../../Assets/SeatOutlineBg';
import { M3Tone } from '../../../UtilComponents/Material/Material';

/** A door (or a cargo hold) on the planform */
export interface PlanformDoor {
  key: string;
  label: string;
  /** Left, right, or the centreline (a cargo hold) */
  side: 'L' | 'R' | 'C';
  /** Along the fuselage, in the units of the Payload page drawing (0 at the nose, 657 at the right edge) */
  at: number;
  /** 0 closed to 1 open */
  open: number;
  /** The id of the door group in the drawing, coloured with the door state */
  artId?: string;
  /** On the upper deck (A380): drawn inset on the fuselage */
  upperDeck?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

/** A service tag next to the fuselage (GPU, fuel...) */
export interface PlanformTag {
  label: string;
  tone: M3Tone;
  side: 'L' | 'R';
  /** Along the fuselage, in the drawing's units */
  at: number;
}

interface FuselagePlanformProps {
  variant: 'a380' | 'a320';
  doors: PlanformDoor[];
  holds: PlanformDoor[];
  tags: PlanformTag[];
}

/**
 * The drawings of the Payload page (Assets/SeatOutlineBg, A380SeatOutlineBg): 657 x 150 units, the nose at x = 0, the
 * right side of the aircraft at the top (small y). They are turned nose up here: a drawing point (x, y) lands at
 * (150 - y, x).
 */
const ART = {
  a380: { Outline: A380SeatOutlineBg, length: 640, left: 112, right: 33, centre: 72 },
  a320: { Outline: SeatOutlineBg, length: 657, left: 117, right: 33, centre: 75 },
};

/** The view is this much wider than the drawing, for the labels and the tags either side */
const MARGIN = 120;

const TONE_FILL: Record<M3Tone, [string, string, string]> = {
  active: ['var(--m3-primary)', 'var(--m3-primary-light)', 'var(--m3-on-primary-container)'],
  busy: ['var(--m3-warn-container)', 'var(--m3-on-warn)', 'var(--m3-on-warn)'],
  warn: ['var(--m3-error-container)', 'var(--m3-on-error)', 'var(--m3-on-error)'],
  idle: ['var(--m3-tile)', 'var(--m3-outline-strong)', 'var(--m3-muted)'],
};

const doorTone = (open: number): M3Tone => (open >= 1 ? 'active' : open > 0 ? 'busy' : 'idle');

/**
 * The aircraft from above as on the Payload page, without the seats, turned nose up: every controllable door as a
 * marker on the fuselage side (its shape in the drawing coloured with its state), the cargo holds on the centreline,
 * and the service tags beside the fuselage. Tapping a door toggles it.
 */
export const FuselagePlanform: FC<FuselagePlanformProps> = ({ variant, doors, holds, tags }) => {
  const art = ART[variant];
  const { Outline } = art;
  const font = { fontFamily: 'Manrope, Inter, sans-serif' };
  /** A drawing point, nose up */
  const px = (y: number) => 150 - y;
  const sideY = (side: 'L' | 'R') => (side === 'L' ? art.left : art.right);

  // The door shapes of the drawing take the colour of their state
  const doorStyles = doors
    .filter((door) => door.artId)
    .map((door) => {
      const [, stroke] = TONE_FILL[doorTone(door.open)];
      return `.m3-planform #${door.artId} * { stroke: ${stroke}; stroke-width: 2.5px; }`;
    })
    .join('\n');

  return (
    <svg
      className="m3-planform h-full w-full"
      viewBox={`${-MARGIN} 0 ${150 + 2 * MARGIN} ${art.length}`}
      preserveAspectRatio="xMidYMin meet"
      aria-label="Aircraft doors and services"
    >
      <style>{`.m3-planform svg * { stroke: var(--m3-outline-strong); }\n.m3-planform svg { overflow: visible; }\n${doorStyles}`}</style>
      <g transform="matrix(0 1 -1 0 150 0)">
        <svg width="657" height="150" viewBox="0 0 657 150">
          <Outline stroke="#5c6069" highlight="#5c6069" />
        </svg>
      </g>

      {/* cargo holds on the centreline */}
      {holds.map((hold) => {
        const [fill, stroke, text] = TONE_FILL[doorTone(hold.open)];
        return (
          <g
            key={hold.key}
            className={hold.onClick && !hold.disabled ? 'cursor-pointer' : ''}
            onClick={hold.disabled ? undefined : hold.onClick}
            opacity={hold.disabled ? 0.4 : 1}
          >
            <rect
              x={px(art.centre) - 14}
              y={hold.at}
              width="28"
              height="70"
              rx="5"
              fill={fill}
              stroke={stroke}
              strokeWidth="1.5"
            />
            <text
              x={px(art.centre)}
              y={hold.at + 39}
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill={text}
              style={font}
            >
              {hold.label}
            </text>
          </g>
        );
      })}

      {/* doors as markers on the fuselage side, upper deck doors inset */}
      {doors.map((door) => {
        const [fill, stroke, text] = TONE_FILL[doorTone(door.open)];
        const edge = door.side === 'C' ? art.centre : sideY(door.side);
        const inset = door.upperDeck ? (door.side === 'L' ? -10 : 10) : 0;
        const x = px(edge + inset);
        const r = door.upperDeck ? 5 : 7;
        const outward = door.side === 'L' ? -1 : 1;
        const tx = px(edge) + outward * 12;
        const anchor = outward < 0 ? 'end' : 'start';
        return (
          <g
            key={door.key}
            className={door.onClick && !door.disabled ? 'cursor-pointer' : ''}
            onClick={door.disabled ? undefined : door.onClick}
            opacity={door.disabled ? 0.4 : 1}
          >
            <circle cx={x} cy={door.at} r={r + 8} fill="transparent" />
            <circle cx={x} cy={door.at} r={r} fill={fill} stroke={stroke} strokeWidth="1.5" />
            <text
              x={tx}
              y={door.at + 3.5}
              textAnchor={anchor}
              fontSize={door.upperDeck ? 8 : 10}
              fontWeight="700"
              fill={text}
              style={font}
            >
              {door.label}
            </text>
          </g>
        );
      })}

      {/* service tags beside the fuselage */}
      {tags.map((tag) => {
        const [fill, , text] = TONE_FILL[tag.tone];
        const w = Math.max(56, tag.label.length * 6.2 + 14);
        const edge = px(sideY(tag.side));
        const x = tag.side === 'L' ? edge - 34 - w : edge + 34;
        return (
          <g key={`${tag.label}-${tag.at}`}>
            <path
              d={`M${tag.side === 'L' ? x + w : x} ${tag.at} L${edge} ${tag.at}`}
              stroke={text}
              strokeWidth="1"
              strokeDasharray="2.5 2.5"
            />
            <rect x={x} y={tag.at - 9} width={w} height="18" rx="6" fill={fill} />
            <text
              x={x + w / 2}
              y={tag.at + 3.5}
              textAnchor="middle"
              fontSize="9.5"
              fontWeight="700"
              fill={text}
              style={font}
            >
              {tag.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
