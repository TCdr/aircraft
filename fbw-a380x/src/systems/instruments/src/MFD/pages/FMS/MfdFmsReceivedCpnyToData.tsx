// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ArraySubject, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { AbstractMfdPageProps } from '../../MFD';
import { FmsPage } from '../common/FmsPage';
import { Footer } from '../common/Footer';
import { fcomAt, fcomLine, fcomRight } from '../common/FcomLayout';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { IconButton } from '../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { DropdownMenu } from '../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { RadioButtonGroup } from '../../../MsfsAvionicsCommon/UiWidgets/RadioButtonGroup';
import { cpnyToRequestPage } from './MfdFmsCpnyToRequest';

import './MfdFmsReceivedCpnyToData.scss';

/** FCOM P 312: takeoff data for up to four runways */
const maxRunways = 4;

/**
 * RECEIVED COMPANY T.O DATA page (A380 FCOM DSC-22-FMS-20-30 P 312-320): the takeoff data received from the company
 * for up to four runways and two thrust settings per runway, with INSERT and CLEAR.
 *
 * No company takeoff data can be received in the simulation (see the COMPANY T.O DATA REQUEST page): the page shows
 * dashes, INSERT and CLEAR are inactive.
 */
export class MfdFmsReceivedCpnyToData extends FmsPage<AbstractMfdPageProps> {
  private readonly runwayPage = Subject.create(0);

  private readonly runwayPageText = this.runwayPage.map((i) => `RWY ${i + 1}/${maxRunways}`);

  private readonly thrustLabels = ArraySubject.create<string>(['TOGA']);

  private readonly selectedThrust = Subject.create<number | null>(null);

