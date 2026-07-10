# LCDPC API — Endpoint Documentation

Base URL: `http://localhost:8080`
Response format: **JSend** (`{"status": "success|fail|error", "data": {}, "message": ""}`)

---

## 1. Health & Discovery

### `GET /`
Ping básico.
```json
{"service": "LCDPC.API", "status": "ok"}
```

### `GET /health`
Readiness probe. 200 = ok, 503 = db unreachable.
```
ok
```

### `GET /api/health`
Health check con DB ping.
```json
{"status": "success", "data": {"service": "LCDPC.API", "status": "ok"}}
```

### `GET /.well-known/openid-configuration`
Discovery document OAuth2/OpenID.
```json
{
  "issuer": "http://localhost:8080",
  "authorization_endpoint": "http://localhost:8080/oauth2/authorize",
  "token_endpoint": "http://localhost:8080/oauth2/token",
  "introspection_endpoint": "http://localhost:8080/oauth2/introspect",
  "revocation_endpoint": "http://localhost:8080/oauth2/revoke",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "subject_types_supported": ["public"]
}
```

---

## 2. OAuth2 Server

### `GET /oauth2/authorize`
Authorization Code + PKCE (S256).

**Query params:**
| Param | Required | Description |
|-------|----------|-------------|
| `client_id` | Yes | Registered OAuth2 client ID |
| `redirect_uri` | Yes | Registered client redirect URI |
| `response_type` | Yes | Only `code` |
| `scope` | No | Space-separated scopes |
| `state` | Recommended | CSRF protection |
| `code_challenge` | If PKCE required | SHA256(code_verifier) in base64url |
| `code_challenge_method` | If PKCE required | Only `S256` |

**Auth:** Cookie `lcdpc_at` or `Authorization: Bearer <token>` (logged-in user).

**Success:** Redirect 302 to `{redirect_uri}?code={code}&state={state}`

**Error:** Redirect 302 to `{redirect_uri}?error={code}&error_description={msg}`

**Possible errors:** `invalid_client`, `invalid_redirect_uri`, `unsupported_response_type`, `invalid_scope`, `invalid_request`, `login_required`

---

### `POST /oauth2/token`
Exchange authorization code for tokens, or refresh a refresh token.

**Content-Type:** `application/x-www-form-urlencoded`

#### Grant type: `authorization_code`
```
grant_type=authorization_code
&client_id=lcdpc-web
&code={authorization_code}
&redirect_uri={redirect_uri}
&code_verifier={random_string}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "access_token": "v2.local...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "refresh_token": "opaque-token",
    "scope": "openid email profile"
  }
}
```

#### Grant type: `refresh_token`
```
grant_type=refresh_token
&client_id=lcdpc-web
&refresh_token={refresh_token}
```

**Response:** Same as `authorization_code`.

**Possible errors:** `invalid_client`, `invalid_grant`, `unsupported_grant_type`, `invalid_request`, `server_error`

---

### `POST /oauth2/introspect`
RFC 7662. Validate a token (access or refresh).

**Content-Type:** `application/x-www-form-urlencoded`

```
token={access_token_or_refresh_token}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "active": true,
    "client_id": "lcdpc-web",
    "username": "user@example.com",
    "scope": "openid email profile",
    "exp": 1750000000,
    "iat": 1749996400,
    "sub": "user-uuid"
  }
}
```

If token is invalid or expired: `{"active": false}`

---

### `POST /oauth2/revoke`
RFC 7009. Revoke a refresh token and its entire family.

**Content-Type:** `application/x-www-form-urlencoded`

```
token={refresh_token}
```

