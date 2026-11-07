// @ts-strict-ignore
// Copyright (c) 2021-2023, 2025 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { RadioUtils } from '@flybywiresim/fbw-sdk';
import { NXFictionalMessages, NXSystemMessages } from '../messages/NXSystemMessages';
import { FmgcFlightPhase } from '@shared/flightphase';
import { Keypad } from '../legacy/A320_Neo_CDU_Keypad';
import { LegacyFmsPageInterface } from '../legacy/LegacyFmsPageInterface';
import { MmrRadioTuningStatus } from '@fmgc/navigation/NavaidTuner';
import { canEnterLsCourse } from '@fmgc/navigation/LandingSystemTuning';
import { RPI_PATTERN } from '@fmgc/navigation/gls/ManualGlsEntry';
import { ManualGlsTuningResult } from '@fmgc/navigation/gls/ManualGlsTuning';
import { classifyLsEntry, lsCourseCell, lsCourseTitle, lsFieldCell, showsLsSlope } from './NavRadioFields';
import { isPrecisionApproach } from './LandingSystemRows';

export class CDUNavRadioPage {
  static ShowPage(mcdu: LegacyFmsPageInterface) {
    mcdu.clearDisplay();
    mcdu.page.Current = mcdu.page.NavRadioPage;
    mcdu.activeSystem = 'FMGC';
    mcdu.pageRedrawCallback = () => {
      CDUNavRadioPage.ShowPage(mcdu);
    };
    setTimeout(mcdu.requestUpdate.bind(mcdu), 500);
    mcdu.returnPageCallback = () => {
      CDUNavRadioPage.ShowPage(mcdu);
    };

    const lsk1Row = [];
    const lsk2Row = [];
    const lsk3Row = [];
    const lsk4Title = ['CRS'];
    const lsk4Row = [];
    const lsk5Row = [];
    const lsk6Row = [];

    // this is the state when FM radio tuning is not active
    const template = [
      ['RADIO NAV'],
      ['VOR1/FREQ', 'FREQ/VOR2'],
      lsk1Row,
      ['CRS', 'CRS'],
      lsk2Row,
      ['\xa0LS\xa0/FREQ'],
      lsk3Row,
      lsk4Title,
      lsk4Row,
      ['ADF1/FREQ', 'FREQ/ADF2'],
      lsk5Row,
      [''],
      lsk6Row,
    ];

    if (!mcdu.isFmTuningActive()) {
      mcdu.setTemplate(template);
      return;
    }

    // VOR 1
    lsk1Row[0] = CDUNavRadioPage.renderVor(mcdu, 1);
    mcdu.onLeftInput[0] = CDUNavRadioPage.handleVorLsk.bind(this, mcdu, 1);
    lsk2Row[0] = CDUNavRadioPage.renderVorCrs(mcdu, 1);
    mcdu.onLeftInput[1] = CDUNavRadioPage.handleVorCrsLsk.bind(this, mcdu, 1);

    // VOR 2
    lsk1Row[1] = CDUNavRadioPage.renderVor(mcdu, 2);
    mcdu.onRightInput[0] = CDUNavRadioPage.handleVorLsk.bind(this, mcdu, 2);
    lsk2Row[1] = CDUNavRadioPage.renderVorCrs(mcdu, 2);
    mcdu.onRightInput[1] = CDUNavRadioPage.handleVorCrsLsk.bind(this, mcdu, 2);

    // LS
    lsk3Row[0] = CDUNavRadioPage.renderMmr(mcdu);
    mcdu.onLeftInput[2] = CDUNavRadioPage.handleMmrLsk.bind(this, mcdu);
    lsk4Row[0] = CDUNavRadioPage.renderMmrCrs(mcdu);
    mcdu.onLeftInput[3] = CDUNavRadioPage.handleMmrCrsLsk.bind(this, mcdu);
    lsk4Title[0] = CDUNavRadioPage.renderMmrCrsTitle(mcdu);

    // ADF 1
    lsk5Row[0] = CDUNavRadioPage.renderAdf(mcdu, 1);
    mcdu.onLeftInput[4] = CDUNavRadioPage.handleAdfLsk.bind(this, mcdu, 1);
    // FIXME BFO

    // ADF 2
    lsk5Row[1] = CDUNavRadioPage.renderAdf(mcdu, 2);
    mcdu.onRightInput[4] = CDUNavRadioPage.handleAdfLsk.bind(this, mcdu, 2);
    // FIXME BFO

    mcdu.setTemplate(template);
  }

