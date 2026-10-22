// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Arinc429Word } from '@flybywiresim/fbw-sdk';
import { AutoThrustMode, VerticalMode } from '@shared/autopilot';
import { FmgcFlightPhase } from '@shared/flightphase';

import { isSpeedAtUpperMargin, SpeedBrakeMessage, speedBrakeMessage } from '../../PFD/FMADefinitions';
import { NXSystemMessages, TypeIIMessage } from '../shared/NXSystemMessages';

/** What the FMS reads for EXTEND SPD BRK / RETRACT SPD BRK, the inputs of the PFD message as well */
export interface FmsSpeedBrakeData {
  /** L:A32NX_FMA_VERTICAL_MODE */
  verticalMode: number;
  /**
   * L:A32NX_AUTOTHRUST_MODE. Design choice: the FMS reads the A/THR mode where the PFD reads the PRIM thrust mode word;
   * both give THR IDLE together.
   */
  autoThrustMode: number;
  flightPhase: FmgcFlightPhase;
  /** L:A32NX_FLAPS_HANDLE_INDEX: 0, 1, 2, 3, 4 (FULL) */
  flapHandleIndex: number;
  /** FCDC discrete word 4 bit 28, the speed brake command */
  speedBrakesExtended: boolean;
  /** altitude minus the vertical path altitude in feet, null when the FMS does not compute it */
  linearDeviationFt: number | null;
  showSpeedMargins: boolean;
  upperSpeedMarginKt: number;
  casKt: number | null;
}

/**
 * EXTEND SPD BRK and RETRACT SPD BRK go to the MFD and the PFD: the MFD message follows the same rule as the FMA line 3
 * message (FMADefinitions speedBrakeMessage), so that both show and go together.
 * @returns the MFD message, null without one
 */
export function fmsSpeedBrakeMessage(data: FmsSpeedBrakeData): TypeIIMessage | null {
  const message = speedBrakeMessage({
    desActive: data.verticalMode === VerticalMode.DES,
    altOrAltStarActive:
      data.verticalMode === VerticalMode.ALT ||
      data.verticalMode === VerticalMode.ALT_CPT ||
      data.verticalMode === VerticalMode.ALT_CST ||
      data.verticalMode === VerticalMode.ALT_CST_CPT,
    descentOrApproachPhase:
      data.flightPhase === FmgcFlightPhase.Descent || data.flightPhase === FmgcFlightPhase.Approach,
    thrustIdle: data.autoThrustMode === AutoThrustMode.THR_IDLE,
    flapsConf3OrFull: data.flapHandleIndex >= 3,
    speedBrakesExtended: data.speedBrakesExtended,
    linearDeviationFt: data.linearDeviationFt,
    speedAtUpperMargin: isSpeedAtUpperMargin(data.showSpeedMargins, data.upperSpeedMarginKt, data.casKt),
  });
  switch (message) {
    case SpeedBrakeMessage.EXTEND:
      return NXSystemMessages.extendSpdBrk;
    case SpeedBrakeMessage.RETRACT:
      return NXSystemMessages.retractSpdBrk;
    default:
      return null;
  }
}

/**
 * @param flightPhase the FMS flight phase
 * @param altitudeFt the baro corrected altitude, null when invalid
 * @param casKt the computed airspeed, null when invalid
 */
export function readFmsSpeedBrakeData(
  flightPhase: FmgcFlightPhase,
  altitudeFt: number | null,
  casKt: number | null,
): FmsSpeedBrakeData {
  // The FCDC choice of the captain PFD: FCDC 2 only when FCDC 1 has failed and FCDC 2 has not
  const fcdc1Failed = Arinc429Word.fromSimVarValue('L:A32NX_FCDC_1_DISCRETE_WORD_1').isFailureWarning();
  const fcdc2Failed = Arinc429Word.fromSimVarValue('L:A32NX_FCDC_2_DISCRETE_WORD_1').isFailureWarning();
  const fcdc = fcdc1Failed && !fcdc2Failed ? 2 : 1;
  const fcdcWord4 = Arinc429Word.fromSimVarValue(`L:A32NX_FCDC_${fcdc}_DISCRETE_WORD_4`);
  const linearDeviationActive = SimVar.GetSimVarValue('L:A32NX_PFD_LINEAR_DEVIATION_ACTIVE', 'bool');
  return {
    verticalMode: SimVar.GetSimVarValue('L:A32NX_FMA_VERTICAL_MODE', 'number'),
    autoThrustMode: SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_MODE', 'enum'),
    flightPhase,
    flapHandleIndex: SimVar.GetSimVarValue('L:A32NX_FLAPS_HANDLE_INDEX', 'number'),
    speedBrakesExtended: fcdcWord4.bitValueOr(28, false),
    linearDeviationFt:
      linearDeviationActive && altitudeFt !== null
        ? altitudeFt - SimVar.GetSimVarValue('L:A32NX_PFD_TARGET_ALTITUDE', 'feet')
        : null,
    showSpeedMargins: !!SimVar.GetSimVarValue('L:A32NX_PFD_SHOW_SPEED_MARGINS', 'bool'),
    upperSpeedMarginKt: SimVar.GetSimVarValue('L:A32NX_PFD_UPPER_SPEED_MARGIN', 'knots'),
    casKt,
  };
}
