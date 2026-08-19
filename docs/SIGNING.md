# Windows code signing (optional)

By default the Windows installer this project builds is **unsigned**. It works fine, but
when someone runs it, Windows SmartScreen shows an **"unknown publisher"** warning and they
have to click *More info → Run anyway*. Signing the installer with a code‑signing certificate
removes that warning and shows your name/organization as the verified publisher.

You do **not** need to sign to ship. Everything already works unsigned. This is purely to make
the installer look trustworthy to other people who download it.

The build is already wired up: as soon as you add the two repository Secrets below, the next
release you tag will be signed automatically. Nothing else changes. If the Secrets are missing,
the build simply produces an unsigned installer (no error).

---

## What you need

A **code‑signing certificate** as a `.pfx` (PKCS#12) file, plus its password. You buy this once
from a certificate authority (CA). Options, roughly cheapest → most trusted:

- **OV (Organization Validation) certificate** — ~$100–300/yr from resellers (e.g. Sectigo,
  SSL.com, DigiCert). Removes "unknown publisher" but SmartScreen reputation still builds over time.
- **EV (Extended Validation) certificate** — ~$300–600/yr. Best SmartScreen reputation immediately,
  but the private key usually lives on a hardware token / cloud HSM, which is harder to automate in
  CI. If you go EV, follow your provider's cloud‑signing guide instead of the `.pfx` steps below.

Most solo developers start with an OV `.pfx`.

---

## Step 1 — Get your certificate as a base64 string

GitHub Secrets store text, not files, so encode your `.pfx` as base64.

**Windows (PowerShell):**

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\your-cert.pfx")) | Set-Clipboard
```

That copies the base64 text to your clipboard.

**macOS / Linux:**

```bash
base64 -w0 your-cert.pfx    # (on macOS use: base64 your-cert.pfx | tr -d '\n')
```

Copy the output.

## Step 2 — Add two repository Secrets

On GitHub: **your repo → Settings → Secrets and variables → Actions → New repository secret.**
Add these two:

| Secret name            | Value                                             |
| ---------------------- | ------------------------------------------------- |
| `WIN_CSC_LINK`         | the base64 text from Step 1                       |
| `WIN_CSC_KEY_PASSWORD` | the password for your `.pfx`                      |

That's it. Keep these secret — anyone with them can sign software as you.

## Step 3 — Release as usual

Tag a new version and push it (the normal release flow). The GitHub Actions **Release** workflow
passes those Secrets to electron-builder, which signs the installer during the build. Download the
installer from the Release and confirm the publisher shows your certificate's name instead of
"unknown publisher".

---

## How to tell it worked

- Right‑click the built `*.exe` → **Properties → Digital Signatures** tab shows your certificate.
- Running the installer no longer shows the SmartScreen "unknown publisher" prompt (OV certs may
  still show a generic prompt until they build reputation; EV certs are trusted immediately).

## Notes

- **Auto‑update:** electron-updater verifies the publisher name on Windows. Once you start signing,
  keep using the *same* certificate/publisher across releases so updates keep verifying cleanly.
- **Nothing to change in code or config** — signing is controlled entirely by the two Secrets. To
  stop signing, remove the Secrets; builds go back to unsigned automatically.
- **EV / token‑based certs** can't be base64‑loaded like this; use your provider's cloud signing
  (e.g. Azure Trusted Signing, SSL.com eSigner) and set the corresponding electron-builder options.
