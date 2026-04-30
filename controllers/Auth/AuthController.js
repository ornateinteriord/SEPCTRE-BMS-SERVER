const AdminModel = require("../../models/Admin/Admin");
const MemberModel = require("../../models/Users/Member");
const jwt = require("jsonwebtoken");
const {
  sendMail,
} = require("../../utils/EmailService");
const { generateOTP, storeOTP, verifyOTP } = require("../../utils/OtpService");
const { generateMSCSEmail } = require("../../utils/generateMSCSEmail");
const { updateSponsorReferrals } = require("../../controllers/Users/mlmService/mlmService");
const path = require("path");

const recoverySubject = "BMS Foundation - Password Recovery";
const resetPasswordSubject = "BMS Foundation - OTP Verification";

const generateUniqueMemberId = async () => {
  let newNumber = 1;
  // Get the most recently created member with a BMS ID
  const lastMember = await MemberModel.findOne({ Member_id: /^BMS/ }).sort({ _id: -1 });

  if (lastMember && lastMember.Member_id) {
    const lastNumberStr = lastMember.Member_id.replace('BMS', '');
    const lastNumber = parseInt(lastNumberStr, 10);
    if (!isNaN(lastNumber)) {
      newNumber = lastNumber + 1;
    }
  }

  let finalId = `BMS${String(newNumber).padStart(6, '0')}`;

  // Guarantee uniqueness
  while (await MemberModel.exists({ Member_id: finalId })) {
    newNumber++;
    finalId = `BMS${String(newNumber).padStart(6, '0')}`;
  }

  return finalId;
};

