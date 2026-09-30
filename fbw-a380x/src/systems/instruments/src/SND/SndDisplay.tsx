// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { DisplayComponent, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { formatLatitude, formatLongitude, SndNavigation } from './SndData';
import { SndFixView, SndGuidanceView, SndLowerView } from './SndViews';

/**
 * Geometry of the SND on its 512 x 512 screen, from the figures of the A380 FCOM (DSC-34-10-20-30): the heading rose
 * centred on the aircraft symbol, the navigation line above the waypoint list
 */
const CX = 256;
const CY = 256;
/** Outer radius of the rose graduations */
const ROSE_RADIUS = 190;
/** The rose shows 240°: 120° each side of the heading */
const ROSE_HALF_SPAN = 120;
const LONG_TICK = 22;
const SHORT_TICK = 12;
/** Radius of the centre of the rose numbers */
const LABEL_RADIUS = ROSE_RADIUS - 44;
/** Numbers every 30°: at most 9 in 240° */
const LABEL_COUNT = 9;
/** Top of the position line, and the line above the waypoint list */
const POSITION_TOP = 358;
const SEPARATOR_Y = 402;
/** Baselines of the four lines of the waypoint list (FROM, TO, NEXT and the FIX) or of the menu */
const ROWS_Y = [430, 456, 482, 508];
/** The FIX bearing pointer: from the rose to near the aircraft symbol, each side */
const FIX_OUTER = ROSE_RADIUS - 14;
const FIX_INNER = 58;
/** Deviation scale: 5 NM between the large lines, full scale 10 NM */
const PIXELS_PER_NM = 8;
const FULL_SCALE_NM = 10;
/** Parts of the course pointer: the arrow from the rose to the deviation bar, the bar, the tail */
const COURSE_OUTER = 150;
const COURSE_INNER = 64;
const BAR_HALF_LENGTH = 56;
/** The coordinates being entered: 8 fields, and the separators between them */
const EDITOR_SEPARATORS = [' ', ' ', '.', ' / ', ' ', ' ', '.', ''];

const polar = (angle: number, radius: number): [number, number] => {
  const a = (angle * Math.PI) / 180;
  return [CX + radius * Math.sin(a), CY - radius * Math.cos(a)];
};

/** The shortest angle from a to b, -180 to 180 */
const relative = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

interface RoseLabel {
  text: Subject<string>;
  transform: Subject<string>;
  visible: Subject<boolean>;
}

export interface SndDisplayProps {
  navigation: Subject<SndNavigation>;
  /** TO WPT and the course of the leg, null when the navigation is not activated */
  guidance: Subject<SndGuidanceView | null>;
  /** The waypoint list, or the menu */
  lower: Subject<SndLowerView>;
  /** The FIX, null when there is none or no position */
  fix: Subject<SndFixView | null>;
  /** 0 (dark) to 1 */
  brightness: Subject<number>;
  /** The seconds left of the power-up tests of the ISIS unit, null out of the tests */
  selfTest: Subject<number | null>;
}

/**
 * The Standby Navigation Display (SND) of the A380 ISIS (FCOM DSC-34-10-20-30): heading rose (240°, graduated every 5°,
 * numbers every 30°) with the heading source, the track, the ground speed and the aircraft position with its source.
 */
export class SndDisplay extends DisplayComponent<SndDisplayProps> {
  private readonly heading = this.props.navigation.map((n) => n.heading);

  private readonly headingValid = this.heading.map((h) => h !== null);

  private readonly ticks = this.heading.map((h) => (h === null ? '' : SndDisplay.ticksPath(h)));

  private readonly labels: RoseLabel[] = Array.from({ length: LABEL_COUNT }, () => ({
    text: Subject.create(''),
    transform: Subject.create(''),
    visible: Subject.create(false),
  }));

  private readonly trackTransform = this.props.navigation.map((n) => {
    if (n.heading === null || n.track === null || Math.abs(relative(n.heading, n.track)) > ROSE_HALF_SPAN) {
      return null;
    }
    return `rotate(${relative(n.heading, n.track)} ${CX} ${CY})`;
  });

  private readonly headingSource = this.props.navigation.map((n) =>
    n.headingAdiru === null ? '' : `IR${n.headingAdiru}`,
  );

  private readonly trueReference = this.props.navigation.map((n) => n.headingAdiru !== null && n.trueReference);

