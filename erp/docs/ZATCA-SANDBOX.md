# ZATCA sandbox walkthrough

How to take a tenant from "installed" to "issuing cleared tax invoices", against ZATCA's
developer sandbox. The same four steps run against simulation and production; only the
environment setting changes.

The screens referred to are at **Settings → ZATCA e-invoicing** (`/settings/zatca`). You need the
Owner role: onboarding creates the key that signs every invoice the business will ever issue.

---

## Before you start

You need three things from outside this system:

1. **A VAT registration number**, fifteen digits, starting and ending in 3. The system rejects
   anything else before it makes a network call, because ZATCA rejects it afterwards with a
   message that does not say why.
2. **A Fatoora portal account** for the taxpayer, at
   <https://fatoora.zatca.gov.sa>. For the sandbox, ZATCA's developer portal issues the OTP
   without a live registration.
3. **The National Address of the branch** — building number, street, district, city, postal code
   and the four-digit additional number. ZATCA validates the shape of all of it.

Confirm the tenant's environment first. Settings → ZATCA shows it; a newly created tenant is on
`sandbox`.

---

## Step 1 — Generate the certificate request

Fill in the EGS unit details and press **Generate certificate request**.

| Field | What it is | Example |
|---|---|---|
| Branch | Which branch this device invoices for | `JED — Al Rawdah` |
| Common name | A unique name for this unit | `EGS-JED-01` |
| Organisational unit | Branch or department; for a VAT group, the member's 10-digit number | `Jeddah Branch` |
| Device serial | `1-<solution>\|2-<model>\|3-<serial>` | `1-NakhlaERP\|2-1.0.0\|3-JED-01` |
| Invoice types | Which types this unit may issue | `1100` — standard and simplified |
| Registered address | Free text, matching the National Address | `Prince Sultan Road, Al Rawdah, Jeddah 23434` |
| Business category | Industry | `Restaurants` |

**What happens.** A secp256k1 key pair is generated and the private half is encrypted with the
application's `ENCRYPTION_KEY` before it is stored. A PKCS#10 CSR is built carrying the
identifiers in a `subjectAltName` directory name, plus the certificate template name for the
environment. The CSR is shown so you can inspect it.

**Verify it yourself.** Copy the CSR into a file and run:

```
$ openssl req -in request.csr -noout -text -verify
Certificate request self-signature verify OK
Certificate Request:
    Data:
        Version: 1 (0x0)
        Subject: C = SA, OU = Jeddah Branch, O = ..., CN = EGS-JED-01
        Subject Public Key Info:
            Public Key Algorithm: id-ecPublicKey
                Public-Key: (256 bit)
                ASN1 OID: secp256k1
        Attributes:
            Requested Extensions:
                1.3.6.1.4.1.311.20.2:
                    ..TSTZATCA-Code-Signing
                X509v3 Subject Alternative Name:
                    DirName:/serialNumber=1-NakhlaERP|2-1.0.0|3-JED-01/UID=300000000000003/
                            title=1100/registeredAddress=Prince Sultan Road, Al Rawdah, Jeddah 23434/
                            businessCategory=Restaurants
    Signature Algorithm: ecdsa-with-SHA256
```

Four things to check: **verify OK**, **secp256k1**, the template name matching the environment,
and your VAT number in the `UID` field. The test suite asserts all four
(`tests/unit/zatca-invoice.test.ts`), so a regression here fails CI rather than onboarding.

If the button reports a problem instead, it names the field: a VAT number that does not start and
end in 3, an invoice type that is not four digits, a device serial in the wrong shape.

---

## Step 2 — Request the compliance CSID

1. Sign in to the Fatoora portal as the taxpayer.
2. Go to **Onboarding & Management → Onboard New Solution Unit/Device**.
3. Choose the number of OTPs and generate one. **It is valid for one hour.**
4. Paste it into the OTP field and press **Request compliance CSID**.

**What happens.** The CSR is base64-encoded and posted to
`/e-invoicing/developer-portal/compliance` with the OTP in a header. ZATCA returns a binary
security token — the compliance CSID — a secret, and a request id. All three are encrypted and
stored; the request id is what step 4 exchanges.

**Expected result.** `Compliance CSID issued.` and a request id in the detail panel.

**If it fails**, the panel shows ZATCA's own `dispositionMessage`. The two common causes:

