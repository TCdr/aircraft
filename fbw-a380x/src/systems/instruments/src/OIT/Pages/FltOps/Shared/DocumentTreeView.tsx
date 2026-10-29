//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, FSComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { DocumentTreeRow } from './DocumentTree';
import './document-widgets.scss';

/** Pixels each depth level of the tree moves a line to the right */
const INDENT_PX = 16;

interface DocumentTreeViewProps extends ComponentProps {
  readonly rows: Subscribable<readonly DocumentTreeRow[]>;
  /** A line was clicked */
  readonly onSelect: (row: DocumentTreeRow) => void;
  /** The + or - icon of a folder was clicked */
  readonly onToggle: (row: DocumentTreeRow) => void;
}

/**
 * The navigation tree: one line per row, with the + and - icon of the folders, the selected line boxed and the search
 * hits in green. The lines are plain elements rebuilt on each change, as the sim browser never fires a JSX onClick on a
 * plain element.
 */
export class DocumentTreeView extends DestroyableComponent<DocumentTreeViewProps> {
  private readonly containerRef = FSComponent.createRef<HTMLDivElement>();

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(this.props.rows.sub((rows) => this.rebuild(rows), true));
  }

  private rebuild(rows: readonly DocumentTreeRow[]): void {
    const container = this.containerRef.instance;
    const scrollTop = container.scrollTop;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    let selectedLine: HTMLElement | null = null;
    for (const row of rows) {
      const line = document.createElement('div');
      line.className = `oit-doc-tree-row${row.selected ? ' selected' : ''}${row.hit ? ' hit' : ''}${
        row.rowClass ? ` ${row.rowClass}` : ''
      }`;
      line.style.paddingLeft = `${row.depth * INDENT_PX}px`;

      const opener = document.createElement('span');
      opener.className = 'oit-doc-tree-opener';
      opener.textContent = row.expandable ? (row.expanded ? '-' : '+') : '';
      if (row.expandable) {
        opener.addEventListener('click', (event) => {
          event.stopPropagation();
          this.props.onToggle(row);
        });
      }
      line.appendChild(opener);

      const icon = document.createElement('span');
      icon.className = `oit-doc-tree-icon ${row.kind}`;
      line.appendChild(icon);

      if (row.badge !== undefined) {
        const badge = document.createElement('span');
        badge.className = 'oit-doc-tree-badge';
        badge.textContent = row.badge;
        line.appendChild(badge);
      }

      const title = document.createElement('span');
      title.className = `oit-doc-tree-title${row.titleClass ? ` ${row.titleClass}` : ''}`;
      title.textContent = row.title;
      line.appendChild(title);

      line.addEventListener('click', () => this.props.onSelect(row));
      container.appendChild(line);
      if (row.selected) {
        selectedLine = line;
      }
    }
    container.scrollTop = scrollTop;
    // Keep the selected line in view after a step to the next unit
    if (selectedLine !== null) {
      if (selectedLine.offsetTop < container.scrollTop) {
        container.scrollTop = selectedLine.offsetTop;
      } else if (selectedLine.offsetTop + selectedLine.offsetHeight > container.scrollTop + container.clientHeight) {
        container.scrollTop = selectedLine.offsetTop + selectedLine.offsetHeight - container.clientHeight;
      }
    }
  }

  render(): VNode {
    return <div ref={this.containerRef} class="oit-doc-tree" />;
  }
}
