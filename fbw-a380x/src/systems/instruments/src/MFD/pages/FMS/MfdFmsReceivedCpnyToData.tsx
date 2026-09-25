// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ArraySubject, FSComponent, MappedSubject, Subject, Subscribable, UnitType, VNode } from '@microsoft/msfs-sdk';
import { CompanyTakeoffDataUplink, NXDataStore } from '@flybywiresim/fbw-sdk';

import { AbstractMfdPageProps } from '../../MFD';
import { FmsPage } from '../common/FmsPage';
import { Footer } from '../common/Footer';
import { fcomAt, fcomLine, fcomRight } from '../common/FcomLayout';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { IconButton } from '../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { DropdownMenu } from '../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { RadioButtonGroup } from '../../../MsfsAvionicsCommon/UiWidgets/RadioButtonGroup';
import { cpnyToRequestPage, runwayConditions } from './MfdFmsCpnyToRequest';

import './MfdFmsReceivedCpnyToData.scss';

/**
 * RECEIVED COMPANY T.O DATA page (A380 FCOM DSC-22-FMS-20-30 P 312-320): the takeoff data received from the company
 * for up to four runways and two thrust settings per runway, with INSERT and CLEAR. The company ground station is the
 * flypad takeoff calculator.
 *
 * INSERT is only possible for the departure airport and runway of the active flight plan, with a TOW not more than
 * 2 t below or 7 t above the FMS one, and the takeoff speeds, T.O CG, wind, runway condition, QNH and temperature
 * (FCOM P 316-319). A runway that is not the active one is amber; a TOW outside the margin is amber, with
 * UPLINK/ACTIVE TOW DISAGREE when the runway is the active one.
 */
export class MfdFmsReceivedCpnyToData extends FmsPage<AbstractMfdPageProps> {
  private readonly uplinks = Subject.create<readonly CompanyTakeoffDataUplink[]>([]);

  private readonly runwayPage = Subject.create(0);

  /** The received runways, in reception order */
  private readonly runways = this.uplinks.map((list) => [...new Set(list.map((u) => u.runway))]);

  private readonly runwayPageText = MappedSubject.create(
    ([page, runways]) => `RWY ${runways.length > 0 ? page + 1 : 0}/${runways.length}`,
    this.runwayPage,
    this.runways,
  );

  /** The received data of the displayed runway, one per thrust rating */
  private readonly runwayUplinks = MappedSubject.create(
    ([list, runways, page]) => list.filter((u) => u.runway === runways[page]),
    this.uplinks,
    this.runways,
    this.runwayPage,
  );

  private readonly thrustLabels = ArraySubject.create<string>([]);

  private readonly selectedThrust = Subject.create<number | null>(null);

  private readonly current = MappedSubject.create(
    ([uplinks, thrust]) => uplinks[thrust ?? 0] ?? null,
    this.runwayUplinks,
    this.selectedThrust,
  );

  private readonly noData = this.current.map((u) => u === null);

  private readonly insertDisabled = Subject.create(true);

  private readonly runwayDisagree = Subject.create(false);

  private readonly towDisagree = Subject.create(false);

  /** UPLINK/ACTIVE TOW DISAGREE: a TOW outside the margin on the active runway */
  private readonly towDisagreeMessage = MappedSubject.create(
    ([tow, runway]) => tow && !runway,
    this.towDisagree,
    this.runwayDisagree,
  );

  private readonly weightUnit = NXDataStore.getSetting('CONFIG_USING_METRIC_UNIT').map((v) =>
    v ? UnitType.KILOGRAM : UnitType.POUND,
  );

  private readonly towText = MappedSubject.create(
    ([u, unit]) => (u ? (UnitType.KILOGRAM.convertTo(u.tow, unit) / 1000).toFixed(0) : '----'),
    this.current,
    this.weightUnit,
  );

