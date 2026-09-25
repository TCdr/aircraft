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
import { NXDataStore } from '@flybywiresim/fbw-sdk';
import { AbstractMfdPageProps } from '../../../MFD';
import { Footer } from '../../common/Footer';
import { Button, ButtonMenuItem } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { FmsPage } from '../../common/FmsPage';
import { getApproachName } from '../../../shared/utils';
import { ApproachType } from '@flybywiresim/fbw-sdk';
import { LandingSystemUtils } from '@fmgc/flightplanning/data/landingsystem';
import { FlightPlanPerformanceData } from '@fmgc/flightplanning/plans/performance/FlightPlanPerformanceData';
import { AlternateFlightPlan } from '@fmgc/flightplanning/plans/AlternateFlightPlan';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';

import { fcomAt, fcomRight } from '../../common/FcomLayout';
import './MfdFmsFpln.scss';

const ApproachTypeOrder = Object.freeze({
  [ApproachType.Mls]: 0,
  [ApproachType.MlsTypeA]: 1,
  [ApproachType.MlsTypeBC]: 2,
  [ApproachType.Ils]: 3,
  [ApproachType.Gls]: 4,
  [ApproachType.Igs]: 5,
  [ApproachType.Loc]: 6,
  [ApproachType.LocBackcourse]: 7,
  [ApproachType.Lda]: 8,
  [ApproachType.Sdf]: 9,
  [ApproachType.Fms]: 10,
  [ApproachType.Gps]: 11,
  [ApproachType.Rnav]: 12,
  [ApproachType.VorDme]: 13,
  [ApproachType.Vortac]: 13, // VORTAC and VORDME are intentionally the same
  [ApproachType.Tacan]: 13,
  [ApproachType.Vor]: 14,
  [ApproachType.NdbDme]: 15,
  [ApproachType.Ndb]: 16,
  [ApproachType.Unknown]: 17,
});

interface MfdFmsFplnArrProps extends AbstractMfdPageProps {}

export class MfdFmsFplnArr extends FmsPage<MfdFmsFplnArrProps> {
  private readonly toIcao = Subject.create<string>('');

  private readonly rwyIdent = Subject.create<string>('');

  private rwyLength = NumberUnitSubject.create(UnitType.METER.createNumber(NaN));

  private readonly rwyCrs = Subject.create<string>('');

  private readonly approachName = Subject.create<string>('');

  private readonly approachLsFrequencyChannel = Subject.create<string>('---.--');

  private readonly approachLsIdent = Subject.create('----');

  private readonly via = Subject.create<string>('');

  private readonly star = Subject.create<string>('');

  private readonly trans = Subject.create<string>('');

  private readonly rwyOptions = Subject.create<ButtonMenuItem[]>([]);

  private readonly apprDisabled = Subject.create<boolean>(false);

  private readonly apprOptions = Subject.create<ButtonMenuItem[]>([]);

  private readonly viaDisabled = Subject.create<boolean>(false);

  private readonly viaOptions = Subject.create<ButtonMenuItem[]>([]);

  private readonly starDisabled = Subject.create<boolean>(false);

  private readonly starOptions = Subject.create<ButtonMenuItem[]>([]);

  private readonly transDisabled = Subject.create<boolean>(false);

  private readonly transOptions = Subject.create<ButtonMenuItem[]>([]);

  private readonly returnButtonDiv = FSComponent.createRef<HTMLDivElement>();

  private readonly tmpyInsertButtonDiv = FSComponent.createRef<HTMLDivElement>();

  private readonly apprButtonScrollTo = Subject.create<number>(0);

  private readonly lengthUnit = NXDataStore.getSetting('CONFIG_USING_METRIC_UNIT').map((v) =>
    v ? UnitType.METER : UnitType.FOOT,
  );

