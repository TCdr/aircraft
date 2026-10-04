import './MfdFmsFplnFixInfo.scss';

import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { TopTabNavigator, TopTabNavigatorPage } from '../../../../MsfsAvionicsCommon/UiWidgets/TopTabNavigator';

import { Fix, MagVar } from '@flybywiresim/fbw-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { ObservableFlightPlanManager } from '@fmgc/flightplanning/ObservableFlightPlanManager';
import { FixInfoEntry } from '@fmgc/flightplanning/plans/FixInfo';
import { ObservableFlightPlan } from '@fmgc/flightplanning/plans/ObservableFlightPlan';
import { WaypointEntryUtils } from '@fmgc/flightplanning/WaypointEntryUtils';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';
import {
  ComponentProps,
  DisplayComponent,
  FSComponent,
  NumberFormatter,
  Subject,
  Subscribable,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';

import { hhmmFormatter } from '../../../shared/utils';
import { FixFormat, RadialFormat, RadiusFormat } from '../../common/DataEntryFormats';
import { FlightPlanFooter } from '../../common/FlightPlanFooter';
import { FmsPage } from '../../common/FmsPage';
import { FmgcFlightPhase } from '@shared/flightphase';
import { Footer } from '../../common/Footer';
import { fcomAt, fcomCentre, fcomLine, fcomTabBar } from '../../common/FcomLayout';

export class MfdFmsFplnFixInfo extends FmsPage {
  private readonly flightPlanManager = new ObservableFlightPlanManager(
    this.props.bus,
    this.props.fmcService.master!.flightPlanInterface,
  );

  private flightPlan = new ObservableFlightPlan(
    this.props.bus,
    this.props.fmcService.master!.flightPlanInterface,
    FlightPlanIndex.Active,
  );

  private readonly selectedTab = Subject.create(0);

  /** FCOM DSC-22-FMS-20-30 FIX INFO page, TIME / UTC label: flight time in preflight (no ETT modelled) */
  private readonly timeLabel = this.activeFlightPhase.map((phase) =>
    phase === FmgcFlightPhase.Preflight ? 'TIME' : 'UTC',
  );

  protected onNewData(): void {
    // noop
  }

  destroy() {
    super.destroy();
  }

  public onAfterRender(node: VNode) {
    super.onAfterRender(node);

    this.subs.push(this.flightPlanManager, this.flightPlan, this.timeLabel);
  }

  public render(): VNode {
    return (
      <>
        {super.render()}
        {/* begin page content */}
        <div class="mfd-fms-fpln-fix-info-header"></div>
        <TopTabNavigator
          pageTitles={['FIX1', 'FIX2', 'FIX3', 'FIX4']}
          selectedPageIndex={this.selectedTab}
          {...fcomTabBar}
        >
          {...([1, 2, 3, 4] as const).map((value) => (
            <TopTabNavigatorPage containerStyle="max-height: 45rem;">
              {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 139), tab page coordinates (display x - 21, y - 198) */}
              <div class="mfd-fcom-canvas mfd-fms-fpln-fix-info-canvas">
                {fcomAt(34, 22, <span class="mfd-label">REF IDENT</span>)}
                {fcomAt(
                  34,
                  172,
                  <InputField<Fix, string, false>
                    containerStyle="width: 141px;"
                    alignText="center"
                    readonlyValue={this.flightPlan.fixInfos[value].map((it) => it?.fix ?? null)}
                    onModified={async (text) => {
                      if (text === null) {
                        void this.props.fmcService.master!.flightPlanInterface.setFixInfoEntry(
                          value,
                          null,
                          this.loadedFlightPlanIndex.get(),
                        );
                        return;
                      }

                      // FCOM FIX INFO page: the reference fix is a navigation database or pilot-stored element,
                      // never created here (an unknown ident is NOT IN DATABASE, not a NEW WAYPOINT)
                      const fix = await WaypointEntryUtils.parsePlace(this.props.fmcService.master!, text);

                      if (!fix) {
                        throw new FmsError(FmsErrorType.NotInDatabase);
                      }

                      void this.props.fmcService.master!.flightPlanInterface.setFixInfoEntry(
                        value,
                        new FixInfoEntry(fix, [], []),
                        this.loadedFlightPlanIndex.get(),
                      );
                    }}
                    errorHandler={(msg) => this.props.mfd.showFmsErrorMessage(msg.type)}
                    dataEntryFormat={new FixFormat()}
                    tmpyActive={this.flightPlanManager.temporaryPlanExists}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                <div class="mfd-fms-fpln-fix-info-vline" />
                {fcomCentre(111, 358, <span class="mfd-label">F-PLN INTERCEPT</span>)}
                {fcomCentre(152, 207, <span class="mfd-label">{this.timeLabel}</span>)}
                {fcomCentre(152, 351, <span class="mfd-label">DIST</span>)}
                {fcomCentre(152, 506, <span class="mfd-label">ALT</span>)}
                {fcomLine(176, -2, 718)}
                {fcomAt(201, 20, <span class="mfd-label">RADIAL</span>)}
                {fcomAt(
                  248,
                  22,
                  <InputField<number, number, false>
                    containerStyle="width: 99px;"
                    alignText="center"
                    disabled={this.flightPlan.fixInfos[value].map((it) => it?.fix === undefined)}
                    readonlyValue={this.flightPlan.fixInfos[value].map(
                      (it) => it?.radials?.[0]?.magneticBearing ?? null,
                    )}
                    onModified={(radial) => {
                      this.props.flightPlanInterface.editFixInfoEntry(
                        value,
                        (fixInfo) => {
                          if (!fixInfo.radials) {
                            fixInfo.radials = [];
                          }

                          if (radial !== null) {
                            fixInfo.radials[0] = {
                              magneticBearing: radial,
                              trueBearing: MagVar.magneticToTrue(radial, MagVar.getForFix(fixInfo.fix) ?? 0),
                            };
                          } else {
                            delete fixInfo.radials[0];
                          }

                          return fixInfo;
                        },
                        this.loadedFlightPlanIndex.get(),
                      );
                    }}
                    errorHandler={(msg) => this.props.mfd.showFmsErrorMessage(msg.type)}
                    dataEntryFormat={new RadialFormat()}
                    tmpyActive={this.flightPlanManager.temporaryPlanExists}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomAt(
                  321,
                  22,
                  <InputField<number, number, false>
                    containerStyle="width: 99px;"
                    alignText="center"
                    disabled={this.flightPlan.fixInfos[value].map(
                      (it) => it?.fix === undefined || (it.radials?.length ?? 0) < 1,
                    )}
                    readonlyValue={this.flightPlan.fixInfos[value].map(
                      (it) => it?.radials?.[1]?.magneticBearing ?? null,
                    )}
                    onModified={(radial) => {
                      this.props.flightPlanInterface.editFixInfoEntry(
                        value,
                        (fixInfo) => {
                          if (!fixInfo.radials) {
                            fixInfo.radials = [];
                          }

                          if (radial !== null) {
                            fixInfo.radials[1] = {
                              magneticBearing: radial,
                              trueBearing: MagVar.magneticToTrue(radial, MagVar.getForFix(fixInfo.fix) ?? 0),
                            };
                          } else {
                            delete fixInfo.radials[1];
                          }

                          return fixInfo;
                        },
                        this.loadedFlightPlanIndex.get(),
                      );
                    }}
                    errorHandler={(msg) => this.props.mfd.showFmsErrorMessage(msg.type)}
                    dataEntryFormat={new RadialFormat()}
                    tmpyActive={this.flightPlanManager.temporaryPlanExists}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomAt(248, 165, <FixInfoPredictionRow tmpyActive={this.flightPlanManager.temporaryPlanExists} />)}
                {fcomAt(321, 165, <FixInfoPredictionRow tmpyActive={this.flightPlanManager.temporaryPlanExists} />)}
                {fcomLine(363, -2, 718)}
                {fcomAt(392, 20, <span class="mfd-label">RADIUS</span>)}
                {fcomAt(
                  439,
                  22,
                  <InputField<number, number, false>
                    containerStyle="width: 119px;"
                    alignText="center"
                    disabled={this.flightPlan.fixInfos[value].map((it) => it?.fix === undefined)}
                    readonlyValue={this.flightPlan.fixInfos[value].map((it) => it?.radii?.[0]?.radius ?? null)}
                    onModified={(radius) => {
                      this.props.flightPlanInterface.editFixInfoEntry(
                        value,
                        (fixInfo) => {
                          if (!fixInfo.radii) {
                            fixInfo.radii = [];
                          }

                          if (radius !== null) {
                            fixInfo.radii[0] = { radius };
                          } else {
                            delete fixInfo.radii[0];
                          }

                          return fixInfo;
                        },
                        this.loadedFlightPlanIndex.get(),
                      );
                    }}
                    errorHandler={(msg) => this.props.mfd.showFmsErrorMessage(msg.type)}
                    dataEntryFormat={new RadiusFormat()}
                    tmpyActive={this.flightPlanManager.temporaryPlanExists}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomLine(480, -2, 718)}
                {fcomAt(518, 21, <Button disabled label="ABEAM" buttonStyle="min-width: 120px;" onClick={() => {}} />)}
              </div>
            </TopTabNavigatorPage>
          ))}
        </TopTabNavigator>

        <FlightPlanFooter bus={this.props.bus} mfd={this.props.mfd} fmcService={this.props.fmcService} />

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

interface FixInfoPredictionRowProps extends ComponentProps {
  /** Whether a temporary flight plan is active */
  tmpyActive: Subscribable<boolean>;
}

class FixInfoPredictionRow extends DisplayComponent<FixInfoPredictionRowProps> {
  private readonly subscriptions: Subscription[] = [];

  private readonly buttonRef = FSComponent.createRef<Button>();

  private readonly ete = Subject.create(NaN);

  private readonly eteText = Subject.create('');

  private readonly distance = Subject.create(NaN);

  private readonly distanceFormatter = NumberFormatter.create({ precision: 1, maxDigits: 4, nanString: '----' });

  private readonly distanceText = Subject.create('');

  private readonly distanceUnitVisible = Subject.create(false);

  private readonly altitude = Subject.create(NaN);

  private readonly altitudeFormatter = NumberFormatter.create({ precision: 1, pad: 3, maxDigits: 4, nanString: '---' });

  private readonly altitudeText = Subject.create('');

  private readonly altitudeUnitVisible = Subject.create(false);

  private readonly insertAsWaypointButtonVisible = Subject.create(false);

  onAfterRender(node: VNode) {
    super.onAfterRender(node);

    this.subscriptions.push(this.ete.pipe(this.eteText, hhmmFormatter));
    this.subscriptions.push(this.distance.pipe(this.distanceText, this.distanceFormatter));
    this.subscriptions.push(this.distance.pipe(this.distanceUnitVisible, (distance) => Number.isFinite(distance)));
    this.subscriptions.push(this.altitude.pipe(this.altitudeText, this.altitudeFormatter));
    this.subscriptions.push(this.altitude.pipe(this.altitudeUnitVisible, (altitude) => Number.isFinite(altitude)));
  }

  public render(): VNode | null {
    return (
      <span
        class={{
          fr: true,
          ac: true,
          'mfd-fms-fpln-fix-info-intercept-row': true,
          tmpy: this.props.tmpyActive,
        }}
      >
        <span class="fr aic mfd-fms-fpln-fix-info-eta">
          <span class="mfd-value bigger">{this.eteText}</span>
        </span>
        <span class="fr aic mfd-fms-fpln-fix-info-dist">
          <span class="mfd-value bigger">{this.distanceText}</span>
          <span
            class="mfd-label-unit"
            style={{ visibility: this.distanceUnitVisible.map((it) => (it ? 'visible' : 'hidden')) }}
          >
            NM
          </span>
        </span>
        <span class="fr aic mfd-fms-fpln-fix-info-alt">
          <span
            class="mfd-label-unit"
            style={{ visibility: this.altitudeUnitVisible.map((it) => (it ? 'visible' : 'hidden')) }}
          >
            FL
          </span>
          <span class="mfd-value bigger">{this.altitudeText}</span>
        </span>

        <Button disabled visible={this.insertAsWaypointButtonVisible} label={'INSERT\nAS WPT*'} onClick={() => {}} />
      </span>
    );
  }
}
