// Copyright (c) 2024-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ArraySubject, ClockEvents, FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';
import { AbstractMfdPageProps } from '../../../MFD';
import { Footer } from '../../common/Footer';
import { fcomAt, fcomCentre, fcomLine, fcomRight, fcomTabBar } from '../../common/FcomLayout';

import { FmsPage } from '../../common/FmsPage';
import { TopTabNavigator, TopTabNavigatorPage } from '../../../../MsfsAvionicsCommon/UiWidgets/TopTabNavigator';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { AirlineModifiableInformation } from '@shared/AirlineModifiableInformation';
import { DatabaseIdent } from '@flybywiresim/fbw-sdk';
import { ConfirmationDialog } from '../../../../MsfsAvionicsCommon/UiWidgets/ConfirmationDialog';
import { DropdownMenu } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { IconButton } from '../../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { FmcIndex } from '../../../FMC/FmcServiceInterface';
import { NavigationDatabaseService } from '@fmgc/flightplanning/NavigationDatabaseService';

import './MfdFmsDataStatus.scss';
import { NXSystemMessages } from '../../../shared/NXSystemMessages';
import { showReturnButtonUriExtra } from '../../../shared/utils';

interface MfdFmsDataStatusProps extends AbstractMfdPageProps {}

/** FCOM DSC-22-FMS-20-30 P 98: the database list of the FMS P/N panel */
const partNumberDatabases = [
  'FMS SOFTWARE',
  'NAV DATABASE',
  'FMS AIRLINE CONFIG',
  'FMS OPTIONS CONFIG',
  'PERF DATABASE',
  'MAG VAR DATABASE',
] as const;

enum PartNumberDatabase {
  FmsSoftware,
  NavDatabase,
  AirlineConfig,
  OptionsConfig,
  PerfDatabase,
  MagVarDatabase,
}

const DB_MONTHS: Record<string, string> = {
  '01': 'JAN',
  '02': 'FEB',
  '03': 'MAR',
  '04': 'APR',
  '05': 'MAY',
  '06': 'JUN',
  '07': 'JUL',
  '08': 'AUG',
  '09': 'SEP',
  '10': 'OCT',
  '11': 'NOV',
  '12': 'DEC',
};

export class MfdFmsDataStatus extends FmsPage<MfdFmsDataStatusProps> {
  private readonly selectedPageIndex = Subject.create<number>(0);

  private readonly navDatabase = Subject.create('');

  private readonly activeDatabase = Subject.create('');
  private readonly secondDatabase = Subject.create('');

  private readonly storedWaypoints = Subject.create('00');

  private readonly storedRoutes = Subject.create('00');
  private readonly storedNavaids = Subject.create('00');

  private readonly storedRunways = Subject.create('00');

  private readonly deleteStoredElementsDisabled = Subject.create(true);
  private readonly isSwapConfirmVisible = Subject.create(false);
  private readonly isDeleteAllConfirmVisible = Subject.create(false);

  // ---- FMS P/N panel (FCOM DSC-22-FMS-20-30 P 98-104) ----

  private readonly selectedDatabase = Subject.create<number | null>(PartNumberDatabase.FmsSoftware);

  /** Version of the FMS software (the aircraft build, read from its build information) */
  private readonly softwareVersion = Subject.create<string | null>(null);

  private readonly fmcInop = [FmcIndex.FmcA, FmcIndex.FmcB, FmcIndex.FmcC].map((i) => this.props.fmcService.isInop(i));

  /**
   * Part number of the selected database. The FMS software, the options configuration and the performance database
   * are part of the aircraft build; there is no airline configuration (AMI) file, so it is DEFAULT (P 101); the
   * magnetic variation comes from the simulator.
   */
  private readonly selectedPartNumber = MappedSubject.create(
    ([database, software, nav]) => {
      switch (database) {
        case PartNumberDatabase.NavDatabase:
          return nav || 'INCOMPLETE';
        case PartNumberDatabase.AirlineConfig:
          return 'DEFAULT';
        case PartNumberDatabase.MagVarDatabase:
          return 'MSFS';
        default:
          return software ?? 'INCOMPLETE';
      }
    },
    this.selectedDatabase,
    this.softwareVersion,
    this.navDatabase,
  );

  /** P 99: dashes when the FMC is not available */
  private readonly partNumbers = this.fmcInop.map((inop) =>
    MappedSubject.create(([isInop, pn]) => (isInop ? '-'.repeat(15) : pn), inop, this.selectedPartNumber),
  );

  /** P 99: all part numbers in amber when at least two are different (all FMCs load the same build) */
  private readonly partNumberAmber = this.partNumbers.map(() => Subject.create(false));

