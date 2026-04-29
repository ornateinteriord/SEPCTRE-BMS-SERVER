const mongoose = require("mongoose");
require("dotenv").config();
const MemberModel = require("./models/Users/Member");
const connectDB = require("./models/db");

const migrate = async () => {
  try {
    await connectDB();
    console.log("✅ MongoDB connected for migration");

    // Logic: If they have a package value and are active, set upgrade_status to 'Active'
    // This targets old users who were activated before the new upgrade_status logic
    const query = {
      package_value: { $gt: 0 },
      status: "active",
      upgrade_status: { $in: ["Pending", "Approved"] } // Target Pending and old Approved status
    };

    const count = await MemberModel.countDocuments(query);
    console.log(`🔍 Found ${count} members to migrate.`);

    if (count === 0) {
      console.log("✨ All members already updated. Nothing to do.");
      process.exit(0);
    }

    const result = await MemberModel.updateMany(query, {
      $set: { upgrade_status: "Active" }
    });

    console.log(`✅ Successfully updated ${result.modifiedCount} members to 'Active'.`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
};

migrate();
