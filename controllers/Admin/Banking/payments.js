const mongoose = require("mongoose");
const PaymentsModel = require("../../../models/payments.model.js");
const AccountsModel = require("../../../models/accounts.model.js");
const TransactionModel = require("../../../models/transaction.model.js");
const generateTransactionId = require("../../../utils/generateTransactionId.js");

// Create a new payment
const createPayment = async (req, res) => {
    try {
        const {
            payment_date,
            paid_to,
            payment_details,
            mode_of_payment_paid,
            amount,
            status,
            ref_no,
            payment_no,
            entered_by,
            branch_code,
            member_id,
            account_details
        } = req.body;

        // If account_details is provided, check sufficient balance before creating payment
        if (account_details && account_details.account_id && amount > 0) {
            const account = await AccountsModel.findOne({ 
                $or: [
                    { _id: mongoose.Types.ObjectId.isValid(account_details.account_id) ? account_details.account_id : null },
                    { account_id: account_details.account_id }
                ].filter(Boolean)
            });
            if (!account) {
                return res.status(400).json({
                    success: false,
                    message: "Account not found: " + account_details.account_id
                });
            }
            if ((account.account_amount || 0) < amount) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient balance! Account ${account_details.account_no || account.account_no} has ₹${(account.account_amount || 0).toFixed(2)} but ₹${amount.toFixed(2)} is required. Cannot deduct the entered amount.`
                });
            }
        }

        // Auto-increment payment_id with PMT prefix
        const lastPayment = await PaymentsModel.findOne()
            .sort({ payment_id: -1 })
            .limit(1);

        let newPaymentId = "PMT0001"; // Default starting ID
        if (lastPayment && lastPayment.payment_id) {
            // Extract numeric part from format "PMTXXXX" and increment
            const numericPart = lastPayment.payment_id.replace(/^PMT/, '');
            const lastId = parseInt(numericPart);
            if (!isNaN(lastId)) {
                const nextId = lastId + 1;
                // Format with PMT prefix and pad to 4 digits
                newPaymentId = `PMT${nextId.toString().padStart(4, '0')}`;
            }
        }

        // Create new payment with auto-generated payment_id
        const newPayment = await PaymentsModel.create({
            payment_id: newPaymentId,
            payment_date,
            paid_to,
            payment_details,
            mode_of_payment_paid,
            amount,
            status: status || "active",
            ref_no,
            payment_no,
            entered_by,
            branch_code,
            member_id,
            account_details
        });

        // If account_details is provided, update account balance and create transaction
        if (account_details && account_details.account_id && amount > 0) {
            console.log(`📤 Payment: Processing account update for account_id: ${account_details.account_id}, amount: ${amount}`);

            // First, check if account exists and handle null account_amount
            const existingAccount = await AccountsModel.findOne({ 
                $or: [
                    { _id: mongoose.Types.ObjectId.isValid(account_details.account_id) ? account_details.account_id : null },
                    { account_id: account_details.account_id }
                ].filter(Boolean)
            });

            if (!existingAccount) {
                console.log(`❌ Account not found: ${account_details.account_id}`);
                return res.status(400).json({
                    success: false,
                    message: `Account not found: ${account_details.account_id}`
                });
            } else {
                console.log(`📊 Existing account balance: ${existingAccount.account_amount}`);

                // If account_amount is null, set it to 0 first
                if (existingAccount.account_amount === null || existingAccount.account_amount === undefined) {
                    await AccountsModel.updateOne(
                        { _id: existingAccount._id },
                        { $set: { account_amount: 0 } }
                    );
                    console.log(`🔧 Initialized null account_amount to 0`);
                }

                // Update account balance - DEDUCT money for payment
                const account = await AccountsModel.findOneAndUpdate(
                    { _id: existingAccount._id },
                    { $inc: { account_amount: -amount } },
                    { new: true }
                );

                if (account) {
                    console.log(`✅ Account updated. New balance: ${account.account_amount}`);

                    // Generate unique transaction ID using utility
                    const transId = await generateTransactionId();
                    console.log(`🔑 Generated transaction ID: ${transId}`);

                    // Create transaction record
                    const transaction = await TransactionModel.create({
                        transaction_id: transId,
                        transaction_date: payment_date || new Date(),
                        member_id: member_id,
                        account_number: account_details.account_no,
                        account_type: account_details.account_type,
                        transaction_type: "Payment",
                        description: payment_details || `Payment - ${newPaymentId}`,
                        credit: 0,
                        debit: amount,
                        balance: account.account_amount,
                        Name: paid_to,
                        status: "Completed",
                        reference_no: newPaymentId,
                        collected_by: entered_by
                    });
                    console.log(`📝 Transaction created: ${transaction.transaction_id}`);
                } else {
                    console.log(`❌ Failed to update account balance`);
                }
            }
        } else {
            console.log(`ℹ️ Payment: No account update needed. account_details: ${JSON.stringify(account_details)}, amount: ${amount}`);
        }

        res.status(201).json({
            success: true,
            message: "Payment created successfully",
            data: newPayment
        });
    } catch (error) {
        console.error("Error creating payment:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create payment",
            error: error.message
        });
    }
};

// Get all payments with pagination and filtering
const getPayments = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, status, branch_code } = req.query;

        // Build filter object - exclude inactive records by default
        const filter = { status: { $ne: 'inactive' } };
        if (status) {
            filter.status = status;
        }
        if (branch_code) {
            filter.branch_code = branch_code;
        }
        if (search) {
            filter.$or = [
                { payment_id: { $regex: search, $options: "i" } },
                { payment_details: { $regex: search, $options: "i" } },
                { paid_to: { $regex: search, $options: "i" } },
                { member_id: { $regex: search, $options: "i" } },
                { "account_details.account_no": { $regex: search, $options: "i" } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const payments = await PaymentsModel.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const totalPayments = await PaymentsModel.countDocuments(filter);

        res.status(200).json({
            success: true,
            message: "Payments fetched successfully",
            data: payments,
            pagination: {
                total: totalPayments,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(totalPayments / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Error fetching payments:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch payments",
            error: error.message
        });
    }
};

// Get a single payment by ID
const getPaymentById = async (req, res) => {
    try {
        const { paymentId } = req.params;

        // Exclude inactive records
        const allPayments = await PaymentsModel.find({ status: { $ne: 'inactive' } });
        const payment = allPayments.find(p => p.payment_id === paymentId);

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Payment fetched successfully",
            data: payment
        });
    } catch (error) {
        console.error("Error fetching payment:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch payment",
            error: error.message
        });
    }
};

// Update a payment by ID
const updatePayment = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const updateData = req.body;

        // Find payment by payment_id
        const payment = await PaymentsModel.findOne({ payment_id: paymentId });
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }

        // Update the payment
        const updatedPayment = await PaymentsModel.findOneAndUpdate(
            { payment_id: paymentId },
            { $set: updateData },
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            message: "Payment updated successfully",
            data: updatedPayment
        });
    } catch (error) {
        console.error("Error updating payment:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update payment",
            error: error.message
        });
    }
};

// Delete a payment by ID (soft delete - update status to inactive)
const deletePayment = async (req, res) => {
    try {
        const { paymentId } = req.params;

        const payment = await PaymentsModel.findOne({ payment_id: paymentId });
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }

        // Soft delete by updating status
        const deletedPayment = await PaymentsModel.findOneAndUpdate(
            { payment_id: paymentId },
            { $set: { status: "inactive" } },
            { new: true }
        );

        res.status(200).json({
            success: true,
            message: "Payment deleted successfully",
            data: deletedPayment
        });
    } catch (error) {
        console.error("Error deleting payment:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete payment",
            error: error.message
        });
    }
};

module.exports = {
    createPayment,
    getPayments,
    getPaymentById,
    updatePayment,
    deletePayment
};
