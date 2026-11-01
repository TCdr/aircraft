//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, FSComponent, MappedSubject, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { SearchQuery } from '../Shared/DocumentSearch';
import { EMPTY_AIRCRAFT_STATUS, FltOpsAircraftStatus } from '../../../System/Performance/AircraftStatus';
import { OpsBlock, OpsLayer, OpsNode, blocksOfLayer, ecamUnitId } from '../../../System/OpsLibrary/OpsLibraryContent';
import { OpsLibrarySession } from '../../../System/OpsLibrary/OpsLibrarySession';
import { InlineRun, inlineRuns } from '../../../System/OpsLibrary/OpsLibraryInline';
import { LogbookStatusRows, isItemTicked, setItemTicked } from '../../../System/OpsLibrary/OpsLibraryLogbookStatus';
import { lineStyleColour, parseFwcText, procedureLines } from '../../../System/OpsLibrary/OpsLibraryProcedureLines';
import { WdLineData } from '../../../../MsfsAvionicsCommon/EcamMessages';
import './ops-library.scss';

const BLOCK_LABELS: Readonly<Partial<Record<OpsBlock['t'], string>>> = {
  warn: 'WARNING',
  note: 'NOTE',
  tip: 'TIP',
  situations: 'SITUATIONS',
  limits: 'LIMITS',
};

/**
 * The lines of an ECAM procedure of a unit, as the generator of the EWD draws them
 * @param unit an ECAM PROCEDURES unit
 * @param session the OPS LIBRARY of the laptop
 * @returns the lines
 */
export function ecamUnitLines(unit: OpsNode, session: OpsLibrarySession): WdLineData[] {
  return unit.ecamId !== undefined
    ? procedureLines(unit.ecamId, session.consultation.procedureStateOf(ecamUnitId(unit.ecamId)))
    : [];
}

interface OpsLibraryUnitViewProps extends ComponentProps {
  readonly session: OpsLibrarySession;
  /** The aircraft status of the FLT OPS domain, which the tick box of an MMEL entry changes */
  readonly aircraftStatus: Subject<FltOpsAircraftStatus | null>;
  readonly logbookRows: Subscribable<LogbookStatusRows>;
  readonly docRefShown: Subscribable<boolean>;
}

/**
 * The right pane of the consultation: the title box and the unit. A unit of a generated manual shows its blocks of the
 * layer chosen, an ECAM PROCEDURES unit its procedure, an MMEL unit its title and reference, a folder its contents.
 */
export class OpsLibraryUnitView extends DestroyableComponent<OpsLibraryUnitViewProps> {
  private readonly titleRef = FSComponent.createRef<HTMLDivElement>();

  private readonly bodyRef = FSComponent.createRef<HTMLDivElement>();

