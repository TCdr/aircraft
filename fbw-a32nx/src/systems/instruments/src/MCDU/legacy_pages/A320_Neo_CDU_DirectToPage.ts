// Copyright (c) 2020, 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { CDUFlightPlanPage, Markers } from './A320_Neo_CDU_FlightPlanPage';
import { Fix, MagVar } from '@flybywiresim/fbw-sdk';
import { LegacyFmsPageInterface } from '../legacy/LegacyFmsPageInterface';
import { Column, FormatLine, FormatTemplate } from '../legacy/A320_Neo_CDU_Format';
import { NXFictionalMessages, NXSystemMessages } from '../messages/NXSystemMessages';
import { Keypad } from '../legacy/A320_Neo_CDU_Keypad';
import { Wait } from '@microsoft/msfs-sdk';
import { WaypointEntryUtils } from '@fmgc/flightplanning/WaypointEntryUtils';
import { FmsError } from '@fmgc/FmsError';
import {
  defaultRadialInTrueCourse,
  DirectToFunction,
  DirectToRadial,
  parseDirectToRadial,
} from '../legacy/DirectToRadial';

export class CDUDirectToPage {
  /**
   * @param directWaypoint the DIR TO waypoint, once the DIR TO temporary flight plan exists
   * @param directToFunction the DIRECT TO / INTERCEPT function of the DIR TO temporary flight plan (DirectToRadial.ts)
   * @param radial the radial of the RADIAL IN or RADIAL OUT function
   */
  static ShowPage(
    mcdu: LegacyFmsPageInterface,
    directWaypoint?: Fix,
    wptsListIndex = 0,
    directToFunction = DirectToFunction.Direct,
    radial?: DirectToRadial,
  ) {
    const plan = mcdu.flightPlanService.active;

    mcdu.clearDisplay();
    mcdu.page.Current = mcdu.page.DirectToPage;
    mcdu.returnPageCallback = () => {
      CDUDirectToPage.ShowPage(mcdu, directWaypoint, wptsListIndex, directToFunction, radial);
    };

    mcdu.activeSystem = 'FMGC';

    mcdu.SelfPtr = setTimeout(() => {
      if (mcdu.page.Current === mcdu.page.DirectToPage) {
        CDUDirectToPage.ShowPage(mcdu, directWaypoint, wptsListIndex, directToFunction, radial);
      }
    }, mcdu.PageTimeout.Medium);

    const title = [new Column(17, plan.flightNumber.get() ?? '', Column.small, Column.right)];

    const defaultRadialIn = directWaypoint ? CDUDirectToPage.defaultRadialIn(mcdu, directWaypoint) : null;
    const header = this.renderHeader(directWaypoint, directToFunction, radial, defaultRadialIn);

    const numRows = directWaypoint === undefined ? 5 : 4;
    const firstRowIndex = directWaypoint === undefined ? 1 : 2;

    const waypointsAndMarkers = CDUFlightPlanPage.createWaypointsAndMarkers(mcdu, plan, false, plan.activeLegIndex);
    if (waypointsAndMarkers.length === 0) {
      waypointsAndMarkers.push(
        { marker: Markers.FPLN_DISCONTINUITY, fpIndex: 0, inAlternate: false },
        { marker: Markers.END_OF_FPLN, fpIndex: 1, inAlternate: false },
      );
    }

    const scrollWindow = CDUFlightPlanPage.createScrollWindow(
      mcdu,
      waypointsAndMarkers,
      plan,
      wptsListIndex,
      false,
      Infinity,
      numRows,
    );
    const scrollText = CDUFlightPlanPage.createScrollText(scrollWindow, false);

    mcdu.onLeftInput[0] = (value, scratchpadCallback) => {
      if (value === '') {
        if (directWaypoint !== undefined) {
          // Insert TMPY
          mcdu.insertTemporaryFlightPlan(async () => {
            CDUFlightPlanPage.ShowPage(mcdu);

            await Wait.awaitDelay(300);
            await SimVar.SetSimVarValue('K:A32NX.FMGC_DIR_TO_TRIGGER', 'number', 0);
          });
        } else {
          mcdu.setScratchpadMessage(NXSystemMessages.formatError);
          scratchpadCallback();
          return;
        }
      } else if (value === Keypad.clrValue) {
        if (directWaypoint !== undefined) {
          mcdu.eraseTemporaryFlightPlan(() => {
            CDUDirectToPage.ShowPage(mcdu, undefined, wptsListIndex - 1);
          });
        }
      } else {
        // Non FP direct to
        WaypointEntryUtils.getOrCreateWaypoint(mcdu, value, false)
          .then((w) => {
            if (w) {
              mcdu.eraseTemporaryFlightPlan(() => {
                mcdu
                  .directToWaypoint(w)
                  .then(() => {
                    CDUDirectToPage.ShowPage(mcdu, w, wptsListIndex);
                  })
                  .catch((err) => {
                    mcdu.logTroubleshootingError(err);
                    mcdu.setScratchpadMessage(NXFictionalMessages.internalError);
                    console.error(err);
                  });
              });
            } else {
              mcdu.setScratchpadMessage(NXSystemMessages.notInDatabase);
            }
          })
          .catch((err: any) => {
            // Rethrow if error is not an FMS message to display
            if (err.type === undefined) {
              throw err;
            }

            mcdu.showFmsErrorMessage(err.type);
          });
      }
    };

    if (directWaypoint !== undefined) {
      // ABEAM PTS: the flight plan waypoints up to the DIR TO waypoint are replaced by their abeam points
      mcdu.onLeftInput[1] = (value, scratchpadCallback) => {
        if (value !== '') {
          mcdu.setScratchpadMessage(NXSystemMessages.formatError);
          scratchpadCallback();
          return;
        }
        CDUDirectToPage.applyFunction(mcdu, directWaypoint, wptsListIndex, DirectToFunction.AbeamPoints);
      };
      // RADIAL IN: the entered radial, or the default radial in when the field is selected without an entry
      mcdu.onRightInput[0] = (value, scratchpadCallback) => {
        const radialIn = CDUDirectToPage.radialOf(mcdu, value, defaultRadialIn);
        if (!radialIn) {
          scratchpadCallback();
          return;
        }
        CDUDirectToPage.applyFunction(mcdu, directWaypoint, wptsListIndex, DirectToFunction.RadialIn, radialIn);
      };
      // RADIAL OUT: the entered radial
      mcdu.onRightInput[1] = (value, scratchpadCallback) => {
        const radialOut = CDUDirectToPage.radialOf(mcdu, value, null);
        if (!radialOut) {
          scratchpadCallback();
          return;
        }
        CDUDirectToPage.applyFunction(mcdu, directWaypoint, wptsListIndex, DirectToFunction.RadialOut, radialOut);
      };
    }

    for (let i = 0; i < scrollWindow.length; i++) {
      const line = scrollWindow[i];

      mcdu.leftInputDelay[firstRowIndex + i] = mcdu.getDelayBasic;
      mcdu.onLeftInput[firstRowIndex + i] = (_, scratchpadCallback) => {
        switch (line.type) {
          case 'leg': {
            const { fpIndex, leg } = line;

            const term = leg.terminationWaypoint();
            if ((!leg.isXF() && !leg.isHX()) || term === null || fpIndex >= plan.firstMissedApproachLegIndex) {
              mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
              scratchpadCallback();
              return;
            }

            const newWptsListIndex = directWaypoint === undefined ? wptsListIndex + 1 : wptsListIndex;

            mcdu.eraseTemporaryFlightPlan(() => {
              mcdu
                .directToLeg(fpIndex)
                .then(() => {
                  CDUDirectToPage.ShowPage(mcdu, term, newWptsListIndex);
                })
                .catch((err) => {
                  mcdu.logTroubleshootingError(err);
                  mcdu.setScratchpadMessage(NXFictionalMessages.internalError);
                  console.error(err);
                });
            });
            break;
          }
          default:
            mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
            scratchpadCallback();
        }
      };

      mcdu.rightInputDelay[firstRowIndex + i] = mcdu.getDelayBasic;
      mcdu.onRightInput[firstRowIndex + i] = (_, scratchpadCallback) => {
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        scratchpadCallback();
      };
    }

    let up = false;
    let down = false;
    if (wptsListIndex < waypointsAndMarkers.length - 5) {
      mcdu.onUp = () => {
        wptsListIndex++;
        CDUDirectToPage.ShowPage(mcdu, directWaypoint, wptsListIndex, directToFunction, radial);
      };
      up = true;
    }
    if (wptsListIndex > 0) {
      mcdu.onDown = () => {
        wptsListIndex--;
        CDUDirectToPage.ShowPage(mcdu, directWaypoint, wptsListIndex, directToFunction, radial);
      };
      down = true;
    }
    mcdu.setArrows(up, down, false, false);
    mcdu.setTemplate([FormatLine(...title), ...header, ...scrollText]);
  }