**Response:** Always 200 (even if token doesn't exist).
```json
{"status": "success", "data": {}}
```

---

## 3. Auth (`/api/v1/auth`)

### `POST /api/v1/auth/register/start`
Start registration. Sends OTP to email.

**Request:**
```json
{"email": "user@example.com"}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "flow_id": "uuid",
    "status": "pending_email_verification",
    "otp_policy": {
      "ttl_minutes": 10,
      "max_attempts": 5,
      "cooldown_minutes": 10
    }
  }
}
```

**Errors:** `EMAIL_ALREADY_REGISTERED`, `OTP_COOLDOWN_ACTIVE`

---

### `POST /api/v1/auth/register/verify-email`
Verify OTP received by email.

**Request:**
```json
{
  "flow_id": "flow-uuid",
  "otp": "123456"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "flow_id": "uuid",
    "status": "pending_profile"
  }
}
```

**Errors:** `FLOW_NOT_FOUND`, `FLOW_INVALID_STATUS`, `OTP_EXPIRED`, `OTP_INVALID`, `OTP_ATTEMPTS_EXCEEDED`

---

### `POST /api/v1/auth/register/complete`
Complete registration. Creates user and profile, assigns `client` role.

**Request:**
```json
{
  "flow_id": "flow-uuid",
  "first_name": "Juan",
  "last_name": "Pérez",
  "identity_document": "V-12345678",
  "tax_id": "J-12345678-9",
  "whatsapp_phone": "+584141234567",
  "full_address": "Calle 1, Edif 2, Apt 3",
  "password": "MiPassword123!"
}
```

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "user_id": "uuid",
    "status": "active",
    "account_type": "client"
  }
}
```

**Errors:** `FLOW_NOT_FOUND`, `FLOW_INVALID_STATUS`, `EMAIL_ALREADY_REGISTERED`

---

### `POST /api/v1/auth/login`
Login with email/password. Generates PASETO access token + refresh token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "MiPassword123!"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "access_token": "v2.local...",
    "refresh_token": "opaque-token",
    "expires_in": 3600
  }
}
```

**Cookies set:**
- `lcdpc_at` — PASETO access token (HttpOnly, Lax)
- `lcdpc_rt` — Refresh token (HttpOnly, Strict)

**Errors:** `INVALID_CREDENTIALS`, `ACCOUNT_INACTIVE`

---

### `GET /api/v1/auth/me`
Get current authenticated user.

**Auth:** Required (Bearer token or cookie `lcdpc_at`)

**Response:**
```json
{
  "status": "success",
  "data": {
    "authenticated": true,
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "display_name": "Juan Pérez",
      "status": "active",
      "account_type": "client",
      "onboarding_status": "active",
      "email_verified_at": "2025-06-25T10:00:00Z",
      "profile_id": "uuid"
    },
    "permissions": ["product:view", "bundle:view"],
    "expires_in": 3542
  }
}
```

If not authenticated: `{"authenticated": false, "user": null, "permissions": []}`

---

### `POST /api/v1/auth/refresh`
Renew access token using refresh token.

**Auth:** Required (Bearer token or cookie)

**Request (optional, can use cookie):**
```json
{"refresh_token": "opaque-token"}
```

**Response:** Same as login.
**Errors:** `INVALID_REFRESH_TOKEN`

---

### `POST /api/v1/auth/logout`
Revoke current session.

**Auth:** Required

**Response:**
```json
{"status": "success", "data": {"status": "logged_out"}}
```

Clears `lcdpc_at` and `lcdpc_rt` cookies.

---

### `POST /api/v1/auth/forgot-password`
Generate password reset token.

**Request:**
```json
{"email": "user@example.com"}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "status": "accepted",
    "message": "if the account exists, a reset instruction has been generated"
  }
}
```

