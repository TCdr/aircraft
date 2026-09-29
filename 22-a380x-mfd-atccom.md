# PR 22 - A380X MFD ATC COM pages and the SD mailbox

- **Title:** `feat(a380x/mfd): ATC COM pages and the SD mailbox per the A380 FCOM`
- **Base:** `master` - **Branch:** `pr/22-a380x-mfd-atccom` (stacked on `pr/10-a380x-mfd-fcom-pages`, PR 10: the MFD FCOM layout and
  common components)
- **Tip:** `591aa0b5d` - own commits: `f94da768a` (feature; original `4acffaeee` on `feature/a380/mfd/atccom`), `22fcdb556` (lint and
  strict types), `21756217d` (CHANGELOG line), then the fixes of the in-sim test: `64ea64155` (frame delete, label layout, ATIS auto
  update), `47ca68c77` (texts sized for the FBW display font), `43706e46f` (ATIS time from the ATIS message)
- **Also in `pr/22` (2026-09-29, from the in-sim test with BeyondATC):** `40b6f21d3` SEND FAILED when no ATC center is active
  (original `67cb0b157`, develop 70c70a09e); `591aa0b5d` the FMS connects the datalink networks with the active flight number, the
  INIT FLT NBR field refreshes, FMS DATALINK NOT AVAIL (original `8e0d26341`, develop 375f39e91). The logon to BeyondATC (RJJJ) and a
  MAYDAY sent were confirmed in the sim on 2026-09-28/29 (BeyondATC answers MAYDAY with NO MESSAGE HANDLING AVAILABLE: not supported
  on its side).
- **CHANGELOG lines 2 and 3 (in the branch):** `1. [ATSU] Show SEND FAILED on a message sent without an active ATC center, instead of nothing - @TCdr`,
  `1. [A380X/FMS] Fix datalink not connected with the flight number entered on the INIT page (ATC logon and messages failing), FMS DATALINK NOT AVAIL message - @TCdr`
- **Labels to request:** `A380X`, `MFD`, `Extensive Testing Needed`, `QA A380 Only`
- **Issue to open first:** *"A380X MFD ATC COM pages are placeholders and the SD mailbox cannot answer the ATC"*
- **CHANGELOG line (in the branch):** `1. [A380X/MFD] Add the ATC COM pages (connect, ATIS, message record, request, report, emergency) and the SD mailbox per the A380 FCOM - @TCdr`
- **Before opening - TO DO:** finish the in-sim test. Tested in the sim on 2026-09-27: ATIS (FAA source: request, LIST, RECEIVED),
  REQUEST / OTHER REPORTS / EMERGENCY frames (add, delete). Not tested yet: logon and CPDLC with Hoppie (NOTIFICATION, REQUEST
  -> XFR TO MAILBOX -> SEND, uplink answers on the SD mailbox), MSG RECORD with real dialogues.
- **Not in this PR:** the ATIS PRINT functions (on `feature/a380/mfd/atccom`); they need the pedestal printer, which has no PR yet.

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

Every ATC COM page of the A380 FCOM (DSC-46-10-20-30) is laid out on its FCOM figure and wired to the FBW ATSU, and the SD MAILBOX
(DSC-46-10-10-70) becomes a client of the ATSU mailbox protocol (the same one as the A32NX DCDU).

- **Header:** CONNECT / REQUEST / REPORT & MODIFY / MSG RECORD / ATIS / EMER, and the ATC COM system menu.
- **CONNECT:** NOTIFICATION (logon; NOTIFYING, NOTIFICATION FAILED; the centers notified), CONNECTION STATUS (with the ADS status),
  MAX UPLINK DELAY.
- **ATIS:** LIST, with three request areas (departure, arrival, alternate, following the FMS airports), AUTO UPDATE and UPDATE ALL, and
  ATIS RECEIVED.
