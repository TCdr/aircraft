// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429WordData, NXLogicConfirmNode } from '@flybywiresim/fbw-sdk';
import { Subject } from '@microsoft/msfs-sdk';

/**
 * Trigger logic of the NAV CAPT AND F/O ALT, ATT, HDG and BARO REF DISAGREE alerts of the FWS (A380 FCOM
 * PRO-ABN-ECAM-10-34-10, a380_fcom.txt l.164494-164720). They compare what the CAPT and F/O PFDs display, so each side
 * reads the ADR and the IR of its AIR DATA and ATT HDG switching (ADR/IR 1 on the CAPT side, 2 on the F/O side, 3 when
 * the switching selects it, as the PFD AdirsValueProvider) and its own EFIS control panel baro reference.
 */

/** ALT DISAGREE threshold with STD on both sides: "500 ft if baro ref STD is selected" (a380_fcom.txt l.164501) */
export const ALT_DISAGREE_STD_FT = 500;
/** ALT DISAGREE threshold with QNH on both sides: "250 ft if QNH is selected" (a380_fcom.txt l.164502) */
export const ALT_DISAGREE_QNH_FT = 250;
/** ATT DISAGREE threshold: "more than 5° in pitch or roll" (a380_fcom.txt l.164533) */
export const ATT_DISAGREE_DEG = 5;
/** HDG DISAGREE threshold in the TRUE reference: "more than 5° in TRUE reference" (a380_fcom.txt l.164641) */
export const HDG_DISAGREE_TRUE_DEG = 5;
/** HDG DISAGREE threshold in the MAGNETIC reference: "7° in MAGNETIC reference" (a380_fcom.txt l.164641-164643) */
export const HDG_DISAGREE_MAGNETIC_DEG = 7;
/**
 * The FCOM gives no confirm time for these alerts. Design choice: 10 s, so the two pilots selecting STD (or a new QNH)
 * one after the other, or a short sensor transient, do not trigger them.
 */
export const CAPT_FO_DISAGREE_CONFIRM_S = 10;

/** Positions of the AIR DATA and ATT HDG switching knobs (L:A32NX_AIR_DATA_SWITCHING_KNOB, ATT_HDG_SWITCHING_KNOB) */
const KNOB_CAPT_ON_3 = 0;
const KNOB_FO_ON_3 = 2;

/** What one PFD displays, null where its source is not valid */
export interface SideDisplayData {
  /** Baro reference is STD (EFIS CP word 2 bit 11), null without a valid EFIS CP word */
  baroStd: boolean | null;
  /** Displayed altitude in feet: pressure altitude in STD, baro corrected altitude otherwise */
  altitudeFt: number | null;
  pitchDeg: number | null;
  rollDeg: number | null;
  /** Heading in the selected reference (true or magnetic) */
  headingDeg: number | null;
}

/**
 * The ADR or IR number a PFD side uses: 1 (CAPT) or 2 (F/O), 3 when the switching knob selects it for that side.
 * @param captSide true for the CAPT side
 * @param knob the switching knob position (0 CAPT ON 3, 1 NORM, 2 F/O ON 3)
 * @returns the ADR or IR number
 */
export function sideSource(captSide: boolean, knob: number): 1 | 2 | 3 {
  if (captSide) {
    return knob === KNOB_CAPT_ON_3 ? 3 : 1;
  }
  return knob === KNOB_FO_ON_3 ? 3 : 2;
}

/**
 * Reads what one PFD side displays.
 * @param captSide true for the CAPT side
 * @param readWord reads an ARINC 429 L:var (Arinc429Word.fromSimVarValue in the sim)
 * @param airDataKnob the AIR DATA switching knob position
 * @param attHdgKnob the ATT HDG switching knob position
 * @param trueRef whether the TRUE north reference is selected
 * @returns the display data of that side
 */
