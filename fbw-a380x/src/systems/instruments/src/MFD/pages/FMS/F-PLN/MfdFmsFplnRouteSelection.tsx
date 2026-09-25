// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ArraySubject, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { CompanyRoute } from '@flybywiresim/fbw-sdk';

import { AbstractMfdPageProps } from '../../../MFD';
import { FmsPage } from '../../common/FmsPage';
import { Footer } from '../../common/Footer';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { DropdownMenu } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { IconButton } from '../../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { StoredRoute } from '../../../FMC/PilotStoredElements';
import { routeFromCoRouteDto, routeSummaryTokens, RouteSummaryToken } from '../../../FMC/StoredRouteUtils';
import { fcomAt, fcomCentre, fcomRight } from '../../common/FcomLayout';
import { RouteSummaryDisplay } from '../DATA/RouteSummaryDisplay';
import { initPage } from '../../../shared/utils';

import './MfdFmsFplnRouteSelection.scss';

interface MfdFmsFplnRouteSelectionProps extends AbstractMfdPageProps {}

/** URI extra of the INIT page's ALTN RTE SEL button: routes of the TO/ALTN city pair */
export const alternateRouteSelectionUriExtra = 'altn';

const noTokens: RouteSummaryToken[] = [];

/**
 * ROUTE SELECTION page (A380 FCOM DSC-22-FMS-20-30 "ROUTE SELECTION PAGE"): the company routes of the FROM/TO (or
 * TO/ALTN) city pair from the pilot stored elements database and the navigation database (SimBridge company routes),
 * with their summary; INSERT inserts the selected route into the flight plan and displays the INIT page.
 *
 * Not available yet: inserting an alternate company route into the alternate flight plan (the TO/ALTN routes are
 * listed, INSERT stays disabled).
 */
export class MfdFmsFplnRouteSelection extends FmsPage<MfdFmsFplnRouteSelectionProps> {
  private readonly isAlternateSelection =
    this.props.mfd.uiService.activeUri.get().extra?.split('/').includes(alternateRouteSelectionUriExtra) ?? false;

  private readonly cityPair = Subject.create('----/----');

  private routes: StoredRoute[] = [];

  private readonly routeIdents = ArraySubject.create<string>([]);

  private readonly selectedRoute = Subject.create<number | null>(null);

  private readonly routeNumberText = Subject.create('0/0');

  private readonly summary = Subject.create<readonly RouteSummaryToken[]>(noTokens);

  private readonly previousDisabled = this.selectedRoute.map((i) => i === null || i <= 0);

  private readonly nextDisabled = this.selectedRoute.map((i) => i === null || i >= this.routes.length - 1);

  private readonly insertDisabled = this.selectedRoute.map((i) => i === null || this.isAlternateSelection);