Always returns 200 (doesn't reveal if email exists).

---

### `POST /api/v1/auth/reset-password`
Reset password with token received by email.

**Request:**
```json
{
  "token": "opaque-reset-token",
  "new_password": "NewPassword456!"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "status": "completed",
    "sessions_revoked": true
  }
}
```

**Errors:** `INVALID_OR_EXPIRED_RESET_TOKEN`

---

### `GET /api/v1/auth/security-policy`
Get security policy (public).

**Response:**
```json
{
  "status": "success",
  "data": {
    "password_reset_ttl_minutes": 30,
    "revoke_sessions_on_password_reset": true
  }
}
```

---

### `PUT /api/v1/auth/security-policy`
Update security policy.

**Auth:** Requires `security-policy:update` permission

**Request:**
```json
{
  "password_reset_ttl_minutes": 60,
  "revoke_sessions_on_password_reset": true
}
```

**Errors:** `INVALID_RESET_TTL` (range: 5-1440 minutes)

---

## 4. Products (`/api/v1/products`)

### `GET /api/v1/products`
List all products with pagination. **Public.**

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `limit` | int | Max items (default 10, max 100) |
| `offset` | int | Skip items |
| `category_id` | UUID | Filter by category |
| `name` | string | Filter by name (partial match) |
| `sku` | string | Filter by SKU |
| `is_active` | bool | Filter by active status |

**Response:**
```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "product_id": "uuid",
        "name": "Coca-Cola 2L",
        "sku": "CC-2L",
        "base_measure_type": "unit",
        "wholesale_type": "case",
        "units_per_case": 6,
        "units_per_bundle": 24,
        "is_active": true,
        "img": "product-uuid.webp",
        "category_id": "uuid"
      }
    ],
    "total_count": 42,
    "limit": 10,
    "offset": 0
  }
}
```

---

### `GET /api/v1/products/{id}`
Get a product by ID. **Public.**

**Response:** Single product object.

---

### `POST /api/v1/products`
Create a product.

**Auth:** Requires `product:create`

**Request (multipart/form-data):**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Product name |
| `sku` | string | Yes | Unique SKU |
| `base_measure_type` | string | Yes | `unit` or `weight` |
| `wholesale_type` | string | Yes | `case`, `bundle`, `piece` |
| `units_per_case` | int | If unit | Units per case |
| `units_per_bundle` | int | If unit | Units per bundle |
| `category_id` | UUID | No | Category FK |
| `file` | file | No | Product image |

**Response (201):** Product object.

---

### `PUT /api/v1/products/{id}`
Update a product.

**Auth:** Requires `product:update`

**Request:** Same as create (multipart/form-data).

---

### `PUT /api/v1/products/{id}/image`
Update only the product image.

**Auth:** Requires `product:update`

**Request (multipart/form-data):**
| Field | Type | Required |
|-------|------|----------|
| `file` | file | Yes |

**Response:** `{"status": "success", "data": {"img": "filename.webp"}}`

---

### `DELETE /api/v1/products/{id}`
Delete a product.

**Auth:** Requires `product:delete`

**Response:** `{"status": "success", "data": {"status": "deleted"}}`

---

## 5. Bundles (`/api/v1/bundles`)

### `GET /api/v1/bundles`
List all bundles with pagination. **Public.**

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `limit` | int | Max items (default 10, max 100) |
| `offset` | int | Skip items |
| `category_id` | UUID | Filter by category |
| `name` | string | Filter by name |
| `code` | string | Filter by code |
| `status` | string | Filter by status (`Draft`, `Published`, `Paused`) |
| `is_active` | bool | Filter by active status |

**Response:**
```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "bundle_id": "uuid",
        "code": "COMBO-001",
        "name": "Family Combo",
        "status": "Published",
        "branch_ids_enabled": ["uuid1", "uuid2"],
        "total_price": 25.99,
        "total_price_currency": "USD",
        "promotional_price": 19.99,
        "promotional_price_currency": "USD",
        "img": "bundle-uuid.webp",
        "category_id": "uuid",
        "items": [
          {
            "id": "uuid",
            "bundle_id": "uuid",
            "product_id": "uuid-product",
            "quantity": 2
          }
        ]
      }
    ],
    "total_count": 15,
    "limit": 10,
    "offset": 0
  }
}
```

---

### `GET /api/v1/bundles/{id}`
Get a bundle by ID with its items. **Public.**

---

### `POST /api/v1/bundles`
Create a bundle with items.

**Auth:** Requires `bundle:create`

**Request (multipart/form-data):**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | Unique code |
| `name` | string | Yes | Bundle name |
| `status` | string | No | Default: `Draft` |
| `branch_ids_enabled` | JSON array | No | Branch UUIDs |
| `total_price` | decimal | No | Default: 0 |
| `total_price_currency` | string | No | Default: `USD` |
| `promotional_price` | decimal | No | Promotional price |
| `promotional_price_currency` | string | No | Currency |
| `category_id` | UUID | No | Category FK |
| `items` | JSON array | No | `[{product_id, quantity}]` |
| `file` | file | No | Bundle image |

Initial status: `Draft`.

---

### `PUT /api/v1/bundles/{id}`
Update a bundle. Replaces items if provided.

**Auth:** Requires `bundle:update`

**Request:** Same as create (multipart/form-data).

---

### `PUT /api/v1/bundles/{id}/image`
Update only the bundle image.

**Auth:** Requires `bundle:update`

**Request (multipart/form-data):**
| Field | Type | Required |
|-------|------|----------|
| `file` | file | Yes |

---

### `POST /api/v1/bundles/{id}/publish`
Change status to `Published`.

**Auth:** Requires `bundle:create`

**Response:** `{"status": "success", "data": {"status": "Published"}}`

---

### `POST /api/v1/bundles/{id}/pause`
Change status to `Paused`.

**Auth:** Requires `bundle:create`

**Response:** `{"status": "success", "data": {"status": "Paused"}}`

---

### `DELETE /api/v1/bundles/{id}`
Delete a bundle.

**Auth:** Requires `bundle:delete`

---

## 6. Prices (`/api/v1/prices`)

### `GET /api/v1/prices/{id}`
Get a price by ID. **Public.**

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "product_id": "uuid",
    "branch_id": "uuid",
    "price1_unit": 1.50,
    "price1_currency": "USD",
    "price2_case_bundle_piece": 1.20,
    "price2_currency": "USD",
    "price3_wholesale_from2": 1.00,
    "price3_currency": "USD",
    "price4_wholesale": 0.85,
    "price4_currency": "USD",
    "price4_requires_agreement": false,
    "valid_from": "2025-06-01T00:00:00Z",
    "valid_until": "2025-12-31T00:00:00Z"
  }
}
```

**Price levels:**
1. `price1_unit` — Unit retail price
2. `price2_case_bundle_piece` — Per case/bundle/piece
3. `price3_wholesale_from2` — Wholesale from 2 units
4. `price4_wholesale` — Bulk wholesale (optional, may require agreement)

---

### `GET /api/v1/prices/product/{id}`
List prices for a product (all branches). **Public.**

---

### `GET /api/v1/prices/branch/{id}`
List prices for a branch (all products). **Public.**

---

### `POST /api/v1/prices`
Create a product-branch price.

**Auth:** Requires `price:create`

**Request:**
```json
{
  "product_id": "uuid",
  "branch_id": "uuid",
  "price1_unit": 1.50,
  "price2_case_bundle_piece": 1.20,
  "price3_wholesale_from2": 1.00,
  "price4_wholesale": 0.85,
  "price4_requires_agreement": false,
  "valid_from": "2025-06-01T00:00:00Z",
  "valid_until": "2025-12-31T00:00:00Z"
}
```

---

### `PUT /api/v1/prices/{id}`
Update a price.

**Auth:** Requires `price:create`

---

### `DELETE /api/v1/prices/{id}`
Delete a price.

**Auth:** Requires `price:delete`

---

## 7. Branches (`/api/v1/branches`)

### `GET /api/v1/branches`
List all branches. **Public.**

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "store_name": "LCDPC Centro",
      "rif": "J-12345678-9",
      "address": "Av. Principal, Local 5",
      "contact_phone": "+582121234567",
      "secondary_contact_phone": null,
      "business_hours": "Mon-Fri 8am-6pm, Sat 8am-12pm",
      "created_at_utc": "2025-06-01T00:00:00Z",
      "updated_at_utc": "2025-06-01T00:00:00Z"
    }
  ]
}
```

