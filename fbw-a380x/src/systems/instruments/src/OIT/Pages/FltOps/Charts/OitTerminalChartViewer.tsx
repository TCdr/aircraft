//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ChartImageSupplier, ComponentProps, FSComponent, MappedSubject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { ChartsSession } from '../../../System/Charts/ChartsSession';
import { TerminalChartPage } from '../../../System/Charts/TerminalChartSource';
import {
  centreView,
  FIT_VIEW,
  PanDirection,
  panView,
  Size,
  viewLayout,
  zoomView,
  ZOOM_STEPS,
} from '../../../System/Charts/TerminalChartViewport';

/** Design choice: a chart image that has not come after this long is reported as not available */
const IMAGE_TIMEOUT_MS = 15000;

/** The page layout sets the size of the viewer after it was drawn: how often the viewer checks that it still fits */
const LAYOUT_POLL_MS = 250;

const ARROW_POINTS: Readonly<Record<PanDirection, string>> = {
  left: '15,3 15,19 5,11',
  right: '7,3 7,19 17,11',
  up: '3,15 19,15 11,5',
  down: '3,7 19,7 11,17',
};

/**
 * @param direction where the arrow points
 * @returns the label of a pan button
 */
function arrowLabel(direction: PanDirection): VNode {
  return (
    <svg class="oit-charts-arrow" width="22" height="22" viewBox="0 0 22 22">
      <polygon points={ARROW_POINTS[direction]} fill="white" />
    </svg>
  );
}

interface OitTerminalChartViewerProps extends ComponentProps {
  readonly session: ChartsSession;
}

/**
 * The chart viewer with its buttons: pages, zoom, pan and FIT. The chart image is the sim's own image of the page; it is
 * moved and enlarged by the buttons and by a click that centres the clicked point. The size of the viewer comes from
 * the page layout, so the chart is laid out again whenever that size changes.
 */
export class OitTerminalChartViewer extends DestroyableComponent<OitTerminalChartViewerProps> {
  private readonly session = this.props.session;

  /** The supplier of the gauge, shared by every visit of this page: the viewer never destroys it */
  private readonly supplier: ChartImageSupplier = this.session.createImageSupplier();

  private readonly viewerRef = FSComponent.createRef<HTMLDivElement>();
  private readonly imageRef = FSComponent.createRef<HTMLImageElement>();
  private readonly messageRef = FSComponent.createRef<HTMLDivElement>();
  private readonly messageTextRef = FSComponent.createRef<HTMLDivElement>();
  private readonly retryRef = FSComponent.createRef<HTMLDivElement>();

  private readonly pageCount = this.session.pages.map((pages) => (pages.status === 'loaded' ? pages.pages.length : 0));

  private readonly pageShown = MappedSubject.create(
    ([pages, pageIndex]): TerminalChartPage | null =>
      pages.status === 'loaded' ? pages.pages[pageIndex] ?? null : null,
    this.session.pages,
    this.session.pageIndex,
  );

  private readonly pageLabel = MappedSubject.create(
    ([count, index]) => (count > 0 ? `PAGE ${index + 1}/${count}` : 'PAGE -'),
    this.pageCount,
    this.session.pageIndex,
  );

  private readonly noPreviousPage = this.session.pageIndex.map((index) => index <= 0);

  private readonly noNextPage = MappedSubject.create(
    ([count, index]) => index >= count - 1,
    this.pageCount,
    this.session.pageIndex,
  );

  private readonly noPage = this.pageShown.map((page) => page === null);

  private readonly cannotZoomOut = MappedSubject.create(
    ([page, view]) => page === null || view.zoomIndex <= 0,
    this.pageShown,
    this.session.view,
  );

  private readonly cannotZoomIn = MappedSubject.create(
    ([page, view]) => page === null || view.zoomIndex >= ZOOM_STEPS.length - 1,
    this.pageShown,
    this.session.view,
  );

  /** The address of the page image the supplier was asked for */
  private requestedUrl = '';

  private imageTimedOut = false;
  private imageTimer: number | null = null;
  private layoutPoll: number | null = null;
  private lastLayoutKey = '';

