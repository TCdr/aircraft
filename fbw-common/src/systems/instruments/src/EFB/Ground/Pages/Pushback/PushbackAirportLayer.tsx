// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import { Coordinates } from 'msfs-geo';
import { OansMapProjection, TaxiPoint } from '@flybywiresim/fbw-sdk';
import { useAppSelector } from '../../../Store/store';
import { loadTaxiAirport, TaxiAirport } from '../Taxi/TaxiAirport';
import {
  BoxedPoints,
  indexAirport,
  inView,
  MIN_REDRAW_INTERVAL_MS,
  pictureChanged,
  PushbackMapPicture,
  viewBox,
} from './pushbackAirportDraw';

/** The aircraft is at the airport within this distance of its reference point, in metres (as the Taxi page) */
const AT_AIRPORT_DISTANCE = 8000;

/** The stand names are drawn from this scale, in pixels per metre */
const STAND_LABEL_SCALE = 0.6;

const COLOURS = {
  apron: '#2a2e35',
  taxiway: '#3d424a',
  runway: '#131417',
  runwayEdge: '#9ca3af',
  guidance: 'rgba(212, 181, 60, 0.45)',
  standLine: 'rgba(156, 163, 175, 0.35)',
  stand: '#9ca3af',
  labelBox: 'rgba(15, 17, 21, 0.85)',
};

interface PushbackAirportLayerProps {
  /** The map centre */
  center: Coordinates;
  /** The map is drawn with this true heading up */
  headingTrue: number;
  /** The map scale */
  pxPerMetre: number;
}

/**
 * The airport under the pushback map: the aprons, taxiways, runways, guidance lines and stand names of the Navigraph
 * airport map (as the Taxi page), drawn heading up around the map centre. The airport is the origin or the
 * destination of the SimBrief flight plan the aircraft is at; nothing is drawn away from them. Only the part in the
 * window is drawn, and only when the picture has moved (see pushbackAirportDraw.ts).
 */
