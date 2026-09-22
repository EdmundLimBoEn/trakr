# Trakr technical presentation

Six technical slides (~3½ minutes), a three-minute demo, and one Q&A appendix. Generated from src/slides.ts.

## 1. Equipment checkout, as a stateful system.

**0:00–0:20 · 20 seconds**

Trakr records equipment handovers in a school. A student scans an enrolled item, records its condition and creates a claim. A teacher confirms the return. The engineering problem is to keep identity, authorization and state changes consistent across native clients. We will focus on the data path, failure handling and the cost of each write batch.

Source: README.md; Trakr/Models/Domain.swift; dashboard/README.md

## 2. Two paths into the same datastore.

**0:20–0:55 · 35 seconds**

The NFC tag contains an item identifier, not borrower information. The native client resolves it to equipment. Firebase Authentication supplies the verified school identity, and Security Rules enforce the mobile data boundary. Clients write directly to Firestore; no Cloud Function is required for this path. Staff operations use a separate Cloudflare Worker. That Worker validates the staff session and authorizes operations before using a server-held service account. This is a separate trust boundary: privileged access needs its own validation and audit trail.

Source: Trakr/NFC/NFCService.swift; Trakr/Services/FirebaseGateway.swift; firebase/firestore.rules; dashboard/src/worker/auth.ts; dashboard/src/worker/ops.ts

## 3. Checkout has explicit failure paths.

**0:55–1:40 · 45 seconds**

A scan first resolves an active enrolled tag to equipment. The staging list lets the student remove duplicates and capture issue text before confirmation. If the device is offline, the app keeps the staged list and blocks confirmation. Online, the client submits a checkout batch, claims and optional issues together. Security Rules recheck identity, schemas, equipment status and related records. The UI shows a receipt after a successful commit. A denial leaves no accepted batch; an uncertain network outcome needs reconciliation before retry. Atomicity means all these writes succeed together. It does not mean equipment has an exclusive reservation lock.

Source: Trakr/Features/Checkout/CheckoutView.swift; Trakr/Services/TrakrStore.swift; Trakr/Services/FirebaseGateway.swift:276–330; firebase/firestore.rules:334–414

## 4. Equipment identity survives tag replacement.

**1:40–2:15 · 35 seconds**

Equipment is the durable identity; a tag is replaceable. Claims reference equipment and retain the tag used at checkout, so historical records survive a tag swap. A checkout batch groups claims. A return batch records the teacher and groups claim closures. Issues reference claims and equipment and have a separate resolution workflow. These are Firestore document references represented by IDs, not relational foreign keys. Multiple active claims per item are currently allowed. The issue arrows show the intended UI workflow; the rules permit a teacher to set any of the valid issue states, rather than enforcing a strictly forward-only state machine.

Source: Trakr/Models/Domain.swift; Trakr/Services/FirebaseGateway.swift; firebase/firestore.rules:181–239, 382–414

## 5. Write volume scales with items and issues.

**2:15–2:55 · 40 seconds**

This chart is a deterministic count of writes constructed by the iOS gateway, not production telemetry. A checkout creates one batch document, one claim per item, and one issue document per affected item. So the total is one plus n plus k. Five items with two issues produce eight writes. The chart compares no issues against an issue on every item. Move either slider to explore the formula. The client accepts up to twenty items, but the arithmetic alone does not prove every batch is admissible under rule-evaluation limits. Reads, authentication, retries and operational audit writes are outside this count. A return writes one batch and updates c loaded claims.

Source: Trakr/Services/FirebaseGateway.swift:276–352; firebase/firestore.rules:171–179

## 6. The next work is validation, not more screens.

**2:55–3:30 · 35 seconds**

The implementation deliberately keeps the backend small: direct atomic writes, database authorization and in-app overdue calculation. Those choices leave specific validation work. Test worst-case rule evaluation and interrupted requests, exercise real NFC hardware and approved school sign-in, and probe simultaneous checkout and return. Multiple claims make this an accountability system, not an exclusive booking system. Background alerts and tenant isolation would be future work. Repository tests exist, but hardware and school-environment evidence still need to be collected. In the demo, watch the records and state transitions rather than just the screens.

Source: docs/mvp-verification.md; docs/production-integration.md; TrakrTests; firebase/functions/test

## 7. Watch the state change.

**3:30–6:30 · 3-minute demo**

0:00–0:20: Show the prepared student account and two test items. 0:20–1:00: Scan both tags and inspect the staged list. 1:00–1:35: Mark a loose strap on one item, acknowledge the other condition, confirm and show the receipt. Explain that this gateway call creates four documents. 1:35–2:20: Switch to the teacher session, inspect active claimants and confirm return. 2:20–2:45: Show returned history and acknowledge the issue, explaining that returned does not mean repaired. 2:45–3:00: Close with the remaining validation work. Use a dedicated test environment, and explicitly identify any local simulation or fallback recording.

Source: Trakr/Services/FirebaseGateway.swift:276–352; docs/presentation/demo-runbook.md

## 8. Authorization is operation-specific.

**Q&A only**

The normal mobile path derives student or teacher roles from verified school email claims. Students can read their own claims and issues and create checkouts tied to their identity. Teachers can review records, manage inventory and confirm returns. Operations through the Worker require a staff session and separate server-side authorization. Demo accounts have intentionally relaxed rules and are not represented in this matrix. Before broader use, separate demo data and validate the deployed rule configuration. Multi-school access requires tenant isolation rather than only adding email domains.

Source: firebase/firestore.rules:22–90, 241–442; dashboard/src/worker/auth.ts; dashboard/src/worker/ops.ts