  protected onNewData(): void {
    if (!this.props.fmcService.master || !this.loadedFlightPlan) {
      return;
    }

    const isAltn = this.props.fmcService.master.revisedLegIsAltn.get() ?? false;
    const flightPlan =
      isAltn && this.loadedAlternateFlightPlan ? this.loadedAlternateFlightPlan : this.loadedFlightPlan;

    if (flightPlan.destinationAirport) {
      this.generateRunwayOptions(flightPlan, isAltn);
      if (flightPlan.destinationRunway) {
        this.rwyIdent.set(flightPlan.destinationRunway.ident.substring(4));
        this.rwyLength.set(Number(flightPlan.destinationRunway.length.toFixed(0)), UnitType.METER);
        this.rwyCrs.set(flightPlan.destinationRunway.bearing.toFixed(0).padStart(3, '0') ?? '---');
      } else {
        this.rwyIdent.set('---');
        this.rwyLength.set(NaN);
        this.rwyCrs.set('---');
      }

      if (flightPlan.availableApproaches?.length > 0) {
        // FCOM DSC-22-FMS-20-30 ARRIVAL page, APPR LIST: the approaches are sorted by runway, and the last option of
        // each runway group is the runway itself (e.g. 02C), which creates a default 5 NM leg on the runway axis.
        const appr: ButtonMenuItem[] = [];
        const pushRunwayOnly = (runwayIdent: string) =>
          appr.push({
            label: runwayIdent.substring(4),
            action: async () => {
              await this.props.flightPlanInterface.setDestinationRunway(
                runwayIdent,
                this.loadedFlightPlanIndex.get(),
                isAltn,
              );
              await this.props.flightPlanInterface.setApproach(undefined, this.loadedFlightPlanIndex.get(), isAltn);
              await this.props.flightPlanInterface.setApproachVia(undefined, this.loadedFlightPlanIndex.get(), isAltn);
            },
          });

        const sortedApproaches = flightPlan.availableApproaches
          .filter(
            (a) =>
              a.type !== ApproachType.Tacan &&
              a.type !== ApproachType.Mls &&
              a.type !== ApproachType.MlsTypeA &&
              a.type !== ApproachType.MlsTypeBC &&
              a.runwayIdent !== undefined && // circling approaches
              a.type !== ApproachType.LocBackcourse, // FIXME remove when supported
          )
          .sort(
            (a, b) =>
              a.runwayIdent?.localeCompare(b.runwayIdent ?? '') ||
              ApproachTypeOrder[a.type] - ApproachTypeOrder[b.type],
          );
        let isFirstMatch = true;
        sortedApproaches.forEach((el, idx) => {
          const previousRunway = idx > 0 ? sortedApproaches[idx - 1].runwayIdent : undefined;
          if (previousRunway !== undefined && previousRunway !== el.runwayIdent) {
            pushRunwayOnly(previousRunway);
          }
          if (isFirstMatch && el.runwayIdent === flightPlan?.destinationRunway?.ident) {
            this.apprButtonScrollTo.set(appr.length);
            isFirstMatch = false;
          }
          appr.push({
            label: getApproachName(el),
            action: async () => {
              await this.props.flightPlanInterface.setDestinationRunway(
                el.runwayIdent ?? '',
                this.loadedFlightPlanIndex.get(),
                isAltn,
              ); // Should we do this here?
              await this.props.flightPlanInterface.setApproach(el.databaseId, this.loadedFlightPlanIndex.get(), isAltn);
              await this.props.flightPlanInterface.setApproachVia(undefined, this.loadedFlightPlanIndex.get(), isAltn);
            },
          });
        });
        const lastRunway = sortedApproaches[sortedApproaches.length - 1]?.runwayIdent;
        if (lastRunway !== undefined) {
          pushRunwayOnly(lastRunway);
        }
        this.apprOptions.set(appr);
        this.apprDisabled.set(false);
      } else {
        this.apprDisabled.set(true);
      }

      if (flightPlan.approach) {
        this.approachName.set(getApproachName(flightPlan.approach, false));
        const ls = flightPlan.approach ? LandingSystemUtils.getLsFromApproach(flightPlan.approach) : undefined;
        // FIXME handle non-localizer types
        this.approachLsFrequencyChannel.set(ls?.frequency.toFixed(2) ?? '---.--');
        this.approachLsIdent.set(ls?.ident ?? '----');
        const isRnp = !!flightPlan.approach.authorisationRequired;

        if (flightPlan.availableApproachVias.length > 0) {
          const vias: ButtonMenuItem[] = [
            {
              label: 'NONE',
              action: async () => {
                await this.props.flightPlanInterface.setApproachVia(
                  undefined,
                  this.loadedFlightPlanIndex.get(),
                  isAltn,
                );
              },
            },
          ];

          // Only show VIAs matching to approach (and STAR, if available)
          flightPlan.availableApproachVias
            .filter((via) => {
              if (flightPlan.arrival?.runwayTransitions?.length && flightPlan.arrival?.runwayTransitions?.length > 0) {
                return flightPlan.arrival.runwayTransitions.some(
                  (trans) =>
                    trans.legs[trans.legs.length - 1]?.waypoint?.databaseId === via.legs[0]?.waypoint?.databaseId,
                );
              }
              return true;
            })
            .forEach((via) => {
              vias.push({
                label: isRnp ? `${via.ident} (RNP)` : via.ident,
                action: async () => {
                  await this.props.flightPlanInterface.setApproachVia(
                    via.databaseId,
                    this.loadedFlightPlanIndex.get(),
                    isAltn,
                  );
                },
              });
            });
          this.viaOptions.set(vias);
          this.viaDisabled.set(false);
        } else {
          this.viaDisabled.set(true);
        }
      } else if (flightPlan.availableApproaches?.length > 0) {
        this.approachName.set('------');
        this.approachLsFrequencyChannel.set('---.--');
        this.approachLsIdent.set('----');
        this.viaDisabled.set(true);
      } else {
        this.approachName.set('NONE');
        this.approachLsFrequencyChannel.set('---.--');
        this.approachLsIdent.set('----');
        this.viaDisabled.set(true);
      }

      if (flightPlan.approachVia) {
        this.via.set(flightPlan.approachVia.ident);
      } else if (!flightPlan.approach || flightPlan?.approach?.transitions?.length > 0) {
        this.via.set('------');
      } else {
        this.via.set('NONE');
      }

      if (flightPlan.availableArrivals?.length > 0 && flightPlan.approach) {
        const arrivals: ButtonMenuItem[] = [
          {
            label: 'NONE',
            action: async () => {
              await this.props.flightPlanInterface.setArrival(undefined, this.loadedFlightPlanIndex.get(), isAltn);
              await this.props.flightPlanInterface.setArrivalEnrouteTransition(
                undefined,
                this.loadedFlightPlanIndex.get(),
                isAltn,
              );
            },
          },
        ];

        flightPlan.availableArrivals.forEach((el) => {
          const arr: ButtonMenuItem = {
            label: el.ident,
            action: async () => {
              await this.props.flightPlanInterface.setArrival(el.databaseId, this.loadedFlightPlanIndex.get(), isAltn);
              await this.props.flightPlanInterface.setArrivalEnrouteTransition(
                undefined,
                this.loadedFlightPlanIndex.get(),
                isAltn,
              );
            },
          };

          if (el.runwayTransitions.length > 0) {
            let apprIsMatching = false;
            el.runwayTransitions.forEach((it) => {
              if (
                it.ident === flightPlan.approach?.runwayIdent ||
                (it.ident.charAt(4) === 'B' &&
                  it.ident.substring(0, 4) === flightPlan.approach?.runwayIdent?.substring(0, 4))
              ) {
                apprIsMatching = true;
              }
            });

            if (apprIsMatching) {
              arrivals.push(arr);
            }
          } else {
            // No runway transitions, push all
            arrivals.push(arr);
          }
        });
        this.starOptions.set(arrivals);
        this.starDisabled.set(false);
      } else {
        this.starDisabled.set(true);
      }

      if (flightPlan.arrival) {
        this.star.set(flightPlan.arrival.ident);

        if (flightPlan.arrival.enrouteTransitions?.length > 0) {
          const trans: ButtonMenuItem[] = [
            {
              label: 'NONE',
              action: async () => {
                await this.props.flightPlanInterface.setArrivalEnrouteTransition(
                  undefined,
                  this.loadedFlightPlanIndex.get(),
                  isAltn,
                );
              },
            },
          ];
          flightPlan.arrival.enrouteTransitions.forEach((el) => {
            trans.push({
              label: el.ident,
              action: async () => {
                await this.props.flightPlanInterface.setArrivalEnrouteTransition(
                  el.databaseId,
                  this.loadedFlightPlanIndex.get(),
                  isAltn,
                );
              },
            });
          });
          this.transOptions.set(trans);
          this.transDisabled.set(false);
        }
      } else {
        if (flightPlan.availableArrivals?.length > 0) {
          this.star.set('------');
        } else {
          this.star.set('NONE');
        }
        this.transDisabled.set(true);
      }

      if (flightPlan.arrivalEnrouteTransition) {
        this.trans.set(flightPlan.arrivalEnrouteTransition.ident);
      } else if (flightPlan?.arrival?.enrouteTransitions?.length === 0) {
        this.trans.set('NONE');
      } else {
        this.trans.set('------');
      }
    } else {
      this.toIcao.set('----');
    }
  }