  static handleVorLsk(
    mcdu: LegacyFmsPageInterface,
    receiverIndex: 1 | 2,
    input: string,
    scratchpadCallback: () => void,
  ) {
    if (input === Keypad.clrValue) {
      const vor = mcdu.getVorTuningData(receiverIndex);
      if (vor.manual) {
        mcdu.setManualVor(receiverIndex, null);
      } else {
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        scratchpadCallback();
        return;
      }
    } else if (input.match(/^\d{3}(\.\d{1,2})?$/) !== null) {
      const freq = parseInt(input.replace('.', '').padEnd(5, '0'), 16) << 8;

      if (!RadioUtils.isValidRange(freq, RadioUtils.RadioChannelType.VhfNavaid50)) {
        mcdu.setScratchpadMessage(NXSystemMessages.entryOutOfRange);
        scratchpadCallback();
        return false;
      } else if (!RadioUtils.isValidSpacing(freq, RadioUtils.RadioChannelType.VhfNavaid50)) {
        mcdu.setScratchpadMessage(NXSystemMessages.formatError);
        scratchpadCallback();
        return false;
      }

      mcdu.setManualVor(receiverIndex, RadioUtils.unpackBcd32(freq) / 1e6);
    } else if (input.length >= 1 && input.length <= 4) {
      // ident
      mcdu.getOrSelectVORsByIdent(input, (navaid) => {
        if (navaid) {
          if (mcdu.deselectedNavaids.find((databaseId) => databaseId === navaid.databaseId)) {
            mcdu.setScratchpadMessage(NXSystemMessages.xxxIsDeselected.getModifiedMessage(navaid.ident));
            scratchpadCallback();
            return;
          }
          mcdu.setManualVor(receiverIndex, navaid);
          requestAnimationFrame(() => {
            CDUNavRadioPage.ShowPage(mcdu);
          });
        } else {
          // FIXME new navaid page when it's built
          mcdu.setScratchpadMessage(NXSystemMessages.notInDatabase);
          scratchpadCallback();
        }
      });
      return;
    } else {
      mcdu.setScratchpadMessage(NXSystemMessages.formatError);
      scratchpadCallback();
      return;
    }

    requestAnimationFrame(() => {
      CDUNavRadioPage.ShowPage(mcdu);
    });
  }

  static renderVor(mcdu: LegacyFmsPageInterface, receiverIndex: 1 | 2) {
    const vor = mcdu.getVorTuningData(receiverIndex);
    let identText: string;
    let freqText: string;
    if (vor.frequency !== null) {
      const ident = vor.ident !== null ? vor.ident : '[\xa0\xa0]';
      identText = `{${vor.manual ? 'big' : 'small'}}${receiverIndex === 2 ? ident.padEnd(4, '\xa0') : ident.padStart(4, '\xa0')}{end}`;
      freqText = `{${vor.manual && vor.ident === null ? 'big' : 'small'}}${vor.frequency.toFixed(2)}{end}`;
    } else {
      identText = '[\xa0\xa0]';
      freqText = '[\xa0\xa0.\xa0]';
    }

    return `{cyan}${receiverIndex === 2 ? freqText : identText}{${vor.manual ? 'big' : 'small'}}/{end}${receiverIndex === 2 ? identText : freqText}{end}`;
  }

  static handleVorCrsLsk(
    mcdu: LegacyFmsPageInterface,
    receiverIndex: 1 | 2,
    input: string,
    scratchpadCallback: () => void,
  ) {
    if (input === Keypad.clrValue) {
      mcdu.setVorCourse(receiverIndex, null);
    } else if (input.match(/^\d{1,3}$/) !== null) {
      const course = parseInt(input);
      if (course < 0 || course > 360) {
        mcdu.setScratchpadMessage(NXSystemMessages.entryOutOfRange);
        scratchpadCallback();
        return;
      }
      mcdu.setVorCourse(receiverIndex, course % 360);
    } else {
      mcdu.setScratchpadMessage(NXSystemMessages.formatError);
      scratchpadCallback();
      return;
    }

    requestAnimationFrame(() => {
      CDUNavRadioPage.ShowPage(mcdu);
    });
  }

  static renderVorCrs(mcdu: LegacyFmsPageInterface, receiverIndex: 1 | 2) {
    // FIXME T suffix for true-ref VORs
    const vor = mcdu.getVorTuningData(receiverIndex);
    if (vor.dmeOnly) {
      return '';
    }
    if (vor.course !== null) {
      return `{cyan}${vor.course.toFixed(0).padStart(3, '0')}{end}`;
    }
    return '{cyan}[\xa0]{end}';
  }

