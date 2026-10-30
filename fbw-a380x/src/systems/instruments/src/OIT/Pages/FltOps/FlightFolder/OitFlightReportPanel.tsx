//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, FSComponent, MappedSubject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { FlightFolder } from '../../../System/FlightFolder';
import { FlightFolderSession } from '../../../System/FlightFolderSession';
import { clockText, durationText, weightText } from '../../../System/FlightFolderFlightPlan';
import {
  elapsedSeconds,
  FLIGHT_REPORT_REMARKS_MAX_LENGTH,
  FlightReportTimes,
} from '../../../System/FlightFolderReport';
import { DocumentTextEntry } from '../Shared/DocumentTextEntry';
import { DocumentFieldContainer, DocumentTextField } from '../Shared/DocumentTextField';
import './flight-folder.scss';

interface OitFlightReportPanelProps extends ComponentProps {
  readonly folder: FlightFolder;
  readonly session: FlightFolderSession;
  readonly keyboard: DocumentFieldContainer;
  /** The times and fuel the avionics recorded: empty while their data do not reach the laptop */
  readonly report: Subscribable<FlightReportTimes>;
  /** Whether the aircraft shows tonnes (else thousands of pounds) */
  readonly metric: boolean;
}

/**
 * The FLT REPORT panel of the flight plan. Design choice: the panel has no documented layout, so it is a plain form:
 * the OUT, OFF, ON and IN times and the fuel on board at each, as the avionics recorded them, the block and flight
 * times, and the remarks of the crew with the master status.
 */
export class OitFlightReportPanel extends DestroyableComponent<OitFlightReportPanelProps> {
  private readonly entry = new DocumentTextEntry((text) => this.remarksTyped(text));

  private lastRemarks = this.props.folder.flightPlan.followUp.remarks;

  private readonly events: [
    string,
    (times: FlightReportTimes) => number | null,
    (times: FlightReportTimes) => number | null,
  ][] = [
    ['OUT', (t) => t.outMs, (t) => t.outFobKg],
    ['OFF', (t) => t.offMs, (t) => t.offFobKg],
    ['ON', (t) => t.onMs, (t) => t.onFobKg],
    ['IN', (t) => t.inMs, (t) => t.inFobKg],
  ];

  private readonly editable = MappedSubject.create(
    ([master, current]) => master && current === this.props.folder.id && !this.props.folder.closed,
    this.props.session.isMaster,
    this.props.session.currentId,
    // A flight closure closes the folder without changing who is current
    this.props.folder.changed,
  );
  private readonly readOnly = this.editable.map((editable) => !editable);
  private readonly remarksText = this.props.folder.changed.map(() => this.props.folder.flightPlan.followUp.remarks);

  private readonly blockText = this.props.report.map((t) => durationText(elapsedSeconds(t.blockMs)));
  private readonly flightText = this.props.report.map((t) => durationText(elapsedSeconds(t.flightMs)));

  private readonly cells = this.events.map(([, time, fob]) => ({
    time: this.props.report.map((t) => clockText(time(t))),
    fob: this.props.report.map((t) => weightText(fob(t), this.props.metric)),
  }));

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.entry.set(this.lastRemarks === '' ? null : this.lastRemarks);
    this.subscriptions.push(
      this.editable,
      this.readOnly,
      this.remarksText,
      this.blockText,
      this.flightText,
      ...this.cells.map((c) => c.time),
      ...this.cells.map((c) => c.fob),
      this.props.folder.changed.sub(() => {
        // Remarks that came from the other laptop (REFRESH, SYNCHRONIZE) replace what the field shows
        const remarks = this.props.folder.flightPlan.followUp.remarks;
        if (remarks !== this.lastRemarks) {
          this.lastRemarks = remarks;
          this.entry.set(remarks === '' ? null : remarks);
        }
      }),
    );
  }

  private remarksTyped(text: string): void {
    this.lastRemarks = text;
    this.props.session.setRemarks(text);
  }

  render(): VNode {
    const unit = this.props.metric ? 'T' : 'KLB';
    return (
      <div>
        <div class="oit-eff-group">
          <div class="oit-eff-group-title">Flight report</div>
          <div class="oit-eff-report-grid">
            <div />
            <div class="head">TIME</div>
            <div class="head">{`FOB (${unit})`}</div>
            {this.events.map(([label], index) => (
              <>
                <div class="left">{label}</div>
                <div>{this.cells[index].time}</div>
                <div>{this.cells[index].fob}</div>
              </>
            ))}
            <div class="left">BLOCK</div>
            <div>{this.blockText}</div>
            <div />
            <div class="left">FLIGHT</div>
            <div>{this.flightText}</div>
            <div />
          </div>
        </div>
        <div class="oit-eff-group">
          <div class="oit-eff-group-title">Remarks</div>
          <div class={{ 'oit-eff-report-remarks': true, hidden: this.editable }}>{this.remarksText}</div>
          <div class={{ hidden: this.readOnly }}>
            <DocumentTextField
              container={this.props.keyboard}
              entry={this.entry}
              maxLength={FLIGHT_REPORT_REMARKS_MAX_LENGTH}
              width={700}
            />
          </div>
        </div>
      </div>
    );
  }
}
