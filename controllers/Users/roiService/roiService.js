const MemberModel = require("../../../models/Users/Member");
const PayoutModel = require("../../../models/Payout/Payout");
const AddOnRequestModel = require("../../../models/Packages/AddOnRequest");
const AddOnPackageModel = require("../../../models/Packages/AddOnPackage");
const TransactionModel = require("../../../models/Transaction/Transaction");
const mlmService = require("../mlmService/mlmService");
const moment = require("moment");
const mongoose = require("mongoose");

/**
 * Check if the given date is a weekend (Saturday or Sunday)
 */
const isWeekend = (date) => {
    const day = moment(date).utcOffset("+05:30").day();
    return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
};

/**
 * Calculate the number of working days (Mon-Fri) in a given window
 */
const getWorkingDaysInWindow = (startDate, calendarDays) => {
    let count = 0;
    const start = moment(startDate);
    for (let i = 0; i < calendarDays; i++) {
        const current = moment(start).add(i, "days");
        const day = current.day();
        if (day !== 0 && day !== 6) {
            count++;
        }
    }
    return count;
};

// Lock management for global ROI processing
let isROIProcessing = false;
let lastGlobalProcessTime = 0;
const GLOBAL_LOCK_TIMEOUT = 30 * 60 * 1000; // 30 minutes

/**
 * Process daily ROI for all eligible members (Smart Catch-up)
 * Handles multi-day gaps automatically with production-grade safety.
 * @param {string|null} targetMemberId - Optional ID to process only a specific member
 */