- *OTP expired or already used* — generate a fresh one; each is single-use.
- *CSR rejected* — almost always a VAT number that does not match the portal account, or a
  template name from the wrong environment.

---

## Step 3 — Run the compliance checks

Press **Run compliance checks**. No input; the system builds the samples itself.

**What happens.** For each invoice type the CSR enabled, a sample invoice is generated, hashed,
signed with the compliance CSID and submitted to `/compliance/invoices`. A unit registered for
`1100` submits two: a standard invoice with a buyer, and a simplified one without. They are
chained — the second carries the first's hash as its PIH — because ZATCA checks the chain even in
compliance.

**Expected result.** `All 2 compliance checks passed.`

**If a check fails**, the detail panel carries ZATCA's `validationResults` verbatim, with the
`errorMessages` array. The codes worth knowing:

| Code | What it means | What to do |
|---|---|---|
| `BR-KSA-16` | The invoice hash does not match the invoice | The XML changed after hashing. This system hashes and signs in one transaction, so it should not occur; if it does, it is a bug and worth a report. |
| `BR-KSA-26` | The previous invoice hash is wrong | The chain is broken. Settings → ZATCA shows the last counter value. |
| `BR-KSA-F-04` | The QR does not match the invoice | Regenerate the CSR; the stored key and the certificate have diverged. |
| `BR-KSA-09` | Missing seller address field | Complete the branch's National Address, including the additional number. |

The compliance step is where onboarding usually stops, and it is the step where the raw reply
matters most — which is why it is shown rather than summarised.

---

## Step 4 — Request the production CSID

Press **Request production CSID**. Only enabled once step 3 has passed for every required type.

**What happens.** The compliance request id is exchanged at `/production/csids` for the
production CSID and secret. Both are encrypted and stored, and the device's status becomes
`ACTIVE`.

**Expected result.** `Production CSID issued. Tax invoices can now be cleared and reported.`

The device table now shows `ACTIVE` and the counter at 0. The next invoice posted from this
branch takes counter 1 and the fixed initial PIH.

---

## Issuing an invoice, and reading what came back

Post an invoice from the Sales screen. In one transaction the system allocates a gap-free number,
issues the stock, posts the ledger, claims the next chain link, and signs.

The invoice screen then shows:

- **The QR**, rendered from the exact value embedded in the signed XML — not regenerated for
  display. Scan it with ZATCA's own app to check.
- **ICV and PIH**, the chain values.
- **The ZATCA panel**, with the submission's status, attempt count, HTTP status, and any warnings
  or errors.

`XML` downloads the signed document. Once ZATCA clears an invoice, the download serves ZATCA's
copy instead, because that is the legal document.

### Status, and what it means

| Status | Meaning |
|---|---|
| `PENDING` | Queued. The worker submits it; a simplified invoice must reach ZATCA within 24 hours. |
| `CLEARED` | A standard invoice ZATCA has cleared. It is now valid. |
| `REPORTED` | A simplified invoice ZATCA has acknowledged. |
| `REJECTED` | ZATCA refused it. The errors are shown. **This is terminal** — retrying a rejection burns the reporting window and hides the problem. |

An invoice ZATCA rejects keeps its number and its ledger effect. It legally exists; what is
missing is clearance. Correct it with a credit note and issue a fresh invoice — never by editing
or deleting, which would break the chain for every invoice after it.

---

## Moving to production

1. Change the tenant's environment to `production` in Settings.
2. Run all four steps again. A production CSID is issued against a fresh CSR, and the sandbox key
   is not reused.
3. Check the invoice type flag matches what the business actually issues. A restaurant issuing
   both wants `1100`; a wholesaler with no walk-in trade wants `1000`.
4. Set a reminder for the certificate's expiry. `daysUntilExpiry` in
   `src/lib/zatca/certificate.ts` drives the dashboard warning, and a lapsed CSID stops invoicing
   dead.

---

## Screenshots

This walkthrough describes each screen and quotes the exact output at every step, including the
OpenSSL verification and ZATCA's error codes, so it can be followed without images. Capturing
screenshots of a successful production compliance check requires a real VAT registration and a
live Fatoora account, which this build does not have; the sandbox screens are reproducible by
following the steps above against ZATCA's developer portal.
