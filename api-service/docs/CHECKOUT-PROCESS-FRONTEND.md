# Checkout Process — Frontend Implementation Guide

Complete end-to-end documentation for implementing the checkout flow in the frontdesk application. Use this with Cursor or your frontend team to build the full checkout experience from Room View → Preview → Proceed → Print Bill, plus Checkout History.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Entry Points](#2-entry-points)
3. [API Reference](#3-api-reference)
4. [Flow 1: Active Room Checkout](#4-flow-1-active-room-checkout)
5. [Flow 2: Past Checkout (History)](#5-flow-2-past-checkout-history)
6. [Print Bill Flow](#6-print-bill-flow)
7. [TypeScript Types](#7-typescript-types)
8. [Error Handling](#8-error-handling)
9. [UI / UX Requirements](#9-ui--ux-requirements)
10. [State Management Hints](#10-state-management-hints)

---

## 1. Overview

The checkout system has **four APIs**:

| API | Purpose | When to Use |
|-----|---------|-------------|
| **GET /preview** | View orders, subtotal, adjustments | When opening a room's bill (active or past) |
| **POST /proceed** | Complete checkout (room checked out, orders paid) | When user confirms payment for an **active** room |
| **GET /bill-pdf** | Download/print PDF bill | After proceed succeeds OR when viewing a past checkout (uses `roomSessionId`) |
| **GET /history** | List past checkout sessions | When user needs to find an old bill (guest returns, reprint) |

**Important:** You must complete checkout (Proceed) before you can print a bill for an active room. The Print Bill API uses `roomSessionId` – the same identifier used for Preview and Proceed – and looks up the completed checkout. For past checkouts from History, each item includes `roomSessionId`; use it to call Print Bill.

---

## 2. Entry Points

### Where `roomSessionId` Comes From

1. **Room View (dashboard)** — When user clicks an **occupied** room card (e.g. R-101 with bill amount), that room has an active `roomSessionId`. The room list/QR API typically returns this when `roomStatus: "OCCUPIED"`.
2. **QR scan / room selection** — Same as above; the selected room provides `roomSessionId`.

### Single Identifier: `roomSessionId`

The entire checkout flow uses **roomSessionId** – preview, proceed, and print bill all use it. No need to track `checkoutSessionId` separately for printing.

### Base URL

All checkout APIs are under:
```
/api/v1/{app}/checkout/...
```
- `{app}` = panel context, e.g. `frontdesk`
- Example: `https://api.example.com/api/v1/frontdesk/checkout/preview?roomSessionId=...`

### Authentication

- All endpoints require **Bearer token** (JWT) in `Authorization` header.
- Permission: `CHECK_IN_GUEST` (frontdesk staff).
- History is scoped by hotel from JWT context (`ctx.type === "HOTEL"`, `ctx.id === hotelId`).

---

## 3. API Reference

### 3.1 GET /checkout/preview

**Purpose:** Load orders, subtotal, and bill details for a room (active or past checkout).

**Request:**
```
GET /api/v1/{app}/checkout/preview
```
**Query params (provide exactly one):**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `roomSessionId` | string (24-char hex) | One of these | From Room View / occupied room |
| `checkoutSessionId` | string (24-char hex) | One of these | From History (past checkout) |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "roomSessionId": "507f1f77bcf86cd799439011",
    "roomNumber": "R-101",
    "hotelId": "507f1f77bcf86cd799439020",
    "isAlreadyCheckout": false,
    "foodOrders": [
      {
        "_id": "...",
        "items": [
          { "itemName": "Burger", "variantName": "Large", "quantity": 2, "price": 199 }
        ],
        "bill": { "subtotal": 398, "toPay": 398 },
        "count": 1,
        "createdAt": "2026-03-09T10:30:00.000Z"
      }
    ],
    "serviceRequests": [
      {
        "_id": "...",
        "items": [
          { "itemName": "Room Service", "quantity": 1, "price": 50 }
        ],
        "totalAmount": 50,
        "bill": { "toPay": 50 },
        "createdAt": "2026-03-09T11:00:00.000Z"
      }
    ],
    "ordersSubtotal": 448,
    "guestDetails": [
      { "name": "John Doe", "phone": "+919876543210" }
    ],
    "adjustments": null,
    "finalAmount": null
  }
}
```

**When `isAlreadyCheckout: true` (past checkout):**
```json
{
  "success": true,
  "data": {
    "roomSessionId": "...",
    "roomNumber": "R-101",
    "hotelId": "...",
    "isAlreadyCheckout": true,
    "checkoutSessionId": "507f1f77bcf86cd799439030",
    "foodOrders": [...],
    "serviceRequests": [...],
    "ordersSubtotal": 448,
    "adjustments": [
      { "type": "DISCOUNT", "amount": 44.8, "label": "10% off" }
    ],
    "finalAmount": 403.2,
    "guestDetails": [...]
  }
}
```

**Critical fields for UI:**

| Field | Meaning |
|-------|---------|
| `isAlreadyCheckout` | `false` → show **Proceed** + **Print Bill**. `true` → show **only Print Bill** |
| `roomSessionId` | **Use for Print Bill API** – same for both active and past checkouts |
| `adjustments` | Only when `isAlreadyCheckout: true` — frozen adjustments from checkout |
| `finalAmount` | Only when `isAlreadyCheckout: true` — final billed amount |

---

### 3.2 POST /checkout/proceed

**Purpose:** Finalize checkout — apply adjustments, record payment, mark orders paid, check out room.

**Request:**
```
POST /api/v1/{app}/checkout/proceed
Content-Type: application/json
```
**Body:**
```json
{
  "roomSessionId": "507f1f77bcf86cd799439011",
  "adjustments": [
    { "type": "DISCOUNT", "amount": 50, "label": "10% off" },
    { "type": "DAMAGE", "amount": 200, "label": "Broken lamp" },
    { "type": "OTHER", "amount": 100, "label": "Late check-out" }
  ],
  "paymentMethod": "CASH",
  "guestDetails": {
    "name": "John Doe",
    "phone": "+919876543210"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `roomSessionId` | string | Yes | From preview `data.roomSessionId` |
| `adjustments` | array | No (default `[]`) | `{ type, amount, label? }` |
| `paymentMethod` | string | Yes | `CASH` \| `CARD` \| `UPI` \| `BANK_TRANSFER` \| `OTHER` |
| `guestDetails` | object | No | `{ name?, phone? }` for bill |

**Adjustment types:**
- `DISCOUNT` — reduces total (amount is positive, applied as negative)
- `DAMAGE` — adds charge
- `OTHER` — adds charge, optional label

**Response 200:**
```json
{
  "success": true,
  "message": "Checkout completed successfully",
  "data": {
    "checkoutSessionId": "507f1f77bcf86cd799439030",
    "finalAmount": 1100,
    "roomNumber": "R-101",
    "hotelId": "507f1f77bcf86cd799439020"
  }
}
```

**Note:** Print Bill uses `roomSessionId` (from preview), not `checkoutSessionId`.

---

### 3.3 GET /checkout/bill-pdf

**Purpose:** Download the PDF bill. Uses `roomSessionId` – the same identifier as preview and proceed. Use after Proceed (active room) or from History (past checkout; use `roomSessionId` from the history item).

**Request:**
```
GET /api/v1/{app}/checkout/bill-pdf?roomSessionId={roomSessionId}
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `roomSessionId` | string (24-char hex) | Yes | From preview or history item |

**Response 200:**
- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="checkout-bill-{roomSessionId}.pdf"`
- Body: PDF binary

**Response 404:** Checkout not found for this room session (proceed checkout first, or invalid roomSessionId).

**Frontend handling:** Fetch as blob, create object URL, open in new tab for `window.print()`, or trigger download.

---

### 3.4 GET /checkout/history

**Purpose:** List past checkout sessions for the hotel (for reprints, guest inquiries).

**Request:**
```
GET /api/v1/{app}/checkout/history?search=R-101&page=1&limit=20
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `search` | string | — | Smart search: room number, guest name, guest phone, or ObjectId |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 50) |

**Response 200:**
```json
{
  "success": true,
  "items": [
    {
      "checkoutSessionId": "507f1f77bcf86cd799439030",
      "roomSessionId": "507f1f77bcf86cd799439011",
      "roomNumber": "R-101",
      "paidAt": "2026-03-09T12:30:00.000Z",
      "finalAmount": 24381.9,
      "guestDetails": {
        "name": "John Doe",
        "phone": "+919876543210"
      }
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

**403:** Hotel context required (user must have hotel scope in JWT).

---

## 4. Flow 1: Active Room Checkout

**User journey:** Room View → Click occupied room → All Orders Details → Proceed → Print Bill

### Step-by-Step

1. **User clicks occupied room (e.g. R-101)**  
   - You have `roomSessionId` from the room/QR data.

2. **Call Preview**
   ```
   GET /preview?roomSessionId={roomSessionId}
   ```
   - On success: `data.isAlreadyCheckout === false`.

3. **Render "All Orders Details"**
   - List `foodOrders` and `serviceRequests`.
   - Show `ordersSubtotal`.
   - Payment section:
     - Mode of Payment: Cash / UPI / Card (radio).
     - Discount: percentage or fixed amount input → add to `adjustments` as `{ type: "DISCOUNT", amount }`.
     - Optionally: Damage / Other adjustments.
   - **Buttons:** [Proceed to Checkout] [Print Bill]  
   - For active room, Print Bill only works **after** Proceed (checkout must be completed first). You can either:
     - Disable Print Bill until Proceed completes, or
     - Make Print Bill = Proceed + then fetch PDF (see [Print Bill Flow](#6-print-bill-flow)).

4. **User clicks "Proceed to Checkout"**
   ```
   POST /proceed
   {
     "roomSessionId": data.roomSessionId,
     "adjustments": [...],  // from discount/charge inputs
     "paymentMethod": "CASH",
     "guestDetails": { "name": "...", "phone": "..." }
   }
   ```
   - On success: checkout is complete.
   - Show success message.
   - Enable "Print Bill" (or auto-open print dialog).

5. **User clicks "Print Bill"**
   - Use `data.roomSessionId` from preview (same ID throughout):
   ```
   GET /checkout/bill-pdf?roomSessionId={roomSessionId}
   ```
   - Handle PDF → `window.print()` or download (see [Print Bill Flow](#6-print-bill-flow)).

---

## 5. Flow 2: Past Checkout (History)

**User journey:** Checkout History → Search / select session → Preview (read-only) → Print Bill

### Step-by-Step

1. **User opens Checkout History**
   - Optional: show search input.

2. **Call History**
   ```
   GET /history?search={search}&page=1&limit=20
   ```
   - Render list of `items` (room number, guest, amount, date).

3. **User clicks a session**
   - You have `roomSessionId` and `checkoutSessionId` from the item.

4. **Call Preview**
   ```
   GET /preview?checkoutSessionId={checkoutSessionId}
   ```
   - Or use `roomSessionId`: `GET /preview?roomSessionId={roomSessionId}`
   - On success: `data.isAlreadyCheckout === true`, `data.roomSessionId` present.

5. **Render "All Orders Details" (read-only)**
   - List orders, show `adjustments`, `finalAmount`.
   - **Buttons:** Only [Print Bill] — no Proceed.
   - Payment mode and guest details are informational (from checkout time).

6. **User clicks "Print Bill"**
   ```
   GET /checkout/bill-pdf?roomSessionId={data.roomSessionId}
   ```
   - Use `roomSessionId` from the history item or preview.
   - Same handling as Flow 1.

---

## 6. Print Bill Flow

### Fetch and Print

```javascript
async function printBill(roomSessionId) {
  const res = await fetch(
    `/api/v1/frontdesk/checkout/bill-pdf?roomSessionId=${encodeURIComponent(roomSessionId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error('Failed to fetch bill');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    win.onload = () => win.print();
  } else {
    // Fallback: trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = `checkout-bill-${roomSessionId}.pdf`;
    a.click();
  }
  URL.revokeObjectURL(url);
}
```

### Or: Open in New Tab (User Prints Manually)

```javascript
const blob = await res.blob();
const url = URL.createObjectURL(blob);
window.open(url, '_blank'); // User uses Ctrl+P / Cmd+P
```

---

## 7. TypeScript Types

```typescript
// Preview response
interface CheckoutPreview {
  roomSessionId: string;
  roomNumber: string;
  hotelId: string;
  isAlreadyCheckout: boolean;
  checkoutSessionId?: string;
  foodOrders: CheckoutPreviewFoodOrder[];
  serviceRequests: CheckoutPreviewServiceRequest[];
  ordersSubtotal: number;
  adjustments?: Array<{ type: string; amount: number; label?: string }>;
  finalAmount?: number;
  guestDetails?: { name?: string; phone?: string }[];
}

interface CheckoutPreviewFoodOrder {
  _id: string;
  items: Array<{ itemName: string; quantity: number; variantName?: string; price?: number }>;
  bill: { subtotal: number; toPay: number };
  count: number;
  createdAt: string;
}

interface CheckoutPreviewServiceRequest {
  _id: string;
  items: Array<{ itemName: string; quantity: number; price?: number }>;
  totalAmount: number;
  bill: { toPay: number };
  createdAt: string;
}

// Proceed request
interface ProceedCheckoutInput {
  roomSessionId: string;
  adjustments: Array<{ type: 'DISCOUNT' | 'DAMAGE' | 'OTHER'; amount: number; label?: string }>;
  paymentMethod: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'OTHER';
  guestDetails?: { name?: string; phone?: string };
}

// Proceed response
interface ProceedCheckoutResult {
  checkoutSessionId: string;
  finalAmount: number;
  roomNumber: string;
  hotelId: string;
}

// History item
interface CheckoutHistoryItem {
  checkoutSessionId: string;
  roomSessionId: string;
  roomNumber: string;
  paidAt: string;
  finalAmount: number;
  guestDetails?: { name?: string; phone?: string };
}

// History response
interface CheckoutHistoryResponse {
  success: boolean;
  items: CheckoutHistoryItem[];
  total: number;
  page: number;
  limit: number;
}
```

---

## 8. Error Handling

All APIs use RFC 7807 error format. Check `success === false` and handle by `type`:

| type | status | Action |
|------|--------|--------|
| `VALIDATION_ERROR` | 400 | Show field errors from `errors[]` |
| `BAD_REQUEST` | 400 | Show `detail` in toast |
| `UNAUTHORIZED` | 401 | Redirect to login |
| `FORBIDDEN` | 403 | Show "Access denied" |
| `NOT_FOUND` | 404 | Show "Not found" message |
| `INTERNAL_ERROR` | 500 | Generic error message |

Common cases:
- Preview 400: "Room session not found" / "Room is not active"
- Proceed 400: "Room is not active (already checked out)"
- Bill PDF 404: "Checkout not found for this room session (proceed first)"
- History 403: "Hotel context required"

---

## 9. UI / UX Requirements

### All Orders Details Screen

| Section | Content |
|---------|---------|
| Header | Back button, Floor + Room (e.g. "1st Floor / R-101") |
| Filters | All Orders / Food Orders / Room Service (optional) |
| Order list | Each order: ID, date, items, total. Expand for line items |
| Payment section | Mode (Cash/UPI/Card), Discount %, Overall total |
| Actions | **Proceed to Checkout** (if `!isAlreadyCheckout`), **Print Bill** |

### Conditional Buttons

```tsx
{data.isAlreadyCheckout ? (
  <Button onClick={() => printBill(data.roomSessionId)}>Print Bill</Button>
) : (
  <>
    <Button onClick={handleProceed}>Proceed to Checkout</Button>
    <Button onClick={() => printBill(data.roomSessionId)} disabled={!proceedCompleted}>
      Print Bill
    </Button>
  </>
)}
```
*Note: For active room, disable Print Bill until Proceed completes. Use `data.roomSessionId` for both – no need to track checkoutSessionId.*

### History Screen

- Search input (debounced) → `GET /history?search=...`
- Pagination (page, limit)
- Table/list: Room, Guest, Amount, Date
- Click row → navigate to Preview with `checkoutSessionId`
- Show loading and empty states

### Compute Total for Active Room

```
finalAmount = ordersSubtotal + sum(adjustments)
```
- `DISCOUNT`: subtract `amount`
- `DAMAGE`, `OTHER`: add `amount`

---

## 10. State Management Hints

### State to Keep

- `previewData: CheckoutPreview | null` — from GET /preview
- `proceedCompleted: boolean` — true after POST /proceed succeeds (enables Print Bill)
- `adjustments: Adjustment[]` — user input
- `paymentMethod`, `guestDetails` — user input

### After Proceed

- Set `proceedCompleted = true`
- Print Bill uses `data.roomSessionId` from preview – no separate ID to store
- Optionally auto-trigger Print Bill after successful Proceed

### Navigation

- Room View → All Orders: pass `roomSessionId` (query or state)
- History → All Orders: pass `checkoutSessionId` (query or state)
- Preview component: accept either `roomSessionId` or `checkoutSessionId` and call the correct Preview URL

---

## Quick Reference: API Summary

| Action | Method | Path | Key Params |
|--------|--------|------|------------|
| Load preview (active) | GET | `/checkout/preview` | `roomSessionId` |
| Load preview (past) | GET | `/checkout/preview` | `checkoutSessionId` or `roomSessionId` |
| Complete checkout | POST | `/checkout/proceed` | Body: `roomSessionId`, `adjustments`, `paymentMethod`, `guestDetails` |
| Print/download bill | GET | `/checkout/bill-pdf` | Query: `roomSessionId` |
| List past checkouts | GET | `/checkout/history` | Query: `search`, `page`, `limit` |

---

*Last updated: March 2026 | Backend: TableMitra API v1*