  private readonly groundSpeed = this.props.navigation.map((n) =>
    n.groundSpeed === null ? '' : Math.round(n.groundSpeed).toString(),
  );

  private readonly positionValid = this.props.navigation.map((n) => n.latitude !== null && n.longitude !== null);

  private readonly position = this.props.navigation.map((n) =>
    n.latitude !== null && n.longitude !== null
      ? `${formatLatitude(n.latitude)} / ${formatLongitude(n.longitude)}`
      : '',
  );

  // The position is the ADIRU position, hybrid with the GPS (GPIRS): the ADIRS does not model a pure IR position
  private readonly positionSource = this.props.navigation.map((n) => `GPIR${n.positionAdiru}`);

  private readonly dimming = this.props.brightness.map((b) => (1 - b).toFixed(2));

  private readonly guidanceVisible = this.props.guidance.map((g) => g !== null);

  private readonly toBearing = this.props.guidance.map((g) => g?.bearing ?? '');

  private readonly toBearingUnit = this.props.guidance.map((g) => g?.bearingUnit ?? '');

  private readonly toDistance = this.props.guidance.map((g) => g?.distance ?? '');

  /** The desired track relative to the heading, degrees; null when not shown */
  private readonly courseAngle = this.props.guidance.map((g) => {
    const heading = this.props.navigation.get().heading;
    return g === null || heading === null ? null : relative(heading, g.desiredTrack);
  });

  /** The course pointer, rotated to the desired track, shown with the heading rose */
  private readonly courseTransform = this.courseAngle.map((a) =>
    a === null ? null : `rotate(${a.toFixed(1)} ${CX} ${CY})`,
  );

  /**
   * The lengths of the arrow (to the track) and of the tail: the end pointing down stops above the position line
   */
  private readonly courseLengths = this.courseAngle.map((a) => {
    const down = Math.cos(((a ?? 0) * Math.PI) / 180);
    const room = POSITION_TOP - 8 - CY;
    const limit = (verticalDown: number) =>
      verticalDown > 0.01 ? Math.min(COURSE_OUTER, room / verticalDown) : COURSE_OUTER;
    // The arrow points up the rotated frame (down on the screen when down < 0), the tail the other way
    return { arrow: Math.max(COURSE_INNER, limit(-down) - 16), tail: Math.max(COURSE_INNER, limit(down)) };
  });

  private readonly fixVisible = this.props.fix.map((f) => f !== null);

  private readonly fixDistance = this.props.fix.map((f) => f?.distance ?? '');

  /** The FIX bearing pointer, rotated to the FIX bearing, shown with the heading rose */
  private readonly fixAngle = this.props.fix.map((f) => {
    const heading = this.props.navigation.get().heading;
    return f === null || heading === null ? null : relative(heading, f.bearing);
  });

  /** The two parts of the pointer, the one pointing down stopped above the position line */
  private readonly fixPath = this.fixAngle.map((a) => {
    const down = Math.cos(((a ?? 0) * Math.PI) / 180);
    const room = POSITION_TOP - 8 - CY;
    const limit = (verticalDown: number) =>
      verticalDown > 0.01 ? Math.min(FIX_OUTER, room / verticalDown) : FIX_OUTER;
    const head = Math.max(FIX_INNER, limit(-down));
    const tail = Math.max(FIX_INNER, limit(down));
    // An open triangle near the outer end of each part, pointing to the FIX
    const triangle = (y: number) => `M${CX - 9} ${y + 8}L${CX} ${y - 8}L${CX + 9} ${y + 8}Z`;
    return (
      `M${CX} ${CY - head}V${CY - FIX_INNER}M${CX} ${CY + FIX_INNER}V${CY + tail}` +
      triangle(CY - head + 22) +
      triangle(CY + tail - 22)
    );
  });

  /** The deviation bar: to the left of the aircraft when the aircraft is right of the track */
  private readonly deviationX = this.props.guidance.map((g) => {
    const deviation = Math.max(-FULL_SCALE_NM, Math.min(FULL_SCALE_NM, g?.crossTrack ?? 0));
    return (CX - deviation * PIXELS_PER_NM).toFixed(1);
  });

  // The lower part: the waypoint list (FROM / TO / NEXT) or the menu
  private readonly rowLabels = ROWS_Y.map((_, i) =>
    this.props.lower.map((v) => (v.kind === 'list' ? v.rows[i]?.label ?? '' : '')),
  );