const processDailyROI = async (targetMemberId = null) => {
    const currentTime = Date.now();
    
    // Global lock only applies if processing ALL members
    if (!targetMemberId) {
        if (isROIProcessing && (currentTime - lastGlobalProcessTime < GLOBAL_LOCK_TIMEOUT)) {
            console.log("⚠️ [ROI] Global process already running. Skipping concurrent trigger.");
            return { success: false, message: "Process already running" };
        }
        isROIProcessing = true;
        lastGlobalProcessTime = currentTime;
    }

    try {
        // ✅ Fix: Use Asia/Kolkata (+5:30) for "today" to match IST expectations
        const today = moment().utcOffset("+05:30").startOf("day");
        const todayStr = today.format("YYYY-MM-DD");

        // ✅ REQUIREMENT: Skip processing on weekends (Saturday & Sunday)
        if (isWeekend(todayStr)) {
            console.log(`📅 [ROI] [${todayStr}] Skipping processing as it is a weekend.`);
            return { success: true, message: "Weekend - No processing", processedCount: 0 };
        }

        // Define filter for members
        const memberFilter = {
            status: "active",
            roi_status: "Active"
        };
        if (targetMemberId) {
            memberFilter.Member_id = targetMemberId;
        }

        // Find eligible members
        const activeMembers = await MemberModel.find(memberFilter);

        if (targetMemberId && activeMembers.length === 0) {
            console.log(`ℹ️ [ROI] Member ${targetMemberId} not found or not eligible for ROI.`);
            return { success: true, message: "Member not eligible", processedCount: 0 };
        }

        console.log(`🚀 [ROI] [${today.format("YYYY-MM-DD")}] Starting ${targetMemberId ? `Targeted (${targetMemberId})` : "Global"} Processing for ${activeMembers.length} active members...`);

        let totalPayoutsProcessed = 0;
        let membersUpdatedCount = 0;

        for (const member of activeMembers) {
            // Start a new session for each member catch-up to ensure atomicity
            const session = await mongoose.startSession();
            session.startTransaction();

            try {
                // ✅ FREEZE BASE ROI TARGET the very first time if not set
                // This must use package_value from BEFORE any add-ons were applied.
                // Once set, it is never changed, so the base daily ROI stays constant.
                if (!member.roi_payout_target || member.roi_payout_target === 0) {
                    // Find how much was added via add-ons so far, to subtract and get the ORIGINAL base amount
                    const AddOnRequestModel = require("../../../models/Packages/AddOnRequest");
                    const approvedAddOns = await AddOnRequestModel.find({ member_id: member.Member_id, status: "APPROVED" });
                    const totalAddOnAmount = approvedAddOns.reduce((sum, a) => sum + (a.requested_amount || 0), 0);
                    const originalBaseAmount = (member.package_value || 0) - totalAddOnAmount;
                    member.roi_payout_target = originalBaseAmount > 0 ? originalBaseAmount * 2 : (member.package_value || 0) * 2;
                    console.log(`🔒 [ROI] Freezing base roi_payout_target for ${member.Member_id}: ₹${member.roi_payout_target} (base: ₹${originalBaseAmount}, addons: ₹${totalAddOnAmount})`);
                }

                // Skip if already completed
                if (member.roi_status === "Completed" || (member.roi_payout_count || 0) >= 300) {
                    if (member.roi_status !== "Completed") {
                        member.roi_status = "Completed";
                        await member.save({ session });
                    }
                    await session.commitTransaction();
                    session.endSession();
                    continue;
                }

                let startRefDate = member.roi_last_payout_date || member.roi_start_date || moment(member.createdAt).utcOffset("+05:30").format("YYYY-MM-DD");
                let currentDayPtr = moment(startRefDate).utcOffset("+05:30").startOf("day").add(1, "days");

                let memberPayoutsThisRun = 0;
                const originalTotalCount = member.roi_payout_count || 0;

                // Loop from last payout to Today
                while (currentDayPtr.isSameOrBefore(today, "day")) {
                    const processingDateStr = currentDayPtr.format("YYYY-MM-DD");

                    // Only process on weekdays (Mon-Fri)
                    if (!isWeekend(processingDateStr)) {
                        // ✅ Always use the frozen target — never recalculate from package_value
                        const totalTargetAmount = member.roi_payout_target;

                        if (totalTargetAmount > 0) {
                            const dailyPayoutAmount = parseFloat((totalTargetAmount / 300).toFixed(2));
                            const nextCount = originalTotalCount + memberPayoutsThisRun + 1;

                            if (nextCount <= 300) {
                                const payoutIdNum = Date.now() + Math.floor(Math.random() * 1000);

                                // Create Payout Entry (Historical Date)
                                const payout = new PayoutModel({
                                    payout_id: payoutIdNum,
                                    date: currentDayPtr.toDate(),
                                    memberId: member.Member_id,
                                    payout_type: "ROI",
                                    ref_no: `ROI-${member.Member_id}-${nextCount}`,
                                    amount: dailyPayoutAmount,
                                    count: nextCount,
                                    days: 300,
                                    status: "Approved",
                                    description: `Base ROI payout`
                                });

                                // Create Transaction Record
                                const transaction = new TransactionModel({
                                    transaction_id: `ROI-TX-${payoutIdNum}`,
                                    transaction_date: processingDateStr,
                                    member_id: member.Member_id,
                                    Name: member.Name,
                                    mobileno: member.mobileno,
                                    description: `Base Package – Daily ROI (Day ${nextCount}/300)`,
                                    transaction_type: "ROI Payout",
                                    ew_credit: dailyPayoutAmount.toString(),
                                    ew_debit: "0",
                                    status: "Completed",
                                    benefit_type: "ROI",
                                    reference_no: payout.ref_no
                                });

                                // Distribute Level Commissions (MLM) - NOW ATOMIC (inside session)
                                await mlmService.distributeROICommission(member.Member_id, dailyPayoutAmount, session, processingDateStr);

                                await payout.save({ session });
                                await transaction.save({ session });

                                // Update local state for member
                                member.wallet_balance = (member.wallet_balance || 0) + dailyPayoutAmount;
                                member.roi_payout_count = nextCount;

                                if (nextCount >= 300) {
                                    member.roi_status = "Completed";
                                }

                                memberPayoutsThisRun++;
                                totalPayoutsProcessed++;
                            }
                        }
                    }

                    // Always advance date to mark it as processed
                    member.roi_last_payout_date = processingDateStr;
                    currentDayPtr.add(1, "days");

                    if (member.roi_status === "Completed") break;
                }

                if (memberPayoutsThisRun > 0 || member.isModified()) {
                    await member.save({ session });
                    await session.commitTransaction();
                    if (memberPayoutsThisRun > 0) {
                        membersUpdatedCount++;
                        console.log(`💰 [Base ROI] [Day ${member.roi_payout_count}/300] ₹${memberPayoutsThisRun} days to ${member.Member_id}.`);
                    }
                } else {
                    await session.abortTransaction();
                }

            } catch (memberError) {
                if (session.inTransaction()) {
                    await session.abortTransaction();
                }
                console.error(`❌ ROI Error for ${member.Member_id}:`, memberError.message);
            } finally {
                session.endSession();
            }
        }


        // =============================================
        // PHASE 2: Process Active Add-On Packages
        // =============================================
        const addonFilter = {
            roi_status: "Active"
        };
        if (targetMemberId) {
            addonFilter.member_id = targetMemberId;
        }

        const activeAddOns = await AddOnPackageModel.find(addonFilter);

        console.log(`🚀 [ROI] Starting processing for ${activeAddOns.length} active Add-On packages...`);

        let addonPayoutsProcessed = 0;
        let addonsUpdatedCount = 0;

        for (const addon of activeAddOns) {
            const member = await MemberModel.findOne({ Member_id: addon.member_id });
            if (!member || member.status !== "active") continue; // Skip if parent member isn't active

            const session = await mongoose.startSession();
            session.startTransaction();

            try {
                // Skip if already completed
                if (addon.roi_status === "Completed" || (addon.roi_payout_count || 0) >= 300) {
                    if (addon.roi_status !== "Completed") {
                        addon.roi_status = "Completed";
                        await addon.save({ session });
                    }
                    await session.commitTransaction();
                    session.endSession();
                    continue;
                }

                let startRefDate = addon.roi_last_payout_date || addon.roi_start_date || moment(addon.createdAt).utcOffset("+05:30").format("YYYY-MM-DD");
                let currentDayPtr = moment(startRefDate).utcOffset("+05:30").startOf("day").add(1, "days");

                let addonPayoutsThisRun = 0;
                let lastAddonDailyAmt = 0;
                const originalTotalCount = addon.roi_payout_count || 0;

                while (currentDayPtr.isSameOrBefore(today, "day")) {
                    const processingDateStr = currentDayPtr.format("YYYY-MM-DD");

                    if (!isWeekend(processingDateStr)) {
                        // ✅ Each add-on has its OWN roi_payout_target set at approval time.
                        // NEVER fall back to requested_amount * 2 here — target must already be set on the model.
                        const totalTargetAmount = addon.roi_payout_target || 0;

                        if (totalTargetAmount > 0) {
                            const dailyPayoutAmount = parseFloat((totalTargetAmount / 300).toFixed(2));
                            lastAddonDailyAmt = dailyPayoutAmount;
                            const nextCount = originalTotalCount + addonPayoutsThisRun + 1;

                            if (nextCount <= 300) {
                                const payoutIdNum = Date.now() + Math.floor(Math.random() * 1000);

                                // ✅ Label payout clearly with the specific add-on request ID
                                const payout = new PayoutModel({
                                    payout_id: payoutIdNum,
                                    date: currentDayPtr.toDate(),
                                    memberId: addon.member_id,
                                    payout_type: "ROI (Add-On)",
                                    ref_no: `ROI-A-${addon.package_id}-${nextCount}`,
                                    amount: dailyPayoutAmount,
                                    count: nextCount,
                                    days: 300,
                                    status: "Approved",
                                    description: `Add-On – ₹${addon.amount} package`
                                });

                                // ✅ Transaction clearly shows which add-on generated this ROI
                                const transaction = new TransactionModel({
                                    transaction_id: `ROI-A-TX-${payoutIdNum}`,
                                    transaction_date: processingDateStr,
                                    member_id: addon.member_id,
                                    Name: member.Name,
                                    mobileno: member.mobileno,
                                    description: `Add-On ROI – Day ${nextCount}/300 (₹${addon.amount} pkg)`,
                                    transaction_type: "ROI Payout",
                                    ew_credit: dailyPayoutAmount.toString(),
                                    ew_debit: "0",
                                    status: "Completed",
                                    benefit_type: "ROI",
                                    reference_no: payout.ref_no
                                });

                                // Distribute MLM commission for this add-on's daily ROI - NOW ATOMIC
                                await mlmService.distributeROICommission(addon.member_id, dailyPayoutAmount, session, processingDateStr);

                                await payout.save({ session });
                                await transaction.save({ session });

                                // Credit the user's wallet
                                await MemberModel.updateOne(
                                    { Member_id: addon.member_id },
                                    { $inc: { wallet_balance: dailyPayoutAmount } },
                                    { session }
                                );

                                addon.roi_payout_count = nextCount;

                                if (nextCount >= 300) {
                                    addon.roi_status = "Completed";
                                }

                                addonPayoutsThisRun++;
                                addonPayoutsProcessed++;
                            }
                        }
                    }

                    addon.roi_last_payout_date = processingDateStr;
                    currentDayPtr.add(1, "days");

                    if (addon.roi_status === "Completed") break;
                }

                if (addonPayoutsThisRun > 0 || addon.isModified()) {
                    await addon.save({ session });
                    await session.commitTransaction();
                    if (addonPayoutsThisRun > 0) {
                        addonsUpdatedCount++;
                        console.log(`💰 [Add-On ${addon.package_id}] [Day ${addon.roi_payout_count}/300] ₹${lastAddonDailyAmt}/day to ${addon.member_id}.`);
                    }
                } else {
                    await session.abortTransaction();
                }

            } catch (addonError) {
                if (session.inTransaction()) {
                    await session.abortTransaction();
                }
                console.error(`❌ Addon ROI Error for ${addon.package_id}:`, addonError.message);
            } finally {
                session.endSession();
            }
        }

        console.log(`✅ [ROI] Add-On Processing Complete. Total Payouts: ${addonPayoutsProcessed}.`);
        return {
            success: true,
            baseProcessedCount: totalPayoutsProcessed,
            addonProcessedCount: addonPayoutsProcessed,
            processedCount: totalPayoutsProcessed + addonPayoutsProcessed // For legacy compatibility with cron.js log
        };

    } finally {
        if (!targetMemberId) {
            isROIProcessing = false;
        }
    }
};

