//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, FSComponent, MappedSubject, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { SearchHit, groupHitsByDocument } from './DocumentSearch';
import './document-widgets.scss';

interface DocumentSearchResultsProps extends ComponentProps {
  /** The hits of the last search, null before any search */
  readonly hits: Subscribable<readonly SearchHit[] | null>;
  /** CONSULT: the crew opens a hit */
  readonly onConsult: (hit: SearchHit) => void;
}

/** The RESULTS frame of a search: the hits under their document, and CONSULT for the selected one */
export class DocumentSearchResults extends DestroyableComponent<DocumentSearchResultsProps> {
  private readonly listRef = FSComponent.createRef<HTMLDivElement>();

  private readonly selectedId = Subject.create<string | null>(null);

  private currentHits: readonly SearchHit[] = [];

  private readonly consultDisabled = MappedSubject.create(
    ([hits, selected]) => selected === null || hits === null || !hits.some((hit) => hit.id === selected),
    this.props.hits,
    this.selectedId,
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      this.consultDisabled,
      this.props.hits.sub((hits) => {
        this.currentHits = hits ?? [];
        this.selectedId.set(null);
        this.rebuild();
      }, true),
      this.selectedId.sub(() => this.rebuild()),
    );
  }

  private rebuild(): void {
    const list = this.listRef.instance;
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
    for (const group of groupHitsByDocument(this.currentHits)) {
      const heading = document.createElement('div');
      heading.className = 'oit-doc-results-group';
      heading.textContent = group.group;
      list.appendChild(heading);
      for (const hit of group.hits) {
        const line = document.createElement('div');
        line.className = `oit-doc-results-hit${hit.id === this.selectedId.get() ? ' selected' : ''}`;
        line.textContent = hit.context !== undefined ? `${hit.title}  (${hit.context})` : hit.title;
        line.addEventListener('click', () => this.selectedId.set(hit.id));
        line.addEventListener('dblclick', () => this.props.onConsult(hit));
        list.appendChild(line);
      }
    }
  }

  private consult(): void {
    const hit = this.currentHits.find((h) => h.id === this.selectedId.get());
    if (hit !== undefined) {
      this.props.onConsult(hit);
    }
  }

  render(): VNode {
    return (
      <div class="oit-doc-results">
        <div class="oit-doc-frame-title">RESULTS</div>
        <div ref={this.listRef} class="oit-doc-results-list" />
        <div class="oit-doc-results-buttons">
          <Button label="CONSULT" disabled={this.consultDisabled} onClick={() => this.consult()} />
        </div>
      </div>
    );
  }
}