---

### `POST /api/v1/branches`
Create a branch.

**Auth:** Requires `branch:create`

**Request:**
```json
{
  "store_name": "LCDPC Centro",
  "rif": "J-12345678-9",
  "address": "Av. Principal, Local 5",
  "contact_phone": "+582121234567",
  "secondary_contact_phone": "+584141234567",
  "business_hours": "Mon-Fri 8am-6pm, Sat 8am-12pm"
}
```

---

## 8. Categories (`/api/v1/categories`)

### `GET /api/v1/categories`
List all categories. **Public.**

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "category_id": "uuid",
      "name": "Combos",
      "slug": "combos",
      "sort_order": 1,
      "is_active": true,
      "created_at_utc": "2025-06-01T00:00:00Z",
      "updated_at_utc": "2025-06-01T00:00:00Z"
    }
  ]
}
```

---

### `GET /api/v1/categories/{id}`
Get a category by ID. **Public.**

---

### `POST /api/v1/categories`
Create a category.

**Auth:** Requires `category:create`

**Request:**
```json
{
  "name": "Salsas",
  "slug": "salsas",
  "sort_order": 5,
  "is_active": true
}
```

---

### `PUT /api/v1/categories/{id}`
Update a category.

**Auth:** Requires `category:update`

---

### `DELETE /api/v1/categories/{id}`
Delete a category.

**Auth:** Requires `category:delete`

---

## 9. Staff (`/api/v1/staff`)

### `GET /api/v1/staff`
List staff members with pagination. **Public.**

**Query params:** `limit`, `offset`

**Response:**
```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "id": "uuid",
        "email": "staff@example.com",
        "name": "Juan Pérez",
        "identity_document": "V-12345678",
        "whatsapp_phone": "+584141234567",
        "full_address": "Calle 1",
        "branch_id": "uuid",
        "status": "Active",
        "onboarding_status": "active",
        "role_code": "staff",
        "created_at_utc": "2025-06-01T00:00:00Z"
      }
    ],
    "total_count": 5,
    "limit": 10,
    "offset": 0
  }
}
```

---

### `GET /api/v1/staff/{id}`
Get a staff member by ID. **Public.**

---

### `POST /api/v1/staff`
Create a staff member.

**Auth:** Requires `staff:create`

**Request:**
```json
{
  "email": "staff@example.com",
  "password": "TempPassword123!",
  "first_name": "Juan",
  "last_name": "Pérez",
  "identity_document": "V-12345678",
  "whatsapp_phone": "+584141234567",
  "full_address": "Calle 1",
  "branch_id": "uuid",
  "role_code": "staff"
}
```

`role_code` can be `staff` or `manager`.

---

### `PUT /api/v1/staff/{id}`
Update a staff member.

**Auth:** Requires `staff:update`

---

### `DELETE /api/v1/staff/{id}`
Delete a staff member.

**Auth:** Requires `staff:delete`

---

## 10. RBAC (`/api/v1/rbac`)

### Resources

#### `GET /api/v1/rbac/resources`
List all resources.

**Auth:** Requires `rbac:resource:view`

**Response:**
```json
{
  "status": "success",
  "data": [
    {"id": "uuid", "code": "product:create"},
    {"id": "uuid", "code": "product:view"}
  ]
}
```

#### `GET /api/v1/rbac/resources/{id}`
Get a resource by ID.

**Auth:** Requires `rbac:resource:view`

#### `POST /api/v1/rbac/resources`
Create a resource.

**Auth:** Requires `rbac:resource:create`

**Request:**
```json
{"code": "product:create"}
```

#### `PUT /api/v1/rbac/resources/{id}`
Update a resource.

**Auth:** Requires `rbac:resource:update`

#### `DELETE /api/v1/rbac/resources/{id}`
Delete a resource.

**Auth:** Requires `rbac:resource:delete`

---

### Roles

#### `GET /api/v1/rbac/roles`
List all roles with assigned resources.

**Auth:** Requires `rbac:role:view`

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "code": "global_admin",
      "name": "global_admin",
      "description": "Administrator with global scope",
      "resources": [
        {"id": "uuid", "code": "product:create"},
        {"id": "uuid", "code": "product:view"}
      ]
    }
  ]
}
```

