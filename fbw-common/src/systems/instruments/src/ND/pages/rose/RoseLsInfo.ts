// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { isLsDeviationValid, lsDeviation, lsSource, ownSideGlsTopics } from '../../../PFD/FlsDisplay';
import { glsInfoTexts } from '../../../PFD/GlsInfoTexts';
import { ilsReceiverInfo } from '../../../PFD/IlsReceiverHealth';

export interface RoseLsInfoInputs {
  /** the MMR the ND shows, which is the cross side one */
  index: 1 | 2;
  /** the GLS channel that MMR is set to, 0 in ILS mode */
  glsChannel: number;
  /** the GLS station is received by that MMR */
  glsReceived: boolean;
  /** SimVarString.pack(rpi, 4)[0] */
  glsIdentWord: number;
  /** the course of the selected landing system from the FMS, negative when unknown */
  glsCourse: number;
  ilsIdent: string;
  ilsFrequency: number;
  ilsCourse: number;
  /** that MMR has power */
  mmrPowered: boolean;
  /** the ILS receiver of that MMR, or the whole MMR, is failed */
  ilsReceiverFailed: boolean;
}

export interface RoseLsInfo {
  label: string;
  frequencyMain: string;
  /** empty for a GLS channel, which has no decimals */
  frequencyDecimal: string;
  course: string;
  ident: string;
}

const NO_COURSE = '---';

/**
 * The GLS data of the ND page with this index. The index is the receiver the ND shows, which is the cross side one, so
 * the captain ND (index 2) reads the MMR 2 like the first officer PFD.
 */
export function roseLsGlsTopics(index: number) {
  return ownSideGlsTopics(index);
}

const ROSE_LS_ILS_TOPICS = [
  {
    mmrPowered: 'mmr1Powered',
    ilsFailed: 'ils1Failed',
  },
  {
    mmrPowered: 'mmr2Powered',
    ilsFailed: 'ils2Failed',
  },
] as const;

/** The health of the MMR the ND page with this index shows, whose radio gives the frequency and the course */
export function roseLsIlsTopics(index: number) {
  return ROSE_LS_ILS_TOPICS[index === 2 ? 1 : 0];
}

// We can't tell if the ILS course is valid from the MSFS radio, so at least check that the frequency is
function isIlsBand(ilsFrequency: number): boolean {
  return ilsFrequency >= 108 && ilsFrequency <= 112;
}

/** The course the ND rotates its LS pointer, scale and bar to: the GLS course while the MMR is on a GLS channel */
export function roseLsCourse(glsChannel: number, glsCourse: number, ilsCourse: number): number {
  return glsChannel > 0 ? glsCourse : ilsCourse;
}

/** A GLS whose course is unknown (a manually entered channel) has no scale and no bar either: nothing to deviate from */
export function roseLsCourseKnown(glsChannel: number, glsCourse: number): boolean {
  return glsChannel <= 0 || glsCourse >= 0;
}

/** The course pointer needs a course that is known: a GLS course from the FMS, an ILS frequency in the ILS band */
export function roseLsCoursePointerVisible(glsChannel: number, glsCourse: number, ilsFrequency: number): boolean {
  if (glsChannel > 0) {
    return glsCourse >= 0;
  }
  return isIlsBand(ilsFrequency);
}

// North reads 360, never 000
function courseText(course: number): string {
  const degrees = Math.round(course) % 360;
  return (degrees === 0 ? 360 : degrees).toString().padStart(3, '0');
}

export function roseLsInfo(inputs: RoseLsInfoInputs): RoseLsInfo {
  if (inputs.glsChannel > 0) {
    const gls = glsInfoTexts({
      received: inputs.glsReceived,
      identWord: inputs.glsIdentWord,
      channel: inputs.glsChannel,
      thresholdDistance: 0,
    });
    return {
      label: `GLS${inputs.index}`,
      frequencyMain: gls.channel,
      frequencyDecimal: '',
      course: roseLsCourseKnown(inputs.glsChannel, inputs.glsCourse) ? courseText(inputs.glsCourse) : NO_COURSE,
      ident: gls.ident,
    };
  }

  const ils = ilsReceiverInfo({
    ident: inputs.ilsIdent,
    frequency: inputs.ilsFrequency,
    hasDme: false,
    mmrPowered: inputs.mmrPowered,
    ilsReceiverFailed: inputs.ilsReceiverFailed,
  });
  const [frequencyMain, frequencyDecimal] = isIlsBand(ils.frequency)
    ? ils.frequency.toFixed(2).split('.', 2)
    : ['---', '--'];
  return {
    label: `ILS${inputs.index}`,
    frequencyMain,
    frequencyDecimal,
    course: ils.frequency > 0 ? courseText(inputs.ilsCourse) : NO_COURSE,
    ident: ils.ident,
  };
}

export interface RoseLsDeviationInputs {
  glsChannel: number;
  ilsLocValid: boolean;
  ilsLocDeviation: number;
  ilsGsValid: boolean;
  ilsGsDeviation: number;
  glsLocDeviation: number;
  glsGsDeviation: number;
  glsCourse: number;
  /** the GLS deviation is valid for the MMR the ND shows */
  glsLocValid: boolean;
  glsGsValid: boolean;
}

export interface RoseLsDeviation {
  locValid: boolean;
  locDeviation: number;
  gsValid: boolean;
  gsDeviation: number;
}

// The GLS receiver of the shown MMR wins when it is set to a GLS channel
export function roseLsDeviationSource(inputs: RoseLsDeviationInputs): RoseLsDeviation {
  const source = lsSource(false, inputs.glsChannel > 0);
  return {
    locValid:
      isLsDeviationValid(source, inputs.ilsLocValid, false, inputs.glsLocValid) &&
      roseLsCourseKnown(inputs.glsChannel, inputs.glsCourse),
    locDeviation: lsDeviation(source, inputs.ilsLocDeviation, 0, inputs.glsLocDeviation),
    gsValid: isLsDeviationValid(source, inputs.ilsGsValid, false, inputs.glsGsValid),
    gsDeviation: lsDeviation(source, inputs.ilsGsDeviation, 0, inputs.glsGsDeviation),
  };
}
