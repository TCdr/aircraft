// Copyright (c) 2024-2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0
import { FSComponent, MappedSubject, MappedSubscribable, Subject, VNode } from '@microsoft/msfs-sdk';

import { AbstractMfdPageProps } from '../../MFD';
import { Footer } from '../common/Footer';
import { InputField } from '../../../MsfsAvionicsCommon/UiWidgets/InputField';
import {
  AirportFormat,
  CompanyRouteFormat,
  CostIndexFormat,
  CrzTempFormat,
  FlightLevelFormat,
  LongAlphanumericFormat,
  TripWindFormat,
  TropoFormat,
} from '../common/DataEntryFormats';
import { Button, ButtonMenuItem } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { maxCertifiedAlt } from '@shared/PerformanceConstants';
import { FmsPage } from '../common/FmsPage';
import { fcomAt, fcomLine, fcomRight } from '../common/FcomLayout';
import { CpnyWindButton, cpnyWindRequestPage } from '../../shared/CpnyWindButtonUtils';
import { CompanyTakeoffDataButton } from './MfdFmsCpnyToRequest';
import { FmgcFlightPhase } from '@shared/flightphase';
import { A380AltitudeUtils } from '@shared/OperatingAltitudes';
import { AtsuStatusCodes } from '@datalink/common';
import { FmsRouterMessages } from '@datalink/router';
import {
  cpnyFplnRequestPage,
  routeSelectionPage,
  secIndexPageUri,
  showReturnButtonUriExtra,
  windPage,
} from '../../shared/utils';
import { alternateRouteSelectionUriExtra } from './F-PLN/MfdFmsFplnRouteSelection';
import { newRouteFromActiveUriExtra } from './DATA/MfdFmsDataRoute';
import { routeFromCoRouteDto } from '../../FMC/StoredRouteUtils';
import { StoredRoute } from '../../FMC/PilotStoredElements';
import { NXSystemMessages } from '../../shared/NXSystemMessages';
import { CompanyRoute } from '@flybywiresim/fbw-sdk';

