import {
  FSComponent,
  NumberFormatter,
  NumberUnitSubject,
  Subject,
  Unit,
  UnitFamily,
  UnitType,
  VNode,
} from '@microsoft/msfs-sdk';
import { LsCategory, NXDataStore, Runway } from '@flybywiresim/fbw-sdk';
import { AbstractMfdPageProps } from '../../../MFD';
import { Footer } from '../../common/Footer';
import { Button, ButtonMenuItem } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { FmsPage } from '../../common/FmsPage';
import { FlightPlanPerformanceData } from '@fmgc/flightplanning/plans/performance/FlightPlanPerformanceData';
import { AlternateFlightPlan } from '@fmgc/flightplanning/plans/AlternateFlightPlan';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';

import { fcomAt, fcomRight } from '../../common/FcomLayout';
import './MfdFmsFpln.scss';

interface MfdFmsFplnDepProps extends AbstractMfdPageProps {}

export class MfdFmsFplnDep extends FmsPage<MfdFmsFplnDepProps> {
  private readonly fromIcao = Subject.create<string>('');

  private readonly rwyIdent = Subject.create<string>('');

  private rwyLength = NumberUnitSubject.create(UnitType.METER.createNumber(NaN));

  private readonly rwyCrs = Subject.create<string>('');

  private readonly rwyEoSid = Subject.create<string>('');

  private readonly rwyFreq = Subject.create<string>('');

  /** FCOM DSC-22-FMS-20-30 DEPARTURE page: type and ident of the landing system of the selected runway */
  private readonly rwyLs = Subject.create<string>('');

  private readonly rwySid = Subject.create<string>('');

  private readonly rwyTrans = Subject.create<string>('');

  private readonly rwyOptions = Subject.create<ButtonMenuItem[]>([]);

  private readonly sidDisabled = Subject.create<boolean>(false);

  private readonly sidOptions = Subject.create<ButtonMenuItem[]>([]);

  private readonly transDisabled = Subject.create<boolean>(false);

  private readonly transOptions = Subject.create<ButtonMenuItem[]>([]);

  private readonly returnButtonDiv = FSComponent.createRef<HTMLDivElement>();

  private readonly tmpyInsertButtonDiv = FSComponent.createRef<HTMLDivElement>();

  private readonly lengthUnit = NXDataStore.getSetting('CONFIG_USING_METRIC_UNIT').map((v) =>
    v ? UnitType.METER : UnitType.FOOT,
  );

  protected onNewData(): void {
    const isAltn = this.props.fmcService.master.revisedLegIsAltn.get();
    const flightPlan =
      isAltn && this.loadedAlternateFlightPlan ? this.loadedAlternateFlightPlan : this.loadedFlightPlan;

    if (flightPlan?.originAirport) {
      this.generateRunwayOptions(flightPlan, isAltn);

      if (flightPlan.originRunway) {
        this.rwyIdent.set(flightPlan.originRunway.ident.substring(4));
        this.rwyLength.set(Number(flightPlan.originRunway.length.toFixed(0)), UnitType.METER);
        this.rwyCrs.set(flightPlan.originRunway.bearing.toFixed(0).padStart(3, '0') ?? '---');
        this.rwyEoSid.set('NONE');
        this.rwyFreq.set(flightPlan.originRunway.lsFrequencyChannel?.toFixed(2) ?? '---.--');
        this.rwyLs.set(MfdFmsFplnDep.landingSystemLabel(flightPlan.originRunway));

        if (flightPlan.availableDepartures?.length > 0) {
          const sids: ButtonMenuItem[] = [
            {
              label: 'NONE',
              action: async () => {
                await this.props.flightPlanInterface.setDepartureProcedure(
                  undefined,
                  this.loadedFlightPlanIndex.get(),
                  isAltn ?? false,
                );
                await this.props.flightPlanInterface.setDepartureEnrouteTransition(
                  undefined,
                  this.loadedFlightPlanIndex.get(),
                  isAltn ?? false,
                );
              },
            },
          ];
          const sortedDepartures = flightPlan.availableDepartures.sort((a, b) => a.ident.localeCompare(b.ident));
          sortedDepartures.forEach((dep) => {
            sids.push({
              label: dep.authorisationRequired ? `${dep.ident} (RNP)` : dep.ident,
              action: async () => {
                await this.props.flightPlanInterface.setDepartureProcedure(
                  dep.databaseId,
                  this.loadedFlightPlanIndex.get(),
                  isAltn ?? false,
                );
                await this.props.flightPlanInterface.setDepartureEnrouteTransition(
                  undefined,
                  this.loadedFlightPlanIndex.get(),
                  isAltn ?? false,
                );
              },
            });
          });
          this.sidOptions.set(sids);
          this.sidDisabled.set(false);
        }
      } else {
        this.rwyIdent.set('---');
        this.rwyLength.set(NaN);
        this.rwyCrs.set('---');
        this.rwyEoSid.set('------');
        this.rwyFreq.set('---.--');
        this.rwyLs.set('');
        this.sidDisabled.set(true);
      }

      if (flightPlan.originDeparture) {
        this.rwySid.set(flightPlan.originDeparture.ident);

        if (flightPlan.originDeparture.enrouteTransitions?.length > 0) {
          const trans: ButtonMenuItem[] = [
            {
              label: 'NONE',
              action: () =>
                this.props.flightPlanInterface.setDepartureEnrouteTransition(
                  undefined,
                  this.loadedFlightPlanIndex.get(),
                  isAltn ?? false,
                ),
            },
          ];
          flightPlan.originDeparture.enrouteTransitions.forEach((el) => {
            trans.push({
              label: el.ident,
              action: () =>
                this.props.flightPlanInterface.setDepartureEnrouteTransition(
                  el.databaseId,
                  this.loadedFlightPlanIndex.get(),
                  isAltn ?? false,
                ),
            });
          });
          this.transOptions.set(trans);
          this.transDisabled.set(false);
        }
      } else {
        if (flightPlan.availableDepartures?.length > 0) {
          this.rwySid.set('------');
        } else {
          this.rwySid.set('NONE');
        }
        this.transDisabled.set(true);
      }

      if (flightPlan.departureEnrouteTransition) {
        this.rwyTrans.set(flightPlan.departureEnrouteTransition.ident);
      } else if (flightPlan?.originDeparture?.enrouteTransitions?.length === 0) {
        this.rwyTrans.set('NONE');
      } else {
        this.rwyTrans.set('------');
      }
    } else {
      this.fromIcao.set('----');
    }
  }

