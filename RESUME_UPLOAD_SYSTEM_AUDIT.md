# Resume Upload System Audit

**Scope:** Read-only inspection of the frontend and backend source/build files and the current project filesystem. No database was accessed, no upload was attempted, and no source code was changed.

## Phase 3 Implementation Update

The original sections below describe the state observed during the initial audit. Phase 1 later added a shared backend-root upload directory that is created automatically. Phase 2 changed frontend file links to use the configured backend origin.

Phase 3 now uses that shared upload directory for cleanup, deletion, and file retrieval. Public static serving of `/uploads` was removed. Resume files are sent through an authenticated `GET /api/resumes/:id/file` route that verifies ownership before opening the file. Resume API responses keep their existing shape but now set `fileUrl` to this protected route; the frontend View and Download actions use it, and Download requests an attachment response. Upload filtering checks PDF MIME type and `.pdf` extension, then the service checks the PDF signature before saving its database record. Multer errors receive client error responses. Frontend resume metadata types no longer claim a file size that the backend does not return and use the backend's `fileType` field.

Phase 3 validation did not access the database or perform browser-based retrieval/download tests. An isolated HTTP test of the active Multer middleware accepted a temporary PDF into the shared directory, rejected a non-PDF, and returned HTTP 413 for an oversized file; temporary uploads were removed. A route-level request with a spoofed PDF MIME type was rejected and cleaned up before reaching Prisma. An unauthenticated request to the protected file route returned HTTP 401 without reaching the database. Focused frontend tests and lint passed. Backend and frontend full TypeScript builds remain blocked by existing errors outside the changed files (Prisma `setting` client/bcrypt types on backend; unused dashboard imports and a settings toast type on frontend).

## A. Executive Summary

The current upload failure has a clear cause in the inspected project: the active Multer middleware tries to write into `D:\Apply_Flow\Apply_Flow_Backend\uploads`, but that folder does not exist. The active middleware provides the path through a `destination` callback and does not create the folder. Multer then tries to open the new file and receives `ENOENT` (“the path does not exist”).

The source and compiled middleware resolve to the same backend-root `uploads` folder, so this is not a development-versus-production path difference in the active implementation. The main confirmed problem is that the active upload path is not created.

There are also separate confirmed issues:

- The frontend stores and uses `/uploads/...` as a root-relative URL. In local development, this points at the frontend host, not the backend host, because Vite has no proxy configured.
- The static uploads folder is served without authentication. Anyone with a file URL can request the file.
- Database-failure cleanup and resume deletion use `process.cwd()`-relative paths rather than the absolute Multer path. They can target the wrong folder if the server is started from a different working directory; cleanup failures are swallowed.
- A second, unused Multer setup creates different folders and applies different validation. It is not the setup used by the resume route.

## B. Actual Project Structure

Relevant folders and files found:

```text
Apply_Flow_Backend/
├── src/
│   ├── app.ts
│   ├── config/
│   ├── middlewares/
│   │   ├── auth.middleware.ts
│   │   ├── error.middleware.ts
│   │   └── upload.middleware.ts          [active for resumes]
│   ├── modules/
│   │   └── resumes/
│   │       ├── resume.router.ts
│   │       ├── resume.controller.ts
│   │       ├── resume.service.ts
│   │       └── utils/fileUpload.utils.ts [not imported by route]
│   ├── prisma/schema.prisma
│   ├── routes/index.ts                   [route reference/comments]
│   └── utils/fileUpload.utils.ts         [not imported by route]
├── dist/                                 [compiled files exist]
│   ├── app.js
│   ├── middlewares/upload.middleware.js
│   └── modules/resumes/...
├── uploads/                              [MISSING]
└── src/uploads/                          [MISSING]

J.M.S/                                    [frontend project]
└── src/
    ├── features/resumes/...
    ├── lib/api.ts
    └── pages/app/...
```

In the backend, `src/controllers/` and `src/services/` do not exist; resume code is under `src/modules/resumes/`. `src/routes/` exists, but its `index.ts` is an aggregation reference; actual route mounting is in `src/app.ts`. `dist/uploads/` is also missing.

## C. Complete Upload Flow