#### `GET /api/v1/rbac/roles/{id}`
Get a role by ID with its resources.

**Auth:** Requires `rbac:role:view`

#### `POST /api/v1/rbac/roles`
Create a role.

**Auth:** Requires `rbac:role:create`

**Request:**
```json
{
  "code": "branch_admin",
  "name": "Branch Administrator",
  "description": "Administrator with branch scope"
}
```

#### `PUT /api/v1/rbac/roles/{id}`
Update role code, name, description.

**Auth:** Requires `rbac:role:update`

#### `DELETE /api/v1/rbac/roles/{id}`
Delete a role.

**Auth:** Requires `rbac:role:delete`

#### `POST /api/v1/rbac/roles/{id}/resources`
Assign 1 resource to the role.

**Auth:** Requires `rbac:role:update`

**Request:**
```json
{"resource_id": "uuid"}
```

#### `DELETE /api/v1/rbac/roles/{id}/resources/{resourceId}`
Remove 1 resource from the role.

**Auth:** Requires `rbac:role:update`

---

### Profiles

#### `GET /api/v1/rbac/profiles`
List all profiles with assigned roles.

**Auth:** Requires `rbac:profile:view`

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "name": "Juan Pérez",
      "code": "V-12345678",
      "roles": [
        {"id": "uuid", "code": "client", "name": "client"}
      ],
      "created_at_utc": "2025-06-01T00:00:00Z",
      "updated_at_utc": "2025-06-01T00:00:00Z"
    }
  ]
}
```

#### `GET /api/v1/rbac/profiles/{id}`
Get a profile by ID with its roles.

**Auth:** Requires `rbac:profile:view`

#### `POST /api/v1/rbac/profiles`
Create a profile.

**Auth:** Requires `rbac:profile:create`

**Request:**
```json
{
  "name": "Juan Pérez",
  "code": "V-12345678"
}
```

#### `PUT /api/v1/rbac/profiles/{id}`
Update profile data.

**Auth:** Requires `rbac:profile:update`

#### `DELETE /api/v1/rbac/profiles/{id}`
Delete a profile.

**Auth:** Requires `rbac:profile:delete`

#### `POST /api/v1/rbac/profiles/{id}/roles`
Assign 1 role to the profile.

**Auth:** Requires `rbac:profile:update`

**Request:**
```json
{"role_id": "uuid"}
```

#### `DELETE /api/v1/rbac/profiles/{id}/roles/{roleId}`
Remove 1 role from the profile.

**Auth:** Requires `rbac:profile:update`

---

### Users

#### `PUT /api/v1/users/{id}/profile`
Assign or change a user's profile.

**Auth:** Requires `rbac:user:update`

**Request:**
```json
{"profile_id": "uuid"}
```

---

## 11. Orders (`/api/v1/orders`)

### `POST /api/v1/orders`
Create an order with items.

**Auth:** Requires `order:create`

**Request:**
```json
{
  "branch_id": "uuid",
  "client_user_id": "uuid",
  "notes": "Urgent delivery",
  "items": [
    {
      "item_type": "product",
      "product_id": "uuid",
      "quantity": 5,
      "unit_price": 1.50
    },
    {
      "item_type": "bundle",
      "bundle_id": "uuid",
      "quantity": 2,
      "unit_price": 25.99
    }
  ]
}
```

**Validations:**
- Must have at least 1 item
- `item_type` must be `product` or `bundle`
- If `item_type` = `product`: `product_id` required, `bundle_id` must be null
- If `item_type` = `bundle`: `bundle_id` required, `product_id` must be null

**Response (201):** Complete order with items and calculated price_total.

---

### `GET /api/v1/orders`
List orders with optional filters.

**Auth:** Requires `order:view`

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `branch_id` | UUID | Filter by branch |
| `client_user_id` | UUID | Filter by client |
| `status` | string | Filter by status |

---

### `GET /api/v1/orders/{id}`
Get an order by ID with its items.

**Auth:** Requires `order:view`

---

### `PUT /api/v1/orders/{id}`
Update an order (only if in editable state: `PENDING_REVIEW` or `UNDER_REVIEW`).

**Auth:** Requires `order:update`

**Request:**
```json
{
  "notes": "Updated note",
  "items": [
    {"item_type": "product", "product_id": "uuid", "quantity": 10, "unit_price": 1.50}
  ]
}
```

If `items` is provided, all existing items are replaced and totals recalculated.

**Errors:** `ORDER_NOT_EDITABLE`, `ORDER_NOT_FOUND`

---

### `DELETE /api/v1/orders/{id}`
Cancel an order (changes status to `CANCELLED_BY_CUSTOMER`).

**Auth:** Requires `order:delete`

**Errors:** `ORDER_IN_TERMINAL_STATUS`, `ORDER_NOT_FOUND`

---

### `POST /api/v1/orders/{id}/status`
Change order status.

**Auth:** Requires `order:status:change`

**Request:**
```json
{
  "to_status": "UNDER_REVIEW",
  "notes": "Checking availability"
}
```

**Valid transitions:**
| From | To |
|------|-----|
| `PENDING_REVIEW` | `UNDER_REVIEW`, `REJECTED_BY_VALIDATION`, `CANCELLED_BY_CUSTOMER` |
| `UNDER_REVIEW` | `APPROVED_FOR_FULFILLMENT`, `REJECTED_BY_VALIDATION`, `CANCELLED_BY_CUSTOMER` |
| `APPROVED_FOR_FULFILLMENT` | `IN_PREPARATION`, `CANCELLED_BY_CUSTOMER` |
| `IN_PREPARATION` | `AWAITING_INVENTORY`, `PREPARATION_COMPLETED`, `CANCELLED_BY_CUSTOMER` |
| `AWAITING_INVENTORY` | `IN_PREPARATION`, `CANCELLED_BY_CUSTOMER` |
| `PREPARATION_COMPLETED` | `READY_FOR_PICKUP`, `READY_FOR_DISPATCH` |
| `READY_FOR_PICKUP` | `PICKED_UP`, `DELIVERY_FAILED` |
| `READY_FOR_DISPATCH` | `IN_TRANSIT`, `DELIVERY_FAILED` |
| `IN_TRANSIT` | `DELIVERED`, `DELIVERY_FAILED` |
| `DELIVERED` | `COMPLETED` |
| `PICKED_UP` | `COMPLETED` |

**Errors:** `INVALID_TRANSITION`, `ORDER_NOT_FOUND`

---

### `GET /api/v1/orders/{id}/history`
Get order status change history.

**Auth:** Requires `order:view`

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "order_id": "uuid",
      "from_status": null,
      "to_status": "PENDING_REVIEW",
      "changed_by_user_id": "uuid",
      "notes": null,
      "created_at_utc": "2026-06-27T12:00:00Z"
    }
  ]
}
```