  private readonly rowTexts = ROWS_Y.map((_, i) =>
    this.props.lower.map((v) => {
      if (v.kind === 'list') {
        return v.rows[i]?.text ?? '';
      }
      if (i === 0) {
        return v.menu.title;
      }
      return i === 1 && v.menu.kind === 'waypoint' ? v.menu.text : '';
    }),
  );

  private readonly rowClasses = ROWS_Y.map((_, i) =>
    this.props.lower.map((v) => {
      if (v.kind === 'menu') {
        return i === 0 ? 'snd-cyan snd-list' : 'snd-green snd-list';
      }
      return `snd-${v.rows[i]?.colour ?? 'green'} snd-list`;
    }),
  );

  private readonly bracket = this.props.lower.map((v) => (v.kind === 'list' ? v.bracket : null));

  private readonly editorFields = this.props.lower.map((v) =>
    v.kind === 'menu' && v.menu.kind === 'coordinates' ? v.menu.fields : null,
  );

  /** The graduations of the rose within 120° of the heading, every 5° (long every 10°) */
  private static ticksPath(heading: number): string {
    let d = '';
    const first = Math.ceil((heading - ROSE_HALF_SPAN) / 5) * 5;
    for (let bearing = first; bearing <= heading + ROSE_HALF_SPAN; bearing += 5) {
      const angle = bearing - heading;
      const length = bearing % 10 === 0 ? LONG_TICK : SHORT_TICK;
      const [x1, y1] = polar(angle, ROSE_RADIUS);
      const [x2, y2] = polar(angle, ROSE_RADIUS - length);
      d += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }
    return d;
  }

  onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    // The numbers every 30° within 120° of the heading, upright along the rose (3 = 030°, 0 = 360°)
    this.heading.sub((heading) => {
      const first = heading === null ? 0 : Math.ceil((heading - ROSE_HALF_SPAN) / 30) * 30;
      this.labels.forEach((label, i) => {
        const bearing = first + i * 30;
        if (heading === null || bearing > heading + ROSE_HALF_SPAN) {
          label.visible.set(false);
          return;
        }
        const angle = bearing - heading;
        const [x, y] = polar(angle, LABEL_RADIUS);
        label.text.set(((((bearing % 360) + 360) % 360) / 10).toFixed(0));
        label.transform.set(`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
        label.visible.set(true);
      });
    }, true);
  }

  /** Fixed white markers every 45° (at 45° and 90° each side), outside the rose, pointing to it */
  private static marker(angle: number): string {
    const [tx, ty] = polar(angle, ROSE_RADIUS + 3);
    const [lx, ly] = polar(angle - 3, ROSE_RADIUS + 18);
    const [rx, ry] = polar(angle + 3, ROSE_RADIUS + 18);
    return `${tx.toFixed(1)},${ty.toFixed(1)} ${lx.toFixed(1)},${ly.toFixed(1)} ${rx.toFixed(1)},${ry.toFixed(1)}`;
  }

  render(): VNode {
    return (
      <svg class="snd" version="1.1" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        {/* Ground speed */}
        <text x={14} y={44} class="snd-white snd-small">
          GS
        </text>
        <text x={54} y={46} class="snd-green snd-large">
          {this.groundSpeed}
        </text>

        {/* Heading source: IR3 (IR1), TRU in true reference */}
        <g visibility={this.headingSource.map((s) => (s ? 'inherit' : 'hidden'))}>
          <text
            x={218}
            y={42}
            text-anchor="end"
            class="snd-cyan snd-small"
            visibility={this.trueReference.map((t) => (t ? 'inherit' : 'hidden'))}
          >
            TRU
          </text>
          <rect x={226} y={16} width={60} height={30} class="snd-box" />
          <text x={CX} y={41} text-anchor="middle" class="snd-white snd-small">
            {this.headingSource}
          </text>
        </g>

        {/* FIX: its symbol, and its distance to go */}
        <g visibility={this.fixVisible.map((v) => (v ? 'inherit' : 'hidden'))}>
          <path d="M22 106L15 118H29ZM22 118V126M15 126H29" class="snd-fix-symbol" />
          <text x={36} y={124} class="snd-magenta snd-small">
            FIX
          </text>
          <text x={14} y={158} class="snd-green snd-large">
            {this.fixDistance}
          </text>
          <text x={14} y={180} class="snd-cyan snd-unit">
            NM
          </text>
        </g>

        {/* TO WPT: bearing (magnetic °, or true T) and distance to the TO waypoint */}
        <g visibility={this.guidanceVisible.map((v) => (v ? 'inherit' : 'hidden'))}>
          <text x={306} y={42} class="snd-white snd-small">
            TO WPT
          </text>
          <text x={470} y={44} text-anchor="end" class="snd-green snd-large">
            {this.toBearing}
          </text>
          <text x={474} y={36} class="snd-cyan snd-small">
            {this.toBearingUnit}
          </text>
          <text x={456} y={76} text-anchor="end" class="snd-green snd-large">
            {this.toDistance}
          </text>
          <text x={460} y={76} class="snd-cyan snd-unit">
            NM
          </text>
        </g>

        {/* Heading rose */}
        <g visibility={this.headingValid.map((v) => (v ? 'inherit' : 'hidden'))}>
          <path d={this.ticks} class="snd-tick" />
          {this.labels.map((label) => (
            <text
              class="snd-white snd-rose"
              text-anchor="middle"
              dy={12}
              transform={label.transform}
              visibility={label.visible.map((v) => (v ? 'inherit' : 'hidden'))}
              x={0}
              y={0}
            >
              {label.text}
            </text>
          ))}
          {/* Desired track, deviation bar and deviation scale (large lines 5 NM, small lines 2.5 NM) */}
          <g
            transform={this.courseTransform.map((t) => t ?? '')}
            visibility={this.courseTransform.map((t) => (t !== null ? 'inherit' : 'hidden'))}
          >
            <path
              d={this.courseLengths.map(
                (l) => `M${CX} ${CY - l.arrow}V${CY - COURSE_INNER}M${CX} ${CY + COURSE_INNER}V${CY + l.tail}`,
              )}
              class="snd-course"
            />
            <polygon
              points={this.courseLengths.map(
                (l) => `${CX},${CY - l.arrow - 16} ${CX - 9},${CY - l.arrow + 2} ${CX + 9},${CY - l.arrow + 2}`,
              )}
              class="snd-course-head"
            />
            <path
              d={[-10, -7.5, -5, -2.5, 2.5, 5, 7.5, 10]
                .map((nm) => {
                  const x = CX + nm * PIXELS_PER_NM;
                  const half = nm % 5 === 0 ? 14 : 7;
                  return `M${x} ${CY - half}V${CY + half}`;
                })
                .join('')}
              class="snd-scale"
            />
            <path
              d={this.deviationX.map((x) => `M${x} ${CY - BAR_HALF_LENGTH}V${CY + BAR_HALF_LENGTH}`)}
              class="snd-course"
            />
          </g>
          {/* FIX bearing */}
          <g
            transform={this.fixAngle.map((a) => (a === null ? '' : `rotate(${a.toFixed(1)} ${CX} ${CY})`))}
            visibility={this.fixAngle.map((a) => (a !== null ? 'inherit' : 'hidden'))}
          >
            <path d={this.fixPath} class="snd-fix-pointer" />
          </g>
          {/* Track */}
          <g
            transform={this.trackTransform.map((t) => t ?? '')}
            visibility={this.trackTransform.map((t) => (t !== null ? 'inherit' : 'hidden'))}
          >
            <polygon
              points={`${CX},${CY - ROSE_RADIUS + 2} ${CX + 7},${CY - ROSE_RADIUS + 11} ${CX},${CY - ROSE_RADIUS + 20} ${CX - 7},${CY - ROSE_RADIUS + 11}`}
              class="snd-track"
            />
          </g>
        </g>
        {/* HDG: replaces the heading rose when the heading is not available */}
        <g visibility={this.headingValid.map((v) => (v ? 'hidden' : 'inherit'))}>
          <rect x={206} y={98} width={100} height={44} class="snd-flag" />
          <text x={CX} y={132} text-anchor="middle" class="snd-flag-text snd-large">
            HDG
          </text>
        </g>

        {/* Heading index and fixed markers */}
        {/* The heading index: yellow, white with the HDG flag */}
        <polygon
          points={`${CX - 10},52 ${CX + 10},52 ${CX},66`}
          class={this.headingValid.map((v) => (v ? 'snd-index' : 'snd-marker'))}
        />
        {[-90, -45, 45, 90].map((angle) => (
          <polygon points={SndDisplay.marker(angle)} class="snd-marker" />
        ))}

        {/* Aircraft symbol */}
        <path
          d={`M${CX - 20} ${CY}H${CX + 20}M${CX} ${CY - 14}V${CY + 18}M${CX - 8} ${CY + 14}H${CX + 8}`}
          class="snd-aircraft"
        />

        {/* Position and its source, or PPOS when the coordinates are invalid */}
        <g visibility={this.positionValid.map((v) => (v ? 'inherit' : 'hidden'))}>
          <rect x={10} y={POSITION_TOP + 4} width={90} height={30} class="snd-box" />
          <text x={55} y={POSITION_TOP + 28} text-anchor="middle" class="snd-white snd-small">
            {this.positionSource}
          </text>
          <text x={112} y={POSITION_TOP + 31} class="snd-green snd-position">
            {this.position}
          </text>
        </g>
        <g visibility={this.positionValid.map((v) => (v ? 'hidden' : 'inherit'))}>
          <rect x={10} y={POSITION_TOP + 4} width={80} height={30} class="snd-flag" />
          <text x={50} y={POSITION_TOP + 28} text-anchor="middle" class="snd-flag-text snd-small">
            PPOS
          </text>
        </g>
        <path d={`M6 ${SEPARATOR_Y}H506`} class="snd-separator" />

        {/* Waypoint list (FROM / TO / NEXT), or the menu: its item, or the waypoint or coordinates being selected */}
        {ROWS_Y.map((y, i) => (
          <>
            <text x={12} y={y} class="snd-white snd-label">
              {this.rowLabels[i]}
            </text>
            <text x={84} y={y} class={this.rowClasses[i]}>
              {this.rowTexts[i]}
            </text>
          </>
        ))}
        <g visibility={this.bracket.map((b) => (b !== null ? 'inherit' : 'hidden'))}>
          <path
            d={this.bracket.map((b) => {
              const top = ROWS_Y[b?.row ?? 0] - 9;
              const bottom = ROWS_Y[(b?.row ?? 0) + 1] - 9;
              return `M326 ${top}H336V${bottom}H326`;
            })}
            class="snd-bracket"
          />
          <text x={390} y={this.bracket.map((b) => ROWS_Y[b?.row ?? 0])} text-anchor="end" class="snd-green snd-list">
            {this.bracket.map((b) => b?.bearing ?? '')}
          </text>
          <text x={394} y={this.bracket.map((b) => ROWS_Y[b?.row ?? 0])} class="snd-cyan snd-unit">
            T
          </text>
          <text
            x={390}
            y={this.bracket.map((b) => ROWS_Y[(b?.row ?? 0) + 1])}
            text-anchor="end"
            class="snd-green snd-list"
          >
            {this.bracket.map((b) => b?.distance ?? '')}
          </text>
          <text x={394} y={this.bracket.map((b) => ROWS_Y[(b?.row ?? 0) + 1])} class="snd-cyan snd-unit">
            NM
          </text>
        </g>
        {/* The coordinates being entered, the field the SET/SEL knob changes in a box */}
        <text
          x={84}
          y={ROWS_Y[1]}
          class="snd-list"
          visibility={this.editorFields.map((f) => (f !== null ? 'inherit' : 'hidden'))}
        >
          {EDITOR_SEPARATORS.map((separator, i) => (
            <>
              <tspan class={this.editorFields.map((f) => (f?.[i]?.active ? 'snd-edit-active' : 'snd-green'))}>
                {this.editorFields.map((f) => f?.[i]?.text ?? '')}
              </tspan>
              <tspan class="snd-green">{separator}</tspan>
            </>
          ))}
        </text>

        {/* Power-up tests of the ISIS unit: INIT and the seconds left, as on the SFD */}
        <g visibility={this.props.selfTest.map((s) => (s !== null ? 'inherit' : 'hidden'))}>
          <rect x={150} y={332} width={180} height={40} class="snd-init" />
          <text x={160} y={365} class="snd-flag-text snd-init-text">
            INIT
          </text>
          <text x={325} y={365} text-anchor="end" class="snd-flag-text snd-init-text">
            {this.props.selfTest.map((s) => (s !== null ? `${s}s` : ''))}
          </text>
        </g>

        {/* Brightness (+ and - pb) */}
        <rect x={0} y={0} width={512} height={512} class="snd-dimming" fill-opacity={this.dimming} />
      </svg>
    );
  }
}
