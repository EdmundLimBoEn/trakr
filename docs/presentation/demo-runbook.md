# Three-minute demo runbook

## Before the presentation

- Prepare two clearly labeled test items: camera and tripod. Use the actual enrolled equipment names if these differ; the deck scenario is illustrative.
- Use a dedicated demo Firebase project and prepared student/teacher sessions for a cross-device demonstration. Verify both clients point to the same project.
- If demonstrating only local mode, use a rehearsed role-switching flow and call it a local simulation. Independent local stores do not demonstrate synchronization.
- Rehearse on the actual NFC-capable device, with the actual tags, network and screen-mirroring setup. Keep the device unlocked and disable interruptions.
- Verify that both items are ready for the planned checkout, the teacher can see the resulting claims, and the issue workflow is accessible. Do not clear a live datastore to prepare a demo.
- Prepare a short screen recording of the same successful flow for fallback. No recording is included in this package.
- Keep slide 10 visible on the presentation computer before switching to the app. Have the PDF available if PowerPoint fonts substitute.

## Live sequence

| Demo time | Action | Say / prove |
|---|---|---|
| 0:00–0:20 | Show prepared student session and two items | “We are borrowing a camera and tripod for a school project.” |
| 0:20–1:00 | Scan both items into the staging list | “Each physical tag resolves to an enrolled equipment record.” |
| 1:00–1:20 | Mark the camera as having an issue; enter “Loose strap”; acknowledge the tripod condition | “The condition is captured before the handover is confirmed.” |
| 1:20–1:35 | Confirm checkout and show the receipt | “The borrower now has a record of both items.” |
| 1:35–2:00 | Switch to the prepared teacher session; scan return items and show claims | “The teacher can see who claimed these items.” |
| 2:00–2:20 | Confirm the return and show the result | “The teacher closes the active claims for this return.” |
| 2:20–2:45 | Show history and acknowledge the issue | “Returned does not mean repaired. The issue has its own lifecycle.” |
| 2:45–3:00 | Close and return to the deck | “One handover, one shared record, and a clear next action.” |

## If something fails

Allow one retry, then move on within about ten seconds. Explain exactly what failed. Switch to a prepared local simulation or recording and label it clearly; do not imply that a simulated tap proves physical NFC or that a recording is live. If no backup is available, use the data-flow slide to finish the explanation and state what remains unproven.

## Likely questions

**Why NFC instead of QR?** NFC supports a tap interaction and the native apps implement NDEF reading and writing. QR is a credible alternative. Compare actual device coverage, failure rates and task time in the pilot; do not claim NFC is automatically faster or more secure.

**Does it prevent theft?** No. It records handovers and follow-up information. It does not physically secure or locate equipment, and a tag is not an uncloneable credential.

**Can two people borrow the same item?** The current model allows multiple active claims. The teacher return workflow closes the active claims it loads. Exclusive reservations and stronger concurrency guarantees would need additional design and validation.

**What if the internet fails?** The app preserves staged items and blocks confirmation. A staged list is not a completed checkout.

**What has actually been tested?** The repository contains store, UI and Firestore rules tests. The verification matrix identifies physical NFC, school OAuth and cross-device checks that still require real devices and credentials. Creating this presentation did not rerun those application suites.

**Is it ready for every school?** No. Roles currently depend on school-specific email domains. Multi-school operation requires tenant isolation, configurable policies and validated onboarding.

**Where is the revenue or traction?** Neither is established by the repository. The subscription model, four-week pilot and performance thresholds are proposals. The next business evidence is continued use, buyer feedback, paid conversion and support effort.

**What would you fund next?** Device and pilot validation first; then repeatable onboarding, tenant isolation and operational improvements justified by the results. No invented fundraising amount is included.
