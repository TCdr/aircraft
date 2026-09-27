# PR 21 - A380X company datalink reply time

- **Title:** `feat(a380x): company datalink reply time for the F-PLN, wind and T.O data requests`
- **Base:** `master` - **Branch:** `pr/21-a380x-company-datalink-delay` (stacked on `pr/12-a320-takeoff-calculator`, PR 12: the company
  T.O data link; PR 10 below it: the CPNY F-PLN and WIND requests)
- **Tip:** `199d44f3b` - own commits: `3cc600fd6` (feature), `e17ebd25b` (FMC strict types), `199d44f3b` (OIT settings option)
- **Labels to request:** `A380X`, `MFD`, `FMS`, `EFB`, `QA A380 Only`
- **Issue to open first:** *"A380X: company requests (F-PLN, wind, T.O data) are answered instantly"*
- **CHANGELOG line (to add in the PR):** `1. [A380X/FMS] Answer the company F-PLN, wind and T.O data requests after a datalink reply time (REQUEST PENDING, NO COMPANY REPLY), set in the flyPad realism settings - @TCdr`

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

The A380 FCOM (DSC-22-FMS-10-40-90) describes the company requests as datalink messages: the button shows REQUEST PENDING... until the
answer, and NO COMPANY REPLY appears when there is no answer within 4 min. The FMS answered them instantly.

- **flyPad Settings > Realism > Company Datalink Reply Time (A380X):** Instant / Fast / Real, like the ADIRS align time. Reply time after
  a request: 0 / 5-15 s / 60-120 s (default Real); transit of a message sent without a request: 0 / 1-3 s / 5-15 s. Airbus gives no
  figure: these are typical airline values, below the 4 min limit (`CompanyDatalinkDelay` in fbw-sdk).
- **CPNY F-PLN request:** REQUEST PENDING... from the click, one request at a time, the SimBrief OFP delivered after the reply time,
  NO COMPANY REPLY at 4 min (a failed download used to fail silently).
- **CPNY WIND request:** the answer is delivered after the reply time.
- **T.O data:** the flyPad answer reaches the FMS not before the reply time of SEND T.O REQUEST (only the transit time without a
  request). As in PR 12, only the thrust selected for the takeoff run is sent. The A32NX MCDU uplink stays instant.
- The FMC `navigraphUsername` argument is typed `string | undefined` (FBW_TYPECHECK tsc-strict).
- The OIT flyPad (OITlegacy) gets the new realism option too, with the A380X EFB value; without it the FBW_TYPECHECK build fails.

## Cockpit API Changes

None. New flyPad setting `CONFIG_COMPANY_DATALINK_REPLY_TIME` (`INSTANT` / `FAST` / `REAL`).

## Screenshots (if necessary)

**TO ADD**: the Realism setting; the CPNY F-PLN button showing REQUEST PENDING...; NO COMPANY REPLY after 4 min without an answer.

## References

- A380 FCOM DSC-22-FMS-10-40-90 (company requests: REQUEST PENDING..., NO COMPANY REPLY after 4 min).

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. Setting Real: CPNY F-PLN REQUEST shows REQUEST PENDING... and the flight plan arrives after 1-2 min; Instant: at once.
2. SimBrief not reachable: NO COMPANY REPLY at 4 min.
3. CPNY WIND REQUEST: the winds arrive after the reply time.
4. SEND T.O REQUEST on the MFD, then SEND TO FMS on the flyPad: the data reach the FMS not before the reply time.
5. A32NX: the MCDU uplink takeoff data are still instant.

<!-- DO NOT DELETE THIS -->
