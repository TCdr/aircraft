//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  ComponentProps,
  FSComponent,
  MappedSubject,
  Subject,
  Subscribable,
  ToggleableClassNameRecord,
  VNode,
} from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { IconButton } from '../../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { DataEntryFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { OitAvncsContainer } from '../../../OitAvncsContainer';
import { allRowsTicked } from './LogbookFlows';

interface LogbookClickableProps extends ComponentProps {
  readonly class?: string | ToggleableClassNameRecord;
  readonly style?: string;
  readonly onClick: () => void;
}

/** A plain element that reacts to a click (a JSX onClick on a plain element never fires in the sim) */
export class LogbookClickable extends DestroyableComponent<LogbookClickableProps> {
  private readonly ref = FSComponent.createRef<HTMLDivElement>();

  private readonly onClickHandler = () => this.props.onClick();

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.ref.instance.addEventListener('click', this.onClickHandler);
  }

  destroy(): void {
    this.ref.getOrDefault()?.removeEventListener('click', this.onClickHandler);
    super.destroy();
  }

  render(): VNode {
    return (
      <div ref={this.ref} class={this.props.class ?? ''} style={this.props.style ?? ''}>
        {this.props.children}
      </div>
    );
  }
}

interface LogbookTickBoxProps extends ComponentProps {
  readonly checked: Subscribable<boolean>;
  readonly disabled?: Subscribable<boolean>;
  readonly label?: string | Subscribable<string>;
  readonly labelClass?: string;
  /** The caption left of the box (NIL, NIL DEFECT): part of the click target, like the label right of it */
  readonly caption?: { readonly text: string; readonly width: number };
  readonly onToggle: () => void;
}

/** A tick box with its label (NIL DEFECT, NIL NO DE-ICING) */
export class LogbookTickBox extends DestroyableComponent<LogbookTickBoxProps> {
  private readonly disabled = this.props.disabled ?? Subject.create(false);

  render(): VNode {
    return (
      <LogbookClickable
        class="oit-logbook-row"
        onClick={() => {
          if (!this.disabled.get()) {
            this.props.onToggle();
          }
        }}
      >
        {this.props.caption ? (
          <div class="oit-logbook-label" style={`width: ${this.props.caption.width}px;`}>
            {this.props.caption.text}
          </div>
        ) : (
          <></>
        )}
        <span class={{ 'oit-logbook-tickbox': true, checked: this.props.checked, disabled: this.disabled }} />
        <span class={this.props.labelClass ?? ''}>{this.props.label ?? ''}</span>
      </LogbookClickable>
    );
  }
}

/** A column of a logbook table: its title and CSS width */
export interface LogbookTableColumn {
  readonly title: string;
  readonly width: string;
  readonly centered?: boolean;
}

export interface LogbookTableRow {
  readonly cells: readonly string[];
  /** The cell shown as a link (the REPORT title), opening the detailed report */
  readonly linkCell?: number;
  /** Extra classes of each cell, e.g. a colour */
  readonly cellClasses?: readonly string[];
  readonly onClick?: () => void;
  /** Tick box of the first column (OPEN ITEMS), undefined without one */
  readonly ticked?: boolean;
  readonly onTick?: () => void;
}

interface LogbookTableProps extends ComponentProps {
  readonly columns: readonly LogbookTableColumn[];
  readonly rows: Subscribable<readonly LogbookTableRow[]>;
  readonly rowsPerPage: number;
  /** A tick box column first, with a tick-all box in the header */
  readonly onTickAll?: () => void;
  /** Buttons next to the page buttons (SEND) */
  readonly extraButtons?: VNode;
}

/** A logbook table with the previous/next page buttons. The rows are plain elements, rebuilt on each change. */
export class LogbookTable extends DestroyableComponent<LogbookTableProps> {
  private readonly bodyRef = FSComponent.createRef<HTMLDivElement>();
  private readonly headerTickRef = FSComponent.createRef<HTMLSpanElement>();

  private readonly page = Subject.create(0);

  private readonly pageCount = this.props.rows.map((rows) =>
    Math.max(1, Math.ceil(rows.length / this.props.rowsPerPage)),
  );

