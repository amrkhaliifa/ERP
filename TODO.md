# Add Discount Option to Orders

## Backend Changes
- [x] Update `backend/schema.sql`: Add `discount` column to `orders` table (REAL NOT NULL DEFAULT 0)
- [x] Update `backend/routes/orders.js`:
  - [x] Modify `recalcTotals` function if needed (balance calculation handled in GET)
  - [x] Update POST endpoint to accept `discount` in request body, default to 0
  - [x] Update GET / endpoint to include discount in response
  - [x] Update GET /:id endpoint to calculate balance as (subtotal - discount) - total_paid
- [x] Update `backend/routes/reports.js`:
  - [x] Update `/outstanding` query to include discount and calculate balance as (subtotal - discount) - paid

## Frontend Changes
- [x] Update `frontend/index.html`:
  - [x] Add discount input field in order form
  - [x] Add discount column to ordersTable
  - [x] Add discount column to outstandingTable
- [ ] Update `frontend/js/app.js`:
  - [ ] Modify order form submission to include discount
  - [ ] Update `loadOrders` to display discount column
  - [ ] Update `loadOutstanding` to display discount column
  - [ ] Update `viewOrder` modal to display discount

## Testing
- [ ] Test creating orders with discount
- [ ] Verify balance calculations in order list, reports, and modal
- [ ] Ensure backward compatibility (existing orders have discount 0)
