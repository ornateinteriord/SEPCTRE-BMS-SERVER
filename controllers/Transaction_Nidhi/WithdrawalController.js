const WithdrawRequestModel = require("../../models/withdrawRequest.model");
const CommissionModel = require("../../models/commission.model");
const TransactionModel = require("../../models/transaction.model");
const PaymentsModel = require("../../models/payments.model");
const mongoose = require("mongoose");

// User: Request Commission Withdrawal
exports.withdrawCommission = async (req, res) => {
    try {
        const { member_id, amount, bank_account_number, ifsc_code, account_holder_name } = req.body;

        if (!member_id || !amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ success: false, message: "Invalid request data" });
        }

        // Check Commission Balance
        const calculateCommissionBalance = async (memberId) => {
            const commissions = await CommissionModel.find({ beneficiary_id: memberId });
            let balance = 0;
            commissions.forEach(comm => {
                if (comm.status === "CREDITED") balance += comm.commission_amount;
                // Assuming DEBIT transactions might be stored here or we calculate differently
                // But for now, let's assume we check against total credited minus total withdrawn
                // Wait, simply checking CommissionModel might not be enough if withdrawals are stored elsewhere.
                // Should check if there are any "WITHDRAWAL" entries in CommissionModel or similar.
            });

            // Correction: CommissionModel usually stores "Credits". 
            // We should check 'TransactionModel' or 'CommissionModel' for previous withdrawals?
            // Let's rely on a helper or aggregation if exist, but for now let's do a simple aggregation.

            // BETTER APPROACH: 
            // 1. Sum CREDITED commissions
            // 2. Sum COMPLETED/PENDING withdrawals
            // Balance = (1) - (2)

            const totalEarned = commissions
                .filter(c => c.status === 'CREDITED')
                .reduce((sum, c) => sum + (c.commission_amount || 0), 0);

            // Find already withdrawn/pending amounts from WithdrawRequestModel
            const withdrawals = await WithdrawRequestModel.find({
                member_id: memberId,
                source_type: 'Commission',
                status: { $in: ['Pending', 'Approved', 'Completed'] }
            });

            const totalWithdrawn = withdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);

            return totalEarned - totalWithdrawn;
        };

        const availableBalance = await calculateCommissionBalance(member_id);

        if (availableBalance < parseFloat(amount)) {
            return res.status(400).json({
                success: false,
                message: `Insufficient commission balance. Available: ${availableBalance.toFixed(2)}`
            });
        }

        // Create Request
        const newRequest = new WithdrawRequestModel({
            withdraw_request_id: `WREQ${Date.now()}`,
            member_id,
            source_type: 'Commission',
            amount: parseFloat(amount),
            bank_account_number,
            ifsc_code,
            account_holder_name,
            status: 'Pending'
        });

        await newRequest.save();

        res.status(200).json({ success: true, message: "Withdrawal request submitted successfully", data: newRequest });

    } catch (error) {
        console.error("Error asking withdrawal:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Admin: Get Requests
exports.getWithdrawalRequests = async (req, res) => {
    try {
        const { status } = req.query;
        const query = {};
        if (status && status !== 'All') {
            query.status = status;
        }

        // Get withdrawal requests
        const requests = await WithdrawRequestModel.find(query).sort({ createdAt: -1 }).lean();

        // Fetch member details for each request
        const MemberModel = require("../../models/member.model");

        // Debug: Check if we can find any member
        const sampleMember = await MemberModel.findOne({}).lean();
        console.log("Sample member from DB:", sampleMember ? { member_id: sampleMember.member_id, name: sampleMember.name } : "No members found");

        const enrichedRequests = await Promise.all(
            requests.map(async (request) => {
                console.log("Looking for member_id:", request.member_id, "Type:", typeof request.member_id);
                const member = await MemberModel.findOne({ member_id: request.member_id }).lean();
                console.log("Found member:", member ? member.name : "NOT FOUND");

                return {
                    ...request,
                    member_details: member ? {
                        name: member.name,
                        contactno: member.contactno,
                        bank_name: member.bank_name,
                        account_number: member.account_number,
                        ifsc_code: member.ifsc_code
                    } : null
                };
            })
        );

        res.status(200).json({ success: true, data: enrichedRequests });

    } catch (error) {
        console.error("getWithdrawalRequests error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Admin: Pay/Approve Withdrawal
exports.approveWithdrawal = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { request_id, action, transaction_id, remarks } = req.body;
        // action: 'Pay' (Approve & Pay) or 'Reject'

        const request = await WithdrawRequestModel.findOne({ withdraw_request_id: request_id }).session(session);
        if (!request) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: "Request not found" });
        }

        if (request.status !== 'Pending') {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: "Request is already processed" });
        }

        if (action === 'Reject') {
            request.status = 'Rejected';
            request.rejection_reason = remarks;
            request.processed_date = new Date();
            await request.save({ session });
            await session.commitTransaction();
            return res.status(200).json({ success: true, message: "Request rejected" });
        }

        if (action === 'Pay') {
            // Deduct Logic
            // For Commission: We create a negative Commission Entry or just track it via withdrawals?
            // The User Wallet shows "Commission Transactions". Wallet.tsx fetches `useGetMemberCommissionTransactions`.
            // We need to see how that hook fetches data.
            // ... Assuming we need to insert a record into CommissionModel to show the debit in history.

            if (request.source_type === 'Commission') {
                // Fetch member to get name for beneficiary_name
                const MemberModel = require("../../models/member.model");
                const member = await MemberModel.findOne({ member_id: request.member_id }).session(session);

                // 1. Add Global Transaction Entry (For Transaction History Table)
                const newTransaction = new TransactionModel({
                    transaction_id: transaction_id || `TRX_W_${Date.now()}`, // Same ID as commission for linking
                    transaction_date: new Date(),
                    member_id: request.member_id,
                    account_number: 'N/A', // Commission withdrawal has no specific account number
                    account_type: 'Commission',
                    transaction_type: 'Withdrawal', // Debit
                    description: `Commission Withdrawal Approved`,
                    credit: 0,
                    debit: request.amount,
                    ew_debit: "0",
                    balance: 0, // Available balance calculation is complex here, might need to fetch or leave 0
                    Name: member ? member.name : "Unknown Member",
                    mobileno: member ? member.contactno : "N/A", // Corrected field name
                    status: "Completed",
                    reference_no: transaction_id || 'N/A',
                    collected_by: "ADMIN",
                    paid_by: "ADMIN"
                });
                await newTransaction.save({ session });

                // ✅ NEW: INTEGRATE WITH BANKING PAYMENTS
                try {
                    console.log(`🧾 [Banking] Generating Payment Voucher for Withdrawal: ${request_id}`);
                    
                    // 1. Generate Payment ID
                    const lastPayment = await PaymentsModel.findOne().sort({ payment_id: -1 }).limit(1);
                    let newPaymentId = "PAY0001";
                    if (lastPayment && lastPayment.payment_id) {
                        const numericPart = lastPayment.payment_id.replace(/^PAY/, '');
                        const lastId = parseInt(numericPart);
                        if (!isNaN(lastId)) {
                            newPaymentId = `PAY${(lastId + 1).toString().padStart(4, '0')}`;
                        }
                    }

                    // 2. Create Payment Voucher
                    await PaymentsModel.create([{
                        payment_id: newPaymentId,
                        payment_date: new Date(),
                        paid_to: member ? member.name : request.member_id,
                        payment_details: `Withdrawal - ${request.source_type} - ${request_id}`,
                        mode_of_payment_paid: "Bank/Online",
                        amount: request.amount,
                        status: "active",
                        ref_no: request_id,
                        payment_no: transaction_id || `W-${Date.now()}`,
                        entered_by: "ADMIN",
                        branch_code: member ? (member.branch_id || "BRN001") : "BRN001",
                        member_id: request.member_id
                    }], { session });

                    console.log(`✅ Banking Payment generated: ${newPaymentId}`);
                } catch (paymentErr) {
                    console.error(`❌ Banking Payment generation failed for Withdrawal ${request_id}:`, paymentErr.message);
                }
            }

            request.status = 'Completed'; // Or 'Approved'
            request.transaction_id = transaction_id;
            request.processed_date = new Date();
            await request.save({ session });
        }

        await session.commitTransaction();
        res.status(200).json({ success: true, message: "Withdrawal processed successfully" });

    } catch (error) {
        await session.abortTransaction();
        console.error("Approve Withdraw Error:", error);
        // Return explicit error message for easier debugging
        res.status(500).json({
            success: false,
            message: "Internal Error: " + (error.message || "Unknown error"),
            details: error.errors // Validation errors if any
        });
    } finally {
        session.endSession();
    }
};
