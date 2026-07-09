# Service Accounts — API Endpoint Specification

## Overview

Service accounts are machine-to-machine credentials used for automated integrations (e.g., POS sync, inventory updates). They authenticate via OAuth 2.0 `client_credentials` grant and receive a PASETO v2.local token scoped to a profile's permissions.

---

## 1. Authentication

### Obtain a Token

```
POST /oauth2/token
Content-Type: application/json
```

**Request Body (JSON):**

| Field | Required | Description |
|---|---|---|
| `client_id` | Yes | The service account username |
| `client_secret` | Yes | The service account password |

**Example:**

```bash
curl -X POST https://api.example.com/oauth2/token \
  -H "Content-Type: application/json" \
  -d '{"client_id": "pos-sync", "client_secret": "S3cretP@ss!"}'
```

**Success Response (200):**

```json
{
  "status": "success",
  "data": {
    "access_token": "v2.local.eyJ...",
    "token_type": "Bearer",
    "expires_in": 43200,
    "scope": ""
  }
}
```

**Error Responses:**

| Status | Body |
|---|---|
| 401 | `{"status":"fail","data":{"error":"invalid_client","error_description":"Invalid client credentials."}}` |
| 401 | `{"status":"fail","data":{"error":"invalid_client","error_description":"Service account is inactive."}}` |
| 500 | `{"status":"fail","data":{"error":"server_error","error_description":"Service account authentication is not configured."}}` |

**Notes:**
- The token expires after `token_expiry_hours` configured on the service account (default: 12h).
- There is no refresh token for `client_credentials`; request a new token when the current one expires.
- The token embeds the service account's `profile_id` and is subject to that profile's RBAC permissions.

---

## 2. Using the Token

Include the token in the `Authorization` header for all protected requests:

```
Authorization: Bearer v2.local.eyJ...
```

---

## 3. Available Endpoints

These endpoints accept a service account PASETO token (obtained via `client_credentials`).

### List Products

```
GET /api/v1/sa/products
Authorization: Bearer <sa_token>
```

### List Bundles

```
GET /api/v1/sa/bundles
Authorization: Bearer <sa_token>
```

---

## 4. Token Lifecycle

| Action | Behavior |
|---|---|
| Obtain token | `POST /oauth2/token` with JSON `{"client_id": "...", "client_secret": "..."}`; token signed with dedicated SA PASETO key |
| Token expiry | Configurable per account (`token_expiry_hours`, default 12h) |
| Account deactivation | Existing tokens remain valid until expiry; new token requests are rejected |
| Credential rotation | Request new credentials from the administrator; previous token remains valid until expiry |

---

## 5. Error Codes

| Code | Meaning |
|---|---|
| `invalid_client` | Wrong username/password or account is inactive |
| `server_error` | SA authentication not configured on the server |

---

## 6. Security Considerations

- **Use short-lived tokens** when possible; rotate service accounts periodically.
- **Scope permissions tightly** via the assigned profile; avoid granting `view:branch:all` unless necessary.
- **Store credentials securely**; do not expose `client_secret` in logs or client-side code.