const signup = async (req, res) => {
  try {
    const { email, password, Name, sponsorId, ...otherDetails } = req.body;
    // const existingUser = await MemberModel.findOne({ email });
    // if (existingUser) {
    //   return res.status(400).json({ success: false, message: "Email already in use" });
    // }

    const memberId = await generateUniqueMemberId();

    // Find the sponsor if provided
    let sponsor = null;
    if (sponsorId) {
      sponsor = await MemberModel.findOne({ Member_id: sponsorId });
      if (!sponsor) {
        return res.status(400).json({ success: false, message: "Invalid sponsor ID" });
      }
    }

    const newMember = new MemberModel({
      Member_id: memberId,
      email,
      password,
      Name,

      // Assign sponsor if provided
      sponsor_id: sponsorId || null,
      Sponsor_code: sponsorId || null,
      Sponsor_name: sponsor ? sponsor.Name : null,

      ...otherDetails,
    });
    await newMember.save();

    // If a sponsor was provided, add this member to the sponsor's direct referrals
    if (sponsorId) {
      try {
        await updateSponsorReferrals(sponsorId, memberId);
        console.log(`✅ Added new member ${memberId} to sponsor ${sponsorId}'s direct referrals`);
      } catch (referralError) {
        console.error("Error updating sponsor referrals:", referralError);
      }
    }

    try {

      const { welcomeMessage, welcomeSubject } = generateMSCSEmail(memberId, password, Name);

      const textContent = `Dear ${Name}, Your account registration with BMS Foundation has been completed. Member ID: ${memberId}, Password: ${password}. Your account is under verification process.`;


      await sendMail(email, welcomeSubject, welcomeMessage, textContent);

    } catch (emailError) {

    }

    res.status(201).json({
      success: true,
      message: "Signup successful. Credentials sent to email.",
      user: {
        Member_id: newMember.Member_id,
        email: newMember.email,
        Name: newMember.Name
      },
    });

  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const getSponsorDetails = async (req, res) => {
  try {
    const { ref } = req.params;
    const sponsor = await MemberModel.findOne({ Member_id: ref });
    if (!sponsor) {
      return res
        .status(404)
        .json({ success: false, message: "Invalid Sponsor Code" });
    }
    res.json({
      success: true,
      Member_id: sponsor.Member_id,
      name: sponsor.Name,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const recoverPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await MemberModel.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Email not registered" });
    }
    const recoveryDescription = `Dear Member,

You requested a password recovery. Here is your password:
 ${user.password}

Please keep this information secure.

Best regards,\nBMS Foundation Team`;

    await sendMail(user.email, recoverySubject, recoveryDescription);
    res.json({ success: true, message: "Password sent to your email" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, password, otp } = req.body;
    const user = await MemberModel.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Email not registered" });
    }

    if (otp && password) {
      if (!verifyOTP(email, otp)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid OTP or expired" });
      }
      user.password = password;
      await user.save();

      return res.json({
        success: true,
        message: "Password reset successfully",
      });
    }

    if (otp && !password) {
      if (!verifyOTP(email, otp, true)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid OTP or expired" });
      }
      return res.json({ success: true, message: "OTP verified. Now set a new password." });
    }

    if (password && !otp) {
      return res
        .status(400)
        .json({ success: false, message: "OTP is required to set a new password" });
    }
    const newOtp = generateOTP();

    const textContent = `Dear Member,\n\nYour OTP for password reset is: ${newOtp}\n\nPlease use this OTP to proceed with resetting your password.\n\nPlease don't share this OTP with anyone.\n\nBest regards,\nBMS Foundation Team`;

    const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
      <div style="text-align: center; margin-bottom: 30px;">
        <img src="cid:bmslogo" alt="BMS Foundation Logo" style="max-width: 180px; height: auto;" />
      </div>
      <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
        <h2 style="color: #0f172a; margin-top: 0; text-align: center; font-size: 24px;">Password Reset Request</h2>
        <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Dear Member,</p>
        <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">We received a request to reset the password for your account. Please use the following One-Time Password (OTP) to complete the process:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: 800; color: #1e3a8a; letter-spacing: 4px; padding: 15px 30px; background-color: #eff6ff; border-radius: 8px; border: 2px dashed #bfdbfe; display: inline-block;">${newOtp}</span>
        </div>
        
        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 10px;"><strong>Security Notice:</strong> Please do not share this code with anyone. This OTP is valid for a limited time.</p>
      </div>
      <div style="text-align: center; margin-top: 25px; color: #94a3b8; font-size: 12px;">
        &copy; ${new Date().getFullYear()} BMS Foundation. All rights reserved.
      </div>
    </div>`;

    const attachments = [{
      filename: 'bms_logo.png',
      path: path.join(__dirname, '../../utils/bms_logo.png'),
      cid: 'bmslogo'
    }];

    storeOTP(email, newOtp);
    await sendMail(email, resetPasswordSubject, htmlContent, textContent, attachments);
    return res.json({ success: true, message: "OTP sent to your email" });
  } catch (error) {
    console.error("Error in resetPassword:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await MemberModel.findOne({ Member_id: username });
    const admin = await AdminModel.findOne({ username });
    const foundUser = user || admin;
    if (!foundUser) {
      return res
        .status(404)
        .json({ success: false, message: "User or Admin not found" });
    }
    const userRole = user instanceof MemberModel ? "USER" : (admin.role || "ADMIN");
    const isPasswordValid =
      password === (foundUser.PASSWORD || foundUser.password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ success: false, message: "Incorrect username or password" });
    }

    const token = jwt.sign(
      {
        id: foundUser._id,
        role: userRole,
        memberId: foundUser?.Member_id ?? null,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );
    return res.status(200).json({

      success: true,
      role: userRole,
      user: foundUser,
      token,
      message: `${userRole.charAt(0).toUpperCase() + userRole.slice(1).toLowerCase()
        } login successful`,

    });

  } catch (error) {
    console.error("Login Error:", error);
    return res
      .status(500)
      .json({ success: false, message: error });
  }
};

const impersonate = async (req, res) => {
  try {
    const { memberId } = req.body;
    if (!memberId) {
      return res.status(400).json({ success: false, message: "Member ID is required" });
    }

    const member = await MemberModel.findOne({ Member_id: memberId });
    if (!member) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    const token = jwt.sign(
      {
        id: member._id,
        role: "USER",
        memberId: member.Member_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" } // Short lived token for impersonation
    );

    return res.status(200).json({
      success: true,
      token,
      message: `Impersonation token generated for ${member.Name}`,
    });
  } catch (error) {
    console.error("Impersonation Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  signup,
  getSponsorDetails,
  recoverPassword,
  resetPassword,
  login,
  impersonate,
};
