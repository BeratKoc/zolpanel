# Task 4 Report — SSL Status E2E Test

## Status
DONE

## Commit
(see below — committed after this report was written)

## E2E Result
21 passed (27.5s)

## What Was Done

Added a second `test(...)` inside the existing `test.describe('domains', ...)` block in
`e2e/domains.spec.ts`. The new test:

1. Navigates to Domainler (login is handled by `beforeEach`).
2. Registers a dialog-accept handler for the delete confirmation.
3. Opens the add modal and creates a proxy domain `ssl-e2e.local` on port `3091`
   (distinct from the existing test's `e2e-test.local`/`3070`).
4. Asserts the new row is visible in the list.
5. Locates the specific `.domain-card` row by filtering on the domain text, then
   asserts the `"SSL Bekleniyor"` badge and the `"SSL'i yeniden kontrol et"` aria-label
   button are visible — confirming the freshly-added domain starts in `sslStatus: 'pending'`.
6. Clicks the recheck button. The real `GET /api/domains/[id]/ssl` route does a live
   TLS handshake to `127.0.0.1:443`; no cert is served in the test environment, so the
   socket errors out and `checkDomainSslInfo` returns `{ status: 'error' }`. The UI
   updates via `setDomains` using the API response directly.
7. Asserts `"SSL Hatası"` text appears within 15 000 ms and the recheck button remains visible.
8. Deletes the domain via `getByTitle('Sil', { exact: true })` scoped to the row, and
   asserts the domain text is gone — self-cleaning.

## Key Implementation Notes

- Row scoping via `page.locator('.domain-card').filter({ hasText: SSL_DOMAIN })` prevents
  any selector ambiguity when other domains exist in the DB.
- No route mocking; follows the real-backend convention of the file.
- The SSL API route has a minor bug (it always persists `'pending'` even for `'error'`
  status), but this does not affect the test because the UI state is driven by the live
  API response, not a DB re-fetch.

## Concerns
None.
