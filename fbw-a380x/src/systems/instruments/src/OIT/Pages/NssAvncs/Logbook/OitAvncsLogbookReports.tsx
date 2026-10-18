//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { NXUnits } from '@flybywiresim/fbw-sdk';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import {
  acceptanceReport,
  closureFindings,
  effectivePostFlight,
  flightInfo,
  formatLogbookDate,
  formatLogbookDateTime,
  formatLogbookMinutes,
  itemsIn,
  logbookFuelText,
} from '../../../System/TechLogbook';
import { AnsuOps } from '../../../System/AnsuOps';
import { LOGBOOK_URI, askSignature } from './LogbookFlows';

interface OitAvncsLogbookReportProps extends AbstractOitAvncsPageProps {}

/**
 * A heading and value pair of a report header.
 * @param key the heading
 * @param value the value
 * @returns the cell
 */
function reportCell(key: string, value: string): VNode {
  return (
    <div>
      <span class="oit-logbook-report-key">{key}</span> {value}
    </div>
  );
}

/**
 * The AIRCRAFT ACCEPTANCE REPORT (PIC ACCEPT): flight, certificate of release to service and one block per accepted
 * item. SIGN asks the electronic signature, then the acceptance is synchronised with the ground.
 */
export class OitAvncsLogbookAcceptanceReport extends DestroyableComponent<OitAvncsLogbookReportProps> {
  private readonly store = this.props.container.ansu.techLogbook;

  private readonly report = acceptanceReport(
    this.store.state.get(),
    this.store.avionicsInfo(),
    this.store.registration(),
  );

  private sign(): void {
    askSignature(this.store, () => {
      this.store.signAcceptance();
      this.props.uiService.navigateTo(LOGBOOK_URI.status);
    });
  }

  render(): VNode {
    const r = this.report;
    return (
      <>
        <div class="oit-logbook-report">
          <div class="oit-logbook-report-heading">AIRCRAFT ACCEPTANCE REPORT</div>
          <div class="oit-logbook-report-grid">
            {reportCell('Flight Number:', r.flightNumber)}
            {reportCell('FROM:', r.from)}
            {reportCell('DATE:', r.date)}
            {reportCell('UTC:', r.utc)}
            {reportCell('Tail Number:', r.tail)}
            {reportCell('TO:', r.to)}
            <div />
            <div />
          </div>
          <div class="oit-logbook-report-grid" style="grid-template-columns: 2fr 1fr;">
            <div>
              <span class="oit-logbook-report-key">CERTIFICATE OF RELEASE TO SERVICE:</span>{' '}
              <span class={r.releaseValid ? 'oit-logbook-green' : 'oit-logbook-amber'}>
                {r.releaseValid ? 'VALID' : 'NOT VALID'}
              </span>
            </div>
            {reportCell('DATE:', r.releaseDate)}
          </div>
          {r.items.map((item) => (
            <div class="oit-logbook-report-grid" style="grid-template-columns: 1fr 1fr 1.5fr 1fr 1fr;">
              <div class="oit-logbook-report-key" style="grid-column: 1 / 6;">
                ACCEPTED ITEM:
              </div>
              <div class="oit-logbook-report-key">Type:</div>
              <div class="oit-logbook-report-key">MEL/CDL ref:</div>
              <div class="oit-logbook-report-key">Deferred limit:</div>
              <div class="oit-logbook-report-key">Rectification interval:</div>
              <div class="oit-logbook-report-key">Severity:</div>
              <div>{item.type}</div>
              <div>{item.reference}</div>
              <div>{item.deferredLimit}</div>
              <div>{item.rectificationInterval}</div>
              <div>{item.severity}</div>
              <div style="grid-column: 1 / 6;">
                <span class="oit-logbook-report-key">TITLE:</span> {item.title}
              </div>
              <div style="grid-column: 1 / 6;">
                <span class="oit-logbook-report-key">ATA:</span> {item.ata}
              </div>
              <div style="grid-column: 1 / 6;">
                <span class="oit-logbook-report-key">REPORT:</span> {item.report}
              </div>
            </div>
          ))}
        </div>
        <div class="oit-logbook-bottom-buttons">
          <Button label="SIGN" onClick={() => this.sign()} />
          <Button
            label="CANCEL"
            onClick={() => this.props.uiService.navigateTo(LOGBOOK_URI.status)}
            buttonStyle="margin-left: 10px;"
          />
        </div>
      </>
    );
  }
}

