# Customer order intake — first release

Status (2026-10-13): The website UI and Tune Desk integration are implemented locally. The order Worker is deployed at `orders.cmperf.uk` with a private R2 bucket in Cloudflare's `us` jurisdiction and Turnstile; the website and Mac service changes are not yet deployed. A live customer order has not been submitted or imported. The concurrency stress test remains deferred.

## What the customer sees

The first screen asks **“Choose your tuning platform.”** with three mobile-friendly choices:

- **Bootmod3:** Show how to find **CM Performance** in the Bootmod3 Tuners directory and send the request there. No website order or upload.
- **MHD:** Collect their MHD-generated stock `.bin` and `_flashoptions` file.
- **ECU read / bench:** Collect one raw `.bin` or `.mpc` file.

For MHD and bench orders, ask for name, email, VIN, vehicle, engine, requested 2-step RPM, and a short note. Show an unchecked **“Add a performance remap (+$100)”** option. If they choose M1/M2 activation, ask for the two button RPMs. Engine choices are N20, N26, N55, N63, S55, B58 and B58 Gen 2; label B58 choices **“review first”** until support is confirmed. Show the current base price as **from $200**, with the final quote set after review. No payment is taken here.

A website cannot open a phone's file picker in a chosen folder. The `_flashoptions.xml` picker now shows the owner-confirmed Android and iPhone locations. The stock-BIN location is still described generically until a real export path is confirmed ([browser file-picker behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file)).

## The smallest working flow

1. **Verify email on the page.** The customer enters an address and a short-lived code emailed to it. The Worker issues a short-lived, signed `Secure`/`HttpOnly` cookie for that verified email. An unverified visitor cannot start an upload. Limit code sends and attempts, and put a bot check before sending a code. The browser cannot set its own “verified” flag.
2. **Submit files to Cloudflare.** The Worker checks required file slots and a firm size limit, stores the originals in a **private R2 bucket**, then writes one `pending/<reference>.json` record only when the complete submission is saved. The page shows the reference and says **“Submitted. We’ll email you when we receive it.”** The same reference cannot create a second order. R2 keeps submitted files while the order is pending; abandoned uploads can expire.
3. **Bring one order at a time into Tune Desk.** A single Mac process polls Cloudflare at a modest interval. It checks the saved files and creates a manual job using the reference as its unique ID. Retrying an order finds the same job instead of creating another. The Mac is never a public upload endpoint.
4. **Send the receipt email.** After Tune Desk has saved the job and files, its email worker sends one fixed message to the verified address: **“We’ve received your request and files (reference). We’ll review them and contact you with next steps.”** Record the send result so a retry does not send it again. Then mark the Cloudflare order complete. If the Mac is offline, the order remains pending and no “received” email is sent.

A bad order must stay visible for Chef to resolve while the importer continues to later orders. Website orders begin as **New / needs intake review**; they do not become Paid, start a build, or authorize map delivery.

## Email conversation in Tune Desk

Use that same **request reference as the email thread ID**, not as a filename. Store the verified address, reference, and receipt email's Message-ID on the Tune Desk job. The receipt comes from `contact@cmperf.uk` with Reply-To set to the same address and the reference in its subject. In the job detail, authorized staff can read the email conversation and press **Reply**; Tune Desk sends through the existing mail provider, keeps the subject/thread headers, and records the outgoing message and send receipt. Staff never need to copy the customer's address into a separate mail app.

Customer replies to `contact@cmperf.uk` already forward to the company Gmail inbox. A small inbound mail listener attaches a reply to a job only when its thread/reference and sender match that job's verified address. Ambiguous or unmatched mail stays for human review rather than appearing on the wrong job. This listener is separate from the existing Bootmod3 notification listener, which watches a different mailbox and only recognizes Bootmod3 alerts. The reference remains stable through the conversation, including later files or revisions; no customer-facing download link is implied.

## Checks before launch

- Verify that an unverified browser cannot upload, a wrong or expired code fails, and email changes require a new code.
- Try missing, empty, oversized, wrong-slot and interrupted files. The browser gives quick feedback; the Worker enforces the same basic checks. The Mac checks size and file hash again. An unfamiliar but plausible ECU file goes to manual review rather than being called compatible.
- Submit twice, restart the Mac between saving a job and marking the order complete, and take the Mac offline with pending orders. Confirm one Tune Desk job and one receipt email per reference.
- Send a staff reply and a customer response. Confirm both appear on the correct job, a retry does not resend, and mail with a wrong reference or sender cannot attach to another customer's job.
- Test the form on Android and iPhone with real MHD file locations. Confirm the Bootmod3 path only shows instructions.

No D1 database, Cloudflare Queues, public order-status portal, or new build workflow in this release. Add those only if order volume shows a need.

Before publishing, confirm the MHD file locations and inspect one real stock BIN/flashoptions pair, verify the engine labels and base price, and approve the two short transactional email templates (verification code and received-order receipt). The external ECU workspace was not mounted during this planning pass, so no file signature or engine compatibility is claimed here.

## Controlled production test proposed for Chef approval

This starts only after Chef commits and pushes both repositories and approves the test. Use the company-owned `cmperformancegh@gmail.com` mailbox, clearly named **CM Performance intake TEST** records, a non-flashable synthetic BIN, and a test VIN. No customer file, payment, map build, or release is involved. Leave the test records visible for Chef to inspect; do not silently delete them.

1. Deploy the committed website, revised Cloudflare Worker, and Mac intake/mail workers. Check the Mac service and worker process health, the Worker custom domain, the private US-jurisdiction R2 binding, and that the website loads the new form over HTTPS.
2. In the real website browser, choose **ECU read / bench**, request an email code, try one wrong code, then verify with the correct code. Confirm an unverified upload is rejected and the verified session is bound to that email.
3. Upload one small synthetic `.bin` as a **test-only** bench request. Confirm the page shows a reference, the Mac imports the same bytes and hash into exactly one New/needs-review Tune Desk job, and the fixed receipt reaches the test mailbox once with its provider Message-ID recorded. Confirm Cloudflare marks the order complete afterward.
4. Refresh and retry the same submission key. Confirm the same reference and no second Tune Desk job or receipt. Test the MHD file-slot and 1 MB flashoptions rejection with browser/Worker checks; a real MHD pair is reserved for a later owner-supplied compatibility test.
5. Reply from the test mailbox to the receipt. Confirm it appears on that one Tune Desk job. Send one clearly marked staff test reply from the job and confirm it reaches the same mailbox and threads correctly. Check the outbound send receipt and that no other job gains the message.
6. Report the references, hashes, email counts, observed timing, any failure, and the remaining limits to Chef. Keep the TEST job visible until Chef decides how to archive it. Do not run a stress test or interrupt the live Mac service intentionally.
