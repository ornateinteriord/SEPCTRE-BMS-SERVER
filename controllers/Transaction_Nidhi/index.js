const AccountsModel = require("../../models/accounts.model");
const MemberModel = require("../../models/member.model");
const TransactionModel = require("../../models/transaction.model");

// Transfer money between accounts
const transferMoney = async (req, res) => {
    try {
        const { from, to, amount } = req.body;

        // Validate input
        if (!from || !to || !amount) {
            return res.status(400).json({
                success: false,
                message: "From account, to account, and amount are required"
            });
        }

        if (amount <= 0) {
            return res.status(400).json({
                success: false,
                message: "Transfer amount must be greater than zero"
            });
        }

        // Validate sender member exists and is active
        const senderMember = await MemberModel.findOne({ member_id: from.member_id });
        if (!senderMember) {
            return res.status(404).json({
                success: false,
                message: "Sender member not found"
            });
        }

        if (senderMember.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Sender member account is not active"
            });
        }

        // Validate receiver member exists and is active
        const receiverMember = await MemberModel.findOne({ member_id: to.member_id });
        if (!receiverMember) {
            return res.status(404).json({
                success: false,
                message: "Receiver member not found"
            });
        }

        if (receiverMember.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Receiver member account is not active"
            });
        }

        // Find sender account
        const senderAccount = await AccountsModel.findOne({
            account_id: from.account_id,
            member_id: from.member_id,
            account_no: from.account_no,
            account_type: from.account_type
        });

        if (!senderAccount) {
            return res.status(404).json({
                success: false,
                message: "Sender account not found"
            });
        }

        // Check if sender account is active
        if (senderAccount.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Sender account is not active"
            });
        }

        // Find receiver account
        const receiverAccount = await AccountsModel.findOne({
            account_id: to.account_id,
            member_id: to.member_id,
            account_no: to.account_no,
            account_type: to.account_type
        });

        if (!receiverAccount) {
            return res.status(404).json({
                success: false,
                message: "Receiver account not found"
            });
        }

        // Check if receiver account is active
        if (receiverAccount.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Receiver account is not active"
            });
        }

        // Check if sender has sufficient balance
        if (senderAccount.account_amount < amount) {
            // Record failed transaction
            await createTransaction({
                member_id: from.member_id,
                account_number: from.account_no,
                account_type: from.account_type,
                transaction_type: "Transfer",
                description: `Failed transfer to ${to.member_id} - Insufficient balance`,
                debit: amount,
                balance: senderAccount.account_amount,
                Name: senderMember.name,
                mobileno: senderMember.contactno,
                status: "Failed"
            });

            return res.status(400).json({
                success: false,
                message: `Insufficient balance. Available: $${senderAccount.account_amount}, Required: $${amount}`
            });
        }

        // Perform the transfer
        // Deduct from sender
        senderAccount.account_amount -= amount;
        await senderAccount.save();

        // Add to receiver
        receiverAccount.account_amount += amount;
        await receiverAccount.save();

        // Create debit transaction for sender
        const debitTransaction = await createTransaction({
            member_id: from.member_id,
            account_number: from.account_no,
            account_type: from.account_type,
            transaction_type: "Transfer",
            description: `Transfer to ${receiverMember.name} (${to.account_no})`,
            debit: amount,
            balance: senderAccount.account_amount,
            Name: senderMember.name,
            mobileno: senderMember.contactno,
            status: "Completed"
        });

        await createTransaction({
            member_id: to.member_id,
            account_number: to.account_no,
            account_type: to.account_type,
            transaction_type: "Transfer",
            description: `Transfer from ${senderMember.name} (${from.account_no})`,
            credit: amount,
            balance: receiverAccount.account_amount,
            Name: receiverMember.name,
            mobileno: receiverMember.contactno,
            status: "Completed",
            reference_no: debitTransaction.transaction_id
        });

        res.status(200).json({
            success: true,
            message: "Money transferred successfully",
            data: {
                transactionId: debitTransaction.transaction_id,
                from: {
                    account_no: from.account_no,
                    member_name: senderMember.name,
                    new_balance: senderAccount.account_amount
                },
                to: {
                    account_no: to.account_no,
                    member_name: receiverMember.name,
                    new_balance: receiverAccount.account_amount
                },
                amount: amount,
                transfer_date: new Date()
            }
        });

    } catch (error) {
        console.error("Error in money transfer:", error);
        res.status(500).json({
            success: false,
            message: "Failed to transfer money",
            error: error.message
        });
    }
};

// Helper function to create transaction record
async function createTransaction(data) {
    // Generate unique transaction ID
    const lastTransaction = await TransactionModel.findOne()
        .sort({ transaction_id: -1 })
        .limit(1);

    let newTransactionId = "TXN000001";
    if (lastTransaction && lastTransaction.transaction_id) {
        const numericPart = lastTransaction.transaction_id.replace(/^TXN/, '');
        const lastId = parseInt(numericPart);
        if (!isNaN(lastId)) {
            const nextId = lastId + 1;
            newTransactionId = `TXN${nextId.toString().padStart(6, '0')}`;
        }
    }

    const transaction = await TransactionModel.create({
        transaction_id: newTransactionId,
        transaction_date: new Date(),
        ...data
    });

    return transaction;
}

module.exports = {
    transferMoney
};
