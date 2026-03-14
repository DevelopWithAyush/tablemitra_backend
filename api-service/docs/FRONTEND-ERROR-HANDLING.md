# Frontend Error Handling Guide — RFC 7807 / 9457 Standard

This document describes how the backend returns errors and how the frontend must handle them for a consistent, user-friendly experience. **Every API error response follows this structure.**

---

## Table of Contents

1. [Error Response Structure](#1-error-response-structure)
2. [Error Types Reference](#2-error-types-reference)
3. [Validation Errors: Field-Level Handling](#3-validation-errors-field-level-handling)
4. [Mapping Error Names to UI Fields](#4-mapping-error-names-to-ui-fields)
5. [Recommended Frontend Implementation](#5-recommended-frontend-implementation)
6. [UI / UX Guidelines](#6-ui--ux-guidelines)
7. [Complete Examples](#7-complete-examples)
8. [What Is Never Returned](#8-what-is-never-returned)

---

## 1. Error Response Structure

All error responses use this shape. **Check `success === false` first** on every API response.

### TypeScript Interface

```typescript
interface ApiErrorResponse {
  success: false;
  type: ApiErrorType;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: FieldError[];
}

interface FieldError {
  name: string;   // Field path, e.g. "body.shortCode"
  message: string; // User-facing message
}

type ApiErrorType =
  | "VALIDATION_ERROR"
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";
```

### Field Descriptions

| Field       | Type     | Always present? | Description |
|------------|----------|-----------------|-------------|
| `success`  | `false`  | Yes             | Indicates an error. Always `false` for error responses. |
| `type`     | `string` | Yes             | Machine-readable error category. Use for routing logic and i18n keys. |
| `title`    | `string` | Yes             | Short human-readable summary (e.g. "Validation Failed", "Not Found"). |
| `status`   | `number` | Yes             | HTTP status code (400, 401, 403, 404, 409, 500). |
| `detail`   | `string` | Sometimes       | Detailed explanation for this specific error. Use for toast/snackbar or main error text. |
| `instance` | `string` | Sometimes       | Request path (e.g. `/api/v1/frontdesk/menu/items/...`). Useful for logging or support. |
| `errors`   | `array`  | Only validation | Array of field-level errors. See [Section 3](#3-validation-errors-field-level-handling). |

---

## 2. Error Types Reference

| `type`            | Typical `status` | When it occurs | Suggested frontend action |
|-------------------|------------------|----------------|----------------------------|
| `VALIDATION_ERROR`| 400              | Request body/query/params fail validation | Show field errors, highlight invalid fields |
| `BAD_REQUEST`     | 400              | Generic bad request, invalid format, or invalid ID | Show `detail` in toast/alert |
| `UNAUTHORIZED`    | 401              | Token expired, invalid token, not logged in | Redirect to login, clear auth state |
| `FORBIDDEN`       | 403              | Authenticated but not allowed (e.g. wrong chain) | Show "access denied", maybe redirect |
| `NOT_FOUND`       | 404              | Resource does not exist | Show "not found" message, offer navigation |
| `CONFLICT`        | 409              | Duplicate value, e.g. unique constraint | Show `detail`, suggest fix (e.g. change email) |
| `INTERNAL_ERROR`  | 500              | Server error | Show generic message, log `instance` for support |

---

## 3. Validation Errors: Field-Level Handling

**Validation errors are the only responses that include the `errors` array.** This is the primary mechanism for per-field UI feedback.

### When `errors` is Present

- `type` is `"VALIDATION_ERROR"`
- `status` is `400`
- `errors` is an array of `{ name, message }`

### Structure of Each Entry in `errors`

```json
{
  "name": "body.shortCode",
  "message": "Short code is required"
}
```

- **`name`** — Dotted path to the field (see [Section 4](#4-mapping-error-names-to-ui-fields))
- **`message`** — User-facing message. **Use this for the label under the input or inline error.**

### Example Validation Response

```json
{
  "success": false,
  "type": "VALIDATION_ERROR",
  "title": "Validation Failed",
  "status": 400,
  "detail": "body.shortCode: Short code is required. body.preparationTimeMinutes: Too small: expected number to be >=1",
  "instance": "/api/v1/frontdesk/menu/items/69ade904133218728719848b",
  "errors": [
    {
      "name": "body.shortCode",
      "message": "Short code is required"
    },
    {
      "name": "body.preparationTimeMinutes",
      "message": "Too small: expected number to be >=1"
    }
  ]
}
```

### Using `errors` for UI

1. Build a map: `fieldPath → message` (e.g. `"body.shortCode" → "Short code is required"`).
2. Map each field path to the UI field name using the logic in [Section 4](#4-mapping-error-names-to-ui-fields).
3. Display `message` next to each invalid input.

---

## 4. Mapping Error Names to UI Fields

`errors[].name` uses dotted paths with a prefix indicating the source.

### Prefixes

| Prefix  | Source       | Example path        | UI mapping hint |
|---------|--------------|---------------------|-----------------|
| `body.` | Request body | `body.shortCode`    | Form field `shortCode` |
| `query.`| Query params | `query.page`        | Query param `page` |
| `params.`| URL params  | `params.itemId`     | URL param `itemId` |
| `headers.`| Headers   | `headers.authorization` | Header `authorization` |

### How to Get the UI Field Name

1. Strip the prefix (`body.`, `query.`, `params.`, `headers.`).
2. The rest is the field path: `shortCode`, `preparationTimeMinutes`, `variants.0.name`, etc.

### Nested and Array Fields

| `errors[].name`        | Meaning                | UI target                          |
|------------------------|------------------------|------------------------------------|
| `body.shortCode`       | Top-level body field   | Input for `shortCode`              |
| `body.variants.0.name` | First variant's name   | Input for `variants[0].name`       |
| `body.variants.1.price`| Second variant's price | Input for `variants[1].price`      |
| `body.availability.days` | Nested field      | Input for `availability.days`      |
| `query.page`           | Query param            | Pagination / page selector         |
| `params.id`            | URL param              | Resource identifier in URL         |

### Helper Function

```typescript
/**
 * Map API error name to form field name for binding.
 * "body.shortCode" -> "shortCode"
 * "body.variants.0.name" -> "variants.0.name"
 */
function errorNameToFieldName(name: string): string {
  const prefixes = ["body.", "query.", "params.", "headers."];
  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) {
      return name.slice(prefix.length);
    }
  }
  return name;
}
```

---

## 5. Recommended Frontend Implementation

### 5.1 Central Error Handler / Interceptor

```typescript
// axios / fetch interceptor example
async function handleApiError(response: Response): Promise<never> {
  const data = await response.json();
  
  if (data.success === false) {
    const error: ApiErrorResponse = data;
    
    // Route by type
    switch (error.type) {
      case "UNAUTHORIZED":
        // Clear token, redirect to login
        break;
      case "FORBIDDEN":
        // Show access denied
        break;
      case "VALIDATION_ERROR":
        // Return structured error for form binding
        throw new ValidationError(error);
      default:
        throw new ApiError(error);
    }
  }
  
  throw new Error("Unknown error");
}
```

### 5.2 Validation Error Class for Forms

```typescript
class ValidationError extends Error {
  constructor(public readonly response: ApiErrorResponse) {
    super(response.detail ?? response.title);
    this.name = "ValidationError";
  }

  /** Map of field path -> message for form binding */
  getFieldErrors(): Record<string, string> {
    const errors = this.response.errors ?? [];
    return Object.fromEntries(
      errors.map((e) => [errorNameToFieldName(e.name), e.message])
    );
  }

  /** Get message for a specific field (e.g. "shortCode") */
  getMessageForField(fieldName: string): string | undefined {
    const fieldErrors = this.getFieldErrors();
    return fieldErrors[fieldName];
  }
}
```

### 5.3 React Hook Example (React Hook Form)

```tsx
const onSubmit = async (data: FormData) => {
  try {
    await api.updateItem(id, data);
    toast.success("Saved");
  } catch (e) {
    if (e instanceof ValidationError) {
      const fieldErrors = e.getFieldErrors();
      Object.entries(fieldErrors).forEach(([field, message]) => {
        setError(field, { type: "server", message });
      });
    } else {
      toast.error(e.response?.detail ?? "Something went wrong");
    }
  }
};
```

### 5.4 Summary Toast for Validation

Use `detail` for a compact summary (e.g. toast):

```typescript
// "body.shortCode: Short code is required. body.preparationTimeMinutes: Too small..."
toast.error(response.detail);
```

Use `errors` for inline field errors.

---

## 6. UI / UX Guidelines

### Validation Errors

| Action | Do | Avoid |
|--------|-----|-------|
| Per-field message | Use `errors[].message` for each input | Generic "Validation failed" only |
| Highlighting | Focus / scroll to first invalid field | Showing all errors without focus |
| Summary | Optional toast with `detail` | Long toast with every field |
| Accessibility | Associate error with input via `aria-describedby` | Errors without proper labels |

### Other Errors

| `type` | Suggested UX |
|--------|---------------|
| `UNAUTHORIZED` | Redirect to login, clear session |
| `FORBIDDEN` | Banner or modal: "You don't have access" |
| `NOT_FOUND` | Empty state: "Not found" + link back |
| `CONFLICT` | Inline or toast with `detail`, suggest correction |
| `BAD_REQUEST` | Toast with `detail` |
| `INTERNAL_ERROR` | Generic message, support contact if needed |

---

## 7. Complete Examples

### Example 1: Single Validation Error

**Response:**
```json
{
  "success": false,
  "type": "VALIDATION_ERROR",
  "title": "Validation Failed",
  "status": 400,
  "detail": "body.email: Invalid email format",
  "instance": "/api/v1/admin/company/admins",
  "errors": [
    { "name": "body.email", "message": "Invalid email format" }
  ]
}
```

**UI:** Show "Invalid email format" under the email input.

---

### Example 2: Multiple Validation Errors (Form)

**Response:**
```json
{
  "success": false,
  "type": "VALIDATION_ERROR",
  "title": "Validation Failed",
  "status": 400,
  "detail": "body.name: Name is required. body.shortCode: Short code is required. body.variants.0.price: Price must be positive",
  "instance": "/api/v1/frontdesk/menu/items",
  "errors": [
    { "name": "body.name", "message": "Name is required" },
    { "name": "body.shortCode", "message": "Short code is required" },
    { "name": "body.variants.0.price", "message": "Price must be positive" }
  ]
}
```

**UI:**
- `body.name` → "Name is required" under the name input
- `body.shortCode` → "Short code is required" under the short code input
- `body.variants.0.price` → "Price must be positive" under the first variant's price input

---

### Example 3: Non-Validation Error (404)

**Response:**
```json
{
  "success": false,
  "type": "NOT_FOUND",
  "title": "Not Found",
  "status": 404,
  "detail": "Hotel not found",
  "instance": "/api/v1/founder/hospitality/hotels/507f1f77bcf86cd799439011"
}
```

**UI:** Toast or banner: "Hotel not found", link back to list.

---

### Example 4: Auth Error (401)

**Response:**
```json
{
  "success": false,
  "type": "UNAUTHORIZED",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Token has expired",
  "instance": "/api/v1/sales/profile"
}
```

**UI:** Clear token, redirect to login, optionally toast: "Session expired. Please log in again."

---

### Example 5: Conflict (409)

**Response:**
```json
{
  "success": false,
  "type": "CONFLICT",
  "title": "Conflict",
  "status": 409,
  "detail": "Duplicate value for field: email. Value: john@example.com",
  "instance": "/api/v1/admin/company/admins"
}
```

**UI:** Toast or inline: "This email is already registered. Please use another."

---

## 8. What Is Never Returned

The API **does not** include:

- `stack` — Never sent (logged server-side only)
- `details` — Raw error objects are never sent
- Any non-standard fields beyond the structure above

If you see `stack` or `details`, the response is not from this implementation.

---

## Quick Reference: Response Check Flow

```
1. Parse JSON from response body.
2. If success === false → treat as error.
3. Check type:
   - VALIDATION_ERROR → use errors[] for field-level UI.
   - UNAUTHORIZED → auth flow (login redirect).
   - FORBIDDEN → access denied UI.
   - NOT_FOUND → "not found" UI.
   - CONFLICT → show detail, suggest fix.
   - BAD_REQUEST / INTERNAL_ERROR → show detail in toast/alert.
4. Use detail for summary messages.
5. Use errors[].name → field mapping, errors[].message → per-field message.
```

---

*Last updated: March 2025 | Backend: RFC 7807 / 9457 Problem Details*
