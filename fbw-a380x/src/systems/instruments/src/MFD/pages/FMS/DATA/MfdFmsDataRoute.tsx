// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ArraySubject, FSComponent, MappedSubject, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { CompanyRoute } from '@flybywiresim/fbw-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { FmgcFlightPhase } from '@shared/flightphase';

import { AbstractMfdPageProps } from '../../../MFD';
import { FmsPage } from '../../common/FmsPage';
import { Footer } from '../../common/Footer';
import { TopTabNavigator, TopTabNavigatorPage } from '../../../../MsfsAvionicsCommon/UiWidgets/TopTabNavigator';
import { Button, ButtonMenuItem } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { DropdownMenu } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { IconButton } from '../../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { ConfirmationDialog } from '../../../../MsfsAvionicsCommon/UiWidgets/ConfirmationDialog';
import { AirportFormat, CompanyRouteFormat } from '../../common/DataEntryFormats';
import { StoredRoute } from '../../../FMC/PilotStoredElements';
import {
  buildStoredRouteFromPlan,
  routeFromCoRouteDto,
  routeSummaryTokens,
  RouteSummaryToken,
} from '../../../FMC/StoredRouteUtils';
import { NXSystemMessages } from '../../../shared/NXSystemMessages';
import { showReturnButtonUriExtra } from '../../../shared/utils';
import { RouteSummaryDisplay } from './RouteSummaryDisplay';

import './MfdFmsDataRoute.scss';
import { fcomAt, fcomCentre, fcomRight, fcomTabBar } from '../../common/FcomLayout';

interface MfdFmsDataRouteProps extends AbstractMfdPageProps {}

enum RoutePanel {
  Database,
  PilotStored,
}

/** URI extra of the INIT page's RTE SUMMARY button: the active flight plan is copied as a new route (FCOM). */
export const newRouteFromActiveUriExtra = 'new-from-active';

const noTokens: RouteSummaryToken[] = [];

/**
 * DATA / ROUTE page (A380 FCOM DSC-22-FMS-20-30 "DATA / ROUTE PAGE"): the DATABASE RTEs panel lists the company
 * routes of a FROM/TO city pair (the SimBridge company routes stand for the navigation database routes); the PILOT
 * STORED RTEs panel lists the routes stored by the flight crew, deletes them and stores a copy of the active or a
 * secondary flight plan as a new route.
 */
export class MfdFmsDataRoute extends FmsPage<MfdFmsDataRouteProps> {
  private readonly pilotStoredElements = this.props.fmcService.master.pilotStoredElements;

  private readonly selectedPageIndex = Subject.create<number>(RoutePanel.Database);

  private readonly showReturnButton = Subject.create(false);

  // ---- DATABASE RTEs panel --------------------------------------------------------------------------------------------

  private readonly databaseFrom = Subject.create<string | null>(null);

  private readonly databaseTo = Subject.create<string | null>(null);

  private databaseRoutes: StoredRoute[] = [];

  private readonly databaseRouteIdents = ArraySubject.create<string>([]);

  private readonly selectedDatabaseRoute = Subject.create<number | null>(null);

  private readonly databaseRouteNumberText = Subject.create('0/0');

  private readonly databaseSummary = Subject.create<readonly RouteSummaryToken[]>(noTokens);

  private readonly previousDatabaseDisabled = this.selectedDatabaseRoute.map((i) => i === null || i <= 0);

  private readonly nextDatabaseDisabled = this.selectedDatabaseRoute.map(
    (i) => i === null || i >= this.databaseRoutes.length - 1,
  );

  // ---- PILOT STORED RTEs panel ------------------------------------------------------------------------------------

  private readonly storedIdents = ArraySubject.create<string>([]);

  private readonly selectedStored = Subject.create<number | null>(null);

  private readonly storedNumberText = Subject.create('0/0');

  private readonly storedCityPair = Subject.create('');

  private readonly storedSummary = Subject.create<readonly RouteSummaryToken[]>(noTokens);

  private readonly hasStoredRoutes = Subject.create(false);

  private readonly newRouteMode = Subject.create(false);

  private readonly listVisible = MappedSubject.create(
    ([hasStored, newMode]) => hasStored && !newMode,
    this.hasStoredRoutes,
    this.newRouteMode,
  );