  /**
   * Rebuilds the DIR TO temporary flight plan with another DIRECT TO / INTERCEPT function (A320 FCOM l.18291-18360)
   */
  private static applyFunction(
    mcdu: LegacyFmsPageInterface,
    directWaypoint: Fix,
    wptsListIndex: number,
    directToFunction: DirectToFunction,
    radial?: DirectToRadial,
  ) {
    const interceptCourse =
      radial && (directToFunction === DirectToFunction.RadialIn || directToFunction === DirectToFunction.RadialOut)
        ? { course: radial.course, isTrue: radial.isTrue, inbound: directToFunction === DirectToFunction.RadialIn }
        : undefined;

    mcdu.eraseTemporaryFlightPlan(() => {
      mcdu
        .directToWaypoint(directWaypoint, directToFunction === DirectToFunction.AbeamPoints, interceptCourse)
        .then(() => {
          CDUDirectToPage.ShowPage(mcdu, directWaypoint, wptsListIndex, directToFunction, radial);
        })
        .catch((err) => {
          mcdu.logTroubleshootingError(err);
          mcdu.setScratchpadMessage(NXFictionalMessages.internalError);
          console.error(err);
        });
    });
  }

  /**
   * The radial of a RADIAL IN / RADIAL OUT entry, or the default radial when the field is selected without an entry
   * @returns the radial, or null after showing the scratchpad message of a wrong entry
   */
  private static radialOf(
    mcdu: LegacyFmsPageInterface,
    value: string,
    defaultRadial: DirectToRadial | null,
  ): DirectToRadial | null {
    if (value === '') {
      if (defaultRadial === null) {
        mcdu.setScratchpadMessage(NXSystemMessages.formatError);
      }
      return defaultRadial;
    }
    try {
      return parseDirectToRadial(value);
    } catch (e) {
      if (e instanceof FmsError) {
        mcdu.showFmsErrorMessage(e.type);
        return null;
      }
      throw e;
    }
  }