  private readonly previousDisabled = this.page.map((p) => p === 0);
  private readonly nextDisabled = MappedSubject.create(([p, count]) => p >= count - 1, this.page, this.pageCount);

  private readonly onTickAllHandler = () => this.props.onTickAll?.();

  private readonly allTicked = this.props.rows.map(allRowsTicked);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const rowsAndPage = MappedSubject.create(this.props.rows, this.page);
    this.subscriptions.push(
      this.pageCount,
      this.previousDisabled,
      this.nextDisabled,
      this.allTicked,
      this.pageCount.sub((count) => {
        if (this.page.get() >= count) {
          this.page.set(count - 1);
        }
      }),
      rowsAndPage,
      rowsAndPage.sub(() => this.renderRows(), true),
    );
    this.headerTickRef.getOrDefault()?.addEventListener('click', this.onTickAllHandler);
  }

  destroy(): void {
    this.headerTickRef.getOrDefault()?.removeEventListener('click', this.onTickAllHandler);
    super.destroy();
  }

  private renderRows(): void {
    const body = this.bodyRef.getOrDefault();
    if (!body) {
      return;
    }
    while (body.firstChild) {
      body.removeChild(body.firstChild);
    }
    const start = this.page.get() * this.props.rowsPerPage;
    const rows = this.props.rows.get().slice(start, start + this.props.rowsPerPage);
    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'oit-logbook-table-row';
      if (this.props.onTickAll !== undefined) {
        const tickCell = document.createElement('div');
        tickCell.className = 'oit-logbook-table-cell centered';
        tickCell.style.width = '40px';
        const tick = document.createElement('span');
        tick.className = `oit-logbook-tickbox${row.ticked ? ' checked' : ''}`;
        tick.style.marginRight = '0px';
        if (row.onTick) {
          const onTick = row.onTick;
          tick.addEventListener('click', () => onTick());
        }
        tickCell.appendChild(tick);
        line.appendChild(tickCell);
      }
      row.cells.forEach((text, index) => {
        const column = this.props.columns[index];
        const cell = document.createElement('div');
        cell.className = `oit-logbook-table-cell${column?.centered ? ' centered' : ''} ${row.cellClasses?.[index] ?? ''}`;
        cell.style.width = column?.width ?? 'auto';
        const content = document.createElement('span');
        content.textContent = text;
        if (row.linkCell === index) {
          content.className = 'oit-logbook-link';
          if (row.onClick) {
            const onClick = row.onClick;
            content.addEventListener('click', () => onClick());
          }
        }
        cell.appendChild(content);
        line.appendChild(cell);
      });
      body.appendChild(line);
    }
  }

  render(): VNode {
    return (
      <div class="oit-logbook-column">
        <div class="oit-logbook-table">
          <div class="oit-logbook-table-header">
            {this.props.onTickAll !== undefined && (
              <div class="oit-logbook-table-cell centered" style="width: 40px;">
                <span
                  ref={this.headerTickRef}
                  class={{ 'oit-logbook-tickbox': true, checked: this.allTicked }}
                  style="margin-right: 0px;"
                />
              </div>
            )}
            {this.props.columns.map((column) => (
              <div class="oit-logbook-table-cell centered" style={`width: ${column.width};`}>
                {column.title}
              </div>
            ))}
          </div>
          <div ref={this.bodyRef} />
        </div>
        <div class="oit-logbook-table-pager">
          <IconButton
            icon="double-up"
            disabled={this.previousDisabled}
            onClick={() => this.page.set(Math.max(0, this.page.get() - 1))}
            containerStyle="width: 44px; height: 44px; margin-right: 6px;"
          />
          <IconButton
            icon="double-down"
            disabled={this.nextDisabled}
            onClick={() => this.page.set(Math.min(this.pageCount.get() - 1, this.page.get() + 1))}
            containerStyle="width: 44px; height: 44px;"
          />
          {this.props.extraButtons ?? <></>}
        </div>
      </div>
    );
  }
}