export function readSideDisplayData(
  captSide: boolean,
  readWord: (name: string) => Arinc429WordData,
  airDataKnob: number,
  attHdgKnob: number,
  trueRef: boolean,
): SideDisplayData {
  const adr = sideSource(captSide, airDataKnob);
  const ir = sideSource(captSide, attHdgKnob);
  const efisWord2 = readWord(`L:A32NX_FCU_EFIS_${captSide ? 'L' : 'R'}_DISCRETE_WORD_2`);
  const baroStd = efisWord2.bitValueOr(11, null);
  // The ADR computes BARO_CORRECTED_ALTITUDE_1 with the CAPT baro setting and _2 with the F/O one
  const altitude = readWord(
    baroStd === false
      ? `L:A32NX_ADIRS_ADR_${adr}_BARO_CORRECTED_ALTITUDE_${captSide ? 1 : 2}`
      : `L:A32NX_ADIRS_ADR_${adr}_ALTITUDE`,
  );
  return {
    baroStd,
    altitudeFt: altitude.valueOr(null),
    pitchDeg: readWord(`L:A32NX_ADIRS_IR_${ir}_PITCH`).valueOr(null),
    rollDeg: readWord(`L:A32NX_ADIRS_IR_${ir}_ROLL`).valueOr(null),
    headingDeg: readWord(`L:A32NX_ADIRS_IR_${ir}_${trueRef ? 'TRUE_HEADING' : 'HEADING'}`).valueOr(null),
  };
}

/**
 * BARO REF DISAGREE: "The Captain's barometric reference is QNH(STD), and the First Officer's barometric reference is
 * STD(QNH)" (a380_fcom.txt l.164615-164616).
 * @param capt the CAPT side
 * @param fo the F/O side
 * @returns the alert condition before its confirm time
 */
export function baroRefDisagree(capt: SideDisplayData, fo: SideDisplayData): boolean {
  return capt.baroStd !== null && fo.baroStd !== null && capt.baroStd !== fo.baroStd;
}

/**
 * ALT DISAGREE: the altitudes displayed on the CAPT and F/O PFDs differ by more than 500 ft in STD or 250 ft in QNH
 * (a380_fcom.txt l.164500-164502). Design choice: compared only when both sides use the same reference; with different
 * references BARO REF DISAGREE is the alert.
 * @param capt the CAPT side
 * @param fo the F/O side
 * @returns the alert condition before its confirm time
 */
export function altDisagree(capt: SideDisplayData, fo: SideDisplayData): boolean {
  if (capt.altitudeFt === null || fo.altitudeFt === null || capt.baroStd === null || capt.baroStd !== fo.baroStd) {
    return false;
  }
  const threshold = capt.baroStd ? ALT_DISAGREE_STD_FT : ALT_DISAGREE_QNH_FT;
  return Math.abs(capt.altitudeFt - fo.altitudeFt) > threshold;
}

/**
 * ATT DISAGREE: "more than 5° in pitch or roll" between the CAPT and F/O sides (a380_fcom.txt l.164533-164534).
 * @param capt the CAPT side
 * @param fo the F/O side
 * @returns the alert condition before its confirm time
 */
export function attDisagree(capt: SideDisplayData, fo: SideDisplayData): boolean {
  const pitch =
    capt.pitchDeg !== null && fo.pitchDeg !== null && Math.abs(capt.pitchDeg - fo.pitchDeg) > ATT_DISAGREE_DEG;
  const roll = capt.rollDeg !== null && fo.rollDeg !== null && Math.abs(capt.rollDeg - fo.rollDeg) > ATT_DISAGREE_DEG;
  return pitch || roll;
}

/**
 * HDG DISAGREE: "more than 5° in TRUE reference or 7° in MAGNETIC reference" between the CAPT and F/O sides
 * (a380_fcom.txt l.164641-164643), the shortest way round the compass.
 * @param capt the CAPT side
 * @param fo the F/O side
 * @param trueRef whether the TRUE north reference is selected
 * @returns the alert condition before its confirm time
 */