/**
 * Process ROI for a single member (typically called during activation)
 */
const processMemberROI = async (member) => {
    // Start session for atomic single run
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const todayStr = moment().utcOffset("+05:30").format("YYYY-MM-DD");

        if (isWeekend(todayStr)) {
            await session.abortTransaction();
            session.endSession();
            return { success: false, message: "Weekend" };
        }

        if (member.roi_last_payout_date === todayStr) {
            await session.abortTransaction();
            session.endSession();
            return { success: false, message: "Already paid" };
        }

        const dailyAmt = parseFloat(((member.roi_payout_target || (member.package_value * 2)) / 300).toFixed(2));
        const nextIdx = (member.roi_payout_count || 0) + 1;

        const pId = Date.now() + Math.floor(Math.random() * 1000);
        const payout = new PayoutModel({
            payout_id: pId, date: new Date(), memberId: member.Member_id,
            payout_type: "ROI", ref_no: `ROI-${member.Member_id}-${nextIdx}`,
            amount: dailyAmt, count: nextIdx, days: 300, status: "Approved"
        });

        const transaction = new TransactionModel({
            transaction_id: `ROI-TX-${pId}`, transaction_date: todayStr,
            member_id: member.Member_id, Name: member.Name, mobileno: member.mobileno,
            description: `Daily ROI Payout (Day ${nextIdx}/300)`, transaction_type: "ROI Payout",
            ew_credit: dailyAmt.toString(), ew_debit: "0", status: "Completed", benefit_type: "ROI"
        });

        member.roi_payout_count = nextIdx;
        member.roi_last_payout_date = todayStr;
        member.wallet_balance = (member.wallet_balance || 0) + dailyAmt;
        if (nextIdx >= 300) member.roi_status = "Completed";

        await Promise.all([payout.save({ session }), transaction.save({ session }), member.save({ session })]);
        
        // Distribute Level Commissions (MLM) - NOW ATOMIC
        await mlmService.distributeROICommission(member.Member_id, dailyAmt, session, todayStr);
        
        await session.commitTransaction();

        return { success: true, amount: dailyAmt };
    } catch (err) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error(`❌ ROI Single Error for ${member.Member_id}:`, err.message);
        return { success: false, error: err.message };
    } finally {
        session.endSession();
    }
};

