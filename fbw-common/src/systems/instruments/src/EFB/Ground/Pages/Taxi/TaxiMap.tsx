// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useEffect, useRef, useState } from 'react';
import { taxiDistance, TaxiLineKind, TaxiPoint, TaxiRoute, TaxiStand } from '@flybywiresim/fbw-sdk';
import { ArrowsFullscreen, GeoAltFill, ZoomIn, ZoomOut } from 'react-bootstrap-icons';
import { TaxiAirport } from './TaxiAirport';

const COLOURS = {
  background: '#0f1115',
  apron: '#2a2e35',
  taxiway: '#3d424a',
  runway: '#131417',
  runwayEdge: '#9ca3af',
  guidance: 'rgba(212, 181, 60, 0.45)',
  standLine: 'rgba(156, 163, 175, 0.35)',
  stand: '#9ca3af',
  route: '#e040fb',
  label: '#ffffff',
  labelBox: 'rgba(15, 17, 21, 0.85)',
  start: '#22c55e',
  crossing: '#ef4444',
  hold: '#f59e0b',
  entry: '#22d3ee',
  aircraft: '#facc15',
  taxiwayName: '#eab308',
};

/**
 * The canvas is larger than the map by this part of its size on each side: a drag moves the drawn canvas (fast) and the
 * map is drawn again when it ends
 */
const MARGIN = 0.5;
/** Pixels per metre: the taxiway names appear from this scale */
const TAXIWAY_LABEL_SCALE = 0.15;
/** The same taxiway name is repeated at least this far apart, in pixels */
const TAXIWAY_LABEL_SPACING = 250;

/** Pixels per metre: the stand names appear from this scale */
const STAND_LABEL_SCALE = 0.6;
/** Pixels per metre: the locate button zooms in to at least this scale, with the stand names */
const LOCATE_SCALE = 1;
/** The margin around the route or the airport when the map fits them, in pixels */
const FIT_PADDING = 70;
/** A tap picks the nearest stand within this distance, in pixels */
const STAND_PICK_DISTANCE = 20;
/** A press that moves less than this is a tap, not a drag, in pixels */
const TAP_MOVE = 5;

interface View {
  cx: number;
  cy: number;
  /** pixels per metre */
  scale: number;
}

export interface TaxiMapProps {
  airport: TaxiAirport;
  route: TaxiRoute | null;
  /** The route along the clearance is accepted (solid line); else it is the suggested route (dashed line) */
  accepted: boolean;
  crossings: { runway: string; point: TaxiPoint }[];
  stand: TaxiStand | null;
  /** Departure: where the route stops before the runway */
  hold: { point: TaxiPoint; label: string } | null;
  /** Departure: the entries of the runway */
  entries: { name: string; point: TaxiPoint }[];
  aircraft: { point: TaxiPoint; heading: number } | null;
  /** Called with the name of the stand tapped on the map, when the page takes a stand */
  onStandPick?: (name: string) => void;
}

/** The view that shows all the points, with a margin */
function fit(points: TaxiPoint[], width: number, height: number): View | null {
  if (points.length === 0 || width <= 0 || height <= 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  // A margin in pixels keeps the labels at the ends of the route (stand, HOLD) inside the map
  const scale = Math.min(
    (width - 2 * FIT_PADDING) / Math.max(maxX - minX, 100),
    (height - 2 * FIT_PADDING) / Math.max(maxY - minY, 100),
  );
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, scale: Math.min(scale, 4) };
}

/**
 * The airport map of the taxi route page: aprons, taxiways and runways, the guidance lines, the stands, the route with
 * its taxiway names, the runway crossings and the aircraft. North up; drag to move, buttons to zoom, tap a stand to
 * choose it.
 */
