// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { ChartImage, ChartImageSupplier, Subscribable } from '@microsoft/msfs-sdk';

/**
 * The one chart view of an OIT gauge, shared by every viewer that is shown on it over the life of the gauge. Design
 * choice: like the flyPad, the view is created once and never destroyed. The native chart service of the sim keeps
 * writing the image of a view and may still hold it when a page closes, so a view that is destroyed and created again
 * at every visit is released under the sim's feet. A viewer only asks for images and listens to the image.
 */
export class SharedChartImageSupplier implements ChartImageSupplier {
  private requestedUrl = '';

  /** @param view the view of the sim, already being initialized */
  constructor(private readonly view: ChartImageSupplier) {}

  /** @inheritdoc */
  public get image(): Subscribable<ChartImage> {
    return this.view.image;
  }

  /**
   * Asks the view for the image of a chart page. The same address is not asked twice while its answer is on its way or
   * has come: a viewer that opens again, or a RETRY after the timeout of the page, does not start a second request for
   * the same image. Only an answer with an error lets the same address be asked again.
   * @param chartUrl the page image to show, empty for none
   */
  public showChartImage(chartUrl: string): void {
    if (chartUrl === this.requestedUrl && !this.failed(chartUrl)) {
      return;
    }
    this.requestedUrl = chartUrl;
    this.view.showChartImage(chartUrl);
  }

  private failed(chartUrl: string): boolean {
    const image = this.view.image.get();
    return chartUrl !== '' && image.chartUrl === chartUrl && image.errorCode !== 0;
  }

  /** Does nothing: the view lives as long as the gauge */
  public destroy(): void {}
}