  private static landingSystemLabel(runway: Runway): string {
    if (!runway.lsIdent) {
      return '';
    }
    // GLS channels are five-digit numbers, ILS / LOC frequencies are in MHz
    const channel = runway.lsFrequencyChannel ?? 0;
    const type = channel >= 20000 ? 'GLS' : runway.lsCategory === LsCategory.LocOnly ? 'LOC' : 'ILS';
    return `${type} ${runway.lsIdent}`;
  }

  private generateRunwayOptions(
    flightPlan: ReadonlyFlightPlan<FlightPlanPerformanceData> | AlternateFlightPlan<FlightPlanPerformanceData>,
    isAltn: boolean | null | undefined,
  ) {
    if (flightPlan.originAirport) {
      this.fromIcao.set(flightPlan.originAirport.ident);

      const sortedRunways = flightPlan.availableOriginRunways.sort((a, b) => a.ident.localeCompare(b.ident));
      const runways: ButtonMenuItem[] = sortedRunways.map((rw) => {
        return {
          label: `${rw.ident.substring(4).padEnd(3, '\xa0')}\xa0${UnitType.METER.createNumber(rw.length).asUnit(this.lengthUnit.get()).toFixed(0).padStart(5, '\xa0')}${this.distanceUnitFormatter(this.lengthUnit.get())} ${rw.lsIdent ? 'ILS' : ''}`,
          action: async () => {
            await this.props.flightPlanInterface.setOriginRunway(
              rw.ident,
              this.loadedFlightPlanIndex.get(),
              isAltn ?? false,
            );
            await this.props.flightPlanInterface.setDepartureProcedure(
              undefined,
              this.loadedFlightPlanIndex.get(),
              isAltn ?? false,
            );
            await this.props.flightPlanInterface.setDepartureEnrouteTransition(
              undefined,
              this.loadedFlightPlanIndex.get(),
              isAltn ?? false,
            );
          },
        };
      });
      this.rwyOptions.set(runways);
    }
  }

  private lengthNumberFormatter = NumberFormatter.create({
    nanString: '----',
    precision: 1,
  });

  private distanceUnitFormatter(unit: Unit<UnitFamily.Distance>) {
    return unit === UnitType.METER ? 'M' : 'FT';
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.tmpyActive.sub((v) => {
        if (this.returnButtonDiv.getOrDefault() && this.tmpyInsertButtonDiv.getOrDefault()) {
          this.returnButtonDiv.instance.style.visibility = v ? 'hidden' : 'visible';
          this.tmpyInsertButtonDiv.instance.style.visibility = v ? 'visible' : 'hidden';
        }
      }, true),
    );

