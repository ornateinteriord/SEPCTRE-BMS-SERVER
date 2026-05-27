const mongoose = require('mongoose');

const uri = "mongodb+srv://ornateinteriord_db_user:p03ldpMbAJ137iGg@cluster0.ipcvtng.mongodb.net/SEPCTRE-BMS?appName=Cluster0";

async function cleanData() {
  await mongoose.connect(uri);
  console.log("Connected to MongoDB.");

  const memberId = "BMS000003";

  // Reset Primary Package in Member Table
  const memberUpdate = await mongoose.connection.collection('member_tbl').updateOne(
    { Member_id: memberId },
    {
      $set: {
        package_value: 0,
        spackage: null,
        roi_status: "Pending",
        roi_start_date: null,
        roi_last_payout_date: null,
        roi_payout_target: 0,
        roi_payout_count: 0
      }
    }
  );
  console.log(`Member reset: ${memberUpdate.modifiedCount} document(s) updated.`);

  // Delete Add-On Packages
  const addons = await mongoose.connection.collection('add_on_package_tbl').deleteMany({ member_id: memberId });
  console.log(`Deleted ${addons.deletedCount} Add-On Packages.`);

  // Delete Payouts (ROIs, etc.)
  const payouts = await mongoose.connection.collection('payouts').deleteMany({ memberId: memberId });
  console.log(`Deleted ${payouts.deletedCount} Payouts.`);

  // Delete non-Top-Up Transactions
  const tx = await mongoose.connection.collection('transaction_tbl').deleteMany({
    member_id: memberId,
    transaction_type: { $ne: 'Top up' }
  });
  console.log(`Deleted ${tx.deletedCount} Transactions (excluding Top up).`);

  await mongoose.disconnect();
  console.log("Done.");
}

cleanData().catch(console.error);