/**
 * The flight closure report (CLOSE FLIGHT): what the crew signs off. Design choice: its real layout is not known,
 * so it lists the flight, the flight log (OUT/OFF/ON/IN and fuel), the POST-FLIGHT data, the open items of the flight
 * and the temporary items the closure deletes.
 */
export class OitAvncsLogbookClosureReport extends DestroyableComponent<OitAvncsLogbookReportProps> {
  private readonly store = this.props.container.ansu.techLogbook;

  private sign(): void {
    askSignature(this.store, () => {
      this.store.closeFlight();
      this.props.uiService.navigateTo(LOGBOOK_URI.status);
    });
  }

  render(): VNode {
    const state = this.store.state.get();
    const info = flightInfo(state.flight, this.store.avionicsInfo());
    const block = this.store.blockData();
    const post = effectivePostFlight(state, state.flight, block);
    const findings = closureFindings(state, this.store.ecamAlerts.get(), block);
    const openItems = itemsIn(state, 'open').filter((i) => i.flightIndex === state.flight.index);
    return (
      <>
        <div class="oit-logbook-report">
          <div class="oit-logbook-report-heading">FLIGHT CLOSURE REPORT</div>
          <div class="oit-logbook-report-grid">
            {reportCell('Flight Number:', info.flightNumber.value ?? '')}
            {reportCell('FROM:', info.from.value ?? '')}
            {reportCell('TO:', info.to.value ?? '')}
            {reportCell('DATE:', formatLogbookDate(info.date))}
            {reportCell('Tail Number:', this.store.registration())}
          </div>
          <div class="oit-logbook-report-grid">
            {reportCell('OUT:', AnsuOps.formatDateTime(block.outTime))}
            {reportCell('OFF:', AnsuOps.formatDateTime(block.offTime))}
            {reportCell('ON:', AnsuOps.formatDateTime(block.onTime))}
            {reportCell('IN:', AnsuOps.formatDateTime(block.inTime))}
            {reportCell('FOB OUT:', logbookFuelText(block.outFob, NXUnits.metricWeight))}
            {reportCell('FOB IN:', logbookFuelText(block.inFob, NXUnits.metricWeight))}
          </div>
          <div class="oit-logbook-report-grid">
            {reportCell('NIL DEFECT:', post.nilDefect ? 'YES' : 'NO')}
            {reportCell('TAKE OFF:', `${formatLogbookMinutes(post.takeOff.value)} Z`)}
            {reportCell('LANDING:', `${formatLogbookMinutes(post.landing.value)} Z`)}
            {reportCell('FLIGHT TIME:', formatLogbookMinutes(post.flightTime.value))}
            {reportCell('TOTAL TIME B/F:', formatLogbookMinutes(post.totalTimeBroughtForward.value))}
            {reportCell('TOTAL TIME:', formatLogbookMinutes(post.totalTime))}
          </div>
          <div class="oit-logbook-report-key" style="margin-top: 8px;">
            OPEN ITEMS OF THE FLIGHT:
          </div>
          {openItems.length === 0 ? <div>NIL</div> : <></>}
          {openItems.map((i) => (
            <div>
              {formatLogbookDateTime(i.openDate)} {i.title} ({i.ref})
            </div>
          ))}
          <div class="oit-logbook-report-key" style="margin-top: 8px;">
            TEMPORARY ITEMS DELETED:
          </div>
          {findings.temporaryItems.length === 0 ? <div>NIL</div> : <></>}
          {findings.temporaryItems.map((i) => (
            <div>{i.title}</div>
          ))}
        </div>
        <div class="oit-logbook-bottom-buttons">
          <Button label="SIGN" onClick={() => this.sign()} />
          <Button
            label="CANCEL"
            onClick={() => this.props.uiService.navigateTo(LOGBOOK_URI.status)}
            buttonStyle="margin-left: 10px;"
          />
        </div>
      </>
    );
  }
}
