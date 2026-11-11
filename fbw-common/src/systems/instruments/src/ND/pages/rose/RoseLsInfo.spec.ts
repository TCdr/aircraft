// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { SimVarString } from '@flybywiresim/fbw-sdk';
import {
  RoseLsInfoInputs,
  roseLsCourse,
  roseLsCourseKnown,
  roseLsCoursePointerVisible,
  roseLsDeviationSource,
  roseLsGlsTopics,
  roseLsIlsTopics,
  roseLsInfo,
} from './RoseLsInfo';

const IDENT_WORD = SimVarString.pack('G25A', 4)[0];

function inputs(overrides: Partial<RoseLsInfoInputs> = {}): RoseLsInfoInputs {
  return {
    index: 2,
    glsChannel: 0,
    glsReceived: false,
    glsIdentWord: IDENT_WORD,
    glsCourse: 248,
    ilsIdent: 'IFRA',
    ilsFrequency: 108.1,
    ilsCourse: 90,
    mmrPowered: true,
    ilsReceiverFailed: false,
    ...overrides,
  };
}

describe('ROSE LS information block', () => {
  it('shows the ILS frequency, course and ident of the receiver side', () => {
    expect(roseLsInfo(inputs())).toEqual({
      label: 'ILS2',
      frequencyMain: '108',
      frequencyDecimal: '10',
      course: '090',
      ident: 'IFRA',
    });
  });

  it('shows dashes for an ILS that is not tuned', () => {
    const info = roseLsInfo(inputs({ ilsFrequency: 0, ilsIdent: '' }));
    expect(info.frequencyMain).toBe('---');
    expect(info.frequencyDecimal).toBe('--');
    expect(info.course).toBe('---');
  });

  it('shows the GLS course 0 as 360, which is a legal course', () => {
    expect(roseLsInfo(inputs({ glsChannel: 20001, glsCourse: 0 })).course).toBe('360');
  });

  it('accepts the whole ILS band as a frequency', () => {
    expect(roseLsInfo(inputs({ ilsFrequency: 108 })).frequencyMain).toBe('108');
    expect(roseLsInfo(inputs({ ilsFrequency: 111.95 })).frequencyMain).toBe('111');
  });

  it('shows dashes for a frequency above the ILS band, but still the course of a tuned radio', () => {
    const info = roseLsInfo(inputs({ ilsFrequency: 112.1, ilsCourse: 90 }));
    expect(info.frequencyMain).toBe('---');
    expect(info.frequencyDecimal).toBe('--');
    expect(info.course).toBe('090');
  });

  it('shows the GLS channel without a decimal, and no ident until the station is received', () => {
    expect(roseLsInfo(inputs({ index: 1, glsChannel: 20001 }))).toEqual({
      label: 'GLS1',
      frequencyMain: '20001',
      frequencyDecimal: '',
      course: '248',
      ident: '',
    });
  });

  it('shows the ident of the received GLS station', () => {
    expect(roseLsInfo(inputs({ glsChannel: 20001, glsReceived: true })).ident).toBe('G25A');
  });

  it('ignores the ILS values on a GLS', () => {
    const info = roseLsInfo(inputs({ glsChannel: 20001, ilsFrequency: 110.3, ilsIdent: 'ABC', ilsCourse: 10 }));
    expect(info.course).toBe('248');
    expect(info.ident).toBe('');
  });

  it('shows a dashed course and no pointer while the GLS course is unknown', () => {
    const info = roseLsInfo(inputs({ glsChannel: 20001, glsCourse: -1 }));
    expect(info.course).toBe('---');
  });

  it('is the ILS block again for channel 0', () => {
    expect(roseLsInfo(inputs({ glsChannel: 0 })).label).toBe('ILS2');
  });

  it('shows dashes and no ident for a failed ILS receiver, whatever the sim radio still decodes', () => {
    expect(roseLsInfo(inputs({ ilsReceiverFailed: true }))).toEqual({
      label: 'ILS2',
      frequencyMain: '---',
      frequencyDecimal: '--',
      course: '---',
      ident: '',
    });
  });

  it('shows dashes and no ident for an MMR without power', () => {
    expect(roseLsInfo(inputs({ mmrPowered: false }))).toEqual({
      label: 'ILS2',
      frequencyMain: '---',
      frequencyDecimal: '--',
      course: '---',
      ident: '',
    });
  });

  it('keeps the GLS information when only the ILS receiver of that MMR is failed', () => {
    const info = roseLsInfo(inputs({ glsChannel: 20001, glsReceived: true, ilsReceiverFailed: true }));
    expect(info.frequencyMain).toBe('20001');
    expect(info.course).toBe('248');
    expect(info.ident).toBe('G25A');
  });

  it('writes north as 360, from a course of 0, 360 or one that rounds to them', () => {
    expect(roseLsInfo(inputs({ ilsCourse: 359.6 })).course).toBe('360');
    expect(roseLsInfo(inputs({ glsChannel: 20001, glsCourse: 359.6 })).course).toBe('360');
    expect(roseLsInfo(inputs({ ilsCourse: 360 })).course).toBe('360');
    expect(roseLsInfo(inputs({ ilsCourse: 0 })).course).toBe('360');
    expect(roseLsInfo(inputs({ ilsCourse: 0.4 })).course).toBe('360');
  });

  it('writes the courses 1 to 359 with three digits, unchanged', () => {
    expect(roseLsInfo(inputs({ ilsCourse: 0.6 })).course).toBe('001');
    expect(roseLsInfo(inputs({ ilsCourse: 1 })).course).toBe('001');
    expect(roseLsInfo(inputs({ ilsCourse: 90 })).course).toBe('090');
    expect(roseLsInfo(inputs({ ilsCourse: 359.4 })).course).toBe('359');
  });
});

