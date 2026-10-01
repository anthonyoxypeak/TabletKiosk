# Tablet security operations

This is implementation guidance, not a HIPAA certification. The system risk assessment, privacy approval, agreements, device controls, network evidence, monitoring and recovery evidence remain organizational responsibilities.

## Microsoft sign-in applies only to staff

Configure Azure App Service Authentication with Microsoft Entra, the OxyPeak tenant only, requests from this application only, and token store disabled. Allow unauthenticated requests at the platform so patient tablets can use their own API authentication. All staff data and action routes are protected by application middleware; the public dashboard shell contains no patient data.

Set `KIOSK_STAFF_AUTH_MODE=entra`, `KIOSK_ENTRA_TENANT_ID` to the OxyPeak directory ID, and `KIOSK_STAFF_GROUP_IDS` to the approved Tablet Dashboard group object ID. Configure the app registration to issue group IDs in its ID token. Missing groups and group-overage claims deny access; there is no implicit tenant-wide grant. Do not use email suffixes as authorization.

`KIOSK_STAFF_OBJECT_IDS` and the `Tablet.Staff` app role are optional alternative explicit grants. Leave these unset when group membership is the only approved source. In Entra mode, the tablet key and former staff key never grant staff access.

Azure must strip external identity headers and inject its verified principal; do not host this mode behind an arbitrary proxy or expose the container directly. Do not disable App Service Authentication while Entra mode is configured. Verify this deployment assumption after infrastructure changes.

Require MFA through the organization's approved Entra policies. Removing group membership may not invalidate existing authentication cookies immediately; urgent removal also requires account/session revocation and validation. Configure and test session lifetime and sign-in frequency. The dashboard deliberately keeps polling in the background for help alerts. Staff must lock their workstation when leaving it.

## Tablet authentication migration

Patients do not use Microsoft sign-in. Existing tablet URLs continue to bootstrap the shared key; the page strips it from the visible URL after loading and uses a request header. API endpoints no longer accept query-string keys. Existing start URLs and historical logs may still contain the old key. Plan replacement and log review; this change does not erase history.

For a controlled rollout, `KIOSK_DEVICE_KEYS` accepts an array of `{id,chamber,seat,sha256}` entries. Generate a unique random credential per physical tablet and store only its SHA-256 digest in the server registry. Put each credential in its assigned Fully Kiosk start URL fragment (`#key=...`), not a query string. Treat the browser credential as sensitive even though Fully Kiosk hides the URL. The registry disables shared-key tablet access entirely; do not activate it before all tablets are provisioned. It binds requests to a chamber and seat, supports revocation by removing the entry, and does not establish the identity of the person sitting there. Validate with two synthetic seats before production rollout.

## Database and public files

PostgreSQL TLS validates the certificate chain and hostname. `PGSSLROOTCERT_PEM` can contain an approved PEM CA chain if required. Azure rejects explicit TLS-disable mode. Connection-string SSL overrides are removed before connection creation. Do not restore certificate bypasses to solve an outage; verify the hostname and approved CA instead.

Only the files in `PUBLIC_FILES` are served. Server source, package manifests, tests, repository metadata and setup-generator are not public routes. Run the generator locally through an approved IT workflow. Patient APIs are no-store. CORS defaults to the current origin; add only verified origins using `KIOSK_ALLOWED_ORIGINS` if a separate frontend is necessary. API URL overrides in tablet links are ignored to prevent key exfiltration.

## Data and monitoring

Future appointment identities are not returned to tablets. Current names and appointment metadata remain ePHI. Guest chat is held only in process memory and is cleared at dive transitions, expiry, staff pause or restart. Cross-seat shared-key impersonation remains a material risk until device provisioning is completed. Roster and chat disclosure to other patients requires an approved privacy basis.

Expired help requests and announcements are removed from the active state file by reads and a one-minute cleanup timer while the process runs. Backups and prior file versions require separate retention controls. The timer cannot erase files while the app is stopped. No guarantee of secure overwrite is made.

Structured `kiosk_security` events include UTC time, staff object ID when available, method, route template and HTTP result. They exclude request bodies, patient names, keys and query strings. Route names can be unmatched when Express has unwound its router. Configure restricted centralized collection, retention and alerts; stdout alone is not a durable audit program. Keep infrastructure request logging from retaining credential-bearing URLs.

## Release acceptance

Use synthetic data to test an assigned staff member, unassigned staff member, anonymous requests, the former shared key, a guest tablet, help acknowledgement, announcement delivery, seat move, next dive, loss of Wi-Fi and restart. Never send live test announcements to occupied chambers. Check browser-rendered versions against the deployed server version. Preserve the test output, commit, deployment run, configuration screenshots without secrets, approval and rollback reference in restricted security evidence.

## Renew Microsoft sign-in before March 30 2027

The current App Service-generated secret expires March 30, 2027 (verified in Entra on October 1, 2026). A one-time reminder is scheduled for March 28, 2027 at 9 AM Eastern. Expiration can prevent new staff sign-ins; renew early enough to test. This credential is separate from tablet access keys and staff Microsoft passwords.

1. Sign into Azure using an authorized administrator account. Open Microsoft Entra ID > App registrations > All applications > **OxyPeak Tablet Staff Dashboard**. Confirm application ID `8389cb73-ddad-44cc-ab65-be188ac56b0b`.
2. Open Certificates & secrets > Client secrets > New client secret. Give it a dated description, select the approved lifetime, and create it. Keep the existing unexpired secret during the change.
3. Copy the new **Value**, not the Secret ID, directly into the approved password manager. The full value is shown only once. Never put it in this document, chat, email, screenshots, source code or an IT ticket.
4. Open App Services > **oxypeak-to-tablets** > Authentication > Microsoft > Edit. Verify the client secret setting name is **MICROSOFT_PROVIDER_AUTHENTICATION_SECRET**. Do not change the tenant, application ID or guest authentication policy.
5. Open Environment variables > App settings, edit **MICROSOFT_PROVIDER_AUTHENTICATION_SECRET**, enter the new Value and apply/save both the edit panel and settings page. Plan for an app restart and perform this during an approved quiet period.
6. In a fresh private browser session, open `/staff.html` and sign in with an assigned Tablet Dashboard group member. Confirm the dashboard loads, and confirm a guest tablet still opens without Microsoft sign-in. Do not rely on an already-open staff session as proof of renewal.
7. If the test fails, check that the Value belongs to this exact app registration and was saved to the exact setting. While the previous secret is still valid, restore its securely stored value if necessary. Do not disable authentication as a workaround.
8. After successful verification, remove the old secret, record the replacement expiration date and change evidence, and create a new reminder two days before that date. The March 2027 reminder does not automatically track future credentials.
