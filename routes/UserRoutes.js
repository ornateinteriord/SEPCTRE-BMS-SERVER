const express = require("express");
const getTransactionDetails = require("../controllers/Transaction/Transaction");
const { getEpins, transferEpin, getPackageHistory } = require("../controllers/Users/Epin/epin");
const {
  getMemberDetails,
  UpdateMemberDetails,
  activateMemberPackage,
} = require("../controllers/Users/Profile/Profile");
const { getSponsers, checkSponsorReward } = require("../controllers/Users/Sponser/sponser");
const { getMultiLevelSponsorship } = require("../controllers/Users/Sponser/multiLevelSponsorship");
const { createTicket, getTickets } = require("../controllers/Users/Ticket/TicketConntroller");
const Authenticated = require("../middlewares/auth");
const {  triggerMLMCommissions, getMemberCommissionSummary, getDailyPayout, climeRewardLoan, repaymentLoan, getROIBenefits, triggerUserROI } = require("../controllers/Users/Payout/PayoutController");
const { getPendingTransactions, approveWithdrawal } = require("../controllers/Users/payoutPending/pendingTransactions");
const { getWalletOverview, getWalletWithdraw } = require("../controllers/Users/walletServiece/walletServies");
const { getUplineTree } = require("../controllers/Users/mlmService/mlmService");
// const { createOrder, getOrderStatus, webhook } = require("../controllers/Payments/CashfreeController");




const router = express.Router();


router.get("/member/:id", Authenticated, getMemberDetails);
router.put("/member/:memberId", Authenticated, UpdateMemberDetails);
router.put("/activate-package/:memberId", Authenticated, activateMemberPackage);


router.get("/transactions", Authenticated, getTransactionDetails);
router.get("/trasactions/:status", getPendingTransactions);


router.post("/ticket", Authenticated, createTicket);
router.get("/ticket/:id", Authenticated, getTickets);


router.get("/epin", Authenticated, getEpins);
router.put('/transferPackage', Authenticated, transferEpin);
router.get('/package-history', Authenticated, getPackageHistory);

router.get('/sponsers/:memberId', Authenticated, getSponsers);
router.get("/check-sponsor-reward/:memberId", Authenticated, checkSponsorReward);
router.get('/multi-level-sponsors', Authenticated, getMultiLevelSponsorship);

router.post("/mlm/trigger-commissions", Authenticated, triggerMLMCommissions);
router.get("/mlm/commission-summary/:member_id", getMemberCommissionSummary);
router.get("/mlm/upline-tree/:member_id", getUplineTree);
// router.get("/mlm/payouts/:memberId", Authenticated, getMemberPayouts);


router.get("/overview/:memberId", Authenticated, getWalletOverview);
router.post("/withdraw/:memberId", Authenticated, getWalletWithdraw);
router.put('/approve-withdrawal/:transaction_id', Authenticated, approveWithdrawal);


// router.get("/level-benefits/:member_id", getLevelBenefits);
// User-specific daily payout (requires member_id parameter)
router.get("/daily-payout/:member_id", Authenticated, getDailyPayout);
router.get("/roi/trigger/:member_id", Authenticated, triggerUserROI);
router.get("/roi-benefits/:member_id", Authenticated, getROIBenefits);
router.post("/clime-reward-loan/:memberId",climeRewardLoan)

router.post("/repayment-loan/:memberId",repaymentLoan)

// router.post("/create-order" , createOrder);
// router.get("/status/:orderId", getOrderStatus);
// router.post('/webhook',webhook)

module.exports = router;
// Cashfree payments (moved from PaymentRoutes)
