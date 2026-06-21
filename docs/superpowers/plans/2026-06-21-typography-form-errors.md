# Typography Scale + Field-Level Form Errors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Zolpanel's typography to the MASTER scale and add inline field-level form error feedback (aria-invalid + below-field message + blur validation) in the change-password and add-domain flows.

**Architecture:** Visual-only changes to page-title h2 tags (fontSize/fontWeight); `FormField` gains an `error` prop; settings and AddDomainModal get local blur-validation state wired to `FormField error=` and `aria-invalid=`. All existing submit-time validations are kept.

**Tech Stack:** Next.js 15 App Router, TypeScript, next-intl (6 locale JSON files), Playwright (e2e).

## Global Constraints

- Node v22; npm; Windows (EPERM on .next → delete and retry).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Must pass: `npx tsc --noEmit` (clean), `npm run build`, `npm test` (12 pass), `npm run e2e` (19 pass).
- Do NOT remove existing toast-based submit-time validation; only add blur-time inline feedback.
- Do NOT change font sizes other than h1/h2 page-level titles. Keep micro/label/body as-is.
- `domains.errInvalidDomain` i18n key must be added to ALL 6 locale files.

---

### Task 1: Typography — h2 page titles + h1 login title

**Files:**
- Modify: `app/(panel)/domains/page.tsx` (line 64)
- Modify: `app/(panel)/processes/page.tsx` (line 67)
- Modify: `app/(panel)/settings/page.tsx` (line 68)
- Modify: `app/login/page.tsx` (lines 51-56)

**Note:** `app/(panel)/logs/page.tsx` and `app/(panel)/dashboard/page.tsx` do NOT have a page-level `<h2>` with fontSize 15px — skip them.

**Interfaces:** None — visual-only edits.

- [ ] **Step 1: Update domains page h2**

In `app/(panel)/domains/page.tsx` line 64, change:
```tsx
<h2 style={{ fontSize: '15px', fontWeight: 500 }}>{t('domains.title')}</h2>
```
to:
```tsx
<h2 style={{ fontSize: '16px', fontWeight: 600 }}>{t('domains.title')}</h2>
```

- [ ] **Step 2: Update processes page h2**

In `app/(panel)/processes/page.tsx` line 67, change:
```tsx
<h2 style={{ fontSize: '15px', fontWeight: 500 }}>{t('processes.title')}</h2>
```
to:
```tsx
<h2 style={{ fontSize: '16px', fontWeight: 600 }}>{t('processes.title')}</h2>
```

- [ ] **Step 3: Update settings page h2**

In `app/(panel)/settings/page.tsx` line 68, change:
```tsx
<h2 style={{ fontSize: '15px', fontWeight: 500, marginBottom: '24px' }}>{t('settings.title')}</h2>
```
to:
```tsx
<h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '24px' }}>{t('settings.title')}</h2>
```

- [ ] **Step 4: Update login h1**

In `app/login/page.tsx` lines 51-56, change:
```tsx
<h1 style={{
  fontSize: '18px',
  fontWeight: 500,
  color: 'var(--text-primary)',
  marginBottom: '4px',
}}>
```
to:
```tsx
<h1 style={{
  fontSize: '20px',
  fontWeight: 600,
  color: 'var(--text-primary)',
  marginBottom: '4px',
}}>
```

- [ ] **Step 5: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

---

### Task 2: `FormField` gains `error` prop

**Files:**
- Modify: `components/ui.tsx` (lines 217-245)

**Interfaces:**
- Produces: `FormField` accepts `error?: React.ReactNode`; renders `<p role="alert" style={{ fontSize: '11px', color: 'var(--red)', marginTop: '4px' }}>{error}</p>` after children when `error` is truthy. If both `hint` and `error` are present, render both (error shown in addition to hint).

- [ ] **Step 1: Extend FormFieldProps and render error**

In `components/ui.tsx`, replace the `FormField` block (lines 217-245):

Current:
```tsx
// FormField
interface FormFieldProps {
  label?: React.ReactNode;
  children?: React.ReactNode;
  hint?: React.ReactNode;
}

export function FormField({ label, children, hint }: FormFieldProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      {label && (
        <label style={{
          display: 'block',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          marginBottom: '6px',
          fontWeight: 400,
        }}>
          {label}
        </label>
      )}
      {children}
      {hint && (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
```