export const TaxiMap = ({
  airport,
  route,
  accepted,
  crossings,
  stand,
  hold,
  entries,
  aircraft,
  onStandPick,
}: TaxiMapProps) => {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);
  const canvasWidth = Math.round(size.width * (1 + 2 * MARGIN));
  const canvasHeight = Math.round(size.height * (1 + 2 * MARGIN));

  // The canvas follows the size of its container
  useEffect(() => {
    const measure = () => {
      const el = container.current;
      if (el) {
        setSize({ width: el.clientWidth, height: el.clientHeight });
      }
    };
    measure();
    const interval = setInterval(measure, 1000);
    return () => clearInterval(interval);
  }, []);

  const fitAll = () => {
    let points: TaxiPoint[] = route && route.points.length > 0 ? route.points : [];
    if (points.length === 0) {
      // The whole airport (no Array.prototype.flat in Coherent GT)
      for (const ring of airport.shapes.runways.concat(airport.shapes.aprons)) {
        points = points.concat(ring);
      }
    }
    setView(fit(points, size.width, size.height));
  };

  // Show the whole route when it changes, else the whole airport
  useEffect(fitAll, [airport, route, size.width, size.height]);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !view) {
      return;
    }
    const width = canvasWidth;
    const height = canvasHeight;
    const sx = (x: number) => width / 2 + (x - view.cx) * view.scale;
    const sy = (y: number) => height / 2 - (y - view.cy) * view.scale;
    (canvas.current as HTMLCanvasElement).style.transform = '';

    ctx.fillStyle = COLOURS.background;
    ctx.fillRect(0, 0, width, height);

    // Each layer is one path: much faster than one path per shape
    const polygons = (rings: TaxiPoint[][], fill: string, stroke?: string) => {
      ctx.beginPath();
      for (const ring of rings) {
        ring.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(sx(x), sy(y)) : ctx.lineTo(sx(x), sy(y))));
        ctx.closePath();
      }
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };
    polygons(airport.shapes.aprons, COLOURS.apron);
    polygons(airport.shapes.taxiways, COLOURS.taxiway);
    polygons(airport.shapes.runways, COLOURS.runway, COLOURS.runwayEdge);

    ctx.lineWidth = 1;
    for (const kinds of [[TaxiLineKind.Stand], [TaxiLineKind.Taxiway, TaxiLineKind.Exit]]) {
      ctx.strokeStyle = kinds[0] === TaxiLineKind.Stand ? COLOURS.standLine : COLOURS.guidance;
      ctx.beginPath();
      for (const line of airport.network.lines) {
        if (kinds.includes(line.kind)) {
          line.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(sx(x), sy(y)) : ctx.lineTo(sx(x), sy(y))));
        }
      }
      ctx.stroke();
    }

    const label = (text: string, x: number, y: number, colour: string, font = 'bold 15px sans-serif') => {
      ctx.font = font;
      const w = ctx.measureText(text).width + 8;
      ctx.fillStyle = COLOURS.labelBox;
      ctx.fillRect(x - w / 2, y - 10, w, 20);
      ctx.fillStyle = colour;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 1);
    };

    // The taxiway names, spaced out, where they do not hide one another
    if (view.scale >= TAXIWAY_LABEL_SCALE) {
      ctx.font = 'bold 13px sans-serif';
      const placed: { name: string; x: number; y: number; w: number }[] = [];
      for (const line of airport.network.lines) {
        if (line.kind !== TaxiLineKind.Taxiway || line.name === null || line.points.length < 2) {
          continue;
        }
        const a = line.points[0];
        const b = line.points[line.points.length - 1];
        const m = line.points[Math.floor(line.points.length / 2)];
        const x = line.points.length === 2 ? sx((a[0] + b[0]) / 2) : sx(m[0]);
        const y = line.points.length === 2 ? sy((a[1] + b[1]) / 2) : sy(m[1]);
        if (x < 0 || y < 0 || x > width || y > height || taxiDistance(a, b) * view.scale < 40) {
          continue;
        }
        const name = line.name;
        const w = ctx.measureText(name).width + 8;
        const clash = placed.some(
          (p) =>
            (p.name === name && Math.hypot(p.x - x, p.y - y) < TAXIWAY_LABEL_SPACING) ||
            (Math.abs(p.x - x) < (p.w + w) / 2 && Math.abs(p.y - y) < 20),
        );
        if (!clash) {
          placed.push({ name, x, y, w });
          label(name, x, y, COLOURS.taxiwayName, 'bold 13px sans-serif');
        }
      }
    }

    ctx.fillStyle = COLOURS.stand;
    ctx.beginPath();
    for (const s of airport.stands) {
      ctx.moveTo(sx(s.point[0]) + 2.5, sy(s.point[1]));
      ctx.arc(sx(s.point[0]), sy(s.point[1]), 2.5, 0, 2 * Math.PI);
    }
    ctx.fill();
    if (view.scale >= STAND_LABEL_SCALE) {
      for (const s of airport.stands) {
        if (s.name !== stand?.name) {
          label(s.name, sx(s.point[0]), sy(s.point[1]) - 12, COLOURS.stand, '12px sans-serif');
        }
      }
    }

    if (route && route.points.length > 1) {
      ctx.strokeStyle = COLOURS.route;
      ctx.lineWidth = accepted ? 5 : 4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash(accepted ? [] : [12, 8]);
      ctx.beginPath();
      route.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(sx(x), sy(y)) : ctx.lineTo(sx(x), sy(y))));
      ctx.stroke();
      ctx.setLineDash([]);

      const [x0, y0] = route.points[0];
      ctx.fillStyle = COLOURS.start;
      ctx.beginPath();
      ctx.arc(sx(x0), sy(y0), 7, 0, 2 * Math.PI);
      ctx.fill();

      // The name of each taxiway along the route
      for (const leg of route.legs) {
        if (leg.name !== null && leg.kind !== TaxiLineKind.Stand && leg.length > 30) {
          label(leg.name, sx(leg.mid[0]), sy(leg.mid[1]), COLOURS.route);
        }
      }
    }

    for (const e of entries) {
      ctx.fillStyle = COLOURS.entry;
      ctx.beginPath();
      ctx.arc(sx(e.point[0]), sy(e.point[1]), 5, 0, 2 * Math.PI);
      ctx.fill();
      label(e.name, sx(e.point[0]), sy(e.point[1]) + 18, COLOURS.entry, 'bold 13px sans-serif');
    }

    for (const c of crossings) {
      ctx.strokeStyle = COLOURS.crossing;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx(c.point[0]), sy(c.point[1]), 10, 0, 2 * Math.PI);
      ctx.stroke();
      label(c.runway, sx(c.point[0]), sy(c.point[1]) - 22, COLOURS.crossing);
    }

    if (stand) {
      ctx.fillStyle = COLOURS.route;
      ctx.beginPath();
      ctx.arc(sx(stand.point[0]), sy(stand.point[1]), 6, 0, 2 * Math.PI);
      ctx.fill();
      label(stand.name, sx(stand.point[0]), sy(stand.point[1]) - 18, COLOURS.label);
    }

    if (hold) {
      // A stop bar across the end of the route
      const pts = route?.points ?? [];
      const prev = pts.length > 1 ? pts[pts.length - 2] : hold.point;
      const dx = hold.point[0] - prev[0];
      const dy = hold.point[1] - prev[1];
      const n = Math.hypot(dx, dy) || 1;
      const hx = sx(hold.point[0]);
      const hy = sy(hold.point[1]);
      ctx.strokeStyle = COLOURS.hold;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(hx - (dy / n) * 14, hy - (dx / n) * 14);
      ctx.lineTo(hx + (dy / n) * 14, hy + (dx / n) * 14);
      ctx.stroke();
      label(hold.label, hx, hy - 22, COLOURS.hold);
    }

    if (aircraft) {
      const x = sx(aircraft.point[0]);
      const y = sy(aircraft.point[1]);
      const h = (aircraft.heading * Math.PI) / 180;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(h);
      ctx.fillStyle = COLOURS.aircraft;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(9, 10);
      ctx.lineTo(0, 5);
      ctx.lineTo(-9, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }, [airport, route, accepted, crossings, stand, hold, entries, aircraft, view, canvasWidth, canvasHeight]);

  /** A tap on the map: the nearest stand to it */
  const pickStand = (clientX: number, clientY: number) => {
    const el = container.current;
    if (!el || !view || !onStandPick) {
      return;
    }
    // The flyPad may be scaled: from the screen position to the canvas pixels
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) * el.clientWidth) / (rect.width || 1);
    const py = ((clientY - rect.top) * el.clientHeight) / (rect.height || 1);
    const x = view.cx + (px - size.width / 2) / view.scale;
    const y = view.cy - (py - size.height / 2) / view.scale;
    let best: TaxiStand | null = null;
    let bestDistance = STAND_PICK_DISTANCE / view.scale;
    for (const s of airport.stands) {
      const d = Math.hypot(s.point[0] - x, s.point[1] - y);
      if (d < bestDistance) {
        best = s;
        bestDistance = d;
      }
    }
    if (best) {
      onStandPick(best.name);
    }
  };

  /** The drag distance, within the margin of the canvas */
  const dragOffset = (d: { x: number; y: number }, clientX: number, clientY: number): [number, number] => [
    Math.max(-size.width * MARGIN, Math.min(size.width * MARGIN, clientX - d.x)),
    Math.max(-size.height * MARGIN, Math.min(size.height * MARGIN, clientY - d.y)),
  ];

  /** The end of a drag: the map is drawn at its new place; a tap picks a stand */
  const endDrag = (clientX: number, clientY: number) => {
    const d = drag.current;
    drag.current = null;
    if (!d) {
      return;
    }
    const [dx, dy] = dragOffset(d, clientX, clientY);
    if (Math.hypot(dx, dy) < TAP_MOVE) {
      if (canvas.current) {
        canvas.current.style.transform = '';
      }
      pickStand(clientX, clientY);
      return;
    }
    setView({ ...d.view, cx: d.view.cx - dx / d.view.scale, cy: d.view.cy + dy / d.view.scale });
  };

  const locateAircraft = () => {
    if (aircraft && view) {
      setView({ cx: aircraft.point[0], cy: aircraft.point[1], scale: Math.max(view.scale, LOCATE_SCALE) });
    }
  };

  const zoom = (factor: number) =>
    view && setView({ ...view, scale: Math.max(0.02, Math.min(8, view.scale * factor)) });

  return (
    <div
      ref={container}
      className="relative h-full w-full overflow-hidden rounded-2xl"
      onMouseDown={(e) => view && (drag.current = { x: e.clientX, y: e.clientY, view })}
      onMouseMove={(e) => {
        // Moves the drawn canvas only
        const d = drag.current;
        if (d && canvas.current) {
          const [dx, dy] = dragOffset(d, e.clientX, e.clientY);
          canvas.current.style.transform = `translate(${dx}px, ${dy}px)`;
        }
      }}
      onMouseUp={(e) => endDrag(e.clientX, e.clientY)}
      onMouseLeave={(e) => endDrag(e.clientX, e.clientY)}
    >
      <canvas
        ref={canvas}
        width={canvasWidth}
        height={canvasHeight}
        className="absolute"
        style={{ left: -size.width * MARGIN, top: -size.height * MARGIN }}
      />
      <div className="absolute right-4 top-4 flex flex-col space-y-2">
        {[
          { icon: <ZoomIn size={22} />, onClick: () => zoom(1.5), disabled: false },
          { icon: <ZoomOut size={22} />, onClick: () => zoom(1 / 1.5), disabled: false },
          { icon: <ArrowsFullscreen size={20} />, onClick: fitAll, disabled: false },
          // Centres the map on the aircraft (when it is at this airport), zoomed in
          { icon: <GeoAltFill size={20} />, onClick: locateAircraft, disabled: aircraft === null },
        ].map((b, i) => (
          <button
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            type="button"
            disabled={b.disabled}
            className={`flex h-12 w-12 items-center justify-center rounded-xl border border-m3-outline bg-m3-ground ${
              b.disabled ? 'text-m3-muted opacity-50' : 'text-m3-text hover:bg-m3-tile'
            }`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={b.onClick}
          >
            {b.icon}
          </button>
        ))}
      </div>
    </div>
  );
};