interface LogbookSelectionListProps extends ComponentProps {
  readonly items: Subscribable<readonly string[]>;
  readonly selectedIndex: Subject<number | null>;
  readonly style?: string;
}

/** The ITEM SELECTION list: one line per item, the selected one highlighted */
export class LogbookSelectionList extends DestroyableComponent<LogbookSelectionListProps> {
  private readonly listRef = FSComponent.createRef<HTMLDivElement>();

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      this.props.items.sub(() => {
        const selected = this.props.selectedIndex.get();
        if (selected !== null && selected >= this.props.items.get().length) {
          this.props.selectedIndex.set(null);
        }
        this.renderLines();
      }, true),
      this.props.selectedIndex.sub(() => this.renderLines()),
    );
  }

  private renderLines(): void {
    const list = this.listRef.getOrDefault();
    if (!list) {
      return;
    }
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
    this.props.items.get().forEach((text, index) => {
      const line = document.createElement('div');
      line.className = `oit-logbook-list-line${index === this.props.selectedIndex.get() ? ' selected' : ''}`;
      line.textContent = text;
      line.addEventListener('click', () => this.props.selectedIndex.set(index));
      list.appendChild(line);
    });
  }

  render(): VNode {
    return <div ref={this.listRef} class="oit-logbook-list" style={this.props.style ?? ''} />;
  }
}

interface LogbookFieldProps<T> extends ComponentProps {
  readonly container: OitAvncsContainer;
  readonly format: DataEntryFormat<T>;
  readonly value: Subscribable<T | null>;
  readonly onModified: (value: T | null) => void;
  readonly disabled?: Subscribable<boolean> | boolean;
  readonly mandatory?: Subscribable<boolean> | boolean;
  /** Magenta: the value comes from the avionics */
  readonly fromAvionics?: Subscribable<boolean>;
  readonly width: number;
  readonly alignText?: 'flex-start' | 'center' | 'flex-end';
}

/** An entry field of the logbook, written straight into the logbook */
export class LogbookField<T> extends DestroyableComponent<LogbookFieldProps<T>> {
  private readonly shown = Subject.create<T | null>(null);

  private readonly fromAvionics = this.props.fromAvionics ?? Subject.create(false);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(this.props.value.sub((v) => this.shown.set(v), true));
  }

  render(): VNode {
    return (
      <div class={{ 'oit-logbook-avionics': this.fromAvionics }}>
        {/* InputField resolves its value type only for a concrete type, not for the generic T of this field */}
        <InputField<unknown>
          dataEntryFormat={this.props.format as DataEntryFormat<unknown>}
          value={this.shown}
          onModified={(v) => this.props.onModified(v as T | null)}
          disabled={this.props.disabled ?? false}
          mandatory={this.props.mandatory ?? false}
          canBeCleared={true}
          alignText={this.props.alignText ?? 'center'}
          containerStyle={`width: ${this.props.width}px;`}
          hEventConsumer={this.props.container.hEventConsumer}
          interactionMode={this.props.container.interactionMode}
          errorHandler={() => {}}
        />
      </div>
    );
  }
}

interface LogbookValueBoxProps extends ComponentProps {
  /** The text */
  value: string | Subscribable<string>;
  /** The CSS width, the whole line by default */
  width?: string;
  /** Whether the text spans several lines (COMMENT, ADDITIONAL INFO) */
  multiline?: boolean;
  /** Whether the text is centred */
  centered?: boolean;
  /** The class of the text, e.g. its colour */
  textClass?: string;
}

/**
 * A read-only box of a detailed report. A component class: FSComponent builds every component tag by calling render()
 * on the instance, so a plain function component throws when its page is drawn.
 */
export class LogbookValueBox extends DestroyableComponent<LogbookValueBoxProps> {
  render(): VNode {
    return (
      <div
        class={{
          'oit-logbook-value-box': true,
          multiline: this.props.multiline ?? false,
          centered: this.props.centered ?? false,
        }}
        style={`width: ${this.props.width ?? '100%'};`}
      >
        <span class={this.props.textClass ?? ''}>{this.props.value}</span>
      </div>
    );
  }
}