export const PushbackAirportLayer: FC<PushbackAirportLayerProps> = ({ center, headingTrue, pxPerMetre }) => {
  const { departingAirport, arrivingAirport } = useAppSelector((state) => state.simbrief.data);
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [airport, setAirport] = useState<TaxiAirport | null>(null);
  const index = useMemo(() => (airport ? indexAirport(airport) : null), [airport]);

  // The canvas follows the size of its container
  useEffect(() => {
    const measure = () => {
      const el = container.current;
      if (el && (el.clientWidth !== size.width || el.clientHeight !== size.height)) {
        setSize({ width: el.clientWidth, height: el.clientHeight });
      }
    };
    measure();
    const interval = setInterval(measure, 1000);
    return () => clearInterval(interval);
  }, [size.width, size.height]);

  // The airport the aircraft is at, among the flight plan's (looked up again when the centre moves by ~100 m)
  const centerKey = `${center.lat.toFixed(3)},${center.long.toFixed(3)}`;
  useEffect(() => {
    let current = true;
    const candidates = [departingAirport, arrivingAirport]
      .map((icao) => (icao ?? '').toUpperCase())
      .filter((icao) => /^[A-Z0-9]{4}$/.test(icao));
    Promise.all(candidates.map((icao) => loadTaxiAirport(icao))).then((states) => {
      if (!current) {
        return;
      }
      const near = states.find((state) => {
        if (state.state !== 'loaded') {
          return false;
        }
        const point = OansMapProjection.globalToAirportCoordinates(state.airport.arp, center, [0, 0]) as TaxiPoint;
        return Math.hypot(point[0], point[1]) < AT_AIRPORT_DISTANCE;
      });
      setAirport(near && near.state === 'loaded' ? near.airport : null);
    });
    return () => {
      current = false;
    };
  }, [departingAirport, arrivingAirport, centerKey]);

  // The picture last drawn, when it was drawn, and a drawing waiting for the end of the minimum interval
  const drawn = useRef<PushbackMapPicture | null>(null);
  const drawnAt = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest picture to draw (read by a pending drawing)
  const latest = useRef<{ picture: PushbackMapPicture; airport: TaxiAirport | null } | null>(null);

  const draw = () => {
    pending.current = null;
    const ctx = canvas.current?.getContext('2d');
    const next = latest.current;
    if (!ctx || !next) {
      return;
    }
    const { picture } = next;
    const { width, height, cx, cy } = picture;
    drawn.current = picture;
    drawnAt.current = Date.now();
    ctx.clearRect(0, 0, width, height);
    if (!next.airport || !index || width === 0 || height === 0) {
      return;
    }
    const view = viewBox(cx, cy, width, height, picture.pxPerMetre);
    const h = (picture.headingTrue * Math.PI) / 180;
    const cos = Math.cos(h);
    const sin = Math.sin(h);
    const scale = picture.pxPerMetre;
    const sx = (x: number, y: number) => width / 2 + ((x - cx) * cos - (y - cy) * sin) * scale;
    const sy = (x: number, y: number) => height / 2 - ((x - cx) * sin + (y - cy) * cos) * scale;
    const trace = (items: BoxedPoints[], close: boolean) => {
      ctx.beginPath();
      for (const { points } of inView(items, view)) {
        points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(sx(x, y), sy(x, y)) : ctx.lineTo(sx(x, y), sy(x, y))));
        if (close) {
          ctx.closePath();
        }
      }
    };

    trace(index.aprons, true);
    ctx.fillStyle = COLOURS.apron;
    ctx.fill();
    trace(index.taxiways, true);
    ctx.fillStyle = COLOURS.taxiway;
    ctx.fill();
    trace(index.runways, true);
    ctx.fillStyle = COLOURS.runway;
    ctx.fill();
    ctx.strokeStyle = COLOURS.runwayEdge;
    ctx.lineWidth = 1;
    ctx.stroke();

    trace(index.standLines, false);
    ctx.strokeStyle = COLOURS.standLine;
    ctx.stroke();
    trace(index.guidanceLines, false);
    ctx.strokeStyle = COLOURS.guidance;
    ctx.stroke();

    // The stands: a dot, and the name when zoomed in enough
    const stands = next.airport.stands.filter(
      ({ point: [x, y] }) => x >= view.minX && x <= view.maxX && y >= view.minY && y <= view.maxY,
    );
    ctx.fillStyle = COLOURS.stand;
    for (const stand of stands) {
      ctx.beginPath();
      ctx.arc(sx(stand.point[0], stand.point[1]), sy(stand.point[0], stand.point[1]), 3, 0, 2 * Math.PI);
      ctx.fill();
    }
    if (scale >= STAND_LABEL_SCALE) {
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const stand of stands) {
        const x = sx(stand.point[0], stand.point[1]);
        const y = sy(stand.point[0], stand.point[1]) - 12;
        if (x < 0 || y < 0 || x > width || y > height) {
          continue;
        }
        const w = ctx.measureText(stand.name).width + 8;
        ctx.fillStyle = COLOURS.labelBox;
        ctx.fillRect(x - w / 2, y - 10, w, 20);
        ctx.fillStyle = COLOURS.stand;
        ctx.fillText(stand.name, x, y + 1);
      }
    }
  };

  useEffect(() => {
    const [cx, cy] = airport
      ? (OansMapProjection.globalToAirportCoordinates(airport.arp, center, [0, 0]) as TaxiPoint)
      : [0, 0];
    const picture: PushbackMapPicture = {
      airport: airport ? airport.icao : null,
      cx,
      cy,
      headingTrue,
      pxPerMetre,
      width: size.width,
      height: size.height,
    };
    latest.current = { picture, airport };
    if (!pictureChanged(drawn.current, picture) || pending.current !== null) {
      return;
    }
    const wait = drawnAt.current + MIN_REDRAW_INTERVAL_MS - Date.now();
    if (wait > 0) {
      pending.current = setTimeout(draw, wait);
    } else {
      draw();
    }
  }, [airport, index, size.width, size.height, center.lat, center.long, headingTrue, pxPerMetre]);

  useEffect(
    () => () => {
      if (pending.current !== null) {
        clearTimeout(pending.current);
      }
    },
    [],
  );

  return (
    <div ref={container} className="pointer-events-none absolute inset-0">
      <canvas ref={canvas} width={size.width} height={size.height} className="absolute inset-0" />
    </div>
  );
};