  /** The default RADIAL IN (magnetic) when the DIR TO waypoint is a waypoint of the active flight plan */
  private static defaultRadialIn(mcdu: LegacyFmsPageInterface, directWaypoint: Fix): DirectToRadial | null {
    const plan = mcdu.flightPlanService.active;
    const targetIndex = plan.allLegs.findIndex(
      (it, index) =>
        index >= plan.activeLegIndex && it.isDiscontinuity === false && it.terminatesWithWaypoint(directWaypoint),
    );
    if (targetIndex < 0) {
      return null;
    }
    const trueCourse = defaultRadialInTrueCourse(plan.allLegs, targetIndex);
    if (trueCourse === null) {
      return null;
    }
    const magVar = MagVar.getForFix(directWaypoint);
    return magVar === null
      ? { course: Math.round(trueCourse) % 360, isTrue: true }
      : { course: Math.round(MagVar.trueToMagnetic(trueCourse, magVar)) % 360, isTrue: false };
  }

  private static formatRadial(radial: DirectToRadial): string {
    return `${radial.course.toFixed(0).padStart(3, '0')}${radial.isTrue ? 'T' : ''}°`;
  }

  /**
   * The DIR TO waypoint and the DIRECT TO / INTERCEPT functions: the selected function in yellow (it is part of the
   * DIR TO temporary flight plan), the others selectable in cyan, the default radial in in small font.
   */
  private static renderHeader(
    directToWaypoint: Fix | undefined,
    directToFunction: DirectToFunction,
    radial: DirectToRadial | undefined,
    defaultRadialIn: DirectToRadial | null,
  ): string[][] {
    if (!directToWaypoint) {
      return FormatTemplate([
        [new Column(1, 'DIR TO', Column.small)],
        [new Column(1, '[\xa0\xa0\xa0\xa0\xa0]', Column.cyan)],
      ]);
    }

    let radialInCell = new Column(21, '[ ]°', Column.right, Column.cyan);
    if (directToFunction === DirectToFunction.RadialIn && radial) {
      radialInCell = new Column(21, CDUDirectToPage.formatRadial(radial), Column.right, Column.yellow);
    } else if (defaultRadialIn) {
      radialInCell = new Column(
        21,
        CDUDirectToPage.formatRadial(defaultRadialIn),
        Column.right,
        Column.cyan,
        Column.small,
      );
    }
    const radialOutCell =
      directToFunction === DirectToFunction.RadialOut && radial
        ? new Column(21, CDUDirectToPage.formatRadial(radial), Column.right, Column.yellow)
        : new Column(21, '[ ]°', Column.right, Column.cyan);
    const abeamCell =
      directToFunction === DirectToFunction.AbeamPoints
        ? new Column(1, 'ABEAM PTS', Column.yellow)
        : new Column(0, '*ABEAM PTS', Column.cyan);

    return FormatTemplate([
      [new Column(1, 'DIR TO', Column.small), new Column(13, 'RADIAL IN', Column.small)],
      [new Column(0, `*${directToWaypoint.ident}`, Column.cyan), radialInCell],
      [new Column(1, 'WITH', Column.small), new Column(13, 'RADIAL OUT', Column.small)],
      [abeamCell, radialOutCell],
    ]);
  }
}