  /** P 103-104: PRINT FMC-x OPC / AMI CONFIG, with the FMC that controls this MFD */
  private readonly printConfigLabel = this.selectedDatabase.map((d) =>
    d === PartNumberDatabase.OptionsConfig
      ? 'PRINT FMC-A\nOPC CONFIG'
      : d === PartNumberDatabase.AirlineConfig
        ? 'PRINT FMC-A\nAMI CONFIG'
        : '',
  );

  /** FCOM DSC-22-FMS-20-30 p.103: the RETURN button is only displayed when the page was accessed via the INIT page. */
  private readonly showReturnButton = Subject.create(false);

  protected onNewData() {
    NavigationDatabaseService.activeDatabase.getDatabaseIdent().then((dbCycle) => {
      const navCycleDates = dbCycle === null ? '' : MfdFmsDataStatus.calculateActiveDate(dbCycle);
      const navSerial =
        dbCycle === null ? '' : `${dbCycle.provider.substring(0, 2).toUpperCase()}${dbCycle.airacCycle}0001`;

      this.activeDatabase.set(navCycleDates);
      this.secondDatabase.set(navCycleDates);
      this.navDatabase.set(navSerial);
    });

    this.updateStoredElements();
  }

  /** Counts of the pilot stored elements: waypoints (DataManager), NAVAIDs, routes and runways (PilotStoredElements). */
  private updateStoredElements(): void {
    const fmc = this.props.fmcService.master;
    const waypoints = fmc.getDataManager()?.numberOfStoredWaypoints() ?? 0;
    const navaids = fmc.pilotStoredElements.navaids.get().length;
    const routes = fmc.pilotStoredElements.routes.get().length;
    const runways = fmc.pilotStoredElements.runways.get().length;
    this.storedWaypoints.set(waypoints.toFixed(0).padStart(2, '0'));
    this.storedRoutes.set(routes.toFixed(0).padStart(2, '0'));
    this.storedNavaids.set(navaids.toFixed(0).padStart(2, '0'));
    this.storedRunways.set(runways.toFixed(0).padStart(2, '0'));
    this.deleteStoredElementsDisabled.set(waypoints + navaids + routes + runways === 0);
  }

  /**
   * FCOM DSC-22-FMS-20-30 p.96: DELETE ALL (after confirmation) deletes all pilot stored elements; elements still used
   * by the FMS are not deleted and F-PLN ELEMENT RETAINED is displayed.
   */
  private async deleteAllStoredElements(): Promise<void> {
    this.isDeleteAllConfirmVisible.set(false);
    const fmc = this.props.fmcService.master;
    const allWaypointsDeleted = (await fmc.getDataManager()?.deleteAllStoredWaypoints()) ?? true;
    if (!allWaypointsDeleted) {
      fmc.addMessageToQueue(NXSystemMessages.fplnElementRetained, undefined, undefined);
    }
    fmc.pilotStoredElements.deleteAllNavaids();
    fmc.pilotStoredElements.deleteAllRoutes();
    fmc.pilotStoredElements.deleteAllRunways();
    this.updateStoredElements();
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(this.selectedPartNumber, ...this.partNumbers, this.printConfigLabel);
    fetch('/VFS/a380x_build_info.json')
      .then((r) => r.json())
      .then((info) =>
        this.softwareVersion.set(
          String(info.version ?? '')
            .replace(/^a380x-v/, '')
            .toUpperCase() || null,
        ),
      )
      .catch(() => this.softwareVersion.set(null));

    this.subs.push(
      this.props.mfd.uiService.activeUri.sub((val) => {
        const parts = (val.extra ?? '').split('/');
        // FCOM DSC-22-FMS-20-30 p.93: the ACFT STATUS panel is displayed automatically (FMS power-up, FMC reset,
        // DONE phase) and via the INIT page's ACFT STATUS button; the FMS P/N panel only when explicitly requested.
        this.selectedPageIndex.set(parts.includes('fms-pn') ? 1 : 0);
        this.showReturnButton.set(parts.includes(showReturnButtonUriExtra));
      }, true),
    );

    const sub = this.props.bus.getSubscriber<ClockEvents>();
    this.subs.push(
      sub
        .on('realTime')
        .atFrequency(1)
        .handle((_t) => {
          this.onNewData();
        }),
    );
  }

