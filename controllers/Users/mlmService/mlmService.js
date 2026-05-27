const MemberModel = require("../../../models/Users/Member");
const PayoutModel = require("../../../models/Payout/Payout");
const TransactionModel = require("../../../models/Transaction/Transaction");

/**
 * Commission Rates for MLM System
 * 
 * Structure:
 * - Level 1 (Direct Referral): $100 - When a member directly refers someone
 * - Levels 2-5 (Indirect Referrals): $25 each
 * - Levels 6-10 (Indirect Referrals): $15 each
 * - Levels 11-15 (Indirect Referrals): $5 each
 * 
 * Example:
 * - A refers B → A gets $100 (Level 1)
 * - B refers C → B gets $100 (Level 1), A gets $25 (Level 2)
 * - C refers D → C gets $100 (Level 1), B gets $25 (Level 2), A gets $25 (Level 3)
 * 
 * Total potential commission per referral: $300 ($100 + $25×4 + $15×5 + $5×5)
 */
const commissionPercentages = {
  1: 5,     // 5%
  2: 2,     // 2%
  3: 0.5,   // 0.5%
  4: 0.5,   // 0.5%
  5: 0.5,   // 0.5%
  6: 0.25,  // 0.25%
  7: 0.25,  // 0.25%
  8: 0.25,  // 0.25%
  9: 0.25,  // 0.25%
  10: 0.25  // 0.25%
};

const getOrdinal = (number) => {
  const suffixes = ["th", "st", "nd", "rd"];
  const value = number % 100;
  return number + (suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0]);
};

/**
 * Finds all upline sponsors from a given member up to maxLevels
 * Starts from the member and traverses up the sponsor chain
 * Level 1 = Direct sponsor, Level 2 = Sponsor's sponsor, etc.
 * 
 * Example: If A refers B, and B refers C:
 * - When C is activated, findUplineSponsors(C) returns:
 *   - Level 1: B (C's direct sponsor) - gets $100
 *   - Level 2: A (B's sponsor) - gets $25
 */
const findUplineSponsors = async (memberId, maxLevels = 15) => {
  const uplineSponsors = [];
  let currentMemberId = memberId;
  let level = 0;

  while (level < maxLevels) {
    const currentMember = await MemberModel.findOne({ Member_id: currentMemberId });

    if (!currentMember || !currentMember.sponsor_id) {
      break; // No more sponsors in the chain
    }

    const sponsor = await MemberModel.findOne({ Member_id: currentMember.sponsor_id });
    if (!sponsor) {
      break; // Sponsor not found
    }

    // Increment level and add to upline chain
    // Level 1 = Direct sponsor, Level 2 = Sponsor's sponsor, etc.
    level++;
    uplineSponsors.push({
      level: level,
      sponsor_id: sponsor.Member_id,
      Sponsor_code: sponsor.member_code || sponsor.Member_id,
      sponsor_name: sponsor.Name,
      sponsor_mobileno: sponsor.mobileno,
      sponsored_member_id: currentMemberId, // The member who triggered this commission
      sponsor_status: sponsor.status
    });

    // Move up the chain
    currentMemberId = sponsor.Member_id;
  }

  // console.log(`📊 Found ${uplineSponsors.length} upline sponsors for member ${memberId}`);
  return uplineSponsors;
};

/**
 * Calculates commissions for all eligible upline sponsors when a new member joins
 * 
 * Commission Structure:
 * - Level 1 (Direct Sponsor): $100
 * - Levels 2-5 (Indirect Sponsors): $25 each
 * - Levels 6-10 (Indirect Sponsors): $15 each
 * - Levels 11-15 (Indirect Sponsors): $5 each
 * 
 * Example Flow:
 * - A refers B → When B activates: A gets $100 (Level 1)
 * - B refers C → When C activates: B gets $100 (Level 1), A gets $25 (Level 2)
 * - C refers D → When D activates: C gets $100 (Level 1), B gets $25 (Level 2), A gets $25 (Level 3)
 * 
 * @param {string} newMemberId - The newly activated member's ID
 * @param {string} directSponsorId - The direct sponsor's ID (for reference)
 * @param {number} specificAmount - Optional specific amount for commission
 * @param {string} pkgType - Optional package type (e.g., "Add-On")
 * @returns {Array} Array of commission objects for eligible sponsors
 */
