# A380X Project Files

The project directory is structured as follows:

```text
- docs            <Specific docs for the project>
- src             <src files required for the project>
- out             <contains MSFS package folder after the build>
```

The `out` folder can be deleted as it is completely recreated during the build.
This is essentially a clean build.

## A380X INOP systems

These systems are currently not operational / these features are missing and shall thus not lead to bug reports.

This list is divided into standardized ATA chapters, if there are no noteworthy systems missing from a chapter, the chapter heading is hidden (this was different in a previous version of this list). This list is not exhaustive, there might be details missing in other systems which are not stated here.

<!-- ### ATA 20 Aircraft General / Exterior 3D Model -->

<!-- ### ATA 21 Air Con / Pressurization / Ventilation -->

<!-- ### ATA 22 Flight Envelope -->

### ATA 22 Autoflight / FCU

- FLS
- THR NOISE, DCLB
- AFS CP ALT button (immediate level-off, and alt hold indication)

### ATA 22 Flight Management System (FMS)

- Incomplete pages see [fbw-a380x/src/systems/instruments/src/MFD/pages](https://github.com/flybywiresim/aircraft/tree/master/fbw-a380x/src/systems/instruments/src/MFD/pages)
- Full separation into three synchronized FMCs and two FMSs (currently one FMC serving one FMS)
- Accurate CI, OPT and REC MAX FL computation
- NADP (see THR NOISE above)
- ATC / datalink / CPDLC: the MFD ATC COM pages (connect, ATIS, message record, request, report, emergency) and the SD
  mailbox work through the FBW ATSU and its ACARS providers; datalink functions outside those pages are not implemented
- FCU BKUP
- IRS alignment on another reference position (POSITION / IRS): the FMS shows the alignment on the entered position,
  but the ADIRS keep aligning on the aircraft position (no position error, no fast realignment)
- Alternate company routes: their fixes are inserted as direct legs (no airway idents in the alternate flight plan), and
  the CO RTE column of the ALTERNATE page stays empty
- STEP ALTs: Optimum step calculation

### ATA 23 Communication

- RMP: HF, TEL, MENU, SATCOM, DATALINK pages
- CIDS: CALLS buttons

<!-- ### ATA 24 Electrical -->

<!-- ### ATA 25 Equipment / Cockpit 3D Model -->

<!-- ### ATA 26 Fire and Smoke Protection -->

### ATA 27 Flight Controls

- Completely migrated SLAT/FLAP CTL implementation (adapted A32NX computers at the moment)

### ATA 28 Fuel

- Refuel Driver/Refuel Application placeholder pseudo-FQMS implementation (pre-cursor for realistic FQMS implementation while supporting instant load)
  - CPIOM etc. not implemented yet.
- Portions of the automatic fuel transfer system -- main transfers from the inner, mid, trim, and outer tanks are implemented with the correct scheduling (with the reduced feed tank thresholds when the remaining time to destination is below 90 min) as are CG control transfers from the trim tank to the appropriate inner, mid, or feed tanks, the load alleviation transfers (to the outer tanks after takeoff, from the trim and outer tanks before landing) and the automatic ground transfer (AUTO GND XFR pushbutton, to the ground CG target of 39.5 %). The load alleviation transfers, the ground transfer and the gravity transfers move the fuel between the MSFS tanks directly at the FCOM rates (the MSFS fuel system has no line for them). Alternate transfers: CASE 4 (inner or mid tank fwd pump failed: its aft pump takes over) and CASE 5 (outer tank pump failed: gravity transfer into feed tank 2 or 3) only; the transfer valve failures (CASES 1, 2, 3, 6) are not simulated. Not implemented yet are cold fuel transfers.
  The transfer pump pushbuttons work and can be used to interrupt an automatic transfer.
- TRIM TK FEED selector: AUTO / OPEN (gravity transfer to the inner tanks) / ISOL (trim tank transfers stopped) work from the L:var A380X_OVHD_FUEL_TRIM_TK_FEED_SELECTOR, but the cockpit model has no such selector
- Manual fuel transfers: the OUTR, MID and INR TK XFR (MAN) and TRIM TK XFR (FWD) pushbuttons work (pumped transfers, and the outer tank gravity transfer into feed tanks 1 and 4 with an outer tank pump off). Not implemented yet: the outer tank gravity transfer into feed tanks 2 and 3, the FAULT lights of these pushbuttons and the MAN XFR ECAM procedures
- Manually controlling how much fuel each tank receives when fueling
- Integrated Refuel Panel - Simulated in the systems but not modeled in the plane model, or fully connected to ELEC
- MFD entry - Not supported yet (ZFW/ZFWCG entry - Possible via EFB currently for testing)

### ATA 29 Hydraulic System

- No accumulators / LEHGS systems
- Brakes: Systems were carried over from A32NX, with adapted parameters for A380X
- Gear system: Some systems were carried over from A32NX, with adapted parameters for A380X
- Hydraulic actuation of flaps/slats not finalized
- Hydraulics Cooling

<!-- ### ATA 30 Ice and Rain Protection -->

### ATA 31 Indicating / Recording / ECAM / EFIS / Displays

- CDS / display unit reconfiguration: partly implemented. Automatic (PFD to the ND DU, EWD to the SD DU), the PFD/ND
  pb and the DU RECONF pb work (the EWD and the SD can be selected on the ND DUs), but the MFD is not drawn on another
  DU and nothing is drawn on the MFD DUs (the DU RECONF pb skips them, so it does nothing when it acts on an MFD DU),
  the SD on an ND DU has the ATC mailbox only while the SD DU is off or shows another display (with both, the ND DU's
  mailbox mirrors the SD DU's displayed message and takes no input), the ND on the PFD DU has no weather radar or
  terrain image (the native ndwxr gauges stay on the ND DUs), and the KCCU keys do not reconfigure the DUs
- PFD backup scales
- Interactive ND: the revision lists (waypoints, NAVAIDs, airports, aircraft), the DIRECT TO, INSERT NEXT WPT and
  DUPLICATE pages, the latitude/longitude waypoints from a click on the map and the temporary flight plan INSERT /
  ERASE work; the other ND interactions of the FCOM are not implemented yet
- Independent QNH
- KCCU soft keyboard
- ECAM: Completely accurate STS page implementation
- ECAM: AUTO RCL
- ECAM: Correct behavior of RCL / RCL LAST
- ECAM: Time limited failures
- Video: ETACS due to sim limitation
- SD VIDEO page

### ATA 32 Landing Gear / Braking / BTV

- Gear system not yet final
  - Wrong door sequence
  - One left and one right main gear assembly stand for the wing and the body gear of each side: they need both GREEN
    (WLG) and YELLOW (BLG), so with GREEN lost the BLG does not retract alone; the gears move only when all the doors
    are open, so with YELLOW lost the NLG does not retract either
  - The gravity extension takes about 70 s but releases all the gear uplocks together (FCOM: NLG and WLG, then BLG)
- Braking simplified: one NORM circuit (GREEN) and one ALTN circuit (YELLOW and one accumulator) for all the wheel
  groups; no LEHGS and no 4 brake accumulators, no BCS 1/2 split, no A-SKID fault per wheel group
- BTV simplified logic only
  - Basic braking distance calculations
  - No glide slope adaptation
  - No handling of brakes/OANS errors

### ATA 34 Navigation

- MMR implementation: the GPS receivers, the GPIRS position, the GPS modes (TEST, ALTAID, AIDED, DIFF) and the GPS
  deselection are modelled; the satellites come from the nominal 24-slot constellation, not from a real almanac
- GLS
- ISIS SND (second ISIS): SFD/SND reconfiguration (the MODE pb only switches the SND off and on), power-up self-test,
  FIX display on the SFD; the position source is shown as GPIR (see MMR / GPIRS above); the coordinate entry with the
  SET/SEL knob, the list size (10 waypoints) and the waypoint sequencing are simplified (not described in the FCOM)

### ATA 34 Surveillance / TCAS / TAWS / WXR / XPDR

- Weather radar: the native radar shows the sim's weather, which has no cell heights: the PRED W/S setting does nothing,
  the manual GAIN moves the colour levels, and the manual ELEVN/TILT only hide the weather where the selected altitude or
  tilt reaches the ground (they cannot show a slice above or below the cells)
- TAWS obstacles

### ATA 34 ROW/ROP

- Landing runway detection: a runway already selected (FMS or OANS) stays the protected runway down to 350 ft in every
  AUTO BRK mode (FCOM: only in BTV, until 300 ft)
- Shift of touchdown point according to position on glide slope

### ATA 35 Oxygen

- Oxygen masks test P/B

<!-- ### ATA 36 Bleed Air -->

### ATA 42 Avionics Network

- Communication between systems using AFDX (ARINC protocol used mostly)

<!-- ### ATA 49 APU -->

### ATA 52 Doors

- CKPT DOOR functions
- All cargo and passenger doors animated. Most of main deck done right now

### ATA 70 Engines

- Custom engine model (current model is modified LEAP-1A)
- ACUTE
- Reversers: Electrical system for triple lock safety system

<!-- ### Misc / Sim specifics -->