  private loadedCityPair: string | null = null;

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      // The FCOM page title has no flight plan prefix (DSC-22-FMS-20-30 P 324)
      this.props.mfd.uiService.activeUri.sub(() => this.activePageTitle.set('ROUTE SELECTION'), true),
      this.previousDisabled,
      this.nextDisabled,
      this.insertDisabled,
      this.selectedRoute.sub((i) => this.showRoute(i), true),
    );
  }

  protected onNewData(): void {
    const plan = this.loadedFlightPlan;
    if (!plan) {
      return;
    }
    const from = this.isAlternateSelection ? plan.destinationAirport?.ident : plan.originAirport?.ident;
    const to = this.isAlternateSelection
      ? this.loadedAlternateFlightPlan?.destinationAirport?.ident
      : plan.destinationAirport?.ident;
    this.cityPair.set(`${from ?? '----'}/${to ?? '----'}`);

    const pair = from && to ? `${from}/${to}` : null;
    if (pair !== this.loadedCityPair) {
      this.loadedCityPair = pair;
      this.loadRoutes(from, to);
    }
  }

  /** The pilot stored routes of the city pair first, then the navigation database (SimBridge) routes. */
  private async loadRoutes(from: string | undefined, to: string | undefined): Promise<void> {
    this.routes = [];
    if (from && to) {
      this.routes.push(...this.props.fmcService.master.pilotStoredElements.routesForCityPair(from, to));
      try {
        const result = await CompanyRoute.getRouteList(from, to);
        if (result.success && result.data) {
          this.routes.push(...result.data.map(routeFromCoRouteDto));
        }
      } catch (e) {
        // SimBridge not connected: no navigation database company routes
        console.warn('[FMS] Company route list not available:', e);
      }
    }
    this.routeIdents.set(this.routes.map((r) => r.ident));
    const newIndex = this.routes.length > 0 ? 0 : null;
    if (this.selectedRoute.get() === newIndex) {
      this.showRoute(newIndex);
    } else {
      this.selectedRoute.set(newIndex);
    }
  }

  private showRoute(index: number | null): void {
    const route = index !== null ? this.routes[index] : undefined;
    this.routeNumberText.set(route ? `${(index! + 1).toFixed(0)}/${this.routes.length.toFixed(0)}` : '0/0');
    this.summary.set(route ? routeSummaryTokens(route) : noTokens);
  }

  private scrollRoute(delta: number): void {
    const current = this.selectedRoute.get();
    if (current === null) {
      return;
    }
    const next = current + delta;
    if (next >= 0 && next < this.routes.length) {
      this.selectedRoute.set(next);
    }
  }

  /** FCOM INSERT: inserts the selected company route and displays the INIT page. */
  private async insertSelectedRoute(): Promise<void> {
    const index = this.selectedRoute.get();
    const route = index !== null ? this.routes[index] : undefined;
    if (!route || this.isAlternateSelection) {
      return;
    }
    await this.props.fmcService.master.insertCompanyRoute(route, this.loadedFlightPlanIndex.get());
    this.props.mfd.uiService.navigateTo(`fms/${this.props.mfd.uiService.activeUri.get().category}/${initPage}`);
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        {/* begin page content */}
        {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 324), page container coordinates (display y - 143) */}
        <div class="mfd-page-container">
          <div class="mfd-fcom-canvas">
            {fcomCentre(
              28,
              377,
              <span class="mfd-value bigger">{this.cityPair.map((c) => c.replace('/', ' / '))}</span>,
            )}
            {fcomRight(109, 239, <span class="mfd-label">RTE</span>)}
            {fcomAt(
              109,
              260,
              <DropdownMenu
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_routeSelectionDropdown`}
                selectedIndex={this.selectedRoute}
                values={this.routeIdents}
                freeTextAllowed={false}
                containerStyle="width: 249px;"
                alignLabels="center"
                numberOfDigitsForInputField={10}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            {fcomCentre(
              109,
              624,
              <span class="mfd-label">{this.routeNumberText.map((t) => t.replace('/', ' / '))}</span>,
            )}
            {fcomAt(
              169,
              560,
              <div class="fr" style="gap: 4px;">
                <IconButton
                  icon="double-left"
                  disabled={this.previousDisabled}
                  onClick={() => this.scrollRoute(-1)}
                  containerStyle="width: 60px; height: 55px;"
                />
                <IconButton
                  icon="double-right"
                  disabled={this.nextDisabled}
                  onClick={() => this.scrollRoute(1)}
                  containerStyle="width: 60px; height: 55px;"
                />
              </div>,
            )}
            <RouteSummaryDisplay tokens={this.summary} left={103} top={208} lines={11} bottomPadding={19} />
            {/* FCOM: RETURN displays the previous page without selecting the displayed company route */}
            {fcomAt(
              790,
              4,
              <Button
                label="RETURN"
                onClick={() => this.props.mfd.uiService.navigateTo('back')}
                buttonStyle="width: 101px;"
              />,
            )}
            {fcomAt(
              782,
              613,
              <Button
                label="INSERT*"
                disabled={this.insertDisabled}
                onClick={() => this.insertSelectedRoute()}
                buttonStyle="width: 122px; height: 41px;"
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
