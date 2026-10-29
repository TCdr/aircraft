//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, DisplayComponent, FSComponent, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { FlightFolder } from '../../../System/FlightFolder';
import {
  altnUpdateCell,
  durationText,
  EffFuelKey,
  EffLoadKey,
  EffUpdateCell,
  fuelLineVisible,
  fuelUpdateCell,
  loadUpdateCell,
  parseWeight,
  signedText,
  weightText,
} from '../../../System/FlightFolderFlightPlan';
import { oisDateMixedCase, oisTime } from '../../../System/OisDateTime';
import { LogbookFieldKeyboard } from '../../NssAvncs/Logbook/LogbookWidgets';
import { OitPerfEntryFormat } from '../Performance/OitPerfEntryFormat';
import './flight-folder.scss';

/** The waypoints of one NAV LOG page. Design choice: fourteen two-line rows fit the document window. */
export const NAV_LOG_ROWS_PER_PAGE = 14;

/**
 * @param waypointCount the waypoints of the navigation log
 * @returns the tabs of the flight plan, one NAV LOG page for each group of waypoints
 */
export function flightPlanTabs(waypointCount: number): string[] {
  const pages = Math.max(1, Math.ceil(waypointCount / NAV_LOG_ROWS_PER_PAGE));
  const tabs = ['FMS INIT', 'FLT INFO', 'ALTN'];
  for (let page = 1; page <= pages; page++) {
    tabs.push(`NAV LOG ${page}`);
  }
  return tabs;
}

interface EffUpdateFieldProps extends ComponentProps {
  readonly folder: FlightFolder;
  readonly keyboard: LogbookFieldKeyboard;
  readonly metric: boolean;
  readonly cell: () => EffUpdateCell;
  /** Stores the crew entry in kg, null to remove it */
  readonly set: (kg: number | null) => void;
}

/** An Update cell of the flight plan: cyan for the crew's entry, green for a value computed from the entries */
class EffUpdateField extends DestroyableComponent<EffUpdateFieldProps> {
  private readonly value = Subject.create<number | null>(null);
  private readonly source = Subject.create<EffUpdateCell['source']>(null);

  private readonly format = new OitPerfEntryFormat<number>(
    (text) => parseWeight(text, this.props.metric),
    (kg) => weightText(kg, this.props.metric),
    6,
  );

  private readonly disabled = this.props.folder.changed.map(() => this.props.folder.closed);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      this.disabled,
      this.props.folder.changed.sub(() => {
        const cell = this.props.cell();
        this.value.set(cell.kg);
        this.source.set(cell.source);
      }, true),
    );
  }

  render(): VNode {
    return (
      <div
        class={{
          'oit-eff-cell': true,
          cyan: this.source.map((s) => s === 'crew'),
          green: this.source.map((s) => s === 'computed'),
        }}
      >
        <InputField<number>
          dataEntryFormat={this.format}
          value={this.value}
          onModified={(kg) => this.props.set(kg)}
          disabled={this.disabled}
          canBeCleared={true}
          alignText="flex-end"
          containerStyle="width: 100%;"
          hEventConsumer={this.props.keyboard.hEventConsumer}
          interactionMode={this.props.keyboard.interactionMode}
          errorHandler={() => {}}
        />
      </div>
    );
  }
}

interface OitFlightPlanPanelsProps extends ComponentProps {
  readonly folder: FlightFolder;
  readonly tab: Subject<string>;
  readonly keyboard: LogbookFieldKeyboard;
  readonly oisVersion: Subscribable<string>;
  /** Whether the aircraft shows tonnes (else thousands of pounds) */
  readonly metric: boolean;
}

/** The flight plan document: the FMS INIT, FLT INFO, ALTN and NAV LOG panels of the electronic flight folder */
export class OitFlightPlanPanels extends DestroyableComponent<OitFlightPlanPanelsProps> {
  private readonly panelRef = FSComponent.createRef<HTMLDivElement>();
  private readonly tabsRef = FSComponent.createRef<HTMLDivElement>();

  private readonly plan = this.props.folder.flightPlan;

  private readonly tabs = flightPlanTabs(this.plan.navLog.length);