  private generateRunwayOptions(
    flightPlan: ReadonlyFlightPlan<FlightPlanPerformanceData> | AlternateFlightPlan<FlightPlanPerformanceData>,
    isAltn: boolean,
  ) {
    if (flightPlan.destinationAirport) {
      this.toIcao.set(flightPlan.destinationAirport.ident);

      const runways: ButtonMenuItem[] = [];
      const sortedRunways = flightPlan.availableDestinationRunways.sort((a, b) => a.ident.localeCompare(b.ident));
      sortedRunways.forEach((rw) => {
        runways.push({
          label: `${rw.ident.substring(4).padEnd(3, ' ')} ${UnitType.METER.createNumber(rw.length).asUnit(this.lengthUnit.get()).toFixed(0).padStart(5, ' ')}${this.distanceUnitFormatter(this.lengthUnit.get())}`,
          action: async () => {
            await this.props.flightPlanInterface.setDestinationRunway(
              rw.ident,
              this.loadedFlightPlanIndex.get(),
              isAltn,
            );
            await this.props.flightPlanInterface.setApproach(undefined, this.loadedFlightPlanIndex.get(), isAltn);
            await this.props.flightPlanInterface.setApproachVia(undefined, this.loadedFlightPlanIndex.get(), isAltn);
          },
        });
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
        {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 13), page container coordinates */}
        <div class="mfd-page-container">
          <div class="mfd-fcom-canvas">
            <div class="mfd-fms-fpln-proc-frame" />
            {fcomAt(14, 35, <span class="mfd-label mfd-fms-fpln-proc-frame-title">SELECTED ARRIVAL</span>)}
            {fcomAt(65, 18, <span class="mfd-label">TO</span>)}
            {fcomAt(
              65,
              63,
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.toIcao}
              </span>,
            )}
            {fcomAt(45, 192, <span class="mfd-label">LS</span>)}
            {fcomAt(
              85,
              192,
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.approachLsIdent}
              </span>,
            )}
            {fcomAt(45, 362, <span class="mfd-label">RWY</span>)}
            {fcomAt(
              85,
              362,
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.rwyIdent}
              </span>,
            )}
            {fcomAt(45, 480, <span class="mfd-label">LENGTH</span>)}
            {fcomRight(85, 620, [
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.rwyLength.asUnit(this.lengthUnit).map((v) => this.lengthNumberFormatter(v))}
              </span>,
              <span class="mfd-label-unit mfd-unit-trailing">
                {this.lengthUnit.map((v) => this.distanceUnitFormatter(v))}
              </span>,
            ])}
            {fcomAt(45, 628, <span class="mfd-label">CRS</span>)}
            {fcomAt(85, 624, [
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.rwyCrs}
              </span>,
              <span class="mfd-label-unit mfd-unit-trailing">°</span>,
            ])}
            {fcomAt(127, 18, <span class="mfd-label">APPR</span>)}
            {fcomAt(
              164,
              18,
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.approachName}
              </span>,
            )}
            {fcomAt(127, 192, <span class="mfd-label">FREQ/CHAN</span>)}
            {fcomAt(
              164,
              192,
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.approachLsFrequencyChannel}
              </span>,
            )}
            {fcomAt(127, 362, <span class="mfd-label">VIA</span>)}
            {fcomAt(
              164,
              362,
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.via}
              </span>,
            )}
            {fcomAt(127, 496, <span class="mfd-label">STAR</span>)}
            {fcomAt(
              164,
              496,
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.star}
              </span>,
            )}
            {fcomAt(127, 630, <span class="mfd-label">TRANS</span>)}
            {fcomAt(
              164,
              630,
              <span class={{ 'mfd-value': true, bigger: true, tmpy: this.tmpyActive, sec: this.secActive }}>
                {this.trans}
              </span>,
            )}
            {fcomAt(
              229,
              10,
              <Button
                label="RWY"
                onClick={() => {}}
                buttonStyle="width: 145px; height: 25px;"
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_f-pln-arr-rwy-btn`}
                menuItems={this.rwyOptions}
              />,
            )}
            {fcomAt(
              229,
              193,
              <Button
                label="APPR"
                onClick={() => {}}
                disabled={this.apprDisabled}
                buttonStyle="width: 130px; height: 25px;"
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_f-pln-arr-appr-btn`}
                menuItems={this.apprOptions}
                scrollToMenuItem={this.apprButtonScrollTo}
              />,
            )}
            {fcomAt(
              229,
              360,
              <Button
                label="VIA"
                onClick={() => {}}
                disabled={this.viaDisabled}
                buttonStyle="width: 97px; height: 25px;"
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_f-pln-arr-via-btn`}
                menuItems={this.viaOptions}
              />,
            )}
            {fcomAt(
              229,
              495,
              <Button
                label="STAR"
                onClick={() => {}}
                disabled={this.starDisabled}
                buttonStyle="width: 97px; height: 25px;"
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_f-pln-arr-star-btn`}
                menuItems={this.starOptions}
              />,
            )}
            {fcomAt(
              229,
              630,
              <Button
                label="TRANS"
                onClick={() => {}}
                disabled={this.transDisabled}
                buttonStyle="width: 97px; height: 25px;"
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_f-pln-arr-trans-btn`}
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
                  buttonStyle="width: 101px;"
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
                  buttonStyle="color: yellow; width: 134px;"
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
