// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useEffect, useRef, useState } from 'react';
import { Coordinates } from 'msfs-geo';
import { OansMapProjection, TaxiLineKind, TaxiPoint } from '@flybywiresim/fbw-sdk';
import { useAppSelector } from '../../../Store/store';
import { loadTaxiAirport, TaxiAirport } from '../Taxi/TaxiAirport';

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
 * destination of the SimBrief flight plan the aircraft is at; nothing is drawn away from them.
 */
export const PushbackAirportLayer: FC<PushbackAirportLayerProps> = ({ center, headingTrue, pxPerMetre }) => {
  const { departingAirport, arrivingAirport } = useAppSelector((state) => state.simbrief.data);
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [airport, setAirport] = useState<TaxiAirport | null>(null);

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

  // The airport the aircraft is at, among the flight plan's
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

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) {
      return;
    }
    const { width, height } = size;
    ctx.clearRect(0, 0, width, height);
    if (!airport || width === 0 || height === 0) {
      return;
    }
    // The map centre in airport coordinates (metres east and north of the reference point), the heading up
    const [cx, cy] = OansMapProjection.globalToAirportCoordinates(airport.arp, center, [0, 0]) as TaxiPoint;
    const h = (headingTrue * Math.PI) / 180;
    const cos = Math.cos(h);
    const sin = Math.sin(h);
    const sx = (x: number, y: number) => width / 2 + ((x - cx) * cos - (y - cy) * sin) * pxPerMetre;
    const sy = (x: number, y: number) => height / 2 - ((x - cx) * sin + (y - cy) * cos) * pxPerMetre;

    const polygons = (rings: TaxiPoint[][], fill: string, stroke?: string) => {
      ctx.beginPath();
      for (const ring of rings) {
        ring.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(sx(x, y), sy(x, y)) : ctx.lineTo(sx(x, y), sy(x, y))));
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
          line.points.forEach(([x, y], i) =>
            i === 0 ? ctx.moveTo(sx(x, y), sy(x, y)) : ctx.lineTo(sx(x, y), sy(x, y)),
          );
        }
      }
      ctx.stroke();
    }

    // The stands: a dot, and the name when zoomed in enough
    ctx.fillStyle = COLOURS.stand;
    for (const stand of airport.stands) {
      const x = sx(stand.point[0], stand.point[1]);
      const y = sy(stand.point[0], stand.point[1]);
      if (x < -20 || y < -20 || x > width + 20 || y > height + 20) {
        continue;
      }
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
    }
    if (pxPerMetre >= STAND_LABEL_SCALE) {
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const stand of airport.stands) {
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
  }, [airport, size.width, size.height, centerKey, Math.round(headingTrue), pxPerMetre]);

  return (
    <div ref={container} className="pointer-events-none absolute inset-0">
      <canvas ref={canvas} width={size.width} height={size.height} className="absolute inset-0" />
    </div>
  );
};