import './MfdFmsInit.scss';
import { FlightPlanChangeNotifier } from '@fmgc/flightplanning/sync/FlightPlanChangeNotifier';
import { CostIndexMode } from '@fmgc/flightplanning/plans/performance/FlightPlanPerformanceData';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { CpnyFplnButtonUtils } from '../../shared/CpnyFplnButtonUtils';
import { isLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';

interface MfdFmsInitProps extends AbstractMfdPageProps {}

export class MfdFmsInit extends FmsPage<MfdFmsInitProps> {
  /** FIX ME WE shouldn't require this but since we completely delete flightplan from memory, it is possible that we are on this page on one MFD and delete the SEC on the other, meaning, we end up with no flightplan.
   * As such, disable callsign and tropo if that's the case.
   */
  private readonly noFlightPlan = Subject.create(false);

  private readonly flightPlanChangeNotifier = new FlightPlanChangeNotifier(this.props.bus);

  private readonly cpnyWindButton = new CpnyWindButton(this.props.fmcService.master, this.loadedFlightPlanIndex);

  private readonly cpnyFplnButtonLabel = CpnyFplnButtonUtils.cpnyFplnButtonLabel(this.props.fmcService.master);

  private readonly cpnyFplnButtonMenuItems: MappedSubscribable<ButtonMenuItem[]> =
    CpnyFplnButtonUtils.cpnyFplnButtonMenuItems(this.props.fmcService.master, FlightPlanIndex.Active);

  private readonly cpnyFplnButtonDisabled = CpnyFplnButtonUtils.cpnyFplnButtonDisabled(
    this.props.fmcService.master,
    FlightPlanIndex.Active,
  );

  private readonly mandatoryAndActiveFpln = this.loadedFlightPlanIndex.map(
    (it) => it === FlightPlanIndex.Active || it === FlightPlanIndex.Temporary,
  );

  private readonly visibilityOnlyInActive = this.loadedFlightPlanIndex.map((it) =>
    it === FlightPlanIndex.Active || it === FlightPlanIndex.Temporary ? 'inherit' : 'hidden',
  );

  private readonly visibleInSec = this.loadedFlightPlanIndex.map((it) =>
    it !== FlightPlanIndex.Active && it !== FlightPlanIndex.Temporary ? 'inherit' : 'hidden',
  );

  private readonly fromIcao = Subject.create<string | null>(null);

  private readonly toIcao = Subject.create<string | null>(null);

  private readonly cityPairDisabled = MappedSubject.create(
    ([fp, tmpy, fpIndex]) =>
      (fp > FmgcFlightPhase.Preflight && this.props.flightPlanInterface.get(fpIndex).isActiveOrCopiedFromActive()) ||
      tmpy,
    this.activeFlightPhase,
    this.tmpyActive,
    this.loadedFlightPlanIndex,
  );

  private readonly altnIcao = Subject.create<string | null>(null);

  private readonly altnDisabled = MappedSubject.create(
    ([toIcao, fromIcao, tmpy]) => tmpy || !toIcao || !fromIcao,
    this.fromIcao,
    this.toIcao,
    this.tmpyActive,
  );

  private readonly cpnyRte = Subject.create<string | null>(null);

  /**
   * FCOM DSC-22-FMS-20-30 INIT page, COMPANY ROUTE ENTRY FIELD: mandatory when no city pair is defined (the route
   * defines it); not enterable outside PREFLIGHT (ACTIVE / INIT) or when a temporary flight plan is pending.
   */
  private readonly cpnyRteDisabled = MappedSubject.create(
    ([tmpy, phase, fpIndex]) =>
      tmpy ||
      (phase > FmgcFlightPhase.Preflight && this.props.flightPlanInterface.get(fpIndex).isActiveOrCopiedFromActive()),
    this.tmpyActive,
    this.activeFlightPhase,
    this.loadedFlightPlanIndex,
  );

  /** The ROUTE SELECTION page lists the company routes of the FROM / TO city pair */
  /**
   * FCOM DSC-22-FMS-20-30 P 199-200: the (ALTN) RTE SEL buttons always display the ROUTE SELECTION page; only the route
   * entries are limited (company route: PREFLIGHT phase, alternate route: a primary destination, both: no temporary
   * flight plan). Without a city pair the page shows no route.
   */
  private readonly rteSelDisabled = this.cpnyRteDisabled.map((v) => v);

  private readonly altnRteSelDisabled = this.tmpyActive.map((v) => v);

  private readonly altnRte = Subject.create<string | null>(null); // FIXME not found

  private readonly crzFl = Subject.create<number | null>(null);

  private readonly crzFlIsMandatory = Subject.create(true);

  private readonly costIndex = Subject.create<number | null>(null);

  private readonly costIndexModeDisabled = MappedSubject.create(
    ([toIcao, fromIcao, flightPhase, fpIndex]) =>
      !toIcao ||
      !fromIcao ||
      (flightPhase >= FmgcFlightPhase.Descent &&
        this.props.flightPlanInterface.get(fpIndex).isActiveOrCopiedFromActive()),
    this.fromIcao,
    this.toIcao,
    this.activeFlightPhase,
    this.loadedFlightPlanIndex,
  );

  private readonly costIndexDisabled = this.costIndexModeDisabled;

  private readonly tropopause = Subject.create<number | null>(null);
  private readonly tropopauseIsPilotEntered = Subject.create<boolean>(false);

  private readonly tripWind = Subject.create<number | null>(null);

  private readonly windEntriesExist = Subject.create(false);

  /**
   * FCOM DSC-22-FMS-20-30 INIT page, TRIP WIND ENTRY FIELD: not enterable without a city pair; disabled with dashes
   * once a climb, cruise or descent wind is entered on the WIND page.
   */
  private readonly tripWindDisabled = MappedSubject.create(
    ([toIcao, fromIcao, windEntriesExist]) => !toIcao || !fromIcao || windEntriesExist,
    this.fromIcao,
    this.toIcao,
    this.windEntriesExist,
  );

  /** FCOM DSC-22-FMS-20-30 INIT page, TRIP WIND: the default value is HD000 */
  private readonly tripWindDisplay = MappedSubject.create(
    ([tripWind, windEntriesExist, toIcao, fromIcao]) =>
      windEntriesExist || !toIcao || !fromIcao ? null : tripWind ?? 0,
    this.tripWind,
    this.windEntriesExist,
    this.toIcao,
    this.fromIcao,
  );

  private readonly tripWindIsPilotEntered = this.tripWind.map((it) => it !== null);

  private readonly cpnyRteMandatory = MappedSubject.create(
    ([toIcao, fromIcao, mandatoryAndActive]) => (!toIcao || !fromIcao) && mandatoryAndActive,
    this.fromIcao,
    this.toIcao,
    this.mandatoryAndActiveFpln,
  );

  /** FCOM DSC-22-FMS-20-30 INIT page: DEPARTURE is selectable only in PREFLIGHT, when an origin airport exists */
  private readonly departureButtonDisabled = MappedSubject.create(
    ([fromIcao, phase]) => !fromIcao || phase !== FmgcFlightPhase.Preflight,
    this.fromIcao,
    this.activeFlightPhase,
  );

  private readonly cruiseTemperature = Subject.create<number | null>(null);
  private readonly cruiseTemperatureIsPilotEntered = Subject.create<boolean>(false);

  private readonly crzTempDisabled = this.crzFl.map((it) => it === null);

  private readonly flightNumber = Subject.create<string | null>(null);

  /** FIXME workaround as newCity pair deletes the flightplan and we don't want to show ---- on the FROM/TO pair */
  private creationInProgress = false;

  /** CPNY T.O REQUEST, RECEIVED CPNY T.O once company takeoff data is received */
  private readonly cpnyToButton = new CompanyTakeoffDataButton(this.props.fmcService.master, 'CPNY T.O.\nREQUEST');

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subs.push(this.cpnyToButton.subscription, this.cpnyToButton.label);

    this.subs.push(
      this.props.bus
        .getSubscriber<FmsRouterMessages>()
        .on('routerManagementResponse')
        .handle((data) => {
          this.routerResponseCallbacks.every((callback, index) => {
            if (callback(data.status, data.requestId)) {
              this.routerResponseCallbacks.splice(index, 1);
              return false;
            }
            return true;
          });
        }),
    );

    if (this.props.fmcService.master) {
      this.subs.push(
        this.flightNumber.sub((c) => {
          if (this.loadedFlightPlanIndex.get() === FlightPlanIndex.Active) {
            if (c) {
              this.connectToNetworks(c);
              this.props.fmcService.master.updateFlightNumber(c, this.loadedFlightPlanIndex.get(), () => {});
            } else {
              this.disconnectFromNetworks();
            }
            this.props.fmcService.master.acInterface.updateFmsData();
          }
        }),
      );
    }

    this.subs.push(
      this.cpnyFplnButtonMenuItems,
      this.mandatoryAndActiveFpln,
      this.visibilityOnlyInActive,
      this.visibleInSec,
      this.cityPairDisabled,
      this.altnDisabled,
      this.costIndexDisabled,
      this.tripWindDisabled,
      this.cpnyRteMandatory,
      this.cpnyRteDisabled,
      this.rteSelDisabled,
      this.tripWindDisplay,
      this.tripWindIsPilotEntered,
      this.altnRteSelDisabled,
      this.departureButtonDisabled,
      this.costIndexModeDisabled,
    );
  }
  private invalidateDataFields() {
    if (!this.creationInProgress) {
      this.toIcao.set(null);
      this.fromIcao.set(null);
    }
    this.altnIcao.set(null);
    this.flightNumber.set(null);
    this.cpnyRte.set(null);
    this.altnRte.set(null);
    this.tropopause.set(null);
    this.tropopauseIsPilotEntered.set(false);
    this.tripWind.set(null);
    this.crzFl.set(null);
    this.cruiseTemperature.set(null);
    this.cruiseTemperatureIsPilotEntered.set(false);
    this.costIndex.set(null);
  }

  private loadFlightPlanPerformanceData(): void {
    if (!this.creationInProgress) {
      const fp = this.loadedFlightPlan;

      const fpIndex = this.loadedFlightPlanIndex.get();
      const pd = fp?.performanceData;

      this.tropopause.set(pd?.tropopause.get() ?? null);
      this.tropopauseIsPilotEntered.set(pd?.tropopauseIsPilotEntered.get() ?? false);
      this.flightNumber.set(
        this.loadedFlightPlan !== null ? this.props.flightPlanInterface.get(fpIndex).getFlightNumber().get() : null,
      );
      this.tripWind.set(pd?.pilotTripWind.get() ?? null);
      this.cruiseTemperature.set(pd?.cruiseTemperature.get() ?? null);
      this.cruiseTemperatureIsPilotEntered.set(pd?.isCruiseTemperaturePilotEntered.get() ?? false);
      this.crzFl.set(pd?.cruiseFlightLevel.get() ?? null);
      this.costIndex.set(pd?.costIndex.get() ?? null);
    }
  }

  protected onNewData() {
    if (!this.props.fmcService.master || !this.loadedFlightPlan) {
      return;
    }

    this.loadFlightPlanPerformanceData();

    // Update internal subjects for display purposes or input fields
    if (this.loadedFlightPlan.originAirport) {
      this.fromIcao.set(this.loadedFlightPlan.originAirport.ident);
    }

    if (this.loadedFlightPlan.destinationAirport) {
      this.toIcao.set(this.loadedFlightPlan.destinationAirport.ident);
    }

    if (this.loadedAlternateFlightPlan?.destinationAirport) {
      this.altnIcao.set(this.loadedAlternateFlightPlan.destinationAirport.ident);
    } else {
      this.altnIcao.set(this.loadedFlightPlan.originAirport && this.loadedFlightPlan.destinationAirport ? 'NONE' : '');
    }

    const pd = this.loadedFlightPlan.performanceData;
    this.windEntriesExist.set(
      pd.climbWindEntries.get().length > 0 ||
        pd.descentWindEntries.get().length > 0 ||
        this.loadedFlightPlan.allLegs.some((el) => isLeg(el) && el.cruiseWindEntries.length > 0),
    );

    const fpIndex = this.loadedFlightPlanIndex.get();
    this.crzFlIsMandatory.set(
      this.props.fmcService.master.fmgc.getFlightPhase() < FmgcFlightPhase.Descent &&
        (fpIndex === FlightPlanIndex.Active || fpIndex === FlightPlanIndex.Temporary),
    );
    const cruiseLevel = this.loadedFlightPlan.performanceData.cruiseFlightLevel.get();
    const cruiseTemp = this.loadedFlightPlan.performanceData.cruiseTemperature.get();

    if (cruiseLevel && (!cruiseTemp || cruiseTemp - A380AltitudeUtils.getIsaTemp(cruiseLevel * 100) > 0.5)) {
      this.props.flightPlanInterface.setPerformanceData(
        'cruiseTemperatureIsaTemp',
        A380AltitudeUtils.getIsaTemp(cruiseLevel * 100),
        fpIndex,
      );
    }

    // Set some empty fields with pre-defined values
    if (this.fromIcao.get() && this.toIcao.get()) {
      this.cpnyRte.set(this.props.fmcService.master.fmgc.data.companyRouteIdent(fpIndex).get() ?? 'NONE');

      if (!this.altnRte.get()) {
        this.altnRte.set('NONE');
      }
    }
  }

  protected onFlightPlanChanged(): void {
    super.onFlightPlanChanged();

    const fpIndex = this.loadedFlightPlanIndex.get();
    const hasfp = this.loadedFlightPlan !== null && this.props.flightPlanInterface.has(fpIndex);
    this.noFlightPlan.set(!hasfp);
    if (hasfp) {
      this.loadFlightPlanPerformanceData();
    } else {
      this.invalidateDataFields();
    }
  }

  private async cityPairModified() {
    const fromIcao = this.fromIcao.get();
    const toIcao = this.toIcao.get();
    const cityPairIsDifferent =
      fromIcao !== this.loadedFlightPlan?.originAirport?.ident ||
      toIcao !== this.loadedFlightPlan?.destinationAirport?.ident;
    if (fromIcao && toIcao && cityPairIsDifferent) {
      this.creationInProgress = true;
      this.props.fmcService.master.fmgc.data.companyRouteIdent(this.loadedFlightPlanIndex.get()).set(null);
      // We can't use this.loadedFlightPlanIndex here because the flight plan might not exist yet
      await this.props.flightPlanInterface.newCityPair(
        fromIcao,
        toIcao,
        this.altnIcao.get() ?? undefined,
        this.loadedFlightPlanIndex.get(),
      );

      if (this.loadedFlightPlanIndex.get() === FlightPlanIndex.Active) {
        this.props.fmcService.master.acInterface.updateFmsData();
        // Update once as the new flight plan has been created as we need these for MIN DEST EFOB in active.
        this.props.fmcService.master.acInterface.calculateFinalAndAlternateFuel(this.loadedFlightPlanIndex.get());
      }
      this.creationInProgress = false;
    }
  }

  /**
   * FCOM DSC-22-FMS-20-30 INIT page, COMPANY ROUTE ENTRY FIELD: a manual entry inserts the company route (pilot
   * stored, or navigation database via SimBridge), which re-initializes the flight plan and sets the FROM / TO city
   * pair; NOT IN DATABASE otherwise.
   */
  private async onCompanyRouteEntered(ident: string | null): Promise<boolean> {
    const fmc = this.props.fmcService.master;
    const fromIcao = this.fromIcao.get();
    const toIcao = this.toIcao.get();
    if (ident === null || ident === 'NONE') {
      return false;
    }

    let route: StoredRoute | undefined =
      (fromIcao && toIcao
        ? fmc.pilotStoredElements.routesForCityPair(fromIcao, toIcao).find((r) => r.ident === ident)
        : undefined) ?? fmc.pilotStoredElements.findRoute(ident);
    if (!route) {
      try {
        const result = await CompanyRoute.getCoRoute(ident);
        if (result.success && result.data) {
          route = routeFromCoRouteDto(result.data);
        }
      } catch (e) {
        console.warn('[FMS] Company route not available:', e);
      }
    }
    if (!route) {
      fmc.addMessageToQueue(NXSystemMessages.notInDatabase, undefined, undefined);
      return false;
    }

    await fmc.insertCompanyRoute(route, this.loadedFlightPlanIndex.get());
    return true;
  }

  private requestId = 0;

  private routerResponseCallbacks: ((code: AtsuStatusCodes, requestId: number) => boolean)[] = [];

  private async connectToNetworks(callsign: string): Promise<AtsuStatusCodes> {
    const publisher = this.props.bus.getPublisher<FmsRouterMessages>();
    return new Promise<AtsuStatusCodes>((resolve, _reject) => {
      const disconnectRequestId = this.requestId++;
      publisher.pub('routerDisconnect', disconnectRequestId, true, false);
      this.routerResponseCallbacks.push((_code: AtsuStatusCodes, id: number) => {
        if (id === disconnectRequestId) {
          const connectRequestId = this.requestId++;
          publisher.pub('routerConnect', { callsign, requestId: connectRequestId }, true, false);
          this.routerResponseCallbacks.push((code: AtsuStatusCodes, id: number) => {
            if (id === connectRequestId) resolve(code);
            return id === connectRequestId;
          });
        }
        return id === disconnectRequestId;
      });
    });
  }

  private async disconnectFromNetworks(): Promise<AtsuStatusCodes> {
    const publisher = this.props.bus.getPublisher<FmsRouterMessages>();
    return new Promise<AtsuStatusCodes>((resolve, _reject) => {
      const disconnectRequestId = this.requestId++;
      publisher.pub('routerDisconnect', disconnectRequestId, true, false);
      this.routerResponseCallbacks.push((code: AtsuStatusCodes, id: number) => {
        if (id === disconnectRequestId) resolve(code);
        return id === disconnectRequestId;
      });
    });
  }

  public destroy(): void {
    this.cpnyWindButton.destroy();
    this.flightPlanChangeNotifier.destroy();

    super.destroy();
  }

  render(): VNode {
    return (
      this.props.fmcService.master && (
        <>
          {super.render()}
          {/* begin page content */}
          <div class="mfd-page-container">
            {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 191), page container coordinates */}
            <div class="mfd-fcom-canvas">
              {fcomRight(34, 137, <span class="mfd-label">FLT NBR</span>)}
              {fcomAt(
                34,
                147,
                <InputField<string, string, false>
                  dataEntryFormat={new LongAlphanumericFormat()}
                  disabled={this.noFlightPlan}
                  dataHandlerDuringValidation={async (v) => {
                    this.props.flightPlanInterface.get(this.loadedFlightPlanIndex.get()).getFlightNumber().set(v);
                  }}
                  mandatory={this.mandatoryAndActiveFpln}
                  readonlyValue={this.flightNumber}
                  containerStyle="width: 209px;"
                  alignText="center"
                  canBeCleared={Subject.create(false)}
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomAt(
                34,
                369,
                <Button
                  label="ACFT STATUS"
                  onClick={() => this.props.mfd.uiService.navigateTo('fms/data/status/acft-status/withReturn')}
                  buttonStyle="min-width: 199px;"
                />,
              )}
              {fcomAt(
                34,
                589,
                <Button
                  label={this.cpnyFplnButtonLabel}
                  disabled={this.cpnyFplnButtonDisabled}
                  onClick={() =>
                    this.props.fmcService.master.fmgc.data.cpnyFplnAvailable.get()
                      ? {}
                      : this.props.mfd.uiService.navigateTo(
                          `fms/${this.props.mfd.uiService.activeUri.get().category}/${cpnyFplnRequestPage}`,
                        )
                  }
                  buttonStyle="min-width: 174px; min-height: 60px;"
                  idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_fplnreq`}
                  menuItems={this.cpnyFplnButtonMenuItems}
                  showArrow={false}
                />,
              )}
              {fcomRight(98, 137, <span class="mfd-label">FROM</span>)}
              {fcomAt(
                98,
                147,
                <InputField<string>
                  containerStyle="width: 88px;"
                  dataEntryFormat={new AirportFormat()}
                  dataHandlerDuringValidation={async (v) => {
                    this.fromIcao.set(v);
                    this.cityPairModified();
                  }}
                  mandatory={this.mandatoryAndActiveFpln}
                  canBeCleared={Subject.create(false)}
                  value={this.fromIcao}
                  alignText="center"
                  disabled={this.cityPairDisabled}
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomRight(98, 280, <span class="mfd-label">TO</span>)}
              {fcomAt(
                98,
                291,
                <InputField<string>
                  containerStyle="width: 89px;"
                  dataEntryFormat={new AirportFormat()}
                  dataHandlerDuringValidation={async (v) => {
                    this.toIcao.set(v);
                    this.cityPairModified();
                  }}
                  mandatory={this.mandatoryAndActiveFpln}
                  canBeCleared={Subject.create(false)}
                  value={this.toIcao}
                  alignText="center"
                  disabled={this.cityPairDisabled}
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomRight(98, 462, <span class="mfd-label">ALTN</span>)}
              {fcomAt(
                98,
                471,
                <InputField<string>
                  containerStyle="width: 88px;"
                  dataEntryFormat={new AirportFormat()}
                  dataHandlerDuringValidation={async (v) => {
                    this.altnIcao.set(v === 'NONE' ? null : v);
                    if (v) {
                      await this.props.flightPlanInterface.setAlternate(
                        v === 'NONE' ? undefined : v,
                        this.loadedFlightPlanIndex.get(),
                      );
                      this.props.fmcService.master.acInterface.updateFmsData();
                    }
                  }}
                  mandatory={this.mandatoryAndActiveFpln}
                  disabled={this.altnDisabled}
                  value={this.altnIcao}
                  alignText="center"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomRight(165, 137, <span class="mfd-label">CPNY RTE</span>)}
              {fcomAt(
                165,
                147,
                <InputField<string>
                  dataEntryFormat={new CompanyRouteFormat()}
                  mandatory={this.cpnyRteMandatory}
                  canBeCleared={Subject.create(false)}
                  value={this.cpnyRte}
                  dataHandlerDuringValidation={(v) => this.onCompanyRouteEntered(v)}
                  containerStyle="width: 209px;"
                  alignText="center"
                  disabled={this.cpnyRteDisabled}
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomAt(
                165,
                369,
                <Button
                  disabled={this.rteSelDisabled}
                  label="RTE SEL"
                  onClick={() =>
                    this.props.mfd.uiService.navigateTo(
                      `fms/${this.props.mfd.uiService.activeUri.get().category}/${routeSelectionPage}/${showReturnButtonUriExtra}`,
                    )
                  }
                  buttonStyle="min-width: 199px;"
                />,
              )}
              {fcomRight(215, 137, <span class="mfd-label">ALTN RTE</span>)}
              {fcomAt(
                215,
                147,
                <InputField<string>
                  dataEntryFormat={new LongAlphanumericFormat()}
                  disabled={Subject.create(true)} // ALTN RTE: alternate company routes are not supported by the FMS yet
                  canBeCleared={Subject.create(false)}
                  value={this.altnRte}
                  containerStyle="width: 209px;"
                  alignText="center"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomAt(
                215,
                369,
                <Button
                  label="ALTN RTE SEL"
                  disabled={this.altnRteSelDisabled}
                  onClick={() =>
                    this.props.mfd.uiService.navigateTo(
                      `fms/${this.props.mfd.uiService.activeUri.get().category}/${routeSelectionPage}/${alternateRouteSelectionUriExtra}/${showReturnButtonUriExtra}`,
                    )
                  }
                  buttonStyle="min-width: 199px;"
                />,
              )}
              {fcomLine(258, 29, 737)}
              {fcomRight(294, 137, <span class="mfd-label">CRZ FL</span>)}
              {fcomAt(
                294,
                147,
                <InputField<number>
                  containerStyle="width: 108px;"
                  dataEntryFormat={new FlightLevelFormat(Subject.create(0), Subject.create(maxCertifiedAlt / 100))}
                  dataHandlerDuringValidation={async (v) =>
                    v ? this.props.fmcService.master.trySetCruiseFl(v, this.loadedFlightPlanIndex.get()) : false
                  }
                  mandatory={this.crzFlIsMandatory}
                  disabled={this.altnDisabled}
                  canBeCleared={Subject.create(false)}
                  value={this.crzFl}
                  class="mfd-init-crz-fl"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomRight(294, 412, <span class="mfd-label">CRZ TEMP</span>)}
              {fcomAt(
                294,
                420,
                <InputField<number, number, false>
                  dataEntryFormat={new CrzTempFormat()}
                  dataHandlerDuringValidation={async (v) => {
                    this.props.flightPlanInterface.setPerformanceData(
                      'cruiseTemperaturePilotEntry',
                      v,
                      this.loadedFlightPlanIndex.get(),
                    );
                  }}
                  enteredByPilot={this.cruiseTemperatureIsPilotEntered}
                  disabled={this.crzTempDisabled}
                  readonlyValue={this.cruiseTemperature}
                  containerStyle="width: 110px;"
                  alignText="center"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomRight(344, 137, <span class="mfd-label">CI</span>)}
              {fcomAt(
                344,
                147,
                <InputField<number>
                  dataEntryFormat={new CostIndexFormat()}
                  dataHandlerDuringValidation={async (v) => {
                    this.props.flightPlanInterface?.setPerformanceData(
                      'costIndex',
                      v,
                      this.loadedFlightPlanIndex.get(),
                    );
                    this.props.flightPlanInterface?.setPerformanceData(
                      'costIndexMode',
                      CostIndexMode.ECON,
                      this.loadedFlightPlanIndex.get(),
                    );
                  }}
                  mandatory={this.mandatoryAndActiveFpln}
                  disabled={this.costIndexDisabled}
                  value={this.costIndex}
                  containerStyle="width: 68px;"
                  alignText="center"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomRight(344, 412, <span class="mfd-label">TROPO</span>)}
              {fcomAt(
                344,
                420,
                <InputField<number, number, false>
                  containerStyle="width: 140px;"
                  dataEntryFormat={new TropoFormat()}
                  disabled={this.noFlightPlan}
                  dataHandlerDuringValidation={async (v) =>
                    this.props.flightPlanInterface.setPerformanceData(
                      'pilotTropopause',
                      v,
                      this.loadedFlightPlanIndex.get(),
                    )
                  }
                  enteredByPilot={this.tropopauseIsPilotEntered}
                  readonlyValue={this.tropopause}
                  onModified={() => {}}
                  alignText="flex-end"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomAt(
                393,
                589,
                <Button
                  label={this.cpnyWindButton.label}
                  onClick={() =>
                    // FCOM DSC-22-FMS-20-30 P 392: opens the COMPANY WIND DATA REQUEST page (also while pending)
                    this.cpnyWindButton.received.get()
                      ? {}
                      : this.props.mfd.uiService.navigateTo(
                          `fms/${this.props.mfd.uiService.activeUri.get().category}/${cpnyWindRequestPage}`,
                        )
                  }
                  idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_initCpnyWind`}
                  menuItems={this.cpnyWindButton.menuItems}
                  showArrow={false}
                  buttonStyle="min-width: 174px; min-height: 60px;"
                />,
              )}
              {fcomRight(431, 137, <span class="mfd-label">TRIP WIND</span>)}
              {fcomAt(
                431,
                147,
                <InputField<number, number, false>
                  dataEntryFormat={new TripWindFormat()}
                  dataHandlerDuringValidation={async (v) =>
                    this.props.flightPlanInterface.setPerformanceData(
                      'pilotTripWind',
                      v,
                      this.loadedFlightPlanIndex.get(),
                    )
                  }
                  disabled={this.tripWindDisabled}
                  enteredByPilot={this.tripWindIsPilotEntered}
                  readonlyValue={this.tripWindDisplay}
                  containerStyle="width: 109px;"
                  alignText="center"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomAt(
                431,
                369,
                <Button
                  disabled={this.noFlightPlan}
                  label="WIND"
                  onClick={() =>
                    this.props.mfd.uiService.navigateTo(
                      `fms/${this.props.mfd.uiService.activeUri.get().category}/${windPage}/${showReturnButtonUriExtra}`,
                    )
                  }
                  buttonStyle="min-width: 100px;"
                />,
              )}
              {fcomLine(513, 29, 737)}
              <div style={{ visibility: this.visibilityOnlyInActive }}>
                {fcomAt(
                  549,
                  145,
                  <Button
                    label="IRS"
                    onClick={() => this.props.mfd.uiService.navigateTo('fms/position/irs')}
                    buttonStyle="min-width: 155px;"
                  />,
                )}
                {fcomAt(
                  607,
                  145,
                  <Button
                    label="DEPARTURE"
                    disabled={this.departureButtonDisabled}
                    onClick={() =>
                      this.props.mfd.uiService.navigateTo(
                        `fms/${this.props.mfd.uiService.activeUri.get().category}/f-pln-departure`,
                      )
                    }
                    buttonStyle="min-width: 155px;"
                  />,
                )}
                {fcomAt(
                  608,
                  372,
                  <Button
                    label="RTE SUMMARY"
                    onClick={() =>
                      this.props.mfd.uiService.navigateTo(
                        this.fromIcao.get() && this.toIcao.get()
                          ? `fms/data/route/${newRouteFromActiveUriExtra}/${showReturnButtonUriExtra}`
                          : `fms/data/route/${showReturnButtonUriExtra}`,
                      )
                    }
                    buttonStyle="min-width: 198px;"
                  />,
                )}
                {fcomAt(
                  663,
                  145,
                  <Button
                    label="NAVAIDS"
                    onClick={() =>
                      this.props.mfd.uiService.navigateTo(`fms/position/navaids/${showReturnButtonUriExtra}`)
                    }
                    buttonStyle="min-width: 155px;"
                  />,
                )}
                {fcomAt(
                  720,
                  145,
                  <Button
                    label="FUEL&LOAD"
                    onClick={() =>
                      this.props.mfd.uiService.navigateTo(
                        `fms/${this.props.mfd.uiService.activeUri.get().category}/fuel-load`,
                      )
                    }
                    buttonStyle="min-width: 155px;"
                  />,
                )}
                {fcomAt(
                  777,
                  145,
                  <Button
                    label="T.O. PERF"
                    onClick={() =>
                      this.props.mfd.uiService.navigateTo(
                        `fms/${this.props.mfd.uiService.activeUri.get().category}/perf/to`,
                      )
                    }
                    buttonStyle="min-width: 155px;"
                  />,
                )}
                {fcomAt(
                  764,
                  589,
                  <Button
                    // FCOM DSC-22-FMS-20-30 P 33: displays the COMPANY T.O DATA REQUEST page (active flight plan only)
                    disabled={this.secActive}
                    label={this.cpnyToButton.label}
                    onClick={() => this.props.mfd.uiService.navigateTo(this.cpnyToButton.target)}
                    buttonStyle="min-width: 174px; min-height: 60px;"
                  />,
                )}
              </div>
              <div style={{ visibility: this.visibleInSec }}>
                {fcomAt(
                  793,
                  5,
                  <Button
                    label="RETURN"
                    onClick={() =>
                      this.props.mfd.uiService.navigateTo(
                        secIndexPageUri + '/' + (this.loadedFlightPlanIndex.get() - 2),
                      )
                    }
                    buttonStyle="min-width: 129px;"
                  />,
                )}
              </div>
            </div>
            {/* end page content */}
          </div>
          <Footer
            bus={this.props.bus}
            mfd={this.props.mfd}
            fmcService={this.props.fmcService}
            flightPlanInterface={this.props.fmcService.master.flightPlanInterface}
          />
        </>
      )
    );
  }
}
