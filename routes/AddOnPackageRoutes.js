const express = require("express");
const { requestAddOn, getAllRequests, getMemberAddOns, evaluateRequest, getMemberRequests, buyPackageDirectly } = require("../controllers/Packages/AddOnPackageController");
const { getLoadFundConfig, updateLoadFundConfig } = require("../controllers/Payments/LoadFundConfigController");
const router = express.Router();

// User Route -> creates an addOn Request
router.post("/request", requestAddOn);

// User Route -> Instantly buy a package using Top Up Wallet
router.post("/buy-direct", buyPackageDirectly);

// Admin Route -> Gets all pending/approved requests
router.get("/requests", getAllRequests);

// User Route -> Gets all APPROVED addons for a specific member
router.get("/member/:member_id", getMemberAddOns);

// User Route -> Gets all requests (pending/approved/rejected) for a specific member
router.get("/requests/member/:member_id", getMemberRequests);

// Admin Route -> Evaluates request PENDING -> APPROVED | REJECTED 
router.put("/requests/:request_id/evaluate", evaluateRequest);

// Load Fund Config Routes (Admin manage, User fetch)
router.get("/config", getLoadFundConfig);
router.post("/config", updateLoadFundConfig);

module.exports = router;