  static handleMmrLsk(mcdu: LegacyFmsPageInterface, input: string, scratchpadCallback: () => void) {
    if (mcdu.isMmrTuningLocked()) {
      mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
      return;
    }

    const onDone = () =>
      requestAnimationFrame(() => {
        CDUNavRadioPage.ShowPage(mcdu);
      });

    const onFailure = (error: unknown) => {
      mcdu.logTroubleshootingError(error);
      mcdu.setScratchpadMessage(NXFictionalMessages.internalError);
      console.error(error);
      scratchpadCallback();
    };

    if (input === Keypad.clrValue) {
      const mmr = mcdu.getMmrTuningData(1);
      if (mmr.manual) {
        mcdu.setManualIls(null).then(onDone).catch(onFailure);
      } else {
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        scratchpadCallback();
        return;
      }
    } else if (classifyLsEntry(input) === 'channel') {
      mcdu
        .tuneManualGls(input, 'channel')
        .then((result) => {
          if (result === 'tuned') {
            onDone();
          } else if (result === 'locked') {
            // The first entry waits for the airport facilities, and the lock can engage meanwhile
            mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
            scratchpadCallback();
          } else {
            // 5 digits outside the GLS channels 20001 to 39999
            mcdu.setScratchpadMessage(NXSystemMessages.entryOutOfRange);
            scratchpadCallback();
          }
        })
        .catch(onFailure);
      return;
    } else if (classifyLsEntry(input) === 'frequency') {
      const freq = parseInt(input.replace('.', '').padEnd(5, '0'), 16) << 8;

      if (!RadioUtils.isValidRange(freq, RadioUtils.RadioChannelType.IlsNavaid50)) {
        mcdu.setScratchpadMessage(NXSystemMessages.entryOutOfRange);
        scratchpadCallback();
        return false;
      } else if (!RadioUtils.isValidSpacing(freq, RadioUtils.RadioChannelType.IlsNavaid50)) {
        mcdu.setScratchpadMessage(NXSystemMessages.formatError);
        scratchpadCallback();
        return false;
      }

      mcdu
        .setManualIls(RadioUtils.unpackBcd32(freq) / 1e6)
        .then(onDone)
        .catch(onFailure);
    } else if (classifyLsEntry(input) === 'ident') {
      // A reference path identifier of the destination or origin is a GLS, anything else an ILS ident
      const tryGls = RPI_PATTERN.test(input)
        ? mcdu.tuneManualGls(input, 'ident')
        : Promise.resolve<ManualGlsTuningResult>('unknown-rpi');
      tryGls
        .then((glsResult) => {
          if (glsResult === 'tuned') {
            onDone();
            return;
          }
          if (glsResult === 'locked') {
            mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
            scratchpadCallback();
            return;
          }
          mcdu.getOrSelectILSsByIdent(input, (navaid) => {
            if (navaid) {
              if (mcdu.deselectedNavaids.find((databaseId) => databaseId === navaid.databaseId)) {
                mcdu.setScratchpadMessage(NXSystemMessages.xxxIsDeselected.getModifiedMessage(navaid.ident));
                scratchpadCallback();
                return;
              }

              mcdu.setManualIls(navaid).then(onDone).catch(onFailure);
            } else {
              // FIXME new navaid page when it's built
              mcdu.setScratchpadMessage(NXSystemMessages.notInDatabase);
              scratchpadCallback();
            }
          });
        })
        .catch(onFailure);
      return;
    } else {
      mcdu.setScratchpadMessage(NXSystemMessages.formatError);
      scratchpadCallback();
      return;
    }
  }

  static renderMmr(mcdu: LegacyFmsPageInterface) {
    return lsFieldCell(mcdu.getMmrTuningData(1));
  }

  static handleMmrCrsLsk(mcdu: LegacyFmsPageInterface, input: string, scratchpadCallback: () => void) {
    if (mcdu.isMmrTuningLocked()) {
      mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
      return;
    }

    if (!canEnterLsCourse(mcdu.getMmrTuningData(1))) {
      // The receiver takes the course of a GLS from the ground station
      mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
      scratchpadCallback();
      return;
    }

    if (input === Keypad.clrValue) {
      const mmr = mcdu.getMmrTuningData(1);
      if (mmr.courseManual) {
        mcdu.setIlsCourse(null);
      } else {
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        scratchpadCallback();
        return;
      }
    } else if (input === 'F' || input === 'B') {
      // change existing course between front course and back course
      const mmr = mcdu.getMmrTuningData(1);
      if (mmr.course === null) {
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        return;
      }
      const backcourse = input.charAt(0) === 'B';
      mcdu.setIlsCourse(mmr.course, backcourse);
    } else if (input.match(/^[BF]?\d{1,3}$/) !== null) {
      const backcourse = input.charAt(0) === 'B';
      const course = input.charAt(0) === 'F' || backcourse ? parseInt(input.slice(1)) : parseInt(input);
      if (course < 0 || course > 360) {
        mcdu.setScratchpadMessage(NXSystemMessages.entryOutOfRange);
        scratchpadCallback();
        return;
      }
      mcdu.setIlsCourse(course % 360, backcourse);
    } else {
      mcdu.setScratchpadMessage(NXSystemMessages.formatError);
      scratchpadCallback();
      return;
    }

    requestAnimationFrame(() => {
      CDUNavRadioPage.ShowPage(mcdu);
    });
  }