1. The frontend’s upload dialog accepts a PDF and validates the file before submission: `J.M.S/src/features/resumes/components/UploadResumeDialog/UploadResumeDialog.tsx` and `J.M.S/src/features/resumes/utils/validateResumeFile.ts`.
2. The frontend service creates `FormData`, puts the file under the field name `file`, and posts to `/resumes`: `J.M.S/src/features/resumes/services/resumeService.ts` lines 42–76.
3. Axios uses `import.meta.env.VITE_API_URL` as its base URL and removes its default JSON content type for `FormData`, allowing Axios to set the multipart boundary: `J.M.S/src/lib/api.ts` lines 7–20. For the backend route to match, the configured base URL must include `/api`.
4. The backend mounts the resume router at `/api/resumes`: `Apply_Flow_Backend/src/app.ts` line 37.
5. The router runs authentication before the upload middleware. Its `POST /` route applies `uploadSingleFile` and then calls the controller: `src/modules/resumes/resume.router.ts` lines 9–13.
6. Multer uses disk storage. It creates a unique-looking filename from the client filename, current time, and a random number. Its destination callback points to `uploads` at the backend project root: `src/middlewares/upload.middleware.ts` lines 5–21.
7. The controller passes `req.file.originalname`, `req.file.filename`, and `req.file.mimetype` to the service. It does not pass or inspect `req.file.path`: `src/modules/resumes/resume.controller.ts` lines 43–63.
8. The service creates a Prisma `Resume` row with the original filename, MIME type, display name, and `/uploads/<generated filename>` URL: `src/modules/resumes/resume.service.ts` lines 45–58.
9. The frontend displays View and Download links using the returned `fileUrl`. The backend serves static files from `/uploads`: `J.M.S/src/features/resumes/components/ResumeCard/ResumeCard.tsx` lines 95–111 and `src/app.ts` line 31.
10. The frontend deletes a resume through `DELETE /resumes/:id`; the backend removes the database row and then tries to remove the file: `resume.router.ts` lines 14–15 and `resume.service.ts` lines 88–110.

There is no PDF text-extraction or PDF-processing code in the inspected backend. The failing `open()` is consistent with Multer opening its output file during upload.

## D. File and Folder Verification

| Purpose | Expected path | Path resolved by code | Exists now? | Finding |
|---|---|---|---|---|
| Active upload destination in source mode | `Apply_Flow_Backend/uploads/` | `src/middlewares/../../uploads` → `Apply_Flow_Backend/uploads/` | No | Active middleware does not create it. |
| Active upload destination in compiled mode | `Apply_Flow_Backend/uploads/` | `dist/middlewares/../../uploads` → `Apply_Flow_Backend/uploads/` | No | Same destination as source mode. |
| Static file root in source mode | `Apply_Flow_Backend/uploads/` | `src/../uploads` → `Apply_Flow_Backend/uploads/` | No | Matches active Multer destination. |
| Static file root in compiled mode | `Apply_Flow_Backend/uploads/` | `dist/../uploads` → `Apply_Flow_Backend/uploads/` | No | Matches active Multer destination. |
| Resume module helper destination in source mode | It claims project-level uploads | `src/modules/resumes/utils/../../../uploads` → `src/uploads/` | No | The helper’s comment and actual path do not agree. |
| Resume module helper destination in compiled mode | It claims project-level uploads | `dist/modules/resumes/utils/../../../uploads` → `dist/uploads/` | No | Moves with build output; differs from source path. |
| Generic helper destination when CWD is backend root | `Apply_Flow_Backend/uploads/resumes/` | `process.cwd()/uploads/resumes` | No | That helper creates the directory, but is unused by this route. |
| Backend controllers/services folders | Not used in this structure | `src/controllers/`, `src/services/` | No | Resume code is in `src/modules/resumes/`. |
| Backend routes folder | Route documentation/reference | `src/routes/` | Yes | Contains `index.ts`; `app.ts` mounts the real routers. |

These are physical filesystem checks from this audit. They do not prove which process working directory or code build was used when the earlier request failed.

## E. Multer Configuration Audit

### Active configuration

`src/middlewares/upload.middleware.ts` is imported by `src/modules/resumes/resume.router.ts`.

```ts
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  },
});
```

- Storage type: `diskStorage`.
- Destination: absolute path derived from `__dirname`, resolving to `Apply_Flow_Backend/uploads`.
- Filename: original basename plus timestamp, random number, and original extension.
- Directory creation: **none** in this active middleware.
- Filter: only checks `file.mimetype === 'application/pdf'` at lines 24–33. The backend does not check the extension or inspect the PDF’s contents.
- Size limit: 10 MiB at lines 35–42.
- Field name: `file`, matching the frontend FormData field.
- `req.file.filename` is used by the service; `req.file.path` is not used.

The filename is normally unique, but uniqueness is probabilistic: the code does not check whether a name already exists or reserve it exclusively. A collision is very unlikely, but there is no explicit collision guard.

### Other configurations

Two other Multer configurations exist but are not imported by the active resume router:

1. `src/utils/fileUpload.utils.ts`:
   - Uses `process.cwd()/uploads/resumes`.
   - Creates that folder recursively at module load.
   - Allows PDF, DOC, and DOCX and checks both MIME and extension.
   - Has a 5 MiB limit.