const calculateCommissions = async (newMemberId, directSponsorId, specificAmount = null, pkgType = "Base") => {
  try {
    // Find the new member
    const newMember = await MemberModel.findOne({ Member_id: newMemberId });
    if (!newMember) {
      console.error(`❌ New member ${newMemberId} not found for commission calculation`);
      return [];
    }

    const packageValue = specificAmount !== null ? specificAmount : Number(newMember.package_value || newMember.spackage || 0);
    if (!packageValue || packageValue <= 0) {
      console.log(`⚠️ New member ${newMemberId} has invalid package amount: ${packageValue}`);
      return [];
    }


    // Find all upline sponsors up to 10 levels
    const uplineSponsors = await findUplineSponsors(newMemberId, 10);

    if (uplineSponsors.length === 0) {
      return [];
    }

    const commissions = [];

    // Process each upline sponsor
    for (const upline of uplineSponsors) {
      // Only active sponsors are eligible for commissions
      if (upline.sponsor_status !== 'active') {
        continue;
      }

      // Get percentage based on level
      const percentage = commissionPercentages[upline.level] || 0;
      
      if (percentage > 0) {
        const commissionAmount = Number(((packageValue * percentage) / 100).toFixed(2));

        if (commissionAmount > 0) {
          commissions.push({
            level: upline.level,
            sponsor_id: upline.sponsor_id,
            Sponsor_code: upline.Sponsor_code,
            sponsor_name: upline.sponsor_name,
            sponsor_mobileno: upline.sponsor_mobileno,
            sponsored_member_id: upline.sponsored_member_id,
            new_member_id: newMemberId,
            new_member_name: newMember.Name,
            amount: commissionAmount,
            payout_type: `${getOrdinal(upline.level)} Level Benefits (${pkgType})`,
            description: `Level ${upline.level} commission (${percentage}%) from member ${newMemberId}'s ${pkgType} package ($${packageValue})`,
            sponsor_status: upline.sponsor_status
          });

          console.log(`✅ Level ${upline.level}: ${upline.sponsor_name} (${upline.sponsor_id}) gets $${commissionAmount} (${percentage}%)`);
        }
      }
    }

    return commissions;

  } catch (error) {
    console.error("❌ Error calculating commissions:", error);
    throw error;
  }
};

/**
 * Processes commissions by creating payouts and transactions for each eligible sponsor
 * 
 * @param {Array} commissions - Array of commission objects from calculateCommissions
 * @returns {Array} Array of results with success/failure status for each commission
 */
const processCommissions = async (commissions, session = null) => {
  try {
    const results = [];

    for (const commission of commissions) {
      try {
        // Verify sponsor is still active before processing
        const sponsor = await MemberModel.findOne({ Member_id: commission.sponsor_id }).session(session);

        if (!sponsor || sponsor.status !== 'active') {
          results.push({
            success: false,
            level: commission.level,
            sponsor_id: commission.sponsor_id,
            sponsor_name: commission.sponsor_name,
            error: `Sponsor status is not active (${sponsor?.status || 'not found'})`
          });
          continue;
        }

        // Generate unique payout ID
        const payoutId = Date.now() + Math.floor(Math.random() * 1000) + commission.level + Math.floor(Math.random() * 1000);

        // Create payout record
        const payout = new PayoutModel({
          payout_id: payoutId.toString(),
          date: new Date().toISOString().split('T')[0],
          memberId: commission.sponsor_id,
          payout_type: commission.payout_type,
          ref_no: commission.new_member_id,
          amount: commission.amount,
          level: commission.level,
          sponsored_member_id: commission.new_member_id,
          sponsor_id: commission.sponsor_id,
          status: "Completed",
          Name: sponsor.Name,
          mobileno: sponsor.mobileno,
          description: commission.description,
          sponsor_status: commission.sponsor_status
        });

        await payout.save({ session });

        // Create transaction record for wallet credit
        const transaction = await createLevelBenefitsTransaction({
          payout_id: payoutId.toString(),
          memberId: commission.sponsor_id,
          payout_type: commission.payout_type,
          amount: commission.amount,
          level: commission.level,
          new_member_id: commission.new_member_id,
          new_member_name: commission.new_member_name,
          sponsor_name: sponsor.Name,
          sponsor_mobileno: sponsor.mobileno
        }, session);

        results.push({
          success: true,
          level: commission.level,
          amount: commission.amount
        });

      } catch (error) {
        console.error(`❌ Error processing commission for level ${commission.level} (${commission.sponsor_id}):`, error);
        results.push({
          success: false,
          error: error.message
        });
      }
    }

    return results;

  } catch (error) {
    console.error("❌ Error in processCommissions:", error);
    throw error;
  }
};