  private static calculateActiveDate(dbIdent: DatabaseIdent): string {
    const effDay = dbIdent.effectiveFrom.substring(8);
    const effMonth = dbIdent.effectiveFrom.substring(5, 7);
    const expDay = dbIdent.effectiveTo.substring(8);
    const expMonth = dbIdent.effectiveTo.substring(5, 7);

    return `${effDay}${DB_MONTHS[effMonth]}-${expDay}${DB_MONTHS[expMonth]}`;
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        {/* begin page content */}
        <div class="mfd-page-container" style="position: relative;">
          <TopTabNavigator
            pageTitles={Subject.create(['ACFT STATUS', 'FMS P/N'])}
            selectedPageIndex={this.selectedPageIndex}
            pageChangeCallback={(val) => {
              this.selectedPageIndex.set(val);
              this.isSwapConfirmVisible.set(false);
            }}
            selectedTabTextColor="white"
            {...fcomTabBar}
          >
            <TopTabNavigatorPage containerStyle="flex: 0 0 auto; box-sizing: border-box; height: 722px;">
              {/* ACFT STATUS (FCOM DSC-22-FMS-20-30 P 91), positions in panel coordinates (display x - 21, display y - 198) */}
              <div class="mfd-fcom-canvas">
                {fcomCentre(35, 354, <span class="mfd-value bigger">A380-800</span>)}
                {fcomAt(118, 2, <span class="mfd-label">ENGINE</span>)}
                {fcomAt(118, 158, <span class="mfd-value bigger">TRENT 972</span>)}
                <div class="mfd-data-status-factors-box" />
                {fcomAt(118, 545, <span class="mfd-label">IDLE</span>)}
                {fcomRight(
                  118,
                  703,
                  <span class="mfd-value bigger">
                    {`${AirlineModifiableInformation.EK.idleFactor >= 0 ? '+' : '-'}${AirlineModifiableInformation.EK.idleFactor.toFixed(1)}`}
                  </span>,
                )}
                {fcomAt(168, 545, <span class="mfd-label">PERF</span>)}
                {fcomRight(
                  168,
                  703,
                  <span class="mfd-value bigger">
                    {`${AirlineModifiableInformation.EK.perfFactor >= 0 ? '+' : '-'}${AirlineModifiableInformation.EK.perfFactor.toFixed(1)}`}
                  </span>,
                )}
                {fcomAt(
                  227,
                  564,
                  <Button label="MODIFY" onClick={() => {}} disabled={true} buttonStyle="width: 97px;" />,
                )}
                {fcomLine(267, -10, 734)}

                <div class="mfd-data-status-dialog">
                  <ConfirmationDialog
                    visible={this.isSwapConfirmVisible}
                    cancelAction={() => {
                      this.isSwapConfirmVisible.set(false);
                    }}
                    confirmAction={() => {
                      this.props.fmcService.master.swapNavDatabase();
                      this.isSwapConfirmVisible.set(false);
                    }}
                    contentContainerStyle="width: 325px; height: 165px; transform: translateX(-50%);"
                  >
                    SWAP&nbsp;?
                  </ConfirmationDialog>
                </div>
                {fcomAt(293, 2, <span class="mfd-label">NAV DATABASE</span>)}
                {fcomAt(293, 219, <span class="mfd-value bigger">{this.navDatabase}</span>)}
                <div class="mfd-data-status-active-box" />
                {fcomCentre(368, 112, <span class="mfd-label">ACTIVE</span>)}
                {fcomCentre(418, 112, <span class="mfd-value bigger">{this.activeDatabase}</span>)}
                {fcomAt(
                  394,
                  306,
                  <Button
                    label="SWAP *"
                    onClick={() => this.isSwapConfirmVisible.set(true)}
                    buttonStyle="width: 113px; height: 42px;"
                  />,
                )}
                {fcomCentre(363, 621, <span class="mfd-label">SECOND</span>)}
                {fcomCentre(419, 621, <span class="mfd-value">{this.secondDatabase}</span>)}
                {fcomLine(475, -10, 734)}

                <div class="mfd-data-status-dialog" style="top: 500px;">
                  <ConfirmationDialog
                    visible={this.isDeleteAllConfirmVisible}
                    cancelAction={() => this.isDeleteAllConfirmVisible.set(false)}
                    confirmAction={() => this.deleteAllStoredElements()}
                    contentContainerStyle="width: 325px; height: 165px; transform: translateX(-50%);"
                  >
                    DELETE ALL&nbsp;?
                  </ConfirmationDialog>
                </div>
                {fcomAt(515, 2, <span class="mfd-label">PILOT STORED ELEMENTS</span>)}
                {fcomRight(581, 153, <span class="mfd-label">WAYPOINTS</span>)}
                {fcomAt(581, 166, <span class="mfd-value bigger">{this.storedWaypoints}</span>)}
                {fcomRight(581, 356, <span class="mfd-label">ROUTES</span>)}
                {fcomAt(581, 368, <span class="mfd-value bigger">{this.storedRoutes}</span>)}
                {fcomRight(633, 153, <span class="mfd-label">NAVAIDS</span>)}
                {fcomAt(633, 166, <span class="mfd-value bigger">{this.storedNavaids}</span>)}
                {fcomRight(633, 356, <span class="mfd-label">RUNWAYS</span>)}
                {fcomAt(633, 368, <span class="mfd-value bigger">{this.storedRunways}</span>)}
                {fcomAt(
                  606,
                  527,
                  <Button
                    label={
                      <span class="fr aic">
                        <span style="white-space: pre; text-align: center;">{'DELETE\nALL'}</span>
                        <span style="margin-left: 36px;">*</span>
                      </span>
                    }
                    onClick={() => this.isDeleteAllConfirmVisible.set(true)}
                    disabled={this.deleteStoredElementsDisabled}
                    buttonStyle="width: 159px; height: 41px;"
                  />,
                )}
              </div>
            </TopTabNavigatorPage>
            <TopTabNavigatorPage containerStyle="flex: 0 0 auto; box-sizing: border-box; height: 722px;">
              {/* FMS P/N (FCOM DSC-22-FMS-20-30 P 98-104), panel coordinates (display x - 21, display y - 198) */}
              <div class="mfd-fcom-canvas">
                {fcomAt(
                  40,
                  120,
                  <DropdownMenu
                    idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_dataStatusDatabaseList`}
                    selectedIndex={this.selectedDatabase}
                    values={ArraySubject.create([...partNumberDatabases])}
                    freeTextAllowed={false}
                    containerStyle="width: 330px;"
                    alignLabels="flex-start"
                    numberOfDigitsForInputField={18}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomAt(
                  40,
                  490,
                  <div class="fr" style="gap: 8px;">
                    <IconButton
                      icon="double-up"
                      disabled={this.selectedDatabase.map((i) => (i ?? 0) <= 0)}
                      onClick={() => this.selectedDatabase.set(Math.max(0, (this.selectedDatabase.get() ?? 0) - 1))}
                      containerStyle="width: 61px; height: 55px;"
                    />
                    <IconButton
                      icon="double-down"
                      disabled={this.selectedDatabase.map((i) => (i ?? 0) >= partNumberDatabases.length - 1)}
                      onClick={() =>
                        this.selectedDatabase.set(
                          Math.min(partNumberDatabases.length - 1, (this.selectedDatabase.get() ?? 0) + 1),
                        )
                      }
                      containerStyle="width: 61px; height: 55px;"
                    />
                  </div>,
                )}
                {fcomLine(96, -10, 734)}
                {(['A', 'B', 'C'] as const).map((fmc, i) => (
                  <>
                    {fcomAt(166 + i * 63, 150, <span class="mfd-label">{`FMS ${fmc}`}</span>)}
                    {fcomAt(
                      166 + i * 63,
                      236,
                      <span class={{ 'mfd-value': true, bigger: true, amber: this.partNumberAmber[i] }}>
                        {this.partNumbers[i]}
                      </span>,
                    )}
                  </>
                ))}
                {fcomLine(338, -10, 734)}
                {/* P 103-104: print the OPC / AMI content of the FMC that controls this MFD (no cockpit printer) */}
                <div style={{ display: this.printConfigLabel.map((l) => (l ? 'block' : 'none')) }}>
                  {fcomAt(
                    620,
                    274,
                    <Button
                      label={
                        <span class="fr aic">
                          <span style="white-space: pre; text-align: center;">{this.printConfigLabel}</span>
                          <span style="margin-left: 16px;">*</span>
                        </span>
                      }
                      disabled={Subject.create(true)}
                      onClick={() => {}}
                      buttonStyle="width: 150px; height: 42px;"
                    />,
                  )}
                </div>
                {fcomAt(
                  620,
                  542,
                  <Button
                    label={
                      <span class="fr aic">
                        <span style="white-space: pre; text-align: center;">{'PRINT\nALL P/N'}</span>
                        <span style="margin-left: 36px;">*</span>
                      </span>
                    }
                    disabled={Subject.create(true)}
                    onClick={() => {}}
                    buttonStyle="width: 159px; height: 41px;"
                  />,
                )}
              </div>
            </TopTabNavigatorPage>
          </TopTabNavigator>
          {/* FCOM DSC-22-FMS-20-30 p.104: RETURN displays the ACTIVE / INIT page */}
          <div class="mfd-fcom-overlay">
            {fcomAt(
              790,
              4,
              <Button
                label="RETURN"
                visible={this.showReturnButton}
                onClick={() => this.props.mfd.uiService.navigateTo('fms/active/init')}
                buttonStyle="width: 97px;"
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