export function hdgDisagree(capt: SideDisplayData, fo: SideDisplayData, trueRef: boolean): boolean {
  if (capt.headingDeg === null || fo.headingDeg === null) {
    return false;
  }
  const diff = Math.abs(((((capt.headingDeg - fo.headingDeg) % 360) + 540) % 360) - 180);
  return diff > (trueRef ? HDG_DISAGREE_TRUE_DEG : HDG_DISAGREE_MAGNETIC_DEG);
}

/**
 * Whether the FWS takes a faulty ADR as NAV ADR 1(2)(3) FAULT. An ADR that lost one of its two supplies is in the INOP
 * SYS of the ELEC busbar alert instead (A380 FCOM PRO-ABN-ELEC: AC ESS BUS FAULT and DC ESS BUS FAULT lose the ADR 1,
 * a380_fcom.txt l.139230-139232 and l.140854-140856; AC BUS 4 FAULT and DC BUS 2 FAULT the ADR 2, l.139085 and
 * l.140685; AC BUS 2 FAULT and DC BUS 1 FAULT the ADR 3, l.137931 and l.139802). These are the ADIRU supplies of
 * a380_systems navigation.rs.
 * @param adrFault the ADR discrete word is failure warning or has its ADR fail bit
 * @param acBusPowered the AC busbar of the ADR is powered (ADR 1: AC ESS, ADR 2: AC 4, ADR 3: AC 2)
 * @param dcBusPowered the DC busbar of the ADR is powered (ADR 1: DC ESS, ADR 2: DC 2, ADR 3: DC 1)
 * @param flightPhase1Or12 the FWS flight phase is 1 or 12
 * @returns whether the ADR counts as faulty for the NAV ADR alerts
 */
export function adrFaultyForNavAlerts(
  adrFault: boolean,
  acBusPowered: boolean,
  dcBusPowered: boolean,
  flightPhase1Or12: boolean,
): boolean {
  return adrFault && acBusPowered && dcBusPowered && !flightPhase1Or12;
}

/** The NAV CAPT AND F/O DISAGREE alert conditions of the FWS. One instance in FwsCore. */
export class FwsNavAlerts {
  /** NAV CAPT AND F/O ALT DISAGREE (a380_fcom.txt l.164494-164516) */
  public readonly altDisagree = Subject.create(false);

  /** NAV CAPT AND F/O ATT DISAGREE (a380_fcom.txt l.164527-164598) */
  public readonly attDisagree = Subject.create(false);

  /** NAV CAPT AND F/O BARO REF DISAGREE (a380_fcom.txt l.164609-164624) */
  public readonly baroRefDisagree = Subject.create(false);

  /** NAV CAPT AND F/O HDG DISAGREE (a380_fcom.txt l.164635-164713) */
  public readonly hdgDisagree = Subject.create(false);

  private readonly altConfirm = new NXLogicConfirmNode(CAPT_FO_DISAGREE_CONFIRM_S);

  private readonly attConfirm = new NXLogicConfirmNode(CAPT_FO_DISAGREE_CONFIRM_S);

  private readonly baroRefConfirm = new NXLogicConfirmNode(CAPT_FO_DISAGREE_CONFIRM_S);

  private readonly hdgConfirm = new NXLogicConfirmNode(CAPT_FO_DISAGREE_CONFIRM_S);

  /**
   * @param deltaTimeMs the frame time in milliseconds (as the NXLogic nodes take it)
   * @param capt what the CAPT PFD displays
   * @param fo what the F/O PFD displays
   * @param trueRef whether the TRUE north reference is selected
   */
  public update(deltaTimeMs: number, capt: SideDisplayData, fo: SideDisplayData, trueRef: boolean): void {
    this.altDisagree.set(this.altConfirm.write(altDisagree(capt, fo), deltaTimeMs));
    this.attDisagree.set(this.attConfirm.write(attDisagree(capt, fo), deltaTimeMs));
    this.baroRefDisagree.set(this.baroRefConfirm.write(baroRefDisagree(capt, fo), deltaTimeMs));
    this.hdgDisagree.set(this.hdgConfirm.write(hdgDisagree(capt, fo, trueRef), deltaTimeMs));
  }
}
