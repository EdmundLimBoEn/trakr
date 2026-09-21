# Trakr presentation script

Slides 1–9: five minutes. Slide 10: three-minute demo. Slides 11–18: Q&A only.

## 01. Equipment accountability. One tap at a time.

**Timing: 0:00–0:20 · 20 seconds**

A camera leaves the equipment room. Later, a teacher needs to know who has it, what condition it was in, and whether it came back. Trakr connects those moments through an NFC tap, a school account, and a shared record. This is our native mobile MVP and the pilot we propose next.

Evidence: Basis: README.md • native MVP; pilot outcomes not yet measured

## 02. The handover is where context gets lost.

**Timing: 0:20–0:55 · 35 seconds**

Imagine a student borrowing a camera and tripod before a project. A paper log, spreadsheet or chat can capture a name, but keeping the physical handover, condition report and return together takes discipline. Missing context means follow-up work: who should the teacher ask, was the fault already there, and is the item actually back? Our hypothesis is that recording these facts at the handover reduces chasing and uncertainty. We still need to measure the scale of that problem with teachers.

Evidence: Problem hypothesis to validate through teacher interviews and baseline observation

## 03. One workflow. Three people who benefit.

**Timing: 0:55–1:30 · 35 seconds**

Students need a quick way to borrow several items and see their own receipt. Teachers need to enroll equipment, see active claimants, process returns and resolve reported issues. An equipment lead needs oversight across inventory and outstanding activity. Trakr connects those needs with student and teacher mobile workflows plus an operations dashboard. The first target is a single school equipment room, where one teacher can help us observe the whole process before we attempt a broader rollout.

Evidence: Implemented workflows: README.md • Trakr/Features • dashboard/README.md

## 04. Tap. Check. Confirm. Return.

**Timing: 1:30–2:10 · 40 seconds**

The student signs in with an approved school account and scans both tags. Each item enters a staging list, so accidental scans can be removed. Before confirmation, the student acknowledges condition and adds details for any issue, such as a loose camera strap. Confirmation creates the checkout record and receipt. Later, a teacher scans the returned equipment, reviews active claims and confirms the return. The issue has its own open, acknowledged and resolved lifecycle, so returning an item does not automatically mean its fault has been fixed.

Evidence: Sources: CheckoutView.swift • ReturnView.swift • Domain.swift

## 05. A tap identifies the item. Rules govern the write.

**Timing: 2:10–2:50 · 40 seconds**

Here is the data flow. The NFC tag contains a Trakr identifier, which the phone resolves to an equipment record. Google sign-in provides identity; Firebase Security Rules use verified school email claims to enforce access. On confirmation, the mobile client submits a batch containing the checkout record, individual claims and any issues. Those writes commit together or fail together. A teacher later submits the return batch. The web operations dashboard uses a separate privileged Worker path, with its own authentication and audit events. NFC identifies equipment; it is not proof against tag copying.

Evidence: Sources: NFCService.swift • FirebaseGateway.swift • firebase/firestore.rules

## 06. Designed for the awkward moments, too.

**Timing: 2:50–3:25 · 35 seconds**

Three engineering decisions matter. First, access is enforced at the database boundary, not just by hiding buttons; students should only see their own claims and issues. Second, the app preserves staged items when offline and blocks confirmation instead of pretending a checkout has succeeded. Third, equipment identity survives tag replacement, preserving claim history. The repository includes tests for these behaviours and repeated operations. Physical NFC, school sign-in and cross-device behaviour still need device validation. We distinguish implemented safeguards from a proven production deployment.

Evidence: Evidence: docs/mvp-verification.md • TrakrTests • firebase/functions/test

## 07. Measure the handover, not just the download.

**Timing: 3:25–4:00 · 35 seconds**

We propose a four-week pilot. First, observe the existing process and measure its baseline. Then enroll a small inventory and use Trakr for real handovers. Compare median checkout time and weekly teacher follow-up time, while checking record completeness and reliability. Our proposed targets are a thirty percent reduction in checkout time and ninety-five percent complete handover records. These are targets, not results. We also need zero unauthorized cross-student reads in our test set. If the workflow adds friction or staff do not keep using it, we revise before scaling.

Evidence: Proposed experiment • targets are acceptance criteria, not observed results

## 08. Start narrow. Earn the right to expand.

**Timing: 4:00–4:35 · 35 seconds**

The proposed buyer is the school or equipment-owning department, while a teacher is the champion. A subscription could fund hosting, support and continued development, with onboarding covering tags and inventory setup. We would first win one room, then expand within the school after showing repeat use and time saved. Today the differentiation is the complete handover workflow, not a proprietary NFC technology. The investor milestone is repeatable adoption and willingness to pay, followed by the multi-school architecture and onboarding process needed to scale. Revenue and pricing remain unvalidated.

Evidence: Commercial proposal • no validated pricing, paying customers or market-size claim

## 09. Give us one room to prove the value.

**Timing: 4:35–5:00 · 25 seconds**

Our ask is one equipment room, one teacher sponsor and permission to run a measured pilot. We will return a baseline comparison, reliability findings and an adoption recommendation. Trakr already connects checkout, condition and return in a working software flow. The next question is whether it reliably makes school handovers easier. Let us now show that loop in three minutes.

Evidence: Ask: proposed pilot partnership • demo begins at 5:00

## 10. Three minutes. One complete handover.

**Timing: 5:00–8:00 · 180 seconds**