  private readonly noStoredVisible = MappedSubject.create(
    ([hasStored, newMode]) => !hasStored && !newMode,
    this.hasStoredRoutes,
    this.newRouteMode,
  );

  private readonly previousStoredDisabled = this.selectedStored.map((i) => i === null || i <= 0);

  private readonly nextStoredDisabled = MappedSubject.create(
    ([i, routes]) => i === null || i >= routes.length - 1,
    this.selectedStored,
    this.pilotStoredElements.routes,
  );

  private readonly deleteOneDialogVisible = Subject.create(false);

  private readonly deleteAllDialogVisible = Subject.create(false);

  /** FCOM: a copy of the active flight plan can only be stored in preflight */
  private readonly newRouteMenuItems = Subject.create<ButtonMenuItem[]>([]);

  // ---- new route function ---------------------------------------------------------------------------------------------

  private newRoute: StoredRoute | null = null;

  private newRouteTruncated = false;

  private readonly newRouteIdent = Subject.create<string | null>(null);

  private readonly newRouteCityPair = Subject.create('');

  private readonly newRouteSummary = Subject.create<readonly RouteSummaryToken[]>(noTokens);

  private readonly storeDisabled = this.newRouteIdent.map((ident) => ident === null);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.previousDatabaseDisabled,
      this.nextDatabaseDisabled,
      this.listVisible,
      this.noStoredVisible,
      this.previousStoredDisabled,
      this.nextStoredDisabled,
      this.storeDisabled,
      this.selectedDatabaseRoute.sub((i) => this.showDatabaseRoute(i), true),
      this.pilotStoredElements.routes.sub(() => this.refreshStoredRoutes(), true),
      this.selectedStored.sub((i) => this.showStoredRoute(i), true),
      this.activeFlightPhase.sub(() => this.updateNewRouteMenu()),
      this.props.mfd.uiService.activeUri.sub((uri) => this.handleUriExtra(uri.extra ?? ''), true),
    );
    this.updateNewRouteMenu();
  }

  protected onNewData(): void {
    this.updateNewRouteMenu();
  }

  private handleUriExtra(extra: string): void {
    const parts = extra.split('/');
    this.showReturnButton.set(parts.includes(showReturnButtonUriExtra));

    if (parts.includes(newRouteFromActiveUriExtra)) {
      this.openNewRouteFunction(FlightPlanIndex.Active);
    } else if (parts.includes('pilot-stored')) {
      this.selectedPageIndex.set(RoutePanel.PilotStored);
    }
  }

  // ---- DATABASE RTEs --------------------------------------------------------------------------------------------------

  private async loadDatabaseRoutes(): Promise<void> {
    const from = this.databaseFrom.get();
    const to = this.databaseTo.get();
    this.databaseRoutes = [];
    if (from && to) {
      try {
        const result = await CompanyRoute.getRouteList(from, to);
        if (result.success && result.data) {
          this.databaseRoutes = result.data.map(routeFromCoRouteDto);
        }
      } catch (e) {
        // SimBridge not connected: no navigation database company routes
        console.warn('[FMS] Company route list not available:', e);
      }
    }
    this.databaseRouteIdents.set(this.databaseRoutes.map((r) => r.ident));
    const newIndex = this.databaseRoutes.length > 0 ? 0 : null;
    if (this.selectedDatabaseRoute.get() === newIndex) {
      this.showDatabaseRoute(newIndex);
    } else {
      this.selectedDatabaseRoute.set(newIndex);
    }
  }

  private showDatabaseRoute(index: number | null): void {
    const route = index !== null ? this.databaseRoutes[index] : undefined;
    this.databaseRouteNumberText.set(
      route ? `${(index! + 1).toFixed(0)}/${this.databaseRoutes.length.toFixed(0)}` : '0/0',
    );
    this.databaseSummary.set(route ? routeSummaryTokens(route) : noTokens);
  }

  /**
   * FCOM: a route ident that is a pilot created route opens the PILOT STORED RTEs panel; one that is in neither
   * database gives NOT IN DATABASE.
   */
  private onDatabaseRouteEntered(index: number | null, freeText: string): void {
    if (index !== null) {
      this.selectedDatabaseRoute.set(index);
      return;
    }
    const ident = freeText.toUpperCase();
    const databaseIndex = this.databaseRoutes.findIndex((r) => r.ident === ident);
    if (databaseIndex >= 0) {
      this.selectedDatabaseRoute.set(databaseIndex);
      return;
    }
    const storedIndex = this.pilotStoredElements.routes.get().findIndex((r) => r.ident === ident);
    if (storedIndex >= 0) {
      this.newRouteMode.set(false);
      this.selectedStored.set(storedIndex);
      this.selectedPageIndex.set(RoutePanel.PilotStored);
      return;
    }
    this.props.fmcService.master.addMessageToQueue(NXSystemMessages.notInDatabase, undefined, undefined);
  }

  // ---- PILOT STORED RTEs --------------------------------------------------------------------------------------------

  private refreshStoredRoutes(): void {
    const routes = this.pilotStoredElements.routes.get();
    this.storedIdents.set(routes.map((r) => r.ident));
    this.hasStoredRoutes.set(routes.length > 0);

    const current = this.selectedStored.get();
    const newIndex = routes.length === 0 ? null : Math.min(current ?? 0, routes.length - 1);
    if (current === newIndex) {
      this.showStoredRoute(newIndex);
    } else {
      this.selectedStored.set(newIndex);
    }
  }

  private showStoredRoute(index: number | null): void {
    const routes = this.pilotStoredElements.routes.get();
    const route = index !== null ? routes[index] : undefined;
    if (!route) {
      this.storedNumberText.set('0/0');
      this.storedCityPair.set('');
      this.storedSummary.set(noTokens);
      return;
    }
    this.storedNumberText.set(`${(index! + 1).toFixed(0)}/${routes.length.toFixed(0)}`);
    this.storedCityPair.set(`${route.originIcao}/${route.destinationIcao}`);
    this.storedSummary.set(routeSummaryTokens(route));
  }

  private scrollStoredRoute(delta: number): void {
    const current = this.selectedStored.get();
    if (current === null) {
      return;
    }
    const next = current + delta;
    if (next >= 0 && next < this.pilotStoredElements.routes.get().length) {
      this.selectedStored.set(next);
    }
  }

  private scrollDatabaseRoute(delta: number): void {
    const current = this.selectedDatabaseRoute.get();
    if (current === null) {
      return;
    }
    const next = current + delta;
    if (next >= 0 && next < this.databaseRoutes.length) {
      this.selectedDatabaseRoute.set(next);
    }
  }

  private deleteSelectedStoredRoute(): void {
    this.deleteOneDialogVisible.set(false);
    const index = this.selectedStored.get();
    if (index !== null) {
      this.pilotStoredElements.deleteRoute(index);
    }
  }

  private deleteAllStoredRoutes(): void {
    this.deleteAllDialogVisible.set(false);
    this.pilotStoredElements.deleteAllRoutes();
  }

  // ---- new route function ---------------------------------------------------------------------------------------------

  private updateNewRouteMenu(): void {
    const fps = this.props.flightPlanInterface;
    const activeUsable =
      fps.hasActive && fps.active.originAirport !== undefined && fps.active.destinationAirport !== undefined;
    const items: ButtonMenuItem[] = [
      {
        label: 'ACTIVE',
        // FCOM: the flight crew can store a copy of the active flight plan only in preflight
        disabled: !activeUsable || this.activeFlightPhase.get() !== FmgcFlightPhase.Preflight,
        action: () => this.openNewRouteFunction(FlightPlanIndex.Active),
      },
    ];
    for (let sec = 1; sec <= 3; sec++) {
      const planIndex = FlightPlanIndex.FirstSecondary + sec - 1;
      const usable =
        fps.hasSecondary(sec) &&
        fps.secondary(sec).originAirport !== undefined &&
        fps.secondary(sec).destinationAirport !== undefined;
      items.push({
        label: `SEC ${sec}`,
        disabled: !usable,
        action: () => this.openNewRouteFunction(planIndex),
      });
    }
    this.newRouteMenuItems.set(items);
  }

  /** FCOM NEW ROUTE: a copy of the chosen flight plan whose summary is displayed and which can then be stored. */
  private openNewRouteFunction(planIndex: FlightPlanIndex): void {
    const fps = this.props.flightPlanInterface;
    if (!fps.has(planIndex)) {
      return;
    }
    const plan = fps.get(planIndex);
    const alternateIcao = plan.alternateFlightPlan?.destinationAirport?.ident;
    const { route, truncated } = buildStoredRouteFromPlan(plan, '', this.props.fmcService.master, alternateIcao);

    this.newRoute = route;
    this.newRouteTruncated = truncated;
    this.newRouteIdent.set(null);
    this.newRouteCityPair.set(`${route.originIcao}/${route.destinationIcao}`);
    this.newRouteSummary.set(routeSummaryTokens(route));
    this.newRouteMode.set(true);
    this.selectedPageIndex.set(RoutePanel.PilotStored);
  }

  private cancelNewRoute(): void {
    this.newRoute = null;
    this.newRouteMode.set(false);
  }

  /** FCOM: RTE IDENT ALREADY USED when the ident exists already. */
  private async onNewRouteIdentEntered(ident: string | null): Promise<boolean> {
    if (ident === null) {
      return true;
    }
    const used =
      this.pilotStoredElements.findRoute(ident) !== undefined || this.databaseRoutes.some((r) => r.ident === ident);
    if (used) {
      this.props.fmcService.master.addMessageToQueue(NXSystemMessages.rteIdentAlreadyUsed, undefined, undefined);
      return false;
    }
    return true;
  }

  /**
   * FCOM STORE ROUTE: stores the new route (maximum 5 routes, PILOT RTEs LIST FULL otherwise; SOME REVISIONS NOT
   * STORED when the plan had more than 30 elements).
   */
  private storeNewRoute(): void {
    const ident = this.newRouteIdent.get();
    if (!this.newRoute || ident === null) {
      return;
    }
    const fmc = this.props.fmcService.master;
    const stored = this.pilotStoredElements.storeRoute({ ...this.newRoute, ident });
    if (!stored) {
      fmc.addMessageToQueue(NXSystemMessages.pilotRtesListFull, undefined, undefined);
      return;
    }
    if (this.newRouteTruncated) {
      fmc.addMessageToQueue(NXSystemMessages.someRevisionsNotStored, undefined, undefined);
    }
    this.newRoute = null;
    this.newRouteMode.set(false);
    this.selectedStored.set(this.pilotStoredElements.routes.get().findIndex((r) => r.ident === ident));
  }

  // ---- render ---------------------------------------------------------------------------------------------------------
  // Positions from the FCOM figures (DSC-22-FMS-20-30 P 83, P 85, P 86, P 89), in page container coordinates
  // (display y - 143)

  /** FROM xxxx TO xxxx of a stored route, green big font (P 85, P 89) */
  private static cityPair(y: number, cityPair: Subscribable<string>): VNode {
    return (
      <>
        {fcomAt(y, 101, <span class="mfd-label">FROM</span>)}
        {fcomAt(y, 182, <span class="mfd-value bigger">{cityPair.map((c) => c.split('/')[0] ?? '')}</span>)}
        {fcomAt(y, 306, <span class="mfd-label">TO</span>)}
        {fcomAt(y, 352, <span class="mfd-value bigger">{cityPair.map((c) => c.split('/')[1] ?? '')}</span>)}
      </>
    );
  }

  private static scrollButtons(
    y: number,
    previousDisabled: Subscribable<boolean>,
    nextDisabled: Subscribable<boolean>,
    scroll: (delta: number) => void,
  ): VNode {
    return fcomAt(
      y,
      504,
      <div class="fr" style="gap: 8px;">
        <IconButton
          icon="double-left"
          disabled={previousDisabled}
          onClick={() => scroll(-1)}
          containerStyle="width: 61px; height: 55px;"
        />
        <IconButton
          icon="double-right"
          disabled={nextDisabled}
          onClick={() => scroll(1)}
          containerStyle="width: 61px; height: 55px;"
        />
      </div>,
    );
  }

  /** DATABASE RTEs panel (P 83) */
  private renderDatabasePanel(): VNode {
    return (
      <>
        {fcomRight(79, 262, <span class="mfd-label">FROM</span>)}
        {fcomAt(
          79,
          277,
          <InputField<string>
            dataEntryFormat={new AirportFormat()}
            value={this.databaseFrom}
            dataHandlerDuringValidation={async () => {
              await this.loadDatabaseRoutes();
            }}
            mandatory={Subject.create(true)}
            containerStyle="width: 90px;"
            alignText="center"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {fcomAt(79, 406, <span class="mfd-label">TO</span>)}
        {fcomAt(
          79,
          443,
          <InputField<string>
            dataEntryFormat={new AirportFormat()}
            value={this.databaseTo}
            dataHandlerDuringValidation={async () => {
              await this.loadDatabaseRoutes();
            }}
            mandatory={Subject.create(true)}
            containerStyle="width: 88px;"
            alignText="center"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {fcomRight(150, 202, <span class="mfd-label">RTE IDENT</span>)}
        {fcomAt(
          150,
          226,
          <DropdownMenu
            idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_dataRouteDatabaseDropdown`}
            selectedIndex={this.selectedDatabaseRoute}
            values={this.databaseRouteIdents}
            freeTextAllowed={true}
            onModified={(i, freeText) => this.onDatabaseRouteEntered(i, freeText)}
            containerStyle="width: 249px;"
            alignLabels="center"
            numberOfDigitsForInputField={10}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {fcomCentre(150, 575, <span class="mfd-label">{this.databaseRouteNumberText}</span>)}
        {MfdFmsDataRoute.scrollButtons(208, this.previousDatabaseDisabled, this.nextDatabaseDisabled, (d) =>
          this.scrollDatabaseRoute(d),
        )}
        <RouteSummaryDisplay tokens={this.databaseSummary} left={100} top={255} lines={10} scrollDownFirst={false} />
      </>
    );
  }

  /** PILOT STORED RTEs panel with stored routes (P 85) */
  private renderStoredRouteList(): VNode {
    return (
      <>
        {fcomRight(123, 202, <span class="mfd-label">RTE IDENT</span>)}
        {fcomAt(
          123,
          226,
          <DropdownMenu
            idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_dataRouteStoredDropdown`}
            selectedIndex={this.selectedStored}
            values={this.storedIdents}
            freeTextAllowed={false}
            containerStyle="width: 249px;"
            alignLabels="center"
            numberOfDigitsForInputField={10}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {fcomCentre(123, 575, <span class="mfd-label">{this.storedNumberText}</span>)}
        {MfdFmsDataRoute.scrollButtons(180, this.previousStoredDisabled, this.nextStoredDisabled, (d) =>
          this.scrollStoredRoute(d),
        )}
        {MfdFmsDataRoute.cityPair(223, this.storedCityPair)}
        <RouteSummaryDisplay tokens={this.storedSummary} left={100} top={255} lines={8} />
        {fcomAt(
          728,
          18,
          <Button
            label={
              <span class="fr aic">
                <span style="white-space: pre; text-align: center;">{'DELETE\nSTORED RTE'}</span>
                <span style="margin-left: 16px;">*</span>
              </span>
            }
            onClick={() => this.deleteOneDialogVisible.set(true)}
            buttonStyle="min-width: 195px; min-height: 58px;"
          />,
        )}
        {fcomAt(
          728,
          220,
          <Button
            label={
              <span class="fr aic">
                <span style="white-space: pre; text-align: center;">{'DELETE ALL\nSTORED RTEs'}</span>
                <span style="margin-left: 16px;">*</span>
              </span>
            }
            onClick={() => this.deleteAllDialogVisible.set(true)}
            buttonStyle="min-width: 200px; min-height: 58px;"
          />,
        )}
        {fcomAt(
          728,
          549,
          <Button
            label="NEW RTE"
            idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_dataRouteNewRte`}
            menuItems={this.newRouteMenuItems}
            onClick={() => {}}
            buttonStyle="min-width: 199px; min-height: 58px;"
          />,
        )}
      </>
    );
  }

  /** PILOT STORED RTEs panel without stored route (P 86) */
  private renderNoStoredPanel(): VNode {
    return (
      <>
        {fcomCentre(123, 380, <span class="mfd-label">NO PILOT STORED RTEs</span>)}
        {fcomAt(
          726,
          549,
          <Button
            label="NEW RTE"
            idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_dataRouteNewRteEmpty`}
            menuItems={this.newRouteMenuItems}
            onClick={() => {}}
            buttonStyle="min-width: 199px; min-height: 58px;"
          />,
        )}
      </>
    );
  }

  /** NEW ROUTE FUNCTION (P 89) */
  private renderNewRouteFunction(): VNode {
    return (
      <>
        {fcomRight(122, 202, <span class="mfd-label">RTE IDENT</span>)}
        {fcomAt(
          122,
          232,
          <InputField<string>
            dataEntryFormat={new CompanyRouteFormat()}
            value={this.newRouteIdent}
            dataHandlerDuringValidation={(v) => this.onNewRouteIdentEntered(v)}
            mandatory={Subject.create(true)}
            containerStyle="width: 201px;"
            alignText="center"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {MfdFmsDataRoute.cityPair(221, this.newRouteCityPair)}
        <RouteSummaryDisplay tokens={this.newRouteSummary} left={100} top={255} lines={8} />
        {fcomAt(
          724,
          13,
          <Button
            label="CANCEL"
            onClick={() => this.cancelNewRoute()}
            buttonStyle="min-width: 129px; min-height: 59px;"
          />,
        )}
        {fcomAt(
          724,
          574,
          <Button
            label="STORE RTE *"
            disabled={this.storeDisabled}
            onClick={() => this.storeNewRoute()}
            buttonStyle="min-width: 170px; min-height: 59px;"
          />,
        )}
      </>
    );
  }

  render(): VNode {
    const visibleWhen = (visible: Subscribable<boolean>) => ({
      display: visible.map((v) => (v ? 'block' : 'none')),
    });
    const onPanel = (panel: number) => this.selectedPageIndex.map((i) => i === panel);
    const storedPanel = onPanel(1);
    const storedList = MappedSubject.create(([p, v]) => p && v, storedPanel, this.listVisible);
    const storedNone = MappedSubject.create(([p, v]) => p && v, storedPanel, this.noStoredVisible);
    const storedNew = MappedSubject.create(([p, v]) => p && v, storedPanel, this.newRouteMode);
    this.subs.push(storedPanel, storedList, storedNone, storedNew);

    return (
      <>
        {super.render()}
        {/* begin page content */}
        <div class="mfd-page-container" style="position: relative;">
          {/* Tab panels from y = 150 to 910 (P 86); their content is drawn in the overlays below */}
          <TopTabNavigator
            pageTitles={Subject.create(['DATABASE RTEs', 'PILOT STORED RTEs'])}
            selectedPageIndex={this.selectedPageIndex}
            pageChangeCallback={(val) => this.selectedPageIndex.set(val)}
            selectedTabTextColor="white"
            {...fcomTabBar}
          >
            <TopTabNavigatorPage containerStyle="flex: 0 0 auto; box-sizing: border-box; height: 722px;" />
            <TopTabNavigatorPage containerStyle="flex: 0 0 auto; box-sizing: border-box; height: 722px;" />
          </TopTabNavigator>
          <div class="mfd-fcom-overlay" style={visibleWhen(onPanel(0))}>
            {this.renderDatabasePanel()}
          </div>
          <div class="mfd-fcom-overlay" style={visibleWhen(storedList)}>
            {this.renderStoredRouteList()}
          </div>
          <div class="mfd-fcom-overlay" style={visibleWhen(storedNone)}>
            {this.renderNoStoredPanel()}
          </div>
          <div class="mfd-fcom-overlay" style={visibleWhen(storedNew)}>
            {this.renderNewRouteFunction()}
          </div>
          {/* FCOM: RETURN displays the page the DATA / ROUTE page was called from (e.g. the ACTIVE / INIT page) */}
          <div class="mfd-fcom-overlay">
            {fcomAt(
              788,
              4,
              <Button
                label="RETURN"
                visible={this.showReturnButton}
                onClick={() => this.props.mfd.uiService.navigateTo('back')}
                buttonStyle="min-width: 128px;"
              />,
            )}
          </div>
          <div class="mfd-data-route-dialogs">
            <ConfirmationDialog
              visible={this.deleteOneDialogVisible}
              cancelAction={() => this.deleteOneDialogVisible.set(false)}
              confirmAction={() => this.deleteSelectedStoredRoute()}
              contentContainerStyle="width: 480px; height: 165px; transform: translateX(-50%);"
            >
              DELETE STORED RTE ?
            </ConfirmationDialog>
            <ConfirmationDialog
              visible={this.deleteAllDialogVisible}
              cancelAction={() => this.deleteAllDialogVisible.set(false)}
              confirmAction={() => this.deleteAllStoredRoutes()}
              contentContainerStyle="width: 480px; height: 165px; transform: translateX(-50%);"
            >
              DELETE ALL STORED RTEs ?
            </ConfirmationDialog>
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
