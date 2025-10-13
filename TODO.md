# TODO: Add Date Filter for Orders

- [x] Move date filter row in frontend/index.html to under the "Create Order" button
- [x] Add global currentOrderDateFilter variable in frontend/js/app.js
- [x] Modify loadOrders function to accept optional date parameter and use in API call
- [x] Update calls to loadOrders to pass currentOrderDateFilter
- [x] Add event listeners for date filter input and buttons
- [x] Test the functionality by running the app

# TODO: Add Discount and Final Total to Orders

- [x] Add discount and final_total columns to orders table in schema.sql
- [x] Update recalcTotals function in backend/routes/orders.js to calculate final_total = subtotal - discount
- [x] Update POST /orders to accept discount parameter
- [x] Update PUT /orders to accept discount parameter
- [x] Update frontend to include discount field in order form
- [x] Update order display to show final total instead of subtotal for balance calculation
- [x] Test discount functionality

# TODO: Fix Issues Found During Review

- [x] Fix seed.js to use parameterized queries instead of string interpolation for product names with parentheses
- [x] Verify all backend routes are working correctly
- [x] Verify frontend JavaScript has no syntax errors
- [x] Verify HTML structure is correct
- [x] Verify CSS styles are applied correctly
- [x] Test basic CRUD operations for clients, products, and orders
- [x] Test date filtering functionality
- [x] Test discount calculation and final total display