0:00–0:20: Introduce the prepared student account and two enrolled items. 0:20–1:00: Scan the camera and tripod; show the staging list. 1:00–1:35: Report a loose strap on the camera, acknowledge condition, confirm and show the receipt. 1:35–2:20: Switch to the prepared teacher session, scan the same items, show the claimant and confirm return. 2:20–2:45: Show the returned record and acknowledge the issue, explaining that repair is a separate action. 2:45–3:00: Close with: one handover, one shared record, a clear next action. Rehearse account switching. Use a dedicated test environment. If physical NFC fails, switch promptly to the prepared local demo and explicitly identify it as simulated. Independent local demos do not demonstrate cross-device synchronization.

Evidence: Use prepared demo inventory; local demo proves UI flow, not cross-device sync

## 11. Identity stays stable when tags change.

**Timing: Q&A only**

Equipment is the stable identity. A tag points to equipment; tag replacement changes that pointer while existing claims retain their tag-at-checkout reference. A checkout batch groups claims, and each claim belongs to a student and equipment item. An issue references a claim and equipment. A return batch groups claim closures with a teacher identity. Serial guard records support uniqueness. Multiple active claims per equipment item are currently allowed, so do not describe this as an exclusive booking system.

Evidence: Sources: Domain.swift • FirebaseGateway.swift • firebase/firestore.rules

## 12. Two access paths. Two enforcement points.

**Timing: Q&A only**

Mobile: Google Authentication supplies verified identity, and Firestore Security Rules govern reads and writes. Staff domains map to teacher access, student subdomains map to student access. Operations: the browser signs in, the Worker validates the identity and session, then accesses Firestore using a server-held service account. That privileged path does not rely on client Security Rules; its own authorization and validation are essential. Ops mutations generate audit events. The shared-secret emergency route is a separate operational risk. Multi-school deployment requires redesigned tenant boundaries; changing branding alone is insufficient.

Evidence: Sources: firebase/firestore.rules • dashboard/src/worker/auth.ts • ops.ts

## 13. An MVP with clear limits.

**Timing: Q&A only**

Overdue status is calculated in-app and alerts are in-app, not guaranteed push delivery. An internet connection is required to confirm. NFC read/write still needs physical device proof, and school Google Workspace access requires validation. The current role model is school-specific. Multiple claims are allowed, and the return workflow closes the active claims it loads; concurrency deserves pilot testing. Demo accounts have deliberately relaxed write rules and share collections with school accounts in the documented setup. Use a dedicated demo environment and disable demo access before public launch. Do not claim GPS location, theft prevention, exclusive reservations or commercial traction.

Evidence: Sources: docs/production-integration.md • docs/mvp-verification.md • README.md

## 14. Make each claim testable.

**Timing: Q&A only**

This is a suggested assessment map, not an official grading rubric. Problem definition is supported by the concrete borrowing scenario, then strengthened with interviews. Design understanding is shown through the user journey, architecture and data relationships. Implementation is demonstrated by the complete checkout-to-return loop. Quality is supported by repository test coverage and explicit device validation gaps. Critical evaluation means explaining the tradeoffs and measuring against a baseline, rather than claiming the project is production-ready. Source traceability and honest status labels let a teacher separate implementation evidence from proposed outcomes.

Evidence: Evidence map: docs/mvp-verification.md and source references in speaker notes

## 15. Why this workflow instead of another log?

**Timing: Q&A only**

Paper and spreadsheets are familiar and can be sufficient for low-volume borrowing. QR-based workflows are also a credible option; NFC must earn its place through device suitability and observed convenience, rather than an unsupported speed claim. A broad asset platform may be appropriate for institutions that need procurement, depreciation or integrations; those requirements are outside this MVP. Trakr focuses on linking the physical handover, identity, condition, receipt and teacher-confirmed return. We should choose the simplest solution that solves the observed problem. A defensible business would require trusted deployment and repeatable onboarding, not just an NFC tag.

Evidence: Analysis of workflow options, not verified competitor capability claims

## 16. Set the decision rule before the pilot.

**Timing: Q&A only**

Time the same defined task before and during the pilot: beginning the handover through a confirmed record, separating student task time from teacher follow-up. Use comparable item counts and report the number of observations, median and slow cases. Define complete records as having borrower, equipment, checkout time, condition and a teacher-confirmed return when the item is physically returned. Review adoption weekly and interview staff about workarounds. Security tests and failed commits are mandatory checks, not substitutes for usability results. Agree thresholds with the teacher sponsor before the experiment.

Evidence: All thresholds below are proposed pilot targets, not achieved measurements

## 17. Prove willingness to pay before scaling.

**Timing: Q&A only**

Illustration only: if a school saves two staff hours each week, values time at thirty Singapore dollars per hour and uses the system for forty weeks, gross time value is two thousand four hundred dollars per school year. This is not cash savings or validated willingness to pay. Net value must account for onboarding, tags, support and hosting; the subscription must leave the buyer better off. Reachable market should be built from named qualified schools and realistic adoption, not a fabricated global TAM. Before commercial expansion, clarify rights for a commercial offering given the repository's noncommercial license, and validate procurement and data requirements. Multi-tenant isolation is future engineering work.

Evidence: Illustrative arithmetic only • source license: LICENSE (CC BY-NC 4.0)

## 18. A pitch grounded in the repository.

**Timing: Q&A only**

The presentation is grounded in README.md, the domain models, FirebaseGateway, NFCService, Firestore rules and operations dashboard documentation. The verification matrix records repository test coverage and explicitly calls out hardware and school-infrastructure gaps. We did not rerun mobile or backend suites to produce this deck, and we do not claim a new test pass. The next evidence to collect is teacher interviews, baseline handover timings, physical-device results, pilot usage and buyer feedback. Proposed pricing, targets and commercial paths must be updated when real evidence arrives.

Evidence: Repository snapshot: 6467a41 • presentation prepared 21 September 2026