---

## 12. Sync (`/api/v1/sync`)

### `POST /api/v1/sync/products`
Bulk upsert products by `(sku, branch_id)`.

**Auth:** API Key in `X-API-Token` header

**Request:**
```json
[
  {
    "name": "Coca-Cola 2L",
    "code": "CC-2L",
    "is_active": true,
    "brand_code": "COCA-COLA",
    "category_code": "bebidas",
    "branch_code": "CAR-001",
    "base_unit_code": "unit",
    "stock": 100,
    "prices": [
      { "code": "retail", "amount": 2.50 },
      { "code": "wholesale", "amount": 2.00 }
    ]
  }
]
```

**Response:**
```json
{"status": "success", "data": {"processed": 10, "errors": 0, "details": []}}
```

All `_code` fields are resolved to UUIDs. If a code is not found, the item is recorded in `details` as an error.

---

### `POST /api/v1/sync/bundles`
Bulk upsert bundles by `(code, branch_id)` with items, prices, and chain stock.

**Auth:** API Key in `X-API-Token` header

**Request:**
```json
[
  {
    "code": "COMBO-001",
    "name": "Family Combo",
    "is_active": true,
    "branch_code": "CAR-001",
    "category_code": "combos",
    "items": [
      { "product_code": "CC-2L", "quantity": 2 },
      { "product_code": "PAN-001", "quantity": 4 }
    ],
    "prices": [
      { "code": "retail", "amount": 25.99 }
    ],
    "stock": 50,
    "blocks_product_stock": true
  }
]
```