Replace with:
```tsx
// FormField
interface FormFieldProps {
  label?: React.ReactNode;
  children?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}

export function FormField({ label, children, hint, error }: FormFieldProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      {label && (
        <label style={{
          display: 'block',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          marginBottom: '6px',
          fontWeight: 400,
        }}>
          {label}
        </label>
      )}
      {children}
      {hint && (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          {hint}
        </p>
      )}
      {error && (
        <p role="alert" style={{ fontSize: '11px', color: 'var(--red)', marginTop: '4px' }}>{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

---

### Task 3: Settings change-password — blur validation + aria-invalid

**Files:**
- Modify: `app/(panel)/settings/page.tsx`

**Interfaces:**
- Consumes: `FormField` with `error?: React.ReactNode` (from Task 2)
- Produces: `pwErr` state `{ next?: string; confirm?: string }`, blur handlers on new-password and confirm inputs. Existing `handleChangePassword` toast validation unchanged.

- [ ] **Step 1: Add pwErr state**

In `app/(panel)/settings/page.tsx`, after the existing `const [pwLoading, setPwLoading] = useState(false);` line, add:
```tsx
const [pwErr, setPwErr] = useState<{ next?: string; confirm?: string }>({});
```

- [ ] **Step 2: Wire blur handler and aria-invalid to new-password field**

Current `FormField` for new password (lines 83-90):
```tsx
<FormField label={t('settings.newPassword')}>
  <input
    type="password"
    value={pwForm.next}
    onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
    required
  />
</FormField>
```

Replace with:
```tsx
<FormField label={t('settings.newPassword')} error={pwErr.next}>
  <input
    type="password"
    value={pwForm.next}
    onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
    onBlur={e => {
      const v = e.target.value;
      if (v && (v.length < 12 || !/[A-Z]/.test(v) || !/[0-9]/.test(v))) {
        setPwErr(prev => ({ ...prev, next: t('settings.passwordTooShort') }));
      } else {
        setPwErr(prev => ({ ...prev, next: undefined }));
      }
    }}
    aria-invalid={!!pwErr.next}
    required
  />
</FormField>
```

- [ ] **Step 3: Wire blur handler and aria-invalid to confirm-password field**

Current `FormField` for confirm password (lines 91-98):
```tsx
<FormField label={t('settings.newPasswordConfirm')}>
  <input
    type="password"
    value={pwForm.confirm}
    onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
    required
  />
</FormField>
```

Replace with:
```tsx
<FormField label={t('settings.newPasswordConfirm')} error={pwErr.confirm}>
  <input
    type="password"
    value={pwForm.confirm}
    onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
    onBlur={e => {
      const v = e.target.value;
      if (v && v !== pwForm.next) {
        setPwErr(prev => ({ ...prev, confirm: t('settings.passwordMismatch') }));
      } else {
        setPwErr(prev => ({ ...prev, confirm: undefined }));
      }
    }}
    aria-invalid={!!pwErr.confirm}
    required
  />
