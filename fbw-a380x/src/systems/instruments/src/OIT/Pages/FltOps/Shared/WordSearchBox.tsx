//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { SEARCH_HIT_WARNING_LIMIT, SearchQuery, SearchResult, parseSearchQuery } from './DocumentSearch';
import { DocumentTextEntry } from './DocumentTextEntry';
import { DocumentFieldContainer, DocumentTextField } from './DocumentTextField';
import './document-widgets.scss';

/** Design choice: the most characters of a search text */
const WORD_SEARCH_MAX_LENGTH = 60;

interface WordSearchBoxProps extends ComponentProps {
  readonly container: DocumentFieldContainer;
  /** The frame title */
  readonly title: string;
  /** Runs the search of a query on the searched documents */
  readonly search: (query: SearchQuery) => SearchResult;
  /** The hits to list (after the crew confirmed a long list), with the query that found them */
  readonly onResults: (result: SearchResult, query: SearchQuery) => void;
}

/**
 * A framed word search: a field and SEARCH. The words are alternatives, "and" and "or" join them and a phrase goes in
 * quotes. A search with a long hit list asks the crew to confirm before the hits are listed.
 */
export class WordSearchBox extends DestroyableComponent<WordSearchBoxProps> {
  private readonly entry = new DocumentTextEntry();

  private readonly warningHidden = Subject.create(true);

  private pending: { result: SearchResult; query: SearchQuery } | null = null;

  private runSearch(): void {
    const query = parseSearchQuery(this.entry.current());
    if (query === null) {
      return;
    }
    const result = this.props.search(query);
    if (result.tooMany) {
      this.pending = { result, query };
      this.warningHidden.set(false);
      return;
    }
    this.props.onResults(result, query);
  }

  private confirmWarning(): void {
    this.warningHidden.set(true);
    if (this.pending !== null) {
      this.props.onResults(this.pending.result, this.pending.query);
      this.pending = null;
    }
  }

  render(): VNode {
    return (
      <div class="oit-doc-frame">
        <div class="oit-doc-frame-title">{this.props.title}</div>
        <div class="oit-doc-search-line">
          <DocumentTextField
            container={this.props.container}
            entry={this.entry}
            maxLength={WORD_SEARCH_MAX_LENGTH}
            width={330}
          />
          <Button label="SEARCH" onClick={() => this.runSearch()} />
        </div>
        <div class={{ 'oit-doc-warning': true, hidden: this.warningHidden }}>
          <span>{`MORE THAN ${SEARCH_HIT_WARNING_LIMIT} HITS`}</span>
          <Button label="OK" onClick={() => this.confirmWarning()} />
        </div>
      </div>
    );
  }
}
