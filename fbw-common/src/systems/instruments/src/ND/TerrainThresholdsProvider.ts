// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Instrument, Subscribable } from '@microsoft/msfs-sdk';
import { ClientState, EfisSide, NavigationDisplayThresholdsDto, TawsData } from '@flybywiresim/fbw-sdk';

import { TerrainLevelMode } from './types/GenericTawsEvents';

/**
 * Feeds the TERR peaks box of the ND (see TerrainMapThresholds) from SimBridge's terrain service.
 *
 * SimBridge computes the highest and the lowest terrain elevation of the ND range for each side whenever it renders
 * its own terrain picture, and terronnd copies them into the L:A32NX_EGPWC_ND_{side}_TERRAIN_{MIN,MAX}_ELEVATION(_MODE)
 * LVars when that picture reaches it over SimConnect. The native terrain picture (ndwxr) does not go through SimBridge,
 * so this instrument asks SimBridge for the same figures over HTTP once a second while terrain is requested on its
 * side and writes them into those LVars; they are reset to -1 (box hidden) as soon as the figures go away.
 * Without SimBridge the box stays hidden: MSFS gives a gauge no way to read elevations back.
 */
export class TerrainThresholdsProvider implements Instrument {
  private static readonly POLL_INTERVAL_MS = 1000;

  private readonly simBridge = ClientState.getInstance();

  private readonly minElevationVar: string;

  private readonly minElevationModeVar: string;

  private readonly maxElevationVar: string;

  private readonly maxElevationModeVar: string;

  private lastPollTime = 0;

  private requestPending = false;

  private figuresWritten = false;

  /**
   * @param side The ND side this instrument feeds
   * @param terrainRequested Whether the crew has the terrain selected on this ND
   */
  constructor(
    private readonly side: EfisSide,
    private readonly terrainRequested: Subscribable<boolean>,
  ) {
    const prefix = `L:A32NX_EGPWC_ND_${side}_TERRAIN_`;
    this.minElevationVar = `${prefix}MIN_ELEVATION`;
    this.minElevationModeVar = `${prefix}MIN_ELEVATION_MODE`;
    this.maxElevationVar = `${prefix}MAX_ELEVATION`;
    this.maxElevationModeVar = `${prefix}MAX_ELEVATION_MODE`;
  }

  /** @inheritdoc */
  public init(): void {
    // The LVars read 0 until something writes them, which the box would show as a "0": start hidden.
    this.figuresWritten = true;
    this.clearFigures();
  }

  /** @inheritdoc */
  public onUpdate(): void {
    const now = Date.now();
    if (this.requestPending || now - this.lastPollTime < TerrainThresholdsProvider.POLL_INTERVAL_MS) {
      return;
    }
    this.lastPollTime = now;

    if (!this.terrainRequested.get() || !this.simBridge.isConnected()) {
      this.clearFigures();
      return;
    }

    this.requestPending = true;
    TawsData.getRenderingThresholds(this.side)
      .then((thresholds) => {
        if (thresholds) {
          this.writeFigures(thresholds);
        } else {
          this.clearFigures();
        }
        this.requestPending = false;
      })
      .catch(() => {
        this.clearFigures();
        this.requestPending = false;
      });
  }

  private writeFigures(thresholds: NavigationDisplayThresholdsDto): void {
    SimVar.SetSimVarValue(this.minElevationVar, 'number', thresholds.minElevation);
    SimVar.SetSimVarValue(
      this.minElevationModeVar,
      'number',
      TerrainThresholdsProvider.levelMode(thresholds.minElevationIsCaution, thresholds.minElevationIsWarning),
    );
    SimVar.SetSimVarValue(this.maxElevationVar, 'number', thresholds.maxElevation);
    SimVar.SetSimVarValue(
      this.maxElevationModeVar,
      'number',
      TerrainThresholdsProvider.levelMode(thresholds.maxElevationIsCaution, thresholds.maxElevationIsWarning),
    );
    this.figuresWritten = true;
  }

  /** Hides the box, but only if this instrument put figures there (terronnd may own the LVars otherwise). */
  private clearFigures(): void {
    if (!this.figuresWritten) {
      return;
    }
    SimVar.SetSimVarValue(this.minElevationVar, 'number', -1);
    SimVar.SetSimVarValue(this.minElevationModeVar, 'number', TerrainLevelMode.PeaksMode);
    SimVar.SetSimVarValue(this.maxElevationVar, 'number', -1);
    SimVar.SetSimVarValue(this.maxElevationModeVar, 'number', TerrainLevelMode.PeaksMode);
    this.figuresWritten = false;
  }

  private static levelMode(isCaution: boolean, isWarning: boolean): TerrainLevelMode {
    if (isCaution) {
      return TerrainLevelMode.Caution;
    }
    return isWarning ? TerrainLevelMode.Warning : TerrainLevelMode.PeaksMode;
  }
}