2. `src/modules/resumes/utils/fileUpload.utils.ts`:
   - Uses `__dirname/../../../uploads`.
   - Creates that path recursively at module load.
   - Has a 5 MiB limit and checks MIME types, but does not check the extension.
   - In source mode its resolved directory is `src/uploads`; in compiled mode it resolves to `dist/uploads`.

A search found no imports or call sites for either helper. Therefore, their directory creation, filtering, and limits do not apply to the live resume route.

## F. Path Resolution Audit

### Active upload versus static serving

The active middleware’s `__dirname/../../uploads` and the app’s `__dirname/../uploads` both resolve to the backend root `uploads/` folder in both source mode (`tsx watch src/server.ts`) and compiled mode (`node dist/server.js`). This corrects the concern that the active code inherently picks different directories in development and production: **the inspected active paths match in both modes.**

The issue is that the destination does not exist and the active callback does not create it. Multer receives a directory path and attempts to open a new file within it; it cannot create missing parent directories in this callback.

### Stored URL versus frontend origin

The service stores a root-relative URL such as `/uploads/resume-....pdf`. The frontend anchors use `href={resume.fileUrl}`. A root-relative URL uses the browser’s current host. In local development that is normally the Vite frontend host, while the backend is on a different port. `vite.config.ts` has no development proxy configuration. Thus the link normally requests the file from the frontend server rather than the backend server.

### Cleanup and deletion paths

The service uses `path.join('uploads', filename)` for both database-failure cleanup (line 60) and deletion (line 102). Those paths are relative to the process working directory, not anchored to the active Multer directory. They happen to match if the server’s current working directory is the backend root. If the server starts from another directory, cleanup/deletion may look elsewhere.

## G. Confirmed Bugs

### 1. Active upload folder is missing and is not created

- **Severity:** High (upload is unavailable in the current inspected filesystem).
- **File:** `src/middlewares/upload.middleware.ts`, lines 10–14.
- **Evidence:** Current check found no `Apply_Flow_Backend/uploads/`. The callback only returns that path and does not call `mkdir`.
- **Impact:** Multer gets `ENOENT` when it opens the new file inside the missing folder. The controller and service are never reached.

### 2. File links resolve against the frontend host in local development

- **Severity:** Medium.
- **Files:** `src/modules/resumes/resume.service.ts`, line 47; frontend `src/features/resumes/components/ResumeCard/ResumeCard.tsx`, lines 95–111; `vite.config.ts`.
- **Evidence:** Backend stores `/uploads/<filename>`; frontend uses that value directly as an anchor; the inspected Vite config has no proxy.
- **Impact:** Upload can succeed while View/Download requests go to the frontend origin and fail to find the file.

### 3. Resume files are publicly served without authentication

- **Severity:** Medium security concern.
- **File:** `src/app.ts`, lines 29–37.
- **Evidence:** `express.static(...)` is mounted before API routers and is not wrapped in `authMiddleware`. Resume API routes require auth, but static file requests do not.
- **Impact:** Anyone who obtains a file URL can fetch that resume without logging in. Generated names are not a substitute for access control.

### 4. File/database cleanup can target the wrong folder and hide failures

- **Severity:** Medium.
- **File:** `src/modules/resumes/resume.service.ts`, lines 59–69 and 97–109.
- **Evidence:** Cleanup and deletion build a relative `uploads/...` path. Cleanup exceptions are swallowed. Deletion removes the database row first, then attempts file deletion; file deletion errors are also swallowed.
- **Impact:** If CWD differs from the backend root, cleanup may leave an uploaded file behind, and deletion may remove the row but leave the file. The existence of this behavior is confirmed; whether it occurs depends on runtime CWD and filesystem state.

### 5. Frontend and backend resume metadata do not match

- **Severity:** Low.
- **Files:** `src/prisma/schema.prisma`, lines 101–107; frontend `J.M.S/src/features/resumes/types/resume.types.ts`, lines 1–16; backend `src/modules/resumes/resume.service.ts`, lines 50–57.
- **Evidence:** Backend returns `fileType` and has no `fileSize` column. Frontend type expects `mimeType` and `fileSize`. `ResumeCard` passes `resume.fileSize` to a formatter; the formatter returns “Unknown size” for non-numbers.
- **Impact:** File size and MIME metadata are absent or differently named in frontend data. This does not cause the Multer `ENOENT`.

## H. Potential Risks

