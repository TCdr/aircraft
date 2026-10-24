// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { CloudLayer } from './reportElements';

/** Tops the column can have: the first one with room above the highest layer is taken */
const SCALE_TOPS_FT = [2000, 3000, 5000, 10000, 15000, 20000, 25000, 30000, 40000, 50000];
/** Room above the highest layer, so its label stays inside the column */
const HEADROOM = 1.4;
const TICKS_FT = [0, 500, 1000, 2000, 3000, 5000, 10000, 15000, 20000, 25000, 30000, 40000, 50000];
/** Sky cover in eighths, as the bar fills its cells */
const OKTAS: Record<string, number> = { FEW: 2, SCT: 4, BKN: 6, OVC: 8, VV: 8 };

/** The height at the top of the column */
export const skyScaleTopFt = (clouds: CloudLayer[]): number => {
  const highest = clouds.reduce((max, layer) => Math.max(max, layer.baseFt), 0);
  const top = SCALE_TOPS_FT.find((ft) => ft >= highest * HEADROOM);
  return top ?? SCALE_TOPS_FT[SCALE_TOPS_FT.length - 1];
};

export const skyTicksFt = (topFt: number): number[] => TICKS_FT.filter((ft) => ft <= topFt);

/** Square-root scale: the low layers that matter for an approach get most of the column */
export const skyY = (ft: number, topFt: number, topY: number, bottomY: number): number =>
  bottomY - Math.sqrt(Math.min(Math.max(ft, 0), topFt) / topFt) * (bottomY - topY);

export interface SkyRow {
  baseFt: number;
  /** The covers at this height, thinnest first, e.g. ['SCT', 'BKN CB'] */
  covers: string[];
  oktas: number;
  /** Where the bar is drawn: its height, or higher when the row below needs the room for its label */
  barY: number;
}

/**
 * One row per cloud height, from the ground up. A label sits above its bar, so each bar stays at least `rowGap` above
 * the one below it, and the lowest stays `groundGap` above the ground line.
 */
export const skyRows = (
  clouds: CloudLayer[],
  topFt: number,
  topY: number,
  bottomY: number,
  rowGap: number,
  groundGap: number,
): SkyRow[] => {
  const rows: SkyRow[] = [];
  clouds
    .slice()
    .sort((a, b) => a.baseFt - b.baseFt)
    .forEach((layer) => {
      const cover = layer.convective ? `${layer.cover} ${layer.convective}` : layer.cover;
      const last = rows[rows.length - 1];
      if (last && last.baseFt === layer.baseFt) {
        last.covers.push(cover);
        last.oktas = Math.max(last.oktas, OKTAS[layer.cover]);
        return;
      }
      const atHeight = skyY(layer.baseFt, topFt, topY, bottomY);
      rows.push({
        baseFt: layer.baseFt,
        covers: [cover],
        oktas: OKTAS[layer.cover],
        barY: last ? Math.min(atHeight, last.barY - rowGap) : Math.min(atHeight, bottomY - groundGap),
      });
    });
  return rows;
};