</FormField>
```

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

---

### Task 4: AddDomainModal — domain field blur validation + i18n key

**Files:**
- Modify: `components/domains/AddDomainModal.tsx`
- Modify: `messages/tr.json` — add `"domains.errInvalidDomain"` key
- Modify: `messages/en.json` — add `"domains.errInvalidDomain"` key
- Modify: `messages/zh.json` — add `"domains.errInvalidDomain"` key
- Modify: `messages/es.json` — add `"domains.errInvalidDomain"` key
- Modify: `messages/de.json` — add `"domains.errInvalidDomain"` key
- Modify: `messages/fr.json` — add `"domains.errInvalidDomain"` key

**Interfaces:**
- Consumes: `FormField` with `error?: React.ReactNode` (from Task 2)
- Produces: `domainErr` state `string | undefined`, blur handler on domain input, `error={domainErr}` + `aria-invalid` on domain field. Valid domain `e2e-test.local` matches `/^[a-z0-9.-]+$/i` — no error fires for the e2e test domain.

- [ ] **Step 1: Add i18n key to all 6 locale files**

In `messages/tr.json`, inside the `"domains"` object, after `"statusOffline": "Offline"`, add:
```json
"errInvalidDomain": "Geçersiz domain (sadece harf, rakam, nokta, tire)"
```

In `messages/en.json`, inside the `"domains"` object, after `"statusOffline": "Offline"`, add:
```json
"errInvalidDomain": "Invalid domain (letters, digits, dots, hyphens only)"
```

In `messages/zh.json`, inside the `"domains"` object, after `"statusOffline"` entry, add:
```json
"errInvalidDomain": "无效域名（仅字母、数字、点、连字符）"
```

In `messages/es.json`, inside the `"domains"` object, after `"statusOffline"` entry, add:
```json
"errInvalidDomain": "Dominio inválido (solo letras, dígitos, puntos, guiones)"
```

In `messages/de.json`, inside the `"domains"` object, after `"statusOffline"` entry, add:
```json
"errInvalidDomain": "Ungültige Domain (nur Buchstaben, Ziffern, Punkte, Bindestriche)"
```

In `messages/fr.json`, inside the `"domains"` object, after `"statusOffline"` entry, add:
```json
"errInvalidDomain": "Domaine invalide (lettres, chiffres, points, tirets uniquement)"
```

- [ ] **Step 2: Add domainErr state in AddDomainModal**

In `components/domains/AddDomainModal.tsx`, after `const [submitting, setSubmitting] = useState(false);`, add:
```tsx
const [domainErr, setDomainErr] = useState<string | undefined>(undefined);
```

- [ ] **Step 3: Wire blur validation on the domain input**

Current domain `FormField` (lines 104-112):
```tsx
<FormField label={t('domains.domainName')}>
  <input
    placeholder="ornek.com"
    value={form.domain}
    onChange={e => update('domain', e.target.value)}
    required
    autoFocus
  />
</FormField>
```

Replace with:
```tsx
<FormField label={t('domains.domainName')} error={domainErr}>
  <input
    placeholder="ornek.com"
    value={form.domain}
    onChange={e => update('domain', e.target.value)}
    onBlur={e => {
      const v = e.target.value;
      if (v && !/^[a-z0-9.-]+$/i.test(v)) {
        setDomainErr(t('domains.errInvalidDomain'));
      } else {
        setDomainErr(undefined);
      }
    }}
    aria-invalid={!!domainErr}
    required
    autoFocus
  />
</FormField>
```

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

---

### Task 5: Full verification + commit

**Files:** No new changes — run all checks.

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exits 0, no output

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exits 0, "Build complete" or similar success output

- [ ] **Step 3: Unit tests**

Run: `npm test`
Expected: 12 tests pass (JSON key coverage test picks up the new `errInvalidDomain` key)

- [ ] **Step 4: E2E tests**

Run: `npm run e2e`
Expected: 19 tests pass. The domains spec adds `e2e-test.local` which matches `/^[a-z0-9.-]+$/i` — no inline error fires, submit proceeds normally.

- [ ] **Step 5: Commit**

```bash
git add app components messages
git commit -m "feat(design): type scale alignment + field-level form errors (aria-invalid, blur)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage check:**
- A. Typography h2 (domains, processes, settings) → Tasks 1 steps 1-3. Login h1 → Task 1 step 4. Dashboard/logs skipped — they have no page-level h2 at 15px. ✓
- B. FormField `error` prop → Task 2. `role="alert"` + red color + marginTop. ✓
- C. Settings blur validation, pwErr state, `aria-invalid`, existing toast kept → Task 3. ✓
- D. AddDomain blur validation, `domainErr` state, `aria-invalid`, i18n key in all 6 files → Task 4. ✓
- Verify: tsc, build, 12 unit tests, 19 e2e → Task 5. ✓

**Placeholder scan:** No TBDs, no "similar to", all code shown. ✓

**Type consistency:**
- `pwErr: { next?: string; confirm?: string }` — used consistently in Task 3.
- `domainErr: string | undefined` — used consistently in Task 4.
- `FormField error?: React.ReactNode` — produced in Task 2, consumed in Tasks 3 & 4. ✓
