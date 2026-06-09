# LEADer — Legal & Compliance Guardrails

LEADer is built so that **legally compliant ingestion is the only path the code allows.**
This document is both policy and a description of what the code enforces.

## Two separate lanes (never mix)

### 1. Automated public-source discovery
Allowed source types: `PUBLIC_WEB`, `RSS`, `PROCUREMENT`, `ACCELERATOR`, `NEWSLETTER`, `API`.

The automated crawler (`src/lib/ingestion`) **will**:
- Fetch only public pages reachable **without** logging in.
- Check and honour `robots.txt` before fetching (cached per host).
- Identify itself with a clear User-Agent.
- Rate-limit per host and cap pages per run.
- Time out and back off on errors.

The automated crawler **will never**:
- Log in, submit credentials, or use stored cookies/sessions.
- Bypass a paywall, captcha, or access control.
- Access private/closed groups or member-only content.
- Ignore `robots.txt`, rate limits, or a site's Terms of Service.

> Enforced in code: `assertAutomatable(source)` throws for non-eligible types, and
> `isAllowedByRobots(url)` must pass before any fetch. `FACEBOOK_MANUAL`, `UPLOAD`,
> and `MANUAL` source types are **structurally excluded** from the automated pipeline.

### 2. Manual / community import (Facebook groups & communities)
For community sources the **human is the collector**. LEADer offers:
- **Manual paste:** copy a post's text + URL + group + author + date into the import form.
- **Browser-side "save this post":** a user-initiated capture (bookmarklet / copy) that the
  *user* runs in their own logged-in browser session and pushes into LEADer. LEADer's server
  never touches the group.
- **Uploaded export / screenshot:** the user uploads content they are entitled to; OCR is a
  future hook.
- AI then *extracts* a candidate lead from text the user supplied; the user confirms it.

LEADer **does not** and **will not** programmatically scrape Facebook (or any closed
community). There is no code path that authenticates to or crawls a private group.

## Bookmarklet concept (user-assisted, compliant)
A documented bookmarklet copies the selected post text + current URL into the clipboard /
opens the LEADer import form prefilled. It runs in the user's browser, on content the user is
already viewing legitimately. It is a convenience over copy-paste — not automation of access.

## GDPR / data handling
- Stored contacts are business leads supplied by public sources or the user; provide
  delete/redact (record + cascade), document lawful basis (legitimate interest / user-supplied).
- No special-category personal data is collected.
- API keys & secrets live in `.env`; DB key fields are placeholders flagged for
  encryption-at-rest before any production/multi-user deployment.

## If in doubt
Default to **manual import**. The product's value is triage and intelligence on top of
data the user is legally entitled to collect — not aggressive scraping.
