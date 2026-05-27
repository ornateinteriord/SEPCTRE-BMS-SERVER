const AddOnRequestModel = require("../../models/Packages/AddOnRequest");
const AddOnPackageModel = require("../../models/Packages/AddOnPackage");
const MemberModel = require("../../models/Users/Member");
const AccountsModel = require("../../models/accounts.model");
const AccountGroupModel = require("../../models/accountGroup.model");
const mlmService = require("../Users/mlmService/mlmService");
const { processAddOnROI, processMemberROI } = require("../Users/roiService/roiService");
const PayoutModel = require("../../models/Payout/Payout");
const TransactionModel = require("../../models/Transaction/Transaction");
const moment = require("moment");
const ReceiptsModel = require("../../models/receipts.model");
const generateTransactionId = require("../../utils/generateTransactionId");


// User requests a new addon package layer
const requestAddOn = async (req, res) => {
  try {
    const { member_id, requested_amount, tx_no, screenshot_url, payment_method } = req.body;

    if (!member_id || !requested_amount) {
      return res.status(400).json({ success: false, message: "Member ID and Amount are required" });
    }

    const member = await MemberModel.findOne({ Member_id: member_id });
    if (!member) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    const method = payment_method || "crypto";

    let generatedTxNo = tx_no;

    if (method === "wallet") {
      const transactions = await TransactionModel.find({ member_id });
      const nonLoanTransactions = transactions.filter(tx =>
        !tx.transaction_type?.toLowerCase().includes('loan') &&
        !tx.description?.toLowerCase().includes('loan')
      );
      const completedAndPendingTx = nonLoanTransactions.filter(tx =>
        tx.status === "Completed" || tx.status === "Pending" || tx.status === "Approved"
      );
      const availableBalance = completedAndPendingTx.reduce((acc, tx) =>
        acc + (parseFloat(tx.ew_credit) || 0) - (parseFloat(tx.ew_debit) || 0), 0
      );

      if (availableBalance < Number(requested_amount)) {
        return res.status(400).json({ success: false, message: "Insufficient wallet balance." });
      }

      await MemberModel.findOneAndUpdate(
        { Member_id: member_id },
        { $inc: { wallet_balance: -Number(requested_amount) } }
      );

      const lastTransaction = await TransactionModel.findOne({}).sort({ createdAt: -1 }).exec();
      let newTransactionId = 1;
      if (lastTransaction && lastTransaction.transaction_id) {
        const lastIdNumber = parseInt(lastTransaction.transaction_id.replace(/\D/g, ""), 10) || 0;
        newTransactionId = lastIdNumber + 1;
      }
      
      const newTransaction = new TransactionModel({
        transaction_id: newTransactionId.toString(),
        transaction_date: new Date(),
        member_id: member_id,
        Name: member.Name,
        mobileno: member.mobileno,
        description: "Package Purchase Deduction",
        transaction_type: "Package Purchase",
        ew_credit: 0,
        ew_debit: Number(requested_amount),
        status: "Completed",
        net_amount: Number(requested_amount),
        gross_amount: Number(requested_amount)
      });
      await newTransaction.save();
      generatedTxNo = newTransaction.transaction_id;
    }

    const request_id = `AOR${Date.now()}`;
    const newRequest = new AddOnRequestModel({
      request_id,
      member_id,
      requested_amount: Number(requested_amount),
      payment_method: method,
      tx_no: generatedTxNo,
      screenshot_url: method === "wallet" ? null : screenshot_url
    });

    await newRequest.save();

    res.status(201).json({ success: true, message: "Load Fund request submitted successfully", request: newRequest });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin gets list of ALL requests 
const getAllRequests = async (req, res) => {
  try {
    const requests = await AddOnRequestModel.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, requests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all approved add-ons for a specific member (user dashboard)
const getMemberAddOns = async (req, res) => {
  try {
    const { member_id } = req.params;
    
    // 1. Fetch standard add-on packages
    const addons = await AddOnPackageModel.find({
      member_id
    }).sort({ createdAt: 1 });
    
    // 2. Fetch FD accounts from accounts_tbl
    // First get the group IDs for FD
    const fdGroups = await AccountGroupModel.find({
        account_group_name: { $regex: /FIXED DEPOSIT|FD/i }
    }).select('account_group_id');
    
    const fdGroupIds = fdGroups.map(g => g.account_group_id);
    
    const fdAccounts = await AccountsModel.find({
        member_id: member_id,
        $or: [
            { account_type: { $in: fdGroupIds } },
            { account_no: { $regex: /^FD/i } }
        ],
        status: { $ne: "closed" }
    });
    
    // 3. Map FD accounts to look like addons
    const mappedFDs = fdAccounts.map(acc => {
        // Calculate progress for FD if possible
        let progressCount = 0;
        if (acc.date_of_opening && acc.date_of_maturity) {
            const start = moment(acc.date_of_opening);
            const end = moment(acc.date_of_maturity);
            const now = moment();
            const totalDays = end.diff(start, 'days');
            const elapsedDays = now.diff(start, 'days');
            
            if (totalDays > 0) {
                // Map to 300 scale for frontend compatibility if needed, 
                // or we'll handle it in frontend
                progressCount = Math.max(0, Math.min(elapsedDays, totalDays));
                // If we want to use the frontend's /300 logic:
                // progressCount = (elapsedDays / totalDays) * 300;
            }
        }

        return {
            package_id: acc.account_no || acc.account_id,
            member_id: acc.member_id,
            amount: acc.account_amount,
            roi_status: acc.status === 'active' ? 'Active' : 'Pending',
            roi_payout_target: acc.net_amount || (acc.account_amount + (acc.interest_amount || 0)),
            roi_payout_count: progressCount, 
            roi_start_date: acc.date_of_opening,
            isFD: true,
            interest_rate: acc.interest_rate,
            duration: acc.duration,
            date_of_maturity: acc.date_of_maturity,
            account_type_name: "Fixed Deposit"
        };
    });
    
    // Combine them
    const combinedAddOns = [...addons, ...mappedFDs];

    res.status(200).json({ success: true, addons: combinedAddOns });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin Approves/Rejects the request
const evaluateRequest = async (req, res) => {
  try {
    const { request_id } = req.params;
    const { status, admin_id } = req.body; // 'APPROVED' or 'REJECTED'

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const request = await AddOnRequestModel.findOne({ request_id });
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    if (request.status !== "PENDING") {
      return res.status(400).json({ success: false, message: "Request already evaluated" });
    }

    request.status = status;
    request.admin_audit = {
      admin_id: admin_id || "SYSTEM",
      timestamp: new Date()
    };

    if (status === "APPROVED") {
      const member = await MemberModel.findOne({ Member_id: request.member_id });
      if (!member) {
        return res.status(404).json({ success: false, message: "Member not found" });
      }

      try {
        const lastTx = await TransactionModel.findOne({}).sort({ createdAt: -1 }).exec();
        let topUpTxId = 1;
        if (lastTx && lastTx.transaction_id) {
          const lastIdNum = parseInt(lastTx.transaction_id.replace(/\D/g, ""), 10) || 0;
          topUpTxId = lastIdNum + 1;
        }
        const topUpTransaction = new TransactionModel({
          transaction_id: topUpTxId.toString(),
          transaction_date: new Date(),
          member_id: request.member_id,
          Name: member.Name,
          mobileno: member.mobileno,
          description: "Load Fund",
          transaction_type: "Top up",
          ew_credit: request.requested_amount,
          ew_debit: 0,
          status: "Completed",
          net_amount: request.requested_amount,
          gross_amount: request.requested_amount,
          reference_no: request.request_id
        });
        await topUpTransaction.save();
        console.log(`✅ Top Up Wallet credited: $${request.requested_amount} for ${request.member_id}`);
      } catch (topUpErr) {
        console.error(`❌ Top Up transaction creation failed for ${request_id}:`, topUpErr.message);
      }
    } else if (status === "REJECTED") {
      if (request.payment_method === "wallet") {
        const member = await MemberModel.findOne({ Member_id: request.member_id });
        if (member) {
          await MemberModel.findOneAndUpdate(
            { Member_id: request.member_id },
            { $inc: { wallet_balance: Number(request.requested_amount) } }
          );

          const lastTransaction = await TransactionModel.findOne({}).sort({ createdAt: -1 }).exec();
          let newTransactionId = 1;
          if (lastTransaction && lastTransaction.transaction_id) {
            const lastIdNumber = parseInt(lastTransaction.transaction_id.replace(/\D/g, ""), 10) || 0;
            newTransactionId = lastIdNumber + 1;
          }
          
          const newTransaction = new TransactionModel({
            transaction_id: newTransactionId.toString(),
            transaction_date: new Date(),
            member_id: request.member_id,
            Name: member.Name,
            mobileno: member.mobileno,
            description: "Package Purchase Refund (Rejected)",
            transaction_type: "Refund",
            ew_credit: Number(request.requested_amount),
            ew_debit: 0,
            status: "Completed",
            net_amount: Number(request.requested_amount),
            gross_amount: Number(request.requested_amount)
          });
          await newTransaction.save();
        }
      }
    }

    await request.save();

    res.status(200).json({ success: true, message: `Request successfully ${status.toLowerCase()}`, request });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getMemberRequests = async (req, res) => {
  try {
    const { member_id } = req.params;
    const requests = await AddOnRequestModel.find({ member_id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, requests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// User instantly buys a package using Top Up Wallet
const buyPackageDirectly = async (req, res) => {
  try {
    const { member_id, requested_amount } = req.body;

    if (!member_id || !requested_amount) {
      return res.status(400).json({ success: false, message: "Member ID and Amount are required" });
    }

    const member = await MemberModel.findOne({ Member_id: member_id });
    if (!member) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    // 1. Verify Top Up Balance
    const transactions = await TransactionModel.find({ member_id: member_id });
    const topUpTransactions = transactions.filter(tx => tx.transaction_type === 'Top up');
    
    const topUpCredits = topUpTransactions
      .filter(tx => tx.status === 'Completed' || tx.status === 'Approved')
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0), 0);
    const topUpDebits = topUpTransactions
      .filter(tx => tx.status === 'Completed' || tx.status === 'Approved')
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_debit) || 0), 0);
    
    const topUpBalance = Math.max(0, topUpCredits - topUpDebits);

    if (topUpBalance < Number(requested_amount)) {
      return res.status(400).json({ success: false, message: "Insufficient Top Up Balance." });
    }

    // 2. Deduct from Top Up Balance
    const lastTx = await TransactionModel.findOne({}).sort({ createdAt: -1 }).exec();
    let newTxId = 1;
    if (lastTx && lastTx.transaction_id) {
      const lastIdNum = parseInt(lastTx.transaction_id.replace(/\D/g, ""), 10) || 0;
      newTxId = lastIdNum + 1;
    }

    const deductionTx = new TransactionModel({
      transaction_id: newTxId.toString(),
      transaction_date: new Date(),
      member_id: member_id,
      Name: member.Name,
      mobileno: member.mobileno,
      description: "Direct Package Purchase",
      transaction_type: "Top up", // Crucial: must be 'Top up' to affect topUpBalance correctly
      ew_credit: 0,
      ew_debit: Number(requested_amount),
      status: "Completed",
      net_amount: Number(requested_amount),
      gross_amount: Number(requested_amount)
    });
    await deductionTx.save();

    // 3. Create Package & ROI Logic (Same as evaluateRequest Approved)
    const request_id = `DIR${Date.now()}`; // Pseudo request ID for tracking
    
    // CASE A: Primary Package
    if (!member.package_value || member.package_value === 0) {
      member.package_value = requested_amount;
      member.spackage = `PKG-${requested_amount}`;
      member.status = "active";
      member.roi_status = "Active";
      member.roi_start_date = moment().utcOffset("+05:30").format("YYYY-MM-DD");
      member.roi_last_payout_date = member.roi_start_date; 
      member.roi_payout_target = requested_amount * 2;
      member.roi_payout_count = 0;
      await member.save();

      const payoutId = Date.now() + Math.floor(Math.random() * 1000);
      const payout = new PayoutModel({
        payout_id: payoutId,
        date: moment().utcOffset("+05:30").toDate(),
        memberId: member.Member_id,
        payout_type: "ROI",
        ref_no: `ACT-${member.Member_id}-0`,
        amount: 0,
        count: 0,
        days: 300,
        status: "Approved",
        description: "Package Activation"
      });

      const activationTx = new TransactionModel({
        transaction_id: `ACT-TX-${payoutId}`,
        transaction_date: member.roi_last_payout_date,
        member_id: member.Member_id,
        Name: member.Name,
        mobileno: member.mobileno,
        description: `Package Activation – Daily ROI (Day 0/300)`,
        transaction_type: "ROI Payout",
        ew_credit: "0",
        ew_debit: "0",
        status: "Completed",
        benefit_type: "ROI",
        reference_no: payout.ref_no
      });
      await Promise.all([payout.save(), activationTx.save()]);
    } 
    // CASE B: Add-On Package
    else {
      const activationDate = moment().utcOffset("+05:30").format("YYYY-MM-DD");
      const newAddOn = new AddOnPackageModel({
        package_id: `PKG-A-${Date.now()}`,
        member_id: member_id,
        amount: requested_amount,
        roi_status: "Active",
        roi_payout_target: requested_amount * 2,
        roi_payout_count: 0,
        roi_start_date: activationDate,
        roi_last_payout_date: activationDate, 
        request_id: request_id,
        admin_id: "SYSTEM_DIRECT"
      });
      await newAddOn.save();

      const payoutId = Date.now() + Math.floor(Math.random() * 1000);
      const payout = new PayoutModel({
        payout_id: payoutId,
        date: moment().utcOffset("+05:30").toDate(),
        memberId: member_id,
        payout_type: "ROI",
        ref_no: `ACT-A-${newAddOn.package_id}-0`,
        amount: 0,
        count: 0,
        days: 300,
        status: "Approved",
        description: "Add-On Activation"
      });

      const addonActivationTx = new TransactionModel({
        transaction_id: `ACT-A-TX-${payoutId}`,
        transaction_date: activationDate,
        member_id: member_id,
        Name: member.Name,
        mobileno: member.mobileno,
        description: `Add-On Activation – Day 0/300 ($${requested_amount} pkg)`,
        transaction_type: "ROI Payout",
        ew_credit: "0",
        ew_debit: "0",
        status: "Completed",
        benefit_type: "ROI",
        reference_no: payout.ref_no
      });
      await Promise.all([payout.save(), addonActivationTx.save()]);
    }

    // 4. MLM Commissions
    try {
      const commissions = await mlmService.calculateCommissions(
        member_id,
        member.sponsor_id,
        requested_amount, 
        "Add-On"
      );
      if (commissions.length > 0) {
        await mlmService.processCommissions(commissions);
      }
    } catch (commErr) {
      console.error(`⚠️ Commission distribution failed:`, commErr.message);
    }

    // 5. Banking Receipt
    try {
      const lastReceipt = await ReceiptsModel.findOne().sort({ receipt_id: -1 }).limit(1);
      let newReceiptId = "RPT0001";
      if (lastReceipt && lastReceipt.receipt_id) {
        const numericPart = lastReceipt.receipt_id.replace(/^RPT/, '');
        const lastId = parseInt(numericPart);
        if (!isNaN(lastId)) {
          newReceiptId = `RPT${(lastId + 1).toString().padStart(4, '0')}`;
        }
      }

      await ReceiptsModel.create({
        receipt_id: newReceiptId,
        receipt_date: new Date(),
        received_from: member.Name,
        receipt_details: `Direct Package Purchase - ${requested_amount}`,
        mode_of_payment_received: "Top Up Wallet",
        amount: requested_amount,
        status: "active",
        ref_no: request_id,
        receipt_no: `REC-${Date.now()}`,
        entered_by: "SYSTEM_DIRECT",
        branch_code: member.branch_id || "BRN001",
        member_id: member_id
      });
    } catch (receiptErr) {
      console.error(`❌ Banking Receipt generation failed:`, receiptErr.message);
    }

    res.status(200).json({ success: true, message: `Package purchased successfully!` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  requestAddOn,
  getAllRequests,
  getMemberAddOns,
  evaluateRequest,
  getMemberRequests,
  buyPackageDirectly
};

