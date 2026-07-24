# Collab V2 Firebase Storage broker

Collab V2 stores durable file metadata in Supabase and file bytes in Firebase
Storage. Firebase Storage Rules cannot query Supabase space membership, so no
client may read or write `spaces/{spaceId}/...` directly. Instead, the two
authenticated callable functions in `src/collabStorageBroker.ts` perform a
server-side membership check against `public.members`, then issue short-lived
Cloud Storage signed requests.

| Callable function | Input | Result |
| --- | --- | --- |
| `createCollabFileUpload` | `{ spaceId, filename, contentType }` | A 10-minute signed POST policy, a generated `objectPath`, and a server-enforced 25 MiB maximum. |
| `createCollabFileDownload` | `{ spaceId, objectPath }` | A 10-minute signed GET URL. |

Both functions require a Firebase-authenticated, non-anonymous user. Before a
URL is signed, they query `members` with both the supplied `spaceId` and the
Firebase UID. The random object key always has the form:

```text
spaces/{spaceId}/{random-uuid}-{safe-filename}
```

The upload endpoint intentionally returns a signed **POST policy**, rather
than a signed PUT URL, because its Cloud Storage policy can enforce the exact
content type and maximum content length. The caller must POST a multipart form
whose fields are exactly those in `upload.fields`, plus a `file` field.

## Required deployment configuration

Do not place the Supabase service-role key in a client, source file, tracked
`.env` file, Firebase Remote Config, or Tauri/Vite configuration. Configure it
only as a Firebase Functions secret:

```sh
firebase functions:secrets:set SUPABASE_SERVICE_ROLE_KEY --project <firebase-project-id>
```

Set these Functions parameters in the project-specific, ignored Functions env
file (or accept the CLI's parameter prompt during deploy):

```dotenv
SUPABASE_URL=https://<supabase-project-ref>.supabase.co
# Optional. If omitted, the Firebase Admin SDK's default Storage bucket is used.
COLLAB_STORAGE_BUCKET=<bucket-name>
```

The Cloud Functions runtime service account needs permission to act through
the chosen bucket for the signed requests:

- `roles/storage.objectCreator` for uploads and `roles/storage.objectViewer`
  for downloads (or a purpose-built bucket role containing only those grants).
- If the runtime signs through IAM rather than a locally supplied service-account
  key, grant it `roles/iam.serviceAccountTokenCreator` on the signing service
  account so it can call `signBlob`.

Deploy the function code and Storage rules together after reviewing the exact
Firebase project and bucket:

```sh
firebase deploy --only functions:notifications,storage --project <firebase-project-id>
```

`storage.rules` is intentionally default-deny. Signed Cloud Storage requests
are authorized by their signature after the callable function performs the
Postgres check; Firebase Storage Rules do not reopen direct client access.

For browser clients, configure bucket CORS with the exact production origins
(and local development origin if required) for `POST` and `GET`. Do not use a
wildcard origin with credentialed application requests.

## Integration sequence

1. Call `createCollabFileUpload` with the active Firebase session.
2. Multipart-POST the returned policy fields plus the file to `upload.url`.
3. Only after upload success, call the future authorized Supabase `create_file`
   RPC to write the File entity metadata and its returned `objectPath`.
4. To download, obtain the metadata through Supabase RLS, then call
   `createCollabFileDownload` with its `spaceId` and `objectPath`.

An orphaned object is harmless but possible if step 2 succeeds and step 3
fails. Add a scheduled, server-side orphan cleanup once the `files` table and
file-metadata RPC land; clients must never receive bucket-wide list/delete
access.

## Verification

Run the backend tests locally:

```sh
npm --prefix functions test
```

Before production deployment, test with two real Firebase users:

1. A member receives a policy and can upload/download only under their space.
2. A non-member is rejected by both callable functions.
3. An anonymous user is rejected.
4. Direct Firebase Storage SDK reads and writes are denied by `storage.rules`.