const createLevelBenefitsTransaction = async (transactionData, session = null) => {
  try {
    const { payout_id, memberId, payout_type, amount, level, new_member_id, new_member_name, sponsor_name, sponsor_mobileno } = transactionData;

    // Fixed: Performance optimization - don't query for last ID on every iteration
    // Use a unique compound ID to ensure consistency and speed in high-concurrency 
    const newTransactionId = `T-L-${payout_id}-${Math.floor(Math.random() * 1000)}`;

    const transaction = new TransactionModel({
      transaction_id: newTransactionId,
      transaction_date: new Date(),
      member_id: memberId,
      Name: sponsor_name,
      mobileno: sponsor_mobileno,
      reference_no: payout_id.toString(),
      description: payout_type,
      transaction_type: "Level Benefits",
      ew_credit: amount.toString(),
      ew_debit: "0",
      status: "Completed",
      level: level,
      benefit_type: level === 1 ? "direct" : "indirect",
      related_member_id: new_member_id,
      related_member_name: new_member_name,
      related_payout_id: payout_id
    });

    await transaction.save({ session });
    
    // Add amount to sponsor's wallet balance
    await MemberModel.findOneAndUpdate(
      { Member_id: memberId },
      { $inc: { wallet_balance: amount } },
      { session }
    );

    return transaction;

  } catch (error) {
    console.error("❌ Error creating transaction:", error);
    throw error;
  }
};

const updateSponsorReferrals = async (sponsorId, newMemberId) => {
  try {
    const sponsor = await MemberModel.findOne({ Member_id: sponsorId });
    if (!sponsor) {
      console.error(`Sponsor not found: ${sponsorId}`);
      return;
    }
    let directReferrals = sponsor.direct_referrals || [];

    if (!directReferrals.includes(newMemberId)) {
      directReferrals.push(newMemberId);
    }

    await MemberModel.findOneAndUpdate(
      { Member_id: sponsorId },
      {
        direct_referrals: directReferrals,
        $inc: { total_team: 1 }
      }
    );

    console.log(`✅ Updated referrals for ${sponsorId}: Added ${newMemberId}`);

  } catch (error) {
    console.error("❌ Error updating referrals:", error);
    throw error;
  }
};

const getUplineTree = async (memberId, maxLevels = 15) => {
  return []; // DISABLED
  /*
  try {
    const tree = [];
    let currentMemberId = memberId;
    let level = 0;

    while (level < maxLevels) {
      const currentMember = await MemberModel.findOne({ Member_id: currentMemberId });

      if (!currentMember || !currentMember.sponsor_id) {
        break;
      }

      const sponsor = await MemberModel.findOne({ Member_id: currentMember.sponsor_id });
      if (sponsor) {
        level++;
        tree.push({
          level: level,
          member_id: sponsor.Member_id,
          name: sponsor.Name,
          member_code: sponsor.member_code,
          status: sponsor.status,
          direct_referrals: sponsor.direct_referrals || [],
          total_team: sponsor.total_team || 0,
          commission_rate: commissionRates[level],
          eligible: sponsor.status === 'active'
        });

        currentMemberId = sponsor.Member_id;
      } else {
        break;
      }
    }

    return tree;
  } catch (error) {
    console.error("❌ Error getting upline tree:", error);
    throw error;
  }
  */
};

const getCommissionSummary = () => {
  return {
    total_levels: 15,
    level_1_commission: 100,
    levels_2_to_5_commission: 25,
    levels_6_to_10_commission: 15,
    levels_11_to_15_commission: 5,
    total_potential: 300,
    rates: commissionRates,
    condition: "Commissions only for sponsors with 'active' status"
  };
};

const processMemberActivation = async (activatedMemberId) => {
  return { success: false, message: "Commissions Disabled" };
  /*
  try {
    const member = await MemberModel.findOne({ Member_id: activatedMemberId });
    if (!member) {
      return { success: false, message: "Member not found" };
    }

    let sponsor = null;
    if (member.sponsor_id) {
      sponsor = await MemberModel.findOne({ Member_id: member.sponsor_id });
    }

    if (!sponsor) {
      return { success: false, message: "Sponsor not found" };
    }

    if (sponsor.status !== "active") {
      await updateSponsorReferrals(sponsor.Member_id, member.Member_id).catch(e => console.error(e));
      return { success: false, message: "Sponsor not active; payout skipped" };
    }

    const amount = commissionRates[1] || 0;
    if (amount <= 0) {
      return { success: false, message: "No commission configured for level 1" };
    }

    const payoutId = Date.now() + Math.floor(Math.random() * 1000) + 1;

    const payout = new PayoutModel({
      payout_id: payoutId,
      date: new Date().toISOString().split("T")[0],
      memberId: sponsor.Member_id,
      payout_type: `1st Level Benefits`,
      ref_no: member.Member_id,
      amount: amount,
      level: 1,
      sponsored_member_id: member.Member_id,
      sponsor_id: sponsor.Member_id,
      status: "Completed",
      description: `Direct referral commission from ${member.Member_id}`
    });

    await payout.save();

    const transaction = await createLevelBenefitsTransaction({
      payout_id: payoutId,
      memberId: sponsor.Member_id,
      payout_type: payout.payout_type,
      amount: amount,
      level: 1,
      new_member_id: member.Member_id
    });

    await updateSponsorReferrals(sponsor.Member_id, member.Member_id);

    return {
      success: true,
      payout,
      transaction
    };

  } catch (error) {
    console.error("❌ Error in processMemberActivation:", error);
    throw error;
  }
  */
};