  private readonly onViewerClick = (event: MouseEvent): void => {
    const geometry = this.geometry();
    if (geometry === null || event.target === this.retryRef.instance) {
      return;
    }
    const viewer = this.viewerRef.instance;
    const rect = viewer.getBoundingClientRect();
    // The screen may be scaled: the click is turned into the px of the viewer's own layout
    const scale = viewer.offsetWidth > 0 ? rect.width / viewer.offsetWidth : 1;
    const x = (event.clientX - rect.left) / scale - viewer.clientLeft;
    const y = (event.clientY - rect.top) / scale - viewer.clientTop;
    this.session.view.set(centreView(this.session.view.get(), x, y, geometry.page, geometry.viewer));
  };

  /** @returns the page and the viewer sizes, null when no page is shown or the viewer has no size yet */
  private geometry(): { page: Size; viewer: Size } | null {
    const page = this.pageShown.get();
    const viewer = this.viewerRef.getOrDefault();
    if (page === null || viewer === null || viewer.clientWidth <= 0 || viewer.clientHeight <= 0) {
      return null;
    }
    return { page, viewer: { width: viewer.clientWidth, height: viewer.clientHeight } };
  }

  private zoom(step: 1 | -1): void {
    const geometry = this.geometry();
    if (geometry !== null) {
      this.session.view.set(zoomView(this.session.view.get(), step, geometry.page, geometry.viewer));
    }
  }

  private pan(direction: PanDirection): void {
    const geometry = this.geometry();
    if (geometry !== null) {
      this.session.view.set(panView(this.session.view.get(), direction, geometry.page, geometry.viewer));
    }
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.viewerRef.instance.addEventListener('click', this.onViewerClick);
    this.retryRef.instance.addEventListener('click', () => this.retry());

    this.subscriptions.push(
      this.pageCount,
      this.pageShown,
      this.pageLabel,
      this.noPreviousPage,
      this.noNextPage,
      this.noPage,
      this.cannotZoomOut,
      this.cannotZoomIn,
      this.session.chart.sub(() => this.refresh()),
      this.session.pages.sub(() => this.refresh()),
      this.session.pageIndex.sub(() => this.refresh()),
      this.session.view.sub(() => this.applyLayout()),
      this.supplier.image.sub(() => this.refresh()),
    );
    this.layoutPoll = window.setInterval(() => this.applyLayout(), LAYOUT_POLL_MS);
    this.refresh();
  }

  /** RETRY: the page of the chart, or its image, did not come: ask again */
  private retry(): void {
    if (this.session.pages.get().status === 'error') {
      this.session.retry();
      return;
    }
    this.requestedUrl = '';
    this.imageTimedOut = false;
    this.refresh();
  }

  /** Shows what the session and the image supplier have: the image, or the word that says why there is none */
  private refresh(): void {
    const chart = this.session.chart.get();
    const pages = this.session.pages.get();
    const page = this.pageShown.get();
    let message: string | null = null;
    let amber = false;
    let retry = false;
    let imageUrl = '';

    const pageImageUrl = chart !== null && pages.status === 'loaded' && page !== null ? page.imageUrl : '';
    this.requestImage(pageImageUrl);

    if (chart === null) {
      message = 'SELECT A CHART';
    } else if (pages.status === 'loading' || pages.status === 'none') {
      message = 'LOADING...';
    } else if (pages.status === 'error') {
      message = 'CHART NOT AVAILABLE';
      amber = true;
      retry = true;
    } else if (page === null) {
      message = 'CHART IMAGE NOT AVAILABLE';
      amber = true;
    } else {
      // The supplier answers for the address it was asked for last; an answer for an earlier page does not count
      const image = this.supplier.image.get();
      const answered = image.chartUrl === page.imageUrl;
      if (answered && image.errorCode === 0 && image.imageUrl !== '') {
        imageUrl = image.imageUrl;
      } else if ((answered && image.errorCode !== 0) || this.imageTimedOut) {
        message = 'CHART IMAGE NOT AVAILABLE';
        amber = true;
        retry = true;
      } else {
        message = 'LOADING...';
      }
    }

    const image = this.imageRef.instance;
    if (image.getAttribute('src') !== imageUrl) {
      if (imageUrl === '') {
        image.removeAttribute('src');
      } else {
        image.setAttribute('src', imageUrl);
      }
    }
    image.style.display = imageUrl === '' ? 'none' : 'block';
    this.messageRef.instance.classList.toggle('hidden', message === null);
    this.messageRef.instance.classList.toggle('amber', amber);
    this.messageTextRef.instance.textContent = message ?? '';
    this.retryRef.instance.classList.toggle('hidden', !retry);
    this.lastLayoutKey = '';
    this.applyLayout();
  }

