# PR 14 - DIRECT TO with ABEAM points, CRS IN and CRS OUT

- **Title:** `feat(a380x/mfd): DIRECT TO with ABEAM points, CRS IN and CRS OUT`
- **Base:** `master` - **Branch:** `feature/a380/mfd/direct-to-options`
- **Commit:** `f98743703`
- **Labels to request:** `A380X`, `MFD`, `FMS`, `QA A380 Only`
- **Issue to open first:** *"A380X DIRECT TO: DIRECT WITH ABEAM, CRS IN and CRS OUT cannot be selected"*
- **CHANGELOG line:** `1. [A380X/MFD] Add DIRECT WITH ABEAM, CRS IN and CRS OUT to the DIRECT TO page - @TCdr`

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

The DIRECT TO page showed the three options of the A380 FCOM (DSC-22-FMS-20-30, DIRECT TO) but they could not be selected.

- **DIRECT WITH ABEAM:** an abeam point on the direct leg for each bypassed waypoint, named AB + 5 characters of the waypoint; the
  temporary F-PLN shows "(ABEAM PTS)".
- **CRS IN / CRS OUT:** a course into / out of the target (entry format NNN or NNNT, FCOM default courses). The FMS computes an intercept
  point (INTCPT) on that course, flies direct to it and then along the course. When the course cannot be intercepted (more than 160 deg,
  parallel or behind), the leg is a course to / from the target without an intercept point.
- The flight plan functions are shared (`fmgc/.../plans/DirectTo.ts`: abeam point on a leg, intercept point), with 10 unit tests.

## Cockpit API Changes

None.

## Screenshots (if necessary)

**TO ADD**: the DIRECT TO page with each option and the resulting TMPY F-PLN and ND.

## References

- A380 FCOM DSC-22-FMS-20-30, DIRECT TO page and its options.

## Additional context

A CI leg was tried first: FBW's Geo.legIntercept returns a bogus start point (NaN) for it, so a computed intercept waypoint is used.
Not done: the HDG-engaged / NAV-armed variant, the ADJUST DESIRED TRK OR HDG message, recomputing the intercept when the track changes.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. DIRECT TO a waypoint further along the plan WITH ABEAM: abeam points AB... in the TMPY, "(ABEAM PTS)".
2. CRS IN 090 to a waypoint ahead: INTCPT then the waypoint; CRS OUT: the waypoint then the course.
3. A course behind or parallel: no INTCPT, course to / from the target.

<!-- DO NOT DELETE THIS -->