describe('ROSE LS deviation source', () => {
  const receivers = {
    ilsLocValid: true,
    ilsLocDeviation: 0.1,
    ilsGsValid: true,
    ilsGsDeviation: 0.2,
    glsLocDeviation: 0.5,
    glsGsDeviation: -0.3,
    glsCourse: 248,
    glsLocValid: true,
    glsGsValid: false,
  };

  it('uses the ILS receiver in ILS mode', () => {
    expect(roseLsDeviationSource({ ...receivers, glsChannel: 0 })).toEqual({
      locValid: true,
      locDeviation: 0.1,
      gsValid: true,
      gsDeviation: 0.2,
    });
  });

  it('uses the GLS deviations and validity in GLS mode, even when the ILS receiver is valid', () => {
    expect(roseLsDeviationSource({ ...receivers, glsChannel: 20001 })).toEqual({
      locValid: true,
      locDeviation: 0.5,
      gsValid: false,
      gsDeviation: -0.3,
    });
  });

  it('has no deviation on a GLS that is not received', () => {
    const result = roseLsDeviationSource({ ...receivers, glsChannel: 20001, glsLocValid: false });
    expect(result.locValid).toBe(false);
  });

  it('has no LOC bar on a GLS whose course is unknown, as there is no course to deviate from', () => {
    const result = roseLsDeviationSource({ ...receivers, glsChannel: 20001, glsCourse: -1 });
    expect(result.locValid).toBe(false);
  });

  it('keeps the LOC bar on a GLS with course 0 (north)', () => {
    expect(roseLsDeviationSource({ ...receivers, glsChannel: 20001, glsCourse: 0 }).locValid).toBe(true);
  });

  it('ignores the GLS course in ILS mode', () => {
    expect(roseLsDeviationSource({ ...receivers, glsChannel: 0, glsCourse: -1 }).locValid).toBe(true);
  });
});

describe('ROSE LS course', () => {
  it('rotates to the GLS course on a GLS channel and to the ILS course otherwise', () => {
    expect(roseLsCourse(20001, 248, 90)).toBe(248);
    expect(roseLsCourse(0, 248, 90)).toBe(90);
  });

  it('knows the course of an ILS always, and of a GLS when the FMS gives one', () => {
    expect(roseLsCourseKnown(0, -1)).toBe(true);
    expect(roseLsCourseKnown(20001, -1)).toBe(false);
    expect(roseLsCourseKnown(20001, 0)).toBe(true);
  });

  it('shows the pointer for a GLS course, including 000', () => {
    expect(roseLsCoursePointerVisible(20001, 248, 0)).toBe(true);
    expect(roseLsCoursePointerVisible(20001, 0, 0)).toBe(true);
    expect(roseLsCoursePointerVisible(20001, -1, 110)).toBe(false);
  });

  it('shows the pointer for an ILS frequency in the band only', () => {
    expect(roseLsCoursePointerVisible(0, -1, 108)).toBe(true);
    expect(roseLsCoursePointerVisible(0, -1, 111.95)).toBe(true);
    expect(roseLsCoursePointerVisible(0, -1, 112)).toBe(true);
    expect(roseLsCoursePointerVisible(0, -1, 112.1)).toBe(false);
    expect(roseLsCoursePointerVisible(0, -1, 107.95)).toBe(false);
    expect(roseLsCoursePointerVisible(0, -1, 0)).toBe(false);
  });
});

describe('ROSE LS GLS receiver side', () => {
  it('reads the MMR of the ND index, which is the cross side one', () => {
    expect(roseLsGlsTopics(1).channel).toBe('mmr1GlsChannel');
    expect(roseLsGlsTopics(1).locValid).toBe('gls1LocValid');
    expect(roseLsGlsTopics(2).channel).toBe('mmr2GlsChannel');
    expect(roseLsGlsTopics(2).gsValid).toBe('gls2GsValid');
  });
});

describe('ROSE LS ILS receiver side', () => {
  it('reads the health of the MMR of the ND index, like the frequency and the course', () => {
    expect(roseLsIlsTopics(1)).toEqual({
      mmrPowered: 'mmr1Powered',
      ilsFailed: 'ils1Failed',
    });
    expect(roseLsIlsTopics(2)).toEqual({
      mmrPowered: 'mmr2Powered',
      ilsFailed: 'ils2Failed',
    });
  });
});