  private readonly thrustIndex = this.current.map((u) => (u ? (u.thrust === 'FLEX' ? 1 : 0) : null));

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subs.push(
      // The FCOM page title has no flight plan prefix
      this.props.mfd.uiService.activeUri.sub(() => this.activePageTitle.set('RECEIVED COMPANY T.O DATA'), true),
      this.runways,
      this.runwayPageText,
      this.runwayUplinks,
      this.current,
      this.noData,
      this.weightUnit,
      this.towText,
      this.thrustIndex,
      this.towDisagreeMessage,
      this.props.fmcService.master.companyTakeoffData.uplinks.sub((list) => this.uplinks.set(list), true),
      this.runways.sub((runways) => {
        if (this.runwayPage.get() >= runways.length) {
          this.runwayPage.set(Math.max(0, runways.length - 1));
        }
      }, true),
      this.runwayUplinks.sub((uplinks) => {
        this.thrustLabels.set(uplinks.map((u) => (u.thrust === 'FLEX' ? `FLEX ${u.flexTemperature}` : 'TOGA')));
        this.selectedThrust.set(uplinks.length > 0 ? 0 : null);
      }, true),
      this.current.sub(() => this.onNewData(), true),
    );
  }

  protected onNewData(): void {
    const uplink = this.current?.get();
    const check = uplink ? this.props.fmcService.master.checkCompanyTakeoffData(uplink) : null;
    this.insertDisabled.set(!check?.insertable);
    this.runwayDisagree.set(check?.runwayDisagree ?? false);
    this.towDisagree.set(check?.towDisagree ?? false);
  }

  /** The FMS TOW and active runway can change while the page is shown: the checks run again at each data check */
  protected checkIfNewData(): void {
    super.checkIfNewData();
    this.onNewData();
  }

  /** An altitude in feet, with the flight level format above the transition altitude left to the PERF page */
  private static altitude(value: number | null): string | null {
    return value !== null ? (Math.round(value / 10) * 10).toFixed(0) : null;
  }

  /** A received value, dashes without data */
  private text(get: (u: CompanyTakeoffDataUplink) => string | null, dashes: string): Subscribable<string> {
    const mapped = this.current.map((u) => (u ? get(u) ?? dashes : dashes));
    this.subs.push(mapped);
    return mapped;
  }

  private value(y: number, right: number, text: Subscribable<string>, unit?: string | Subscribable<string>): VNode[] {
    const nodes = [fcomRight(y, right, <span class="mfd-value bigger">{text}</span>)];
    if (unit) {
      nodes.push(fcomAt(y, right + 4, <span class="mfd-label-unit">{unit}</span>));
    }
    return nodes;
  }

  render(): VNode {
    const speed = (get: (u: CompanyTakeoffDataUplink) => number | null) =>
      this.text((u) => get(u)?.toFixed(0) ?? null, '---');
    return (
      <>
        {super.render()}
        <div class="mfd-page-container">
          {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 312), page container coordinates */}
          <div class="mfd-fcom-canvas">
            {fcomAt(27, 12, <span class="mfd-label">DATA FOR RWY</span>)}
            {fcomAt(
              27,
              200,
              <span class={{ 'mfd-value': true, bigger: true, amber: this.runwayDisagree }}>
                {this.text((u) => u.runway, '---')}
              </span>,
            )}
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
                disabled={MappedSubject.create(([p, r]) => p >= r.length - 1, this.runwayPage, this.runways)}
                onClick={() => this.runwayPage.set(Math.min(this.runways.get().length - 1, this.runwayPage.get() + 1))}
                containerStyle="width: 62px; height: 60px;"
              />,
            )}
            {fcomAt(22, 617, <span class="mfd-label">{this.runwayPageText}</span>)}

            {fcomAt(100, 12, <span class="mfd-label">T.O WEIGHT</span>)}
            {fcomRight(
              100,
              304,
              <span class={{ 'mfd-value': true, bigger: true, amber: this.towDisagree }}>{this.towText}</span>,
            )}
            {fcomAt(
              100,
              308,
              <span class="mfd-label-unit">{this.weightUnit.map((u) => (u === UnitType.KILOGRAM ? 'T' : 'KLB'))}</span>,
            )}
            {fcomRight(100, 507, <span class="mfd-label">MAG WIND</span>)}
            {this.value(
              100,
              582,
              this.text((u) => u.windDirection.toFixed(0).padStart(3, '0'), '---'),
              '°',
            )}
            {this.value(
              100,
              718,
              this.text((u) => u.windSpeed.toFixed(0), '---'),
              'KT',
            )}
            {fcomRight(153, 172, <span class="mfd-label">T.O CG</span>)}
            {this.value(
              153,
              262,
              this.text((u) => u.cg?.toFixed(1) ?? null, '--.-'),
              '%',
            )}
            {fcomRight(153, 507, <span class="mfd-label">RWY COND</span>)}
            {fcomAt(
              153,
              520,
              <span class="mfd-value bigger">
                {this.text((u) => runwayConditions[u.runwayCondition] ?? null, '---')}
              </span>,
            )}
            {fcomRight(203, 154, <span class="mfd-label">TEMP</span>)}
            {this.value(
              203,
              241,
              // FCOM P 316: green dashes replace the temperature for a FLEX or DERATED thrust
              this.text(
                (u) => (u.thrust === 'TOGA' ? `${u.oat >= 0 ? '+' : '-'}${Math.abs(Math.round(u.oat))}` : null),
                '---',
              ),
              '°C',
            )}
            {fcomRight(203, 507, <span class="mfd-label">QNH</span>)}
            {fcomAt(203, 520, <span class="mfd-value bigger">{this.text((u) => u.qnh.toFixed(0), '---')}</span>)}
            {fcomLine(236, 5, 748)}

            {fcomAt(262, 8, <span class="mfd-label">V1</span>)}
            {this.value(
              262,
              137,
              speed((u) => u.v1),
              'KT',
            )}
            {fcomAt(312, 8, <span class="mfd-label">VR</span>)}
            {this.value(
              312,
              137,
              speed((u) => u.vr),
              'KT',
            )}
            {fcomAt(361, 8, <span class="mfd-label">V2</span>)}
            {this.value(
              361,
              137,
              speed((u) => u.v2),
              'KT',
            )}
            <div class="mfd-received-to-separator" />
            {fcomAt(
              312,
              455,
              <RadioButtonGroup
                values={['TOGA', 'FLEX', 'DERATED']}
                valuesDisabled={Subject.create([true, true, true])}
                selectedIndex={this.thrustIndex}
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_receivedCpnyToThrustOption`}
                additionalVerticalSpacing={15}
              />,
            )}

            {fcomAt(421, 8, <span class="mfd-label">FLAPS</span>)}
            {fcomAt(421, 95, <span class="mfd-value bigger">{this.text((u) => u.flaps.toFixed(0), '-')}</span>)}
            {fcomRight(421, 566, <span class="mfd-label">T.O SHIFT</span>)}
            {/* FCOM DSC-22-FMS-20-100: T.O SHIFT in metres, T.O LIMIT (the remaining runway length) in feet */}
            {this.value(
              421,
              668,
              this.text((u) => u.shift?.toFixed(0) ?? null, '----'),
              'M',
            )}
            {fcomRight(470, 566, <span class="mfd-label">T.O LIMIT</span>)}
            {this.value(
              470,
              668,
              this.text(
                (u) => (u.toLimit !== null ? UnitType.METER.convertTo(u.toLimit, UnitType.FOOT).toFixed(0) : null),
                '-----',
              ),
              'FT',
            )}

            {fcomRight(531, 156, <span class="mfd-label">THR RED</span>)}
            {this.value(
              531,
              272,
              this.text((u) => MfdFmsReceivedCpnyToData.altitude(u.thrustReductionAltitude), '-----'),
              'FT',
            )}
            <div style={{ visibility: this.towDisagreeMessage.map((v) => (v ? 'inherit' : 'hidden')) }}>
              {fcomAt(531, 330, <span class="mfd-label amber">UPLINK/ACTIVE TOW DISAGREE</span>)}
            </div>
            {fcomRight(579, 156, <span class="mfd-label">ACCEL</span>)}
            {this.value(
              579,
              272,
              this.text((u) => MfdFmsReceivedCpnyToData.altitude(u.accelerationAltitude), '-----'),
              'FT',
            )}
            {fcomRight(579, 496, <span class="mfd-label">EO ACCEL</span>)}
            {this.value(
              579,
              620,
              this.text((u) => MfdFmsReceivedCpnyToData.altitude(u.engineOutAccelerationAltitude), '-----'),
              'FT',
            )}

            <div class="mfd-received-to-noise-box" />
            {fcomAt(638, 28, <span class="mfd-label">NOISE END</span>)}
            {this.value(
              638,
              260,
              this.text((u) => (u.noise ? MfdFmsReceivedCpnyToData.altitude(u.noise.endAltitude) : null), '-----'),
              'FT',
            )}
            {fcomAt(638, 325, <span class="mfd-label">SPD</span>)}
            {this.value(
              638,
              445,
              this.text((u) => u.noise?.speed.toFixed(0) ?? null, '---'),
              'KT',
            )}
            {fcomAt(696, 327, <span class="mfd-label">THR</span>)}
            {this.value(
              696,
              445,
              this.text((u) => u.noise?.n1.toFixed(0) ?? null, '---'),
              '%',
            )}
            {fcomAt(
              643,
              571,
              <Button
                label="INSERT *"
                disabled={this.insertDisabled}
                onClick={() => {
                  const uplink = this.current.get();
                  if (uplink) {
                    this.props.fmcService.master.insertCompanyTakeoffData(uplink);
                  }
                }}
                buttonStyle="min-width: 129px; min-height: 60px;"
              />,
            )}
            {fcomAt(
              708,
              571,
              <Button
                label="CLEAR *"
                disabled={this.noData}
                onClick={() => {
                  const uplink = this.current.get();
                  if (uplink) {
                    this.props.fmcService.master.companyTakeoffData.clear(uplink);
                  }
                }}
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
