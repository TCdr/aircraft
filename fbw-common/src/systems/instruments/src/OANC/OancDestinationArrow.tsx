// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ComponentProps, DisplayComponent, FSComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

/**
 * The OANS destination arrow: when the moving airport map is out of the ND range and the selected range is 5 NM, an
 * arrow points to the destination airport (its bearing, not the runway orientation), with its ICAO code. In ROSE NAV
 * mode it is white, between the dashed middle ring and the compass rose, with the ICAO code beside it.
 */

/** The A380 OANS range for the arrow, NM */
export const A380_OANS_DESTINATION_ARROW_RANGE_NM = 5;

/**
 * @param airportWithinRange the moving airport map is within the ND range
 * @param selectedRangeNm the selected OANS range
 * @param arrowRangeNm the OANS range the arrow needs (the A380's 5 NM); undefined: any range (A32NX)
 * @returns whether the destination arrow is shown
 */
export function isOansDestinationArrowShown(
  airportWithinRange: boolean,
  selectedRangeNm: number,
  arrowRangeNm: number | undefined,
): boolean {
  return !airportWithinRange && (arrowRangeNm === undefined || selectedRangeNm === arrowRangeNm);
}

export interface OancDestinationArrowProps extends ComponentProps {
  /** The centre of the compass rose (the aircraft), in the overlay's coordinates */
  centerX: number;
  centerY: number;
  /** The distance from the centre to the tail of the arrow */
  radius: number;
  /** The size of the arrow (1 = the ARC mode arrow) */
  scale: number;
  /** The airport's bearing relative to the top of the display, degrees clockwise */
  rotationToAirport: Subscribable<number>;
  visible: Subscribable<boolean>;
  airportIcao: Subscribable<string>;
}

/** The white arrow toward the airport, with its ICAO code kept upright beside it */
export class OancDestinationArrow extends DisplayComponent<OancDestinationArrowProps> {
  render(): VNode | null {
    const { centerX, centerY, radius, scale } = this.props;
    return (
      <g
        transform={this.props.rotationToAirport.map(
          (rotation) =>
            `translate(${centerX} ${centerY}) rotate(${rotation.toFixed(2)}) translate(0 ${-radius}) rotate(-90) scale(${scale}) translate(0 -15)`,
        )}
        class="White"
        fill="none"
        stroke-width={3 / scale}
        stroke-linecap="round"
        visibility={this.props.visible.map((visible) => (visible ? 'inherit' : 'hidden'))}
      >
        <path d="m21,15l-17.33333,-13l60,0l31.66667,12l-31.66667,13l-60.33333,0l17.66667,-12z" />
        <g
          transform={this.props.rotationToAirport.map(
            (rotation) => `translate(60 60) rotate(${(-rotation + 90).toFixed(2)})`,
          )}
        >
          <text text-anchor="middle" font-size={20 / scale}>
            {this.props.airportIcao}
          </text>
        </g>
      </g>
    );
  }
}