  private readonly consultation = this.props.session.consultation;

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    const content = MappedSubject.create(
      () => this.rebuild(),
      this.consultation.nodeId,
      this.consultation.layer,
      this.consultation.search,
      this.props.aircraftStatus,
      this.props.logbookRows,
      this.props.docRefShown,
    );
    this.subscriptions.push(content);
  }

  /**
   * SUB-TOPICS: brings a block of the unit to the top of the pane
   * @param blockIndex the index of the block in the unit
   */
  public scrollToBlock(blockIndex: number): void {
    const element = this.bodyRef.instance.querySelector(`[data-block="${blockIndex}"]`) as HTMLElement | null;
    if (element !== null) {
      this.bodyRef.instance.scrollTop = element.offsetTop;
    }
  }

  private rebuild(): void {
    const body = this.bodyRef.instance;
    while (body.firstChild) {
      body.removeChild(body.firstChild);
    }
    const unit = this.consultation.openNode();
    this.titleRef.instance.textContent = unit?.title ?? '';
    this.titleRef.instance.classList.toggle('hidden', unit === undefined);
    body.className = `oit-ops-unit layer-${this.consultation.layer.get()}`;
    if (unit === undefined) {
      return;
    }
    const found = this.props.session.catalog.find(unit.id);
    const manual = found !== undefined ? this.props.session.catalog.manual(found.manualId) : undefined;
    if (this.props.docRefShown.get() && manual !== undefined) {
      body.appendChild(this.textDiv('oit-ops-docref', `${manual.title} - ${unit.id} - revision ${manual.revision}`));
    }
    if (unit.kind === 'folder') {
      this.folderContents(body, unit, manual?.id === unit.id ? `${manual.title}  -  revision ${manual.revision}` : '');
    } else if (unit.ecamId !== undefined && unit.id === ecamUnitId(unit.ecamId)) {
      this.procedureBody(body, unit);
    } else if (unit.mmelReference !== undefined) {
      this.mmelBody(body, unit);
    } else {
      this.blocksBody(body, unit);
    }
  }

  private textDiv(className: string, text: string): HTMLDivElement {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    return div;
  }

  private folderContents(body: HTMLElement, folder: OpsNode, heading: string): void {
    if (heading !== '') {
      body.appendChild(this.textDiv('oit-ops-block', heading));
    }
    const list = document.createElement('div');
    list.className = 'oit-ops-folder-list';
    for (const child of folder.children ?? []) {
      const link = this.textDiv('oit-ops-link', child.title);
      link.addEventListener('click', () => this.consultation.select(child.id));
      list.appendChild(link);
    }
    body.appendChild(list);
  }

  private blocksBody(body: HTMLElement, unit: OpsNode): void {
    const query = this.consultation.search.get()?.query ?? null;
    const layer: OpsLayer = this.consultation.layer.get();
    // The sub-topic indexes refer to all blocks: a block keeps its index in the unit
    const all = unit.blocks ?? [];
    const shown = blocksOfLayer(all, layer);
    for (const block of shown) {
      const element = this.blockElement(block, query);
      element.setAttribute('data-block', String(all.indexOf(block)));
      body.appendChild(element);
    }
  }

  private runsInto(parent: HTMLElement, text: string, query: SearchQuery | null): void {
    inlineRuns(text, query).forEach((run: InlineRun) => {
      const span = document.createElement('span');
      span.className = `${run.code ? 'oit-ops-code' : ''}${run.hit ? ' oit-ops-hit' : ''}`.trim();
      span.textContent = run.text;
      parent.appendChild(span);
    });
  }

  private blockElement(block: OpsBlock, query: SearchQuery | null): HTMLElement {
    const element = document.createElement('div');
    element.className = `oit-ops-block ${block.t}`;
    const label = BLOCK_LABELS[block.t];
    if (block.t === 'figure') {
      this.runsInto(element, `[Figure] ${block.text ?? ''}`, query);
      return element;
    }
    if (label !== undefined) {
      const labelSpan = document.createElement('span');
      labelSpan.className = 'oit-ops-block-label';
      labelSpan.textContent = label;
      element.appendChild(labelSpan);
    }
    if (block.text !== undefined) {
      this.runsInto(element, block.text, query);
    }
    if (block.items !== undefined) {
      const list = document.createElement(block.t === 'steps' ? 'ol' : 'ul');
      for (const item of block.items) {
        const li = document.createElement('li');
        this.runsInto(li, item, query);
        list.appendChild(li);
      }
      element.appendChild(list);
    }
    if (block.rows !== undefined || block.head !== undefined) {
      const table = document.createElement('table');
      if (block.head !== undefined) {
        const row = document.createElement('tr');
        for (const cell of block.head) {
          const th = document.createElement('th');
          this.runsInto(th, cell, query);
          row.appendChild(th);
        }
        table.appendChild(row);
      }
      for (const cells of block.rows ?? []) {
        const row = document.createElement('tr');
        for (const cell of cells) {
          const td = document.createElement('td');
          this.runsInto(td, cell, query);
          row.appendChild(td);
        }
        table.appendChild(row);
      }
      element.appendChild(table);
    }
    return element;
  }

  private procedureBody(body: HTMLElement, unit: OpsNode): void {
    for (const line of ecamUnitLines(unit, this.props.session)) {
      const div = document.createElement('div');
      div.className = 'oit-ops-line';
      const defaultColour = lineStyleColour(line.style);
      const runs = parseFwcText(line.text, defaultColour);
      runs.forEach((segments, lineIndex) => {
        if (lineIndex > 0) {
          div.appendChild(document.createElement('br'));
        }
        for (const segment of segments) {
          const span = document.createElement('span');
          span.className = `oit-ops-colour-${segment.colour}${segment.underlined ? ' underlined' : ''}${segment.framed ? ' framed' : ''}`;
          span.textContent = segment.text;
          div.appendChild(span);
        }
      });
      body.appendChild(div);
    }
  }

  private mmelBody(body: HTMLElement, unit: OpsNode): void {
    const reference = unit.mmelReference ?? '';
    body.appendChild(this.textDiv('oit-ops-block', `Reference : ${reference}`));
    // Design choice: no airline MMEL text is bundled, the entry is an empty structure
    body.appendChild(this.textDiv('oit-ops-block oit-ops-small-text', 'No MMEL text is loaded for this entry.'));

    const rows = this.props.logbookRows.get();
    const mel = rows.mel.find((row) => row.reference === reference);
    const cdl = rows.cdl.find((row) => row.reference === reference);
    const row = mel ?? cdl;
    if (row === undefined) {
      return;
    }
    const status = this.props.aircraftStatus.get();
    const ticked = status !== null && isItemTicked(status, reference);
    const tick = document.createElement('div');
    tick.className = 'oit-ops-mmel-tick';
    const box = document.createElement('span');
    box.style.cssText = 'display:inline-block;width:28px;height:28px;border:2px solid #fff;';
    box.textContent = ticked ? 'X' : '';
    const text = this.textDiv('', 'Item selected for T.O PERF and LDG PERF');
    const toggle = () =>
      this.props.aircraftStatus.set(
        setItemTicked(
          this.props.aircraftStatus.get() ?? EMPTY_AIRCRAFT_STATUS,
          row,
          mel !== undefined ? 'MEL' : 'CDL',
          !ticked,
        ),
      );
    box.addEventListener('click', toggle);
    text.addEventListener('click', toggle);
    tick.appendChild(box);
    tick.appendChild(text);
    body.appendChild(tick);
  }

  render(): VNode {
    return (
      <div class="oit-ops-unit-wrapper" style="display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0;">
        <div ref={this.titleRef} class="oit-ops-unit-title" />
        <div ref={this.bodyRef} class="oit-ops-unit" />
      </div>
    );
  }
}