**Response:**
```json
{"status": "success", "data": {"processed": 5, "errors": 0, "details": []}}
```

Items resolve `product_code` to `product_id` via product lookup by sku + branch. Prices resolve `code` to `price_category_id`.

---

### `POST /api/v1/sync/products/{sku}/image`
Upload/update image for a product by SKU.

**Auth:** API Key in `X-API-Token` header

**Request (multipart/form-data):**
| Field | Type | Required |
|-------|------|----------|
| `file` | file | Yes |

---

### `POST /api/v1/sync/bundles/{code}/image`
Upload/update image for a bundle by code.

**Auth:** API Key in `X-API-Token` header

**Request (multipart/form-data):**
| Field | Type | Required |
|-------|------|----------|
| `file` | file | Yes |

---

## 13. Auth Patterns Summary

### Bearer Token (preferred)
```
Authorization: Bearer v2.local...
```

### Cookies (legacy fallback)
- `lcdpc_at` — Access token (HttpOnly, Lax, MaxAge = expires_in)
- `lcdpc_rt` — Refresh token (HttpOnly, Strict, MaxAge = 30 days)

### API Key (sync only)
```
X-API-Token: {api-key-from-seed}
```

### Roles
| Role | Permissions |
|------|-------------|
| `global_admin` | All resources |
| `branch_admin` | CRUD products, bundles, prices, branches, orders. No RBAC, no security-policy |
| `manager` | Staff + product/bundle/price/order CRUD |
| `staff` | View products/bundles/prices/branches/orders + create orders |
| `client` | Read-only: `product:view`, `bundle:view`, `price:view`, `branch:view`, `order:create`, `order:view` |