/**
 * Distributes commission to 10 levels of upline sponsors when a member receives ROI
 * 
 * @param {string} memberId - The member ID who received ROI
 * @param {number} roiAmount - The ROI amount received
 * @returns {Promise<Array>} Results of commission distribution
 */
const distributeROICommission = async (memberId, roiAmount, session = null, customDate = null) => {
  try {
    if (!roiAmount || roiAmount <= 0) return [];

    // Find the source member to get their name
    const sourceMember = await MemberModel.findOne({ Member_id: memberId }).session(session);
    if (!sourceMember) return [];

    // Find all upline sponsors up to 10 levels
    const uplineSponsors = await findUplineSponsors(memberId, 10);
    if (uplineSponsors.length === 0) return [];

    const results = [];

    for (const upline of uplineSponsors) {
      // Only active sponsors are eligible for commissions
      if (upline.sponsor_status !== 'active') {
        results.push({
          level: upline.level,
          sponsor_id: upline.sponsor_id,
          success: false,
          error: "Sponsor not active"
        });
        continue;
      }

      // Get percentage based on level from existing commissionPercentages
      const percentage = commissionPercentages[upline.level] || 0;
      if (percentage <= 0) continue;

      const commissionAmount = Number(((roiAmount * percentage) / 100).toFixed(2));
      if (commissionAmount <= 0) continue;

      const payoutId = Date.now() + Math.floor(Math.random() * 1000) + upline.level + Math.floor(Math.random() * 1000);
      const today = customDate || new Date().toISOString().split('T')[0];

      // Create payout record
      const payout = new PayoutModel({
        payout_id: payoutId.toString(),
        date: today,
        memberId: upline.sponsor_id,
        payout_type: "ROI Level Benefit",
        // ✅ FIXED: ref_no must be unique per day/member/level to avoid DB collision
        ref_no: `ROI-L-${memberId}-${upline.level}-${today}`,
        amount: commissionAmount,
        level: upline.level,
        sponsored_member_id: memberId,
        sponsor_id: upline.sponsor_id,
        status: "Completed",
        Name: upline.sponsor_name,
        mobileno: upline.sponsor_mobileno,
        description: `ROI Level ${upline.level} benefit (${percentage}%) from member ${memberId}'s ROI ($${roiAmount})`,
        sponsor_status: upline.sponsor_status
      });

      await payout.save({ session });

      // Fixed: Use unique transaction ID based on payoutId to skip slow DB reads
      const newTransactionId = `T-ROI-L-${payoutId}-${Math.floor(Math.random() * 1000)}`;

      const transaction = new TransactionModel({
        transaction_id: newTransactionId,
        transaction_date: today,
        member_id: upline.sponsor_id,
        Name: upline.sponsor_name,
        mobileno: upline.sponsor_mobileno,
        reference_no: payoutId.toString(),
        description: `ROI Level ${upline.level} Benefit`,
        transaction_type: "ROI Level Benefit",
        ew_credit: commissionAmount.toString(),
        ew_debit: "0",
        status: "Completed",
        level: upline.level,
        benefit_type: "ROI Level Income",
        related_member_id: memberId,
        related_member_name: sourceMember.Name,
        related_payout_id: payoutId
      });

      await transaction.save({ session });

      // Add amount to sponsor's wallet balance
      await MemberModel.findOneAndUpdate(
        { Member_id: upline.sponsor_id },
        { $inc: { wallet_balance: commissionAmount } },
        { session }
      );

      results.push({
        level: upline.level,
        sponsor_id: upline.sponsor_id,
        amount: commissionAmount,
        success: true
      });

      console.log(`💰 ROI Level ${upline.level}: ${upline.sponsor_id} gets $${commissionAmount} from ${memberId}`);
    }

    return results;

  } catch (error) {
    console.error("❌ Error in distributeROICommission:", error);
    throw error;
  }
};

module.exports = {
  commissionPercentages,
  getOrdinal,
  findUplineSponsors,
  createLevelBenefitsTransaction,
  updateSponsorReferrals,
  calculateCommissions,
  processCommissions,
  getUplineTree,
  getCommissionSummary,
  processMemberActivation,
  distributeROICommission
};
