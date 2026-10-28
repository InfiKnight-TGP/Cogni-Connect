# My Places: Phase 1 recovery

Phase 1 backend recovered from commit `9cfe031` onto `phase-N`, based on
`origin/main` at `1f676c7`. The original checkout and its local changes are
preserved. The frontend is recovered from `906b3c8` in a separate commit on the
same branch, with additional URL, accessibility, and translation checks.

Places and photos belong to the session's patient. Self accounts and caregiver
members can edit; paired devices and patient logins can read only. Other patients'
place IDs and photos return 404. The cap is 12 places, or 6 for demo accounts;
demo changes are limited to 60 per hour per session. Demo reset removes saved
places and photos and restores the empty list.

Only the Google Maps HTTPS hosts listed in the build plan are accepted. The
server never fetches the URL. Photos must decode as JPEG, PNG or WebP, fit within
5 MB, and stay within 8000 pixels per dimension and 25 megapixels. Replacement
and deletion remove old photos. Face recognition is not used.

Hours use local `HH:MM` values. Empty times mean unknown hours. Closing time is
exclusive; equal opening and closing times mean all day. Overnight hours apply
on each non-closed calendar day; a closed day is closed for the whole day.

## Verification

Run from `backend/`:

```powershell
.venv\Scripts\python.exe -c "import app"
.venv\Scripts\python.exe -m unittest discover tests
```

Tests use temporary patient data. Shared test setup blocks OpenAI and outbound
socket calls. API-key isolation is verified with a temporary dummy-key file;
no real `.env` or credentials are needed. Run the frontend type check and all
existing `lib/**/*.check.mjs` scripts after this commit too.

People endpoint tests stub face detection with known fixture outcomes and create
their own zoo metadata instead of requiring downloaded models or patient backups.
Video upload tests wait for the worker to finish instead of sleeping for a fixed
fraction of a second. These checks do not validate the real face detector model.

The backend part adds no locale phrases. The frontend adds 78 UI phrases to each
of Hindi and Assamese, and expands required locale coverage by 81 to 545 phrases.

## Using the editor

Self-care users select **My Places**, then **Edit places**. Caregivers select
**Places**. Use **Add a place** to paste a Google Maps share link, enter a name,
and optionally add a category, note, photo, or hours. The dialog validates links
before saving or testing them. If a photo upload fails after saving the place,
retrying updates that same place and preserves the photo draft.

Paired devices and patient logins see cards without editing controls. **Take me
there** opens Google Maps in a separate tab; it does not track location. Dialogs
support keyboard navigation and restore focus when closed. Navigation buttons
are at least 64px tall and editor targets are at least 56px tall.

For frontend verification, run `npx.cmd tsc --noEmit` and every
`lib/**/*.check.mjs`, including `lib/places.check.mjs`. The latter checks URL
safety, hours, role restrictions, and UI phrase coverage. Browser verification
must additionally exercise self-care saving, both disallowed example URLs,
Google Maps navigation, the paired demo device (`DEMA-2345`), and caregiver
adding/editing. Backend and source checks do not substitute for these scenarios.