  private readonly noData = Subject.create(true);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subs.push(
      // The FCOM page title has no flight plan prefix
      this.props.mfd.uiService.activeUri.sub(() => this.activePageTitle.set('RECEIVED COMPANY T.O DATA'), true),
      this.runwayPageText,
    );
  }

  protected onNewData(): void {
    // No received company takeoff data
  }

  private static value(y: number, right: number, unit?: string): VNode[] {
    const nodes = [fcomRight(y, right, <span class="mfd-value bigger">---</span>)];
    if (unit) {
      nodes.push(fcomAt(y, right + 4, <span class="mfd-label-unit">{unit}</span>));
    }
    return nodes;
  }

  render(): VNode {
    const value = MfdFmsReceivedCpnyToData.value;
    return (
      <>
        {super.render()}
        <div class="mfd-page-container">
          {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 312), page container coordinates */}
          <div class="mfd-fcom-canvas">
            {fcomAt(27, 12, <span class="mfd-label">DATA FOR RWY</span>)}
            {fcomAt(27, 200, <span class="mfd-value bigger">---</span>)}
            {fcomAt(
              27,
              281,
              <DropdownMenu
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_receivedCpnyToThrust`}
                selectedIndex={this.selectedThrust}
                values={this.thrustLabels}
                freeTextAllowed={false}
                inactive={this.noData}
                containerStyle="width: 157px;"
                numberOfDigitsForInputField={7}
                alignLabels="center"
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            {fcomAt(
              32,
              455,
              <IconButton
                icon="double-left"
                disabled={this.runwayPage.map((p) => p === 0)}
                onClick={() => this.runwayPage.set(Math.max(0, this.runwayPage.get() - 1))}
                containerStyle="width: 62px; height: 60px;"
              />,
            )}
            {fcomAt(
              32,
              525,
              <IconButton
                icon="double-right"
                disabled={this.runwayPage.map((p) => p === maxRunways - 1)}
                onClick={() => this.runwayPage.set(Math.min(maxRunways - 1, this.runwayPage.get() + 1))}
                containerStyle="width: 62px; height: 60px;"
              />,
            )}
            {fcomAt(22, 617, <span class="mfd-label">{this.runwayPageText}</span>)}

            {fcomAt(100, 12, <span class="mfd-label">T.O WEIGHT</span>)}
            {value(100, 304, 'KLB')}
            {fcomRight(100, 507, <span class="mfd-label">MAG WIND</span>)}
            {value(100, 582, '°')}
            {value(100, 718, 'KT')}
            {fcomRight(153, 172, <span class="mfd-label">T.O CG</span>)}
            {value(153, 262, '%')}
            {fcomRight(153, 507, <span class="mfd-label">RWY COND</span>)}
            {fcomAt(153, 520, <span class="mfd-value bigger">---</span>)}
            {fcomRight(203, 154, <span class="mfd-label">TEMP</span>)}
            {value(203, 241, '°C')}
            {fcomRight(203, 507, <span class="mfd-label">QNH</span>)}
            {fcomAt(203, 520, <span class="mfd-value bigger">---</span>)}
            {fcomLine(236, 5, 748)}

            {fcomAt(262, 8, <span class="mfd-label">V1</span>)}
            {value(262, 137, 'KT')}
            {fcomAt(312, 8, <span class="mfd-label">VR</span>)}
            {value(312, 137, 'KT')}
            {fcomAt(361, 8, <span class="mfd-label">V2</span>)}
            {value(361, 137, 'KT')}
            <div class="mfd-received-to-separator" />
            {fcomAt(
              312,
              455,
              <RadioButtonGroup
                values={['TOGA', 'FLEX', 'DERATED']}
                valuesDisabled={Subject.create([true, true, true])}
                selectedIndex={Subject.create<number | null>(null)}
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_receivedCpnyToThrustOption`}
                additionalVerticalSpacing={15}
              />,
            )}

            {fcomAt(421, 8, <span class="mfd-label">FLAPS</span>)}
            {fcomAt(421, 95, <span class="mfd-value bigger">-</span>)}
            {fcomRight(421, 566, <span class="mfd-label">T.O SHIFT</span>)}
            {fcomAt(421, 572, <span class="mfd-value bigger">-----</span>)}
            {fcomRight(470, 566, <span class="mfd-label">T.O LIMIT</span>)}
            {fcomAt(470, 572, <span class="mfd-value bigger">-----</span>)}

            {fcomRight(531, 156, <span class="mfd-label">THR RED</span>)}
            {value(531, 272, 'FT')}
            {fcomRight(579, 156, <span class="mfd-label">ACCEL</span>)}
            {value(579, 272, 'FT')}
            {fcomRight(579, 496, <span class="mfd-label">EO ACCEL</span>)}
            {value(579, 620, 'FT')}

            <div class="mfd-received-to-noise-box" />
            {fcomAt(638, 28, <span class="mfd-label">NOISE END</span>)}
            {fcomAt(638, 165, <span class="mfd-value bigger">-----</span>)}
            {fcomAt(638, 325, <span class="mfd-label">SPD</span>)}
            {fcomAt(638, 380, <span class="mfd-value bigger">---</span>)}
            {fcomAt(696, 327, <span class="mfd-label">THR</span>)}
            {fcomAt(696, 380, <span class="mfd-value bigger">---</span>)}
            {fcomAt(
              643,
              571,
              <Button
                label="INSERT *"
                disabled={this.noData}
                onClick={() => {}}
                buttonStyle="min-width: 129px; min-height: 60px;"
              />,
            )}
            {fcomAt(
              708,
              571,
              <Button
                label="CLEAR *"
                disabled={this.noData}
                onClick={() => {}}
                buttonStyle="min-width: 129px; min-height: 60px;"
              />,
            )}
            {fcomAt(
              788,
              3,
              <Button
                label="T.O PERF"
                onClick={() => this.props.mfd.uiService.navigateTo('fms/active/perf/to')}
                buttonStyle="min-width: 152px;"
              />,
            )}
            {fcomAt(
              779,
              500,
              <Button
                label="CPNY T.O<br />REQUEST"
                onClick={() => this.props.mfd.uiService.navigateTo(`fms/active/${cpnyToRequestPage}`)}
                buttonStyle="min-width: 175px; min-height: 58px;"
              />,
            )}
          </div>
        </div>
        <Footer
          bus={this.props.bus}
          mfd={this.props.mfd}
          fmcService={this.props.fmcService}
          flightPlanInterface={this.props.fmcService.master.flightPlanInterface}
        />
      </>
    );
  }
}