  private panel: VNode | null = null;
  private panelSubscriptions: { destroy(): void }[] = [];

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.renderTabs();
    this.subscriptions.push(this.props.tab.sub((tab) => this.showPanel(tab), true));
  }

  public destroy(): void {
    this.destroyPanel();
    super.destroy();
  }

  private renderTabs(): void {
    const container = this.tabsRef.instance;
    for (const tab of this.tabs) {
      const element = document.createElement('div');
      element.className = 'oit-eff-tab';
      element.textContent = tab;
      element.addEventListener('click', () => this.props.tab.set(tab));
      container.appendChild(element);
    }
    this.subscriptions.push(
      this.props.tab.sub((selected) => {
        const children = container.children;
        for (let i = 0; i < children.length; i++) {
          children[i].classList.toggle('selected', this.tabs[i] === selected);
        }
      }, true),
    );
  }

  private destroyPanel(): void {
    this.panelSubscriptions.forEach((s) => s.destroy());
    this.panelSubscriptions = [];
    const container = this.panelRef.getOrDefault();
    if (container) {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    }
    if (this.panel?.instance instanceof DisplayComponent) {
      this.panel.instance.destroy();
    }
    this.panel = null;
  }

  private showPanel(tab: string): void {
    this.destroyPanel();
    const known = this.tabs.includes(tab) ? tab : this.tabs[0];
    if (known === 'FMS INIT') {
      this.panel = this.fmsInit();
    } else if (known === 'FLT INFO') {
      this.panel = this.fltInfo();
    } else if (known === 'ALTN') {
      this.panel = this.altn();
    } else {
      this.panel = this.navLog(Number(known.substring('NAV LOG '.length)) - 1);
    }
    FSComponent.render(this.panel, this.panelRef.instance);
  }

  /**
   * @param read the text of the cell
   * @returns a text that follows the folder
   */
  private text(read: () => string): Subscribable<string> {
    const mapped = this.props.folder.changed.map(read);
    this.panelSubscriptions.push(mapped);
    return mapped;
  }

  private fuel(key: EffFuelKey): VNode {
    return (
      <EffUpdateField
        folder={this.props.folder}
        keyboard={this.props.keyboard}
        metric={this.props.metric}
        cell={() => fuelUpdateCell(this.plan, key)}
        set={(kg) => this.props.folder.setFuelUpdate(key, kg)}
      />
    );
  }

  private load(key: EffLoadKey): VNode {
    return (
      <EffUpdateField
        folder={this.props.folder}
        keyboard={this.props.keyboard}
        metric={this.props.metric}
        cell={() => loadUpdateCell(this.plan, key)}
        set={(kg) => this.props.folder.setLoadUpdate(key, kg)}
      />
    );
  }

  private fmsInit(): VNode {
    const p = this.plan;
    const w = (value: number | null): string => (value === null ? '' : String(value));
    return (
      <div>
        <div class="oit-eff-group">
          <div class="oit-eff-group-title">General</div>
          <div class="oit-eff-form">
            <div class="label">OIS VERSION</div>
            <div style="grid-column: span 3;">{this.props.oisVersion}</div>
            <div class="label">A/C REG.</div>
            <div style="grid-column: span 3;">{p.registration}</div>
          </div>
        </div>
        <div class="oit-eff-group">
          <div class="oit-eff-group-title">Initialization Data :</div>
          <div class="oit-eff-form">
            <div class="label">FLT NBR</div>
            <div>{p.flightNumber}</div>
            <div class="label" />
            <div />
            <div class="label">FROM</div>
            <div>{p.fromIcao}</div>
            <div class="label">TO</div>
            <div>{p.toIcao}</div>
            <div class="label" />
            <div />
            <div class="label">ALTN</div>
            <div>{p.altnIcao}</div>
            <div class="label">CPNY RTE</div>
            <div>{p.companyRoute}</div>
            <div class="label">NM</div>
            <div>{w(p.groundNm)}</div>
            <div class="label">ETD</div>
            <div>{p.etdMs !== null ? oisTime(p.etdMs) : ''}</div>
            <div class="label" />
            <div />
            <div class="label">CRZ FL</div>
            <div>{w(p.cruiseFlightLevel)}</div>
            <div class="label">CRZ TEMP</div>
            <div>{signedText(p.cruiseTempC)}</div>
            <div class="label">CI</div>
            <div>{w(p.costIndex)}</div>
            <div class="label">AVG DISA</div>
            <div>{p.avgDisaC === null ? '' : String(Math.round(p.avgDisaC))}</div>
            <div class="label">TRIP WIND</div>
            <div>{signedText(p.tripWindKt)}</div>
            <div class="label">TROPO</div>
            <div>{w(p.tropopauseFeet)}</div>
          </div>
        </div>
        <div class="oit-eff-group">
          <div class="oit-eff-group-title">Flight Plan</div>
          <div class="oit-eff-route">{p.route}</div>
        </div>
      </div>
    );
  }

  private fltInfo(): VNode {
    const p = this.plan;
    const metric = this.props.metric;
    const est = (kg: number | null): string => weightText(kg, metric);
    const fuelCells = (key: EffFuelKey, label: string, tag: string, nam: boolean): VNode[] => [
      <div class="head">{label}</div>,
      <div class="left">{tag}</div>,
      <div>{this.text(() => (fuelLineVisible(this.plan, key) ? est(p.fuel[key].estimateKg) : ''))}</div>,
      this.fuel(key),
      <div>{durationText(p.fuel[key].timeS)}</div>,
      <div>{nam && p.fuel[key].airNm !== null ? String(Math.round(p.fuel[key].airNm as number)) : ''}</div>,
    ];
    const loadCells = (line: [EffLoadKey, string, number | null] | undefined): VNode[] =>
      line === undefined
        ? [<div />, <div />, <div />, <div />, <div />]
        : [
            <div class="sep">II</div>,
            <div class="head">{line[1]}</div>,
            <div>{est(p.load[line[0]])}</div>,
            this.load(line[0]),
            <div>{est(line[2])}</div>,
          ];
    const rows: [EffFuelKey, string, string, boolean][] = [
      ['trip', 'TRIP', p.toIcao, true],
      ['rteRsv', 'RTE RSV', p.regulationRsvPercent !== null ? p.regulationRsvPercent.toFixed(2) : '', false],
      ['etops', 'ETOPS', '', false],
      ['altn', 'ALTN', p.altnIcao, true],
      ['final', 'FINAL', '', false],
      ['addnl', 'ADDNL', '', false],
      ['xtr', 'XTR', '', false],
      ['tof', 'TOF', '', false],
      ['taxi', 'TAXI', '', false],
    ];
    const loads: [EffLoadKey, string, number | null][] = [
      ['dow', 'DOW', null],
      ['pld', 'PLD', null],
      ['zfw', 'ZFW', p.maxStruct.zfw],
      ['tof', 'TOF', null],
      ['tow', 'TOW', p.maxStruct.tow],
      ['ebo', 'EBO', null],
      ['lw', 'LW', p.maxStruct.lw],
    ];
    const computed = p.generatedMs !== null ? `${oisDateMixedCase(p.generatedMs)} ${oisTime(p.generatedMs)}` : '';
    const mach = p.cruiseMach !== null ? `M${String(Math.round(p.cruiseMach * 100))}` : '';
    const etd = p.etdMs !== null ? `${oisDateMixedCase(p.etdMs)}  ${oisTime(p.etdMs)}` : '';
    const cells: VNode[] = [];
    rows.forEach(([key, label, tag, nam], index) => {
      cells.push(...fuelCells(key, label, tag, nam), ...loadCells(loads[index]));
    });
    return (
      <div>
        <div class="oit-eff-plan-line">
          <div>{`PLAN  ${p.planNumber ?? ''}`}</div>
          <div>{`COMPUTED  ${computed}`}</div>
        </div>
        <div class="oit-eff-plan-line">
          <div>{`${p.registration}  ${p.aircraftType}  ${mach}`}</div>
          <div>{`ETD  ${etd}`}</div>
        </div>
        <div class="oit-eff-header-grid" style="margin-top: 14px;">
          <div>FLT</div>
          <div>DEP</div>
          <div>ARR</div>
          <div>F.TIME</div>
          <div>NM</div>
          <div>ROUTE</div>
          <div>SID</div>
          <div>AVG WIND</div>
          <div>AVG TEMP</div>
          <div>{p.flightNumber}</div>
          <div>{p.fromIata || p.fromIcao}</div>
          <div>{p.toIata || p.toIcao}</div>
          <div>{durationText(p.flightTimeS)}</div>
          <div>{p.groundNm !== null ? String(p.groundNm) : ''}</div>
          <div>{p.companyRoute}</div>
          <div>{p.sid}</div>
          <div>{signedText(p.tripWindKt)}</div>
          <div>{signedText(p.cruiseTempC)}</div>
          <div />
          <div>{p.fromIcao}</div>
          <div>{p.toIcao}</div>
        </div>
        <div class="oit-eff-fuel-load" style="margin-top: 18px;">
          <div class="head left">FUEL</div>
          <div />
          <div class="head">Estimate</div>
          <div class="head update">Update</div>
          <div class="head">E.Time</div>
          <div class="head">NAM</div>
          <div class="sep">II</div>
          <div class="head left">LOAD</div>
          <div class="head">Estimate</div>
          <div class="head update">Update</div>
          <div class="head">Max Struct</div>
          {cells}
          <div class="left" style="grid-column: span 11;">
            {'TRPT COEF  -'}
          </div>
        </div>
      </div>
    );
  }

  private altn(): VNode {
    const p = this.plan;
    return (
      <div>
        <div class="oit-eff-group">
          <div class="oit-eff-group-title">Alternate</div>
          <div class="oit-eff-altn-grid">
            <div class="left">ALTN</div>
            <div>NAM</div>
            <div>NM</div>
            <div>FL</div>
            <div>TIME</div>
            <div>FUEL</div>
            <div class="update">Update</div>
            {p.altnRows.map((row, index) => (
              <>
                <div class="left">{row.icao}</div>
                <div>{row.airNm !== null ? String(Math.round(row.airNm)) : '-'}</div>
                <div>{row.groundNm !== null ? String(Math.round(row.groundNm)) : '-'}</div>
                <div>{row.flightLevel !== null ? String(row.flightLevel) : '-'}</div>
                <div>{row.timeS !== null ? durationText(row.timeS) : '-'}</div>
                <div>{row.fuelKg !== null ? weightText(row.fuelKg, this.props.metric) : '-'}</div>
                <EffUpdateField
                  folder={this.props.folder}
                  keyboard={this.props.keyboard}
                  metric={this.props.metric}
                  cell={() => altnUpdateCell(p, index)}
                  set={(kg) => this.props.folder.setAltnFuelUpdate(index, kg)}
                />
              </>
            ))}
          </div>
        </div>
      </div>
    );
  }

  private navLog(page: number): VNode {
    const rows = this.plan.navLog.slice(page * NAV_LOG_ROWS_PER_PAGE, (page + 1) * NAV_LOG_ROWS_PER_PAGE);
    const metric = this.props.metric;
    return (
      <div class="oit-eff-navlog">
        <div class="head left">WPT/AWY</div>
        <div class="head">MORA</div>
        <div class="head">ET/CT</div>
        <div class="head">ETA</div>
        <div class="head">EFOB</div>
        <div class="head">EFU</div>
        {rows.map((row) => (
          <>
            <div class="left band">{row.ident}</div>
            <div class="band">{row.moraHundredFeet !== null ? String(row.moraHundredFeet) : ''}</div>
            <div class="band green">{durationText(row.legS)}</div>
            <div class="band green">{row.etaMs !== null ? oisTime(row.etaMs) : ''}</div>
            <div class="band">{weightText(row.efobKg, metric)}</div>
            <div class="band">{weightText(row.efuKg, metric)}</div>
            <div class="left">{row.airway}</div>
            <div />
            <div class="green">{durationText(row.cumS)}</div>
            <div />
            <div />
            <div />
          </>
        ))}
      </div>
    );
  }

  render(): VNode {
    return (
      <>
        <div ref={this.tabsRef} class="oit-eff-tabs" />
        <div ref={this.panelRef} class="oit-eff-panel" />
      </>
    );
  }
}