  static showSlope(mcdu: LegacyFmsPageInterface, mmr: MmrRadioTuningStatus) {
    const takeoff = mcdu.flightPhaseManager.phase <= FmgcFlightPhase.Takeoff;
    const approachType = mcdu.flightPlanService.active.approach?.type;
    return showsLsSlope(mmr, takeoff, isPrecisionApproach(approachType));
  }

  static renderMmrCrs(mcdu: LegacyFmsPageInterface) {
    const mmr = mcdu.getMmrTuningData(1);
    return lsCourseCell(mmr, CDUNavRadioPage.showSlope(mcdu, mmr));
  }

  static renderMmrCrsTitle(mcdu: LegacyFmsPageInterface) {
    const mmr = mcdu.getMmrTuningData(1);
    return lsCourseTitle(mmr, CDUNavRadioPage.showSlope(mcdu, mmr));
  }

  static handleAdfLsk(
    mcdu: LegacyFmsPageInterface,
    receiverIndex: 1 | 2,
    input: string,
    scratchpadCallback: () => void,
  ) {
    if (input === Keypad.clrValue) {
      const adf = mcdu.getAdfTuningData(receiverIndex);
      if (adf.manual) {
        mcdu.setManualAdf(receiverIndex, null);
      } else {
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        scratchpadCallback();
        return;
      }
    } else if (input.match(/^\d{3,4}(\.\d)?$/) !== null) {
      const freq = parseFloat(input);
      // 190.0 - 1750.0 with some tolerance for FP precision
      if (freq <= 189.95 || freq >= 1750.05) {
        mcdu.setScratchpadMessage(NXSystemMessages.entryOutOfRange);
        scratchpadCallback();
        return false;
      }

      mcdu.setManualAdf(receiverIndex, freq);
    } else if (input.length >= 1 && input.length <= 4) {
      // ident
      mcdu.getOrSelectNDBsByIdent(input, (navaid) => {
        if (navaid) {
          if (mcdu.deselectedNavaids.find((databaseId) => databaseId === navaid.databaseId)) {
            mcdu.setScratchpadMessage(NXSystemMessages.xxxIsDeselected.getModifiedMessage(navaid.ident));
            scratchpadCallback();
            return;
          }
          mcdu.setManualAdf(receiverIndex, navaid);
          requestAnimationFrame(() => {
            CDUNavRadioPage.ShowPage(mcdu);
          });
        } else {
          // FIXME new navaid page when it's built
          mcdu.setScratchpadMessage(NXSystemMessages.notInDatabase);
          scratchpadCallback();
        }
      });
      return;
    } else {
      mcdu.setScratchpadMessage(NXSystemMessages.formatError);
      scratchpadCallback();
      return;
    }

    requestAnimationFrame(() => {
      CDUNavRadioPage.ShowPage(mcdu);
    });
  }

  static renderAdf(mcdu: LegacyFmsPageInterface, receiverIndex: 1 | 2) {
    const adf = mcdu.getAdfTuningData(receiverIndex);
    let identText;
    let freqText;
    if (adf.frequency !== null) {
      const ident = adf.ident !== null ? adf.ident : '[\xa0\xa0]';
      identText = `{${adf.manual ? 'big' : 'small'}}${receiverIndex === 2 ? ident.padEnd(4, '\xa0') : ident.padStart(4, '\xa0')}{end}`;
      freqText = `{${adf.manual && adf.ident === null ? 'big' : 'small'}}${adf.frequency.toFixed(1)}{end}`;
    } else {
      identText = '[\xa0\xa0]';
      freqText = '[\xa0\xa0\xa0.]';
    }

    return `{cyan}${receiverIndex === 2 ? freqText : identText}{${adf.manual ? 'big' : 'small'}}/{end}${receiverIndex === 2 ? identText : freqText}{end}`;
  }
}