---

## 14. Error Format (JSend)

### `fail` (4xx — client error)
```json
{
  "status": "fail",
  "data": {"email": "invalid"}
}
```

### `error` (4xx/5xx — server error)
```json
{
  "status": "error",
  "message": "INVALID_CREDENTIALS"
}
```

### Common error codes
| HTTP | Internal code | Meaning |
|------|--------------|---------|
| 400 | `INVALID_CREDENTIALS` | Wrong email or password |
| 400 | `EMAIL_ALREADY_REGISTERED` | Email already registered |
| 400 | `OTP_EXPIRED` | OTP expired |
| 400 | `OTP_ATTEMPTS_EXCEEDED` | Too many OTP attempts |
| 400 | `OTP_INVALID` | Wrong OTP |
| 400 | `FLOW_NOT_FOUND` | Registration flow not found |
| 400 | `INVALID_REFRESH_TOKEN` | Invalid/expired refresh token |
| 400 | `INVALID_OR_EXPIRED_RESET_TOKEN` | Invalid reset token |
| 400 | `ORDER_NOT_FOUND` | Order not found |
| 400 | `ORDER_NOT_EDITABLE` | Order not in editable state |
| 400 | `ORDER_IN_TERMINAL_STATUS` | Order in terminal status |
| 400 | `INVALID_TRANSITION` | Invalid status transition |
| 401 | `unauthorized` | Token missing or invalid |
| 403 | `insufficient_permissions` | Insufficient role |
| 404 | `NOT_FOUND` | Resource not found |
