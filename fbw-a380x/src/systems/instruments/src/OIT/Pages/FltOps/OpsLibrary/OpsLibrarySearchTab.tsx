//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { SearchHit } from '../Shared/DocumentSearch';
import { DocumentSearchResults } from '../Shared/DocumentSearchResults';
import { DocumentTextEntry } from '../Shared/DocumentTextEntry';
import { DocumentTextField } from '../Shared/DocumentTextField';
import { WordSearchBox } from '../Shared/WordSearchBox';
import {
  ecamTitleSearchHits,
  functionalCodeHits,
  parseFunctionalCode,
} from '../../../System/OpsLibrary/OpsLibrarySearch';
import { OpsLibraryViewProps } from './OpsLibraryContext';
import './ops-library.scss';

/** Design choice: the most characters of an alert title search */
const ECAM_SEARCH_MAX_LENGTH = 40;

/** A functional code is a chapter, section and item: 24-11-01 */
const FUNCTIONAL_CODE_MAX_LENGTH = 8;

/** The SEARCH tab: WORD SEARCH, ECAM SEARCH and FUNCTIONAL CODE SEARCH, with their hits in the RESULTS frame */
export class OpsLibrarySearchTab extends DestroyableComponent<OpsLibraryViewProps> {
  private readonly session = this.props.ctx.session;

  private readonly ecamEntry = new DocumentTextEntry();

  private readonly codeEntry = new DocumentTextEntry();

  private readonly status = Subject.create('');

  private runEcamSearch(): void {
    const hits = ecamTitleSearchHits(this.session.catalog, this.ecamEntry.current());
    this.status.set(hits.length === 0 ? 'NO ECAM ALERT FOUND' : '');
    this.session.setSearchHits(hits, null);
  }

  private runCodeSearch(): void {
    const code = parseFunctionalCode(this.codeEntry.current());
    if (code === null) {
      this.status.set('INVALID FUNCTIONAL CODE (EXAMPLE: 24 OR 24-11)');
      this.session.setSearchHits([], null);
      return;
    }
    const hits = functionalCodeHits(this.session.catalog, code);
    this.status.set(hits.length === 0 ? 'NO ITEM FOUND' : '');
    this.session.setSearchHits(hits, null);
  }

  private consult(hit: SearchHit): void {
    const query = this.session.searchQuery();
    this.session.consultation.openUnit(hit.id);
    if (query !== null) {
      this.session.consultation.showSearchHitsInManual(this.session.searchHits.get() ?? [], query);
    }
  }

  render(): VNode {
    return (
      <div class="oit-ops-tab">
        <div class="oit-ops-search">
          <div class="oit-ops-search-left">
            <WordSearchBox
              container={this.props.ctx.fields}
              title="WORD SEARCH"
              search={(query) => this.session.wordSearchIndex().search(query)}
              onResults={(result, query) => {
                this.status.set(result.hits.length === 0 ? 'NO ITEM FOUND' : '');
                this.session.setSearchHits(result.hits, query);
              }}
            />
            <div class="oit-doc-frame">
              <div class="oit-doc-frame-title">ECAM SEARCH</div>
              <div class="oit-doc-search-line">
                <DocumentTextField
                  container={this.props.ctx.fields}
                  entry={this.ecamEntry}
                  maxLength={ECAM_SEARCH_MAX_LENGTH}
                  width={330}
                />
                <Button label="SEARCH" onClick={() => this.runEcamSearch()} />
              </div>
            </div>
            <div class="oit-doc-frame">
              <div class="oit-doc-frame-title">FUNCTIONAL CODE SEARCH</div>
              <div class="oit-doc-search-line">
                <DocumentTextField
                  container={this.props.ctx.fields}
                  entry={this.codeEntry}
                  maxLength={FUNCTIONAL_CODE_MAX_LENGTH}
                  width={330}
                />
                <Button label="SEARCH" onClick={() => this.runCodeSearch()} />
              </div>
            </div>
            <div class="oit-ops-small-text">{this.status}</div>
          </div>
          <div class="oit-ops-search-right">
            <DocumentSearchResults hits={this.session.searchHits} onConsult={(hit) => this.consult(hit)} />
          </div>
        </div>
      </div>
    );
  }
}