- **MSG RECORD:** LIST and ZOOM, ERASE ALL of the closed dialogues, MSG RECORD USED OFFSIDE.
- **REQUEST:** every FCOM frame mapped to its CPDLC downlink element (climb and descent, altitude and block, direct, offset, weather
  deviation, heading and track, SID/STAR, speed, when can we expect, free text, voice contact, own separation, VMC descent, additional
  text), the DEPARTURE (DCL) and OCEANIC (OCL) clearances, XFR TO MAILBOX.
- **REPORT & MODIFY:** AUTO and MANUAL POSITION reports filled by the FMS, OTHER REPORTS, MODIFY of a prepared reply.
- **EMERGENCY:** MAYDAY, PANPAN and CANCEL EMER with the emergency frames; MAYDAY switches the ADS to EMERGENCY.
- **SD MAILBOX:** the answer buttons per expected response (WILCO / STANDBY / UNABLE, AFFIRM / NEGATIVE, ROGER), SEND / CANCEL / CLOSE,
  DUE TO and FREETEXT replies, ACK / REFUSE for DCL and OCL, the message status colours of the FCOM.
- FCOM entry formats and messages for every field.
- `fbw-common` MailboxBus (one line): `downlinkTransmit` on an uplink sends its existing open or failed response.
- The old placeholder ATC COM pages (connect, D-ATIS, message record) are removed.
- 33 unit tests (request frames, entry formats, ATIS text and time, message record, reports, mailbox logic).

- **Datalink connection (FMS):** the INIT page FLT NBR field wrote the flight plan only: the field did not refresh and a typed
  flight number never connected the datalink networks (TELEX and the ACARS provider), so every logon and downlink failed. The field
  now updates its value, and the FMS (`FmsDatalinkConnection`) connects the networks whenever the flight number of the active
  flight plan changes, whatever its source (INIT entry, company flight plan, SEC activation, flight reload), resending when the
  router does not answer. A refused connection, or no answer after two tries, shows the FMS message FMS DATALINK NOT AVAIL
  (DSC-22-FMS-20-110); entering the flight number again retries. 5 unit tests.
- **SEND FAILED:** a message sent from the mailbox without an active ATC center was dropped silently; the mailbox now shows SEND
  FAILED (DSC-46-10-20-60), in the shared ATC code (the A32NX DCDU too).

## Cockpit API Changes

New private local vars, documented in `fbw-a380x/docs/a380x-private-local-vars.md` (46 - Information Systems):
- `L:A380X_ATCCOM_ADS_STATUS` (0 ARMED, 1 CONNECTED, 2 OFF), written by the MFD, displayed by the SD mailbox.
- `L:A380X_MFD_{side}_ATCCOM_MSG_RECORD_ZOOM` (an MFD shows a recorded message: MSG RECORD USED OFFSIDE on the other one).

## Screenshots (if necessary)

**TO ADD**: each ATC COM page next to its FCOM figure (CONNECT pages, ATIS LIST, MSG RECORD LIST and ZOOM, REQUEST with frames,
REPORT, EMERGENCY); the SD mailbox with an uplink and its answer buttons.

## References

- A380 FCOM DSC-46-10-20-30 (ATC COM pages), DSC-46-10-10-70 (mailbox), DSC-46-10-20-40 (ATC COM messages); the CPDLC message
  elements (DM / UM numbers) of the FBW ATSU.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. flyPad: set the Hoppie ACARS network and logon code. MFD ATC COM > CONNECT > NOTIFICATION: notify a center: NOTIFIED TO CENTERS,
   then CONNECTION STATUS.
2. ATIS: request the departure ATIS; RECEIVED shows it; AUTO UPDATE.
3. REQUEST: add CLB TO and DIRECT frames, XFR TO MAILBOX; send from the SD mailbox; the reply buttons follow the uplink.
4. MSG RECORD: the dialogue appears; ZOOM; ERASE ALL keeps the open ones.
5. EMER: MAYDAY frame, XFR: ADS EMERGENCY.
6. `npx vitest run` on the six ATC COM / mailbox spec files (33 tests).

<!-- DO NOT DELETE THIS -->