  /** @param url the page image to show, empty for none: the supplier is asked once for each address */
  private requestImage(url: string): void {
    if (url === this.requestedUrl) {
      return;
    }
    this.requestedUrl = url;
    this.imageTimedOut = false;
    if (this.imageTimer !== null) {
      window.clearTimeout(this.imageTimer);
      this.imageTimer = null;
    }
    this.supplier.showChartImage(url);
    if (url !== '') {
      this.imageTimer = window.setTimeout(() => {
        this.imageTimer = null;
        this.imageTimedOut = true;
        this.refresh();
      }, IMAGE_TIMEOUT_MS);
    }
  }

  /** Puts the page where the view says, for the size the viewer has now */
  private applyLayout(): void {
    const geometry = this.geometry();
    const image = this.imageRef.instance;
    if (geometry === null) {
      return;
    }
    const view = this.session.view.get();
    const key = `${geometry.viewer.width}x${geometry.viewer.height}/${geometry.page.width}x${geometry.page.height}/${view.zoomIndex}/${view.centreX}/${view.centreY}`;
    if (key === this.lastLayoutKey) {
      return;
    }
    this.lastLayoutKey = key;
    const layout = viewLayout(view, geometry.page, geometry.viewer);
    image.style.left = `${Math.round(layout.left)}px`;
    image.style.top = `${Math.round(layout.top)}px`;
    image.style.width = `${Math.round(layout.width)}px`;
    image.style.height = `${Math.round(layout.height)}px`;
  }

  public destroy(): void {
    if (this.layoutPoll !== null) {
      window.clearInterval(this.layoutPoll);
    }
    if (this.imageTimer !== null) {
      window.clearTimeout(this.imageTimer);
    }
    this.viewerRef.getOrDefault()?.removeEventListener('click', this.onViewerClick);
    // The supplier stays: the sim's chart service may still write the image of its view
    super.destroy();
  }

  public render(): VNode {
    return (
      <div class="oit-charts-right">
        <div class="oit-charts-viewer-bar">
          <Button
            label={arrowLabel('left')}
            disabled={this.noPreviousPage}
            onClick={() => this.session.setPage(this.session.pageIndex.get() - 1)}
            buttonStyle="width: 54px;"
          />
          <div class="oit-charts-page-label">{this.pageLabel}</div>
          <Button
            label={arrowLabel('right')}
            disabled={this.noNextPage}
            onClick={() => this.session.setPage(this.session.pageIndex.get() + 1)}
            buttonStyle="width: 54px;"
          />
          <div style="width: 14px;" />
          <Button label="ZOOM -" disabled={this.cannotZoomOut} onClick={() => this.zoom(-1)} />
          <Button label="ZOOM +" disabled={this.cannotZoomIn} onClick={() => this.zoom(1)} />
          <Button
            label="FIT"
            disabled={this.noPage}
            onClick={() => this.session.view.set(FIT_VIEW)}
            buttonStyle="width: 64px;"
          />
          <div style="width: 14px;" />
          <Button
            label={arrowLabel('left')}
            disabled={this.noPage}
            onClick={() => this.pan('left')}
            buttonStyle="width: 54px;"
          />
          <Button
            label={arrowLabel('up')}
            disabled={this.noPage}
            onClick={() => this.pan('up')}
            buttonStyle="width: 54px;"
          />
          <Button
            label={arrowLabel('down')}
            disabled={this.noPage}
            onClick={() => this.pan('down')}
            buttonStyle="width: 54px;"
          />
          <Button
            label={arrowLabel('right')}
            disabled={this.noPage}
            onClick={() => this.pan('right')}
            buttonStyle="width: 54px;"
          />
        </div>
        <div ref={this.viewerRef} class="oit-charts-viewer">
          <img ref={this.imageRef} class="oit-charts-image" style="display: none;" />
          <div ref={this.messageRef} class="oit-charts-message">
            <div ref={this.messageTextRef} />
            <div ref={this.retryRef} class="mfd-button hidden">
              RETRY
            </div>
          </div>
        </div>
      </div>
    );
  }
}
