# Trakr presentation

Six short slides (~3½ minutes) and a three-minute demo. Generated from src/slides.ts.

## 1. Know who has it. Know it came back.

**0:00–0:20 · 20 seconds**

A camera leaves the school equipment room. Later, a teacher needs to know who borrowed it, what condition it was in, and whether it came back. Trakr connects those moments in one record, using an NFC tap and a school account. The aim is clearer handovers and less follow-up work.

Source: README.md; problem framing is a hypothesis to validate with teachers.

## 2. The problem is the missing context.

**0:20–1:00 · 40 seconds**

A borrowing log can record a name, but the rest of the story may sit somewhere else: a message about damage, a verbal reminder, or an item dropped back on a shelf. The teacher then has to reconstruct who had it, whether the fault was already there and whether the return was checked. Students also benefit from a clear record of the condition they reported. We are not claiming every school has this problem at the same scale. The pilot needs to establish how often these gaps occur and how much staff time they consume.

Source: Illustrative school workflow; no interview findings or measured savings are claimed.

## 3. Make the handover the moment of record.

**1:00–1:35 · 35 seconds**

Here is the use case we will demonstrate. A student borrows a camera and tripod. They scan both tags, see the staged items, report the camera’s loose strap and confirm checkout. The receipt gives them a record of what they took and the condition they reported. When the equipment comes back, a teacher reviews the active claims and confirms the return. The loose strap remains a separate issue to follow up. That distinction matters: returned equipment is not necessarily repaired equipment.

Source: README.md; Trakr/Features/Checkout/CheckoutView.swift; Trakr/Features/Returns/ReturnView.swift; Trakr/Models/Domain.swift

## 4. One tap connects the whole handover.

**1:35–2:15 · 40 seconds**

This is the overall data flow. The school account tells Trakr who the person is, while the tag identifies the physical equipment. The student app brings the selected items and their condition into a checkout. After access checks, Firebase stores the related records together. The teacher can then view active claims, confirm a return and follow up on issues, updating the same shared record. Students see their own claims rather than another student’s borrowing history. This is the technical foundation behind the simple handover: identity, an item and a record that both sides can act on.

Source: Trakr/NFC/NFCService.swift; Trakr/Services/FirebaseGateway.swift; firebase/firestore.rules; dashboard/README.md

## 5. Less chasing. Clearer accountability.

**2:15–2:55 · 40 seconds**

The value is that each question has a record to turn to. A teacher can see the active claimant, inspect the condition reported at checkout and confirm when the equipment comes back. Students get a clearer account of their own handover. A spreadsheet or form may be enough for some schools; Trakr needs to earn its place by making the complete workflow easier to finish. It requires internet to confirm and it is not a location tracker or an anti-theft system. The expected benefit is less chasing and ambiguity, but that benefit still needs to be measured.

Source: README.md; docs/production-integration.md; docs/mvp-verification.md. Benefits are hypotheses, not measured outcomes.

## 6. Start with one equipment room.

**2:55–3:30 · 35 seconds**

The next step is one equipment room, one teacher sponsor and four weeks. Observe the current process first, then compare checkout time, completeness of records and staff follow-up while using Trakr. The business hypothesis is a school subscription, with onboarding support for inventory and tags. Before expanding, we need evidence that staff continue to use it, a buyer is willing to pay and support effort is manageable. Our ask is a focused pilot that answers those questions. Now we will show the borrowing and return workflow in three minutes.

Source: Proposed pilot and commercial model; no customer traction, price or market-size claim.

## 7. Let’s borrow a camera.

**3:30–6:30 · 3-minute demo**

0:00–0:20: Introduce the prepared student account and two enrolled test items. 0:20–1:00: Scan the camera and tripod and show the staging list. 1:00–1:35: Report the loose camera strap, acknowledge the tripod condition, confirm and show the receipt. 1:35–2:20: Switch to the teacher session, review active claimants and confirm return. 2:20–2:45: Show the returned record and acknowledge the issue, explaining that returned does not mean repaired. 2:45–3:00: Close with the pilot ask. Use a dedicated test environment; identify simulated NFC or local data clearly. Independent local sessions do not prove cross-device sync.

Source: docs/presentation/demo-runbook.md; README.md