/**
 * Process ROI for a single Add-On package (typically called during approval)
 */
const processAddOnROI = async (addon, member) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const todayStr = moment().utcOffset("+05:30").format("YYYY-MM-DD");

        if (isWeekend(todayStr)) {
            await session.abortTransaction();
            session.endSession();
            return { success: false, message: "Weekend" };
        }

        if (addon.roi_last_payout_date === todayStr) {
            await session.abortTransaction();
            session.endSession();
            return { success: false, message: "Already paid" };
        }

        const totalTargetAmount = addon.roi_payout_target || (addon.amount * 2);
        const dailyAmt = parseFloat((totalTargetAmount / 300).toFixed(2));
        const nextIdx = (addon.roi_payout_count || 0) + 1;

        if (nextIdx > 300) {
            await session.abortTransaction();
            session.endSession();
            return { success: false, message: "ROI Target Reached" };
        }

        const pId = Date.now() + Math.floor(Math.random() * 1000);
        
        // Create Payout Entry
        const payout = new PayoutModel({
            payout_id: pId,
            date: new Date(),
            memberId: addon.member_id,
            payout_type: "ROI (Add-On)",
            ref_no: `ROI-A-${addon.package_id}-${nextIdx}`,
            amount: dailyAmt,
            count: nextIdx,
            days: 300,
            status: "Approved",
            description: `Add-On – ₹${addon.amount} package`
        });

        // Create Transaction Record
        const transaction = new TransactionModel({
            transaction_id: `ROI-A-TX-${pId}`,
            transaction_date: todayStr,
            member_id: addon.member_id,
            Name: member.Name,
            mobileno: member.mobileno,
            description: `Add-On Daily ROI (Day ${nextIdx}/300)`,
            transaction_type: "ROI Payout",
            ew_credit: dailyAmt.toString(),
            ew_debit: "0",
            status: "Completed",
            benefit_type: "ROI",
            reference_no: payout.ref_no
        });

        // Update Addon state
        addon.roi_payout_count = nextIdx;
        addon.roi_last_payout_date = todayStr;
        if (nextIdx >= 300) addon.roi_status = "Completed";

        // Update Member wallet
        await MemberModel.updateOne(
            { Member_id: addon.member_id },
            { $inc: { wallet_balance: dailyAmt } },
            { session }
        );

        await Promise.all([payout.save({ session }), transaction.save({ session }), addon.save({ session })]);

        // Distribute MLM commission for this add-on's daily ROI - NOW ATOMIC
        await mlmService.distributeROICommission(addon.member_id, dailyAmt, session, todayStr);

        await session.commitTransaction();

        return { success: true, amount: dailyAmt };
    } catch (err) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error(`❌ Addon ROI Single Error for ${addon.package_id}:`, err.message);
        return { success: false, error: err.message };
    } finally {
        session.endSession();
    }
};

module.exports = { processDailyROI, processMemberROI, processAddOnROI, isWeekend };
