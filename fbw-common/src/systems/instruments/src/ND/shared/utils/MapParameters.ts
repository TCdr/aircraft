// @ts-strict-ignore
import { Coordinates, placeBearingDistance } from 'msfs-geo';

export class MapParameters {
  public centerCoordinates: Coordinates;

  public mapUpTrueDeg: number;

  public nmToPx: number;

  public mToPx: number;

  public nmRadius: number;

  public centerYBias: number;

  public version = 0;

  public valid = false;

  compute(
    centerCoordinates: Coordinates,
    centerYBias: number,
    nmRadius: number,
    pxRadius: number,
    mapUpTrueDeg: number,
  ): void {
    this.version++;
    this.valid =
      Number.isFinite(centerCoordinates.lat) &&
      Number.isFinite(centerCoordinates.long) &&
      Number.isFinite(pxRadius) &&
      Number.isFinite(mapUpTrueDeg);

    this.mapUpTrueDeg = mapUpTrueDeg;
    this.centerCoordinates = centerCoordinates;
    this.centerYBias = centerYBias;
    this.nmToPx = pxRadius / nmRadius;
    this.mToPx = this.nmToPx / 1852;
    this.nmRadius = nmRadius;
  }

  coordinatesToXYy(coordinates: Coordinates): [number, number] {
    const bearing =
      Avionics.Utils.computeGreatCircleHeading(this.centerCoordinates, coordinates) - this.mapUpTrueDeg - 90;
    const distance = Avionics.Utils.computeGreatCircleDistance(this.centerCoordinates, coordinates);

    const xNm = distance * Math.cos((bearing * Math.PI) / 180);
    const yNm = distance * Math.sin((bearing * Math.PI) / 180);

    return [xNm * this.nmToPx, yNm * this.nmToPx + this.centerYBias];
  }

  /**
   * The coordinates of a point of the map (the inverse of {@link coordinatesToXYy}), for a click on the map
   * @param x pixels to the right of the map centre
   * @param y pixels below the map centre
   */
  xyToCoordinates(x: number, y: number): Coordinates {
    const xNm = x / this.nmToPx;
    const yNm = (y - this.centerYBias) / this.nmToPx;
    const distance = Math.hypot(xNm, yNm);
    const bearing = (Math.atan2(yNm, xNm) * 180) / Math.PI + this.mapUpTrueDeg + 90;
    return placeBearingDistance(this.centerCoordinates, ((bearing % 360) + 360) % 360, distance);
  }

  /**
   * Rotates a true bearing into the map orientation
   * @param trueBearing
   * @returns rotation to be applied
   */
  rotation(trueBearing: number): number {
    return trueBearing - this.mapUpTrueDeg;
  }
}
