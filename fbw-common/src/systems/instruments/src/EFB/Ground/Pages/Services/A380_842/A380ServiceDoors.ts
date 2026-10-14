// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * A door the A380X flyPad Services page opens and closes.
 *
 * The sim numbers a door twice: `INTERACTIVE POINT OPEN:<interactivePoint>` reads it (flight_model.cfg
 * [INTERACTIVE POINTS]) and `K:TOGGLE_AIRCRAFT_EXIT <exit>` moves it, with exit = interactive point + 1. The model
 * (ModelBehaviorDefs/fbw_a380x/Templates/Anims_Door.xml: DOOR_ID, ID, TOGGLE_ID), the DOOR/OXY SD page and the FWS
 * door alerts use the same interactive points, so the label here must name the door of that point.
 */
export interface A380ServiceDoor {
  /** The door, as named in the model and on the DOOR/OXY SD page (M = main deck, U = upper deck) */
  readonly door: string;
  readonly interactivePoint: number;
  readonly exit: number;
  /** The localization key of the door button label (Localization/data/en.json, Ground.Services) */
  readonly labelKey: string;
  /** The short label on the fuselage planform */
  readonly planformLabel: string;
  /** Along the fuselage on the planform, in the units of the Payload page drawing (A380SeatOutlineBg, nose at 0) */
  readonly planformAt: number;
  /** The door drawing of A380SeatOutlineBg that lights up with the door (the drawing has doors 1, 2, 4 and 5 only) */
  readonly planformArtId?: string;
}

/**
 * The passenger doors of the Services page. Point 9 is the aft right main deck door, MAIN 5R (flight_model.cfg: the
 * aftmost main deck pair, points 8/9 at Z = -60 ft; Anims_Door.xml: M5R = ID 9, TOGGLE_ID 10); it was labelled
 * "Main 4 R". The catering truck is served at this door. MAIN 4R is point 7 (Z = -32 ft; M4R = ID 7, TOGGLE_ID 8).
 *
 * A switch here only moves its door (K:TOGGLE_AIRCRAFT_EXIT): the door a sim ground vehicle docks at comes from the
 * interactive points of flight_model.cfg (and GSX's from GSX.cfg), which the page does not change.
 */
export const A380_SERVICE_DOORS = {
  main1L: {
    door: 'M1L',
    interactivePoint: 0,
    exit: 1,
    labelKey: 'Ground.Services.DoorMain1L',
    planformLabel: '1 L',
    planformAt: 70,
    planformArtId: 'FWD_L_Door',
  },
  main2L: {
    door: 'M2L',
    interactivePoint: 2,
    exit: 3,
    labelKey: 'Ground.Services.DoorMain2L',
    planformLabel: '2 L',
    planformAt: 176,
    planformArtId: 'MID-FWD_L_Door',
  },
  upper1L: {
    door: 'U1L',
    interactivePoint: 10,
    exit: 11,
    labelKey: 'Ground.Services.DoorUpper1L',
    planformLabel: 'U1L',
    planformAt: 125,
  },
  main4R: {
    door: 'M4R',
    interactivePoint: 7,
    exit: 8,
    labelKey: 'Ground.Services.DoorMain4R',
    planformLabel: '4 R',
    planformAt: 472,
    planformArtId: 'MID-AFT_R_Door',
  },
  main5R: {
    door: 'M5R',
    interactivePoint: 9,
    exit: 10,
    labelKey: 'Ground.Services.DoorMain5R',
    planformLabel: '5 R',
    planformAt: 569,
    planformArtId: 'AFT_R_Door',
  },
} as const satisfies Record<string, A380ServiceDoor>;

/** The forward cargo door: flight_model.cfg point 16 (the first cargo point), exit 17 */
export const A380_FWD_CARGO_DOOR = { interactivePoint: 16, exit: 17 } as const;
