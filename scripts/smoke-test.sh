#!/usr/bin/env bash
# End-to-end smoke test against a running server (default http://localhost:8080) seeded with
# `npm run db:reset`. Needs curl and Node.js (already required by the project). Creates a few records, so run it on a disposable database.
set -u
BASE="${BASE_URL:-http://localhost:8080}"
API="$BASE/api/v1"
PASS=0
FAIL=0

check() { # check <description> <expected> <actual>
  if [ "$2" = "$3" ]; then PASS=$((PASS + 1)); echo "  ok   $1"
  else FAIL=$((FAIL + 1)); echo "  FAIL $1 (expected '$2', got '$3')"; fi
}
req() { # req <method> <path> [token] [json-body]  -> sets BODY and CODE
  local args=(-s -o /tmp/smoke-body -w '%{http_code}' -X "$1" "$API$2" -H 'Content-Type: application/json')
  [ -n "${3:-}" ] && args+=(-H "Authorization: Bearer $3")
  [ -n "${4:-}" ] && args+=(-d "$4")
  CODE=$(curl "${args[@]}"); BODY=$(cat /tmp/smoke-body)
}
j() { echo "$BODY" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const o=JSON.parse(d||"{}");console.log(eval(process.argv[1]))})' "$1"; }

echo "Health"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health-check"); check "GET /health-check" 200 "$CODE"

echo "Staff authentication"
req POST /auth/staff/login "" '{"email":"admin@example.com","password":"wrong-password"}'; check "wrong password rejected" 401 "$CODE"
check "error uses the standard shape" INVALID_CREDENTIALS "$(j 'o.error.code')"
req POST /auth/staff/login "" '{"email":"operator@example.com","password":"password123"}'; check "operator login" 200 "$CODE"
OPERATOR=$(j 'o.token')
req POST /auth/staff/login "" '{"email":"admin@example.com","password":"password123"}'; check "admin login" 200 "$CODE"
ADMIN=$(j 'o.token')
req GET /auth/me "$ADMIN"; check "GET /auth/me" 200 "$CODE"; check "me.role" admin "$(j 'o.user.role')"
req GET /orders ""; check "orders without token" 401 "$CODE"

echo "Roles"
req GET /staff-users "$OPERATOR"; check "operator cannot list staff" 403 "$CODE"
req GET /staff-users "$ADMIN"; check "admin lists staff" 200 "$CODE"

echo "Foods"
req POST /foods "$OPERATOR" '{"name":"Smoke Soup","price":"-1"}'; check "negative price rejected" 400 "$CODE"
check "validation error has field details" true "$(j 'Object.hasOwn(o.error.details.fields, "price")')"
req POST /foods "$OPERATOR" '{"name":"Smoke Soup","category":"Soups","price":"4.50"}'; check "operator creates food" 201 "$CODE"
FOOD=$(j 'o.id')
req GET "/foods?q=smoke&page_size=5" "$ADMIN"; check "search foods" 200 "$CODE"; check "pagination.total" 1 "$(j 'o.pagination.total')"

echo "Mobile order flow"
req GET /mobile/foods ""; check "mobile foods need a customer token" 401 "$CODE"
req POST /mobile/auth/login "" '{"email":"customer@example.com","password":"password123"}'; check "customer login" 200 "$CODE"
CUSTOMER=$(j 'o.token')
req POST /mobile/auth/login "" '{"email":"customer2@example.com","password":"password123"}'; CUSTOMER2=$(j 'o.token')
req GET /mobile/foods "$CUSTOMER"; check "customer lists published foods" 200 "$CODE"
req POST /mobile/orders "$CUSTOMER" "{\"items\":[{\"food_id\":$FOOD,\"quantity\":3}],\"fulfillment_type\":\"pickup\"}"; check "customer places order" 201 "$CODE"
ORDER=$(j 'o.id'); REF=$(j 'o.reference')
check "server-calculated total" 13.50 "$(j 'o.total')"
check "initial status" Placed "$(j 'o.status')"
req GET "/mobile/orders/$ORDER" "$CUSTOMER2"; check "other customer gets 404" 404 "$CODE"
req GET "/mobile/orders/$ORDER" "$CUSTOMER"; check "owner reads order" 200 "$CODE"

echo "Staff order workflow"
req GET "/orders?q=$REF" "$OPERATOR"; check "search by reference" 1 "$(j 'o.pagination.total')"
req POST "/orders/$ORDER/transitions" "$OPERATOR" '{"to":"Completed"}'; check "skipping steps rejected" 409 "$CODE"
check "invalid transition code" INVALID_TRANSITION "$(j 'o.error.code')"
for s in Accepted Preparing Ready Completed; do
  req POST "/orders/$ORDER/transitions" "$OPERATOR" "{\"to\":\"$s\"}"; check "transition to $s" 200 "$CODE"
done
req POST "/orders/$ORDER/transitions" "$OPERATOR" '{"to":"Cancelled","reason":"late"}'; check "terminal order cannot change" 409 "$CODE"
check "terminal code" TERMINAL_STATE "$(j 'o.error.code')"
req GET "/orders/$ORDER" "$ADMIN"; check "history has 5 entries" 5 "$(j 'o.status_history.length')"
req GET "/mobile/orders/$ORDER" "$CUSTOMER"; check "customer sees Completed" Completed "$(j 'o.status')"
req GET /orders/metrics "$ADMIN"; check "metrics" 200 "$CODE"

echo "Logout"
req POST /auth/logout "$OPERATOR"; check "logout" 204 "$CODE"
req GET /auth/me "$OPERATOR"; check "token unusable after logout" 401 "$CODE"

echo
echo "Passed: $PASS  Failed: $FAIL"
[ "$FAIL" -eq 0 ]