- **Probabilistic filename collision:** timestamp plus random number reduces the chance, but does not guarantee uniqueness or prevent an overwrite.
- **MIME-only server validation:** a client can send a misleading `application/pdf` MIME type. The active backend filter does not check the extension or validate file contents. Frontend validation can be bypassed.
- **Cleanup on database failure:** the file is written before Prisma creates its row. If database creation fails, cleanup is attempted with a CWD-relative path and its errors are ignored. A failed cleanup can leave an untracked file.
- **Production storage lifecycle:** files are stored on local disk. If deployed to an ephemeral filesystem or multiple app instances with separate disks, uploaded files may disappear or be unavailable from another instance. Deployment details were not available to verify this.
- **Error status presentation:** Multer errors occur before the controller. The global error middleware logs unexpected errors and returns HTTP 500, so a filesystem `ENOENT` appears as a generic server error to the frontend.
- **Resume details shape:** the frontend type permits `applicationReferences` and `applicationCount`; `getResumeById` returns a plain Prisma Resume row. Those optional UI values may be absent and display as no application usage. This is separate from upload and file storage.

## I. Security Findings

- The static directory has no authentication check. Resume URLs are publicly fetchable if known.
- The active filter trusts the client-provided MIME type and does not validate the extension or PDF contents.
- Multer applies a 10 MiB size cap, which is also the frontend’s configured maximum.
- The generated filename uses `path.basename` on the supplied original name, reducing path separator/path traversal risk for this naming path. The destination itself is fixed; the request cannot choose it.
- The active API routes are behind JWT authentication, which accepts an Authorization header or a token cookie (`src/middlewares/auth.middleware.ts`, lines 13–48). The static files do not use that middleware.
- The inspection found no user-controlled path used in the deletion path other than the filename suffix extracted from the stored URL. No arbitrary path traversal is established by the current code path.

## J. Root Cause of Current HTTP 500

**The evidence strongly identifies the root cause:** the active route directs Multer to open:

```text
D:\Apply_Flow\Apply_Flow_Backend\uploads\<generated filename>
```

The backend-root `uploads` directory does not exist in the inspected filesystem, and the active `destination` callback does not create it. The operating system therefore cannot open a file inside that missing directory and returns `ENOENT`. The filename itself is expected to be new; Multer is supposed to create the file. It is the missing parent directory that matters.

This conclusion is supported by current code and filesystem evidence. If the folder existed at the exact moment of a later request and this error still occurred, additional runtime evidence would be needed: the running process’s actual loaded build/file path, the resolved destination logged by that process, and the full error stack. No database issue is needed to explain this particular error.

## K. Recommended Fix Plan

1. **First:** ensure the active Multer destination directory exists before accepting uploads. The smallest fix is to create the exact backend-root `uploads/` directory at application startup or in the active middleware before Multer writes. Do not rely on the unused helpers.
2. Make cleanup and deletion resolve against that same shared absolute upload directory instead of `process.cwd()`.
3. Make file URLs point to the backend origin (or configure a deliberate frontend/backend proxy) so local View/Download links reach the static middleware.
4. Decide whether resumes must be private. If yes, replace unauthenticated static serving with authenticated file retrieval and ownership checks.
5. Align the frontend resume type with the fields the backend actually returns, or deliberately add the missing metadata fields.
6. Keep one active upload configuration. Remove or clearly mark unused helpers only as a separate cleanup task; they do not fix the current route as written.

## L. Testing Plan

Run these only after a fix is approved and implemented:

| Test | Expected result |
|---|---|
| Upload a valid PDF under 10 MiB | HTTP 201, one database row, file exists in the configured upload directory, and the returned URL opens from the backend host. |
| Upload a non-PDF or spoofed MIME file | Rejected by the server, not just by the frontend. |
| Upload a PDF larger than 10 MiB | Rejected cleanly with a client error (not an unexplained HTTP 500); no database row or partial file remains. |
| Start with upload directory missing | Application creates it, or startup fails with a clear actionable error before accepting uploads. |
| Force a generated-name collision | Existing file is not silently overwritten; request fails safely or obtains a new unique name. |
| Simulate Prisma create failure after file write | Request fails and the newly written file is removed; cleanup uses the same absolute path. |
| Retrieve/view a resume | Static or authenticated endpoint returns the file from backend storage; access rules match the privacy requirement. |
| Delete a resume | Database row and file are both removed, or a reported cleanup failure makes the inconsistency visible. |
| Development run with `tsx watch` | Upload, URL retrieval, and deletion all use the same backend-root upload folder. |
| Production build with `node dist/server.js` | Upload, URL retrieval, and deletion still use the same backend-root upload folder; no dependency on `dist/uploads` or launch CWD. |
| Request a resume URL without authentication | Behavior matches the chosen privacy policy; currently static serving allows it. |