    this.subs.push(
      this.lengthUnit.sub(() => {
        if (!this.props.fmcService.master || !this.loadedFlightPlan) {
          return;
        }
        const isAltn = this.props.fmcService.master.revisedLegIsAltn.get() ?? false;
        const flightPlan =
          isAltn && this.loadedAlternateFlightPlan ? this.loadedAlternateFlightPlan : this.loadedFlightPlan;
        if (flightPlan.destinationAirport) {
          this.generateRunwayOptions(flightPlan, isAltn);
        }
      }, true),
    );

    this.subs.push(this.lengthUnit);
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        {/* begin page content */}
        {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 118), page container coordinates */}
        <div class="mfd-page-container">
          <div class="mfd-fcom-canvas">
            <div class="mfd-fms-fpln-proc-frame" />
            {fcomAt(14, 35, <span class="mfd-label mfd-fms-fpln-proc-frame-title">SELECTED DEPARTURE</span>)}
            {fcomAt(65, 10, <span class="mfd-label">FROM</span>)}
            {fcomAt(
              65,
              88,
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.fromIcao}
              </span>,
            )}
            {fcomAt(
              65,
              190,
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.rwyLs}
              </span>,
            )}
            {fcomAt(45, 380, <span class="mfd-label">RWY</span>)}
            {fcomAt(
              85,
              380,
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.rwyIdent}
              </span>,
            )}
            {fcomAt(45, 505, <span class="mfd-label">LENGTH</span>)}
            {fcomRight(85, 620, [
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.rwyLength.asUnit(this.lengthUnit).map((v) => this.lengthNumberFormatter(v))}
              </span>,
              <span class="mfd-label-unit mfd-unit-trailing">
                {this.lengthUnit.map((v) => this.distanceUnitFormatter(v))}
              </span>,
            ])}
            {fcomAt(45, 655, <span class="mfd-label">CRS</span>)}
            {fcomAt(85, 650, [
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.rwyCrs}
              </span>,
              <span class="mfd-label-unit mfd-unit-trailing">°</span>,
            ])}
            {fcomAt(127, 10, <span class="mfd-label">EOSID</span>)}
            {fcomAt(
              164,
              10,
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.rwyEoSid}
              </span>,
            )}
            {fcomAt(127, 185, <span class="mfd-label">FREQ/CHAN</span>)}
            {fcomAt(
              164,
              190,
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.rwyFreq}
              </span>,
            )}
            {fcomAt(127, 438, <span class="mfd-label">SID</span>)}
            {fcomAt(
              164,
              438,
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.rwySid}
              </span>,
            )}
            {fcomAt(127, 609, <span class="mfd-label">TRANS</span>)}
            {fcomAt(
              164,
              609,
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.rwyTrans}
              </span>,
            )}
            {fcomAt(
              229,
              48,
              <Button
                label="RWY"
                onClick={() => {}}
                buttonStyle="min-width: 281px; min-height: 43px;"
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_f-pln-dep-rwy-btn`}
                menuItems={this.rwyOptions}
              />,
            )}
            {fcomAt(
              229,
              438,
              <Button
                label="SID"
                onClick={() => {}}
                disabled={this.sidDisabled}
                buttonStyle="min-width: 137px; min-height: 43px;"
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_f-pln-dep-sid-btn`}
                menuItems={this.sidOptions}
              />,
            )}
            {fcomAt(
              229,
              609,
              <Button
                label="TRANS"
                onClick={() => {}}
                disabled={this.transDisabled}
                buttonStyle="min-width: 136px; min-height: 43px;"
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_f-pln-dep-trans-btn`}
                menuItems={this.transOptions}
              />,
            )}
            <div ref={this.returnButtonDiv}>
              {fcomAt(
                793,
                5,
                <Button
                  label="RETURN"
                  onClick={() => {
                    this.props.fmcService.master.resetRevisedWaypoint();
                    this.props.mfd.uiService.navigateTo('back');
                  }}
                  buttonStyle="min-width: 129px;"
                />,
              )}
            </div>
            <div ref={this.tmpyInsertButtonDiv}>
              {fcomAt(
                788,
                599,
                <Button
                  label="TMPY F-PLN"
                  onClick={() => {
                    this.props.fmcService.master.resetRevisedWaypoint();
                    this.props.mfd.uiService.navigateTo(
                      `fms/${this.props.mfd.uiService.activeUri.get().category}/f-pln`,
                    );
                  }}
                  buttonStyle="color: yellow; min-width: 162px;"
                />,
              )}
            </div>
          </div>
        </div>
        {/* end page content */}
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
