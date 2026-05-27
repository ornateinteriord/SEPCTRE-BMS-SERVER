const mongoose = require("mongoose");

const AddOnRequestSchema = new mongoose.Schema({
  request_id: { type: String, required: true, unique: true },
  member_id: { type: String, required: true },
  requested_amount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ["PENDING", "APPROVED", "REJECTED"], 
    default: "PENDING" 
  },
  
  // Explicitly tracked metrics for the separate ROI and Payout system once approved
  roi_status: { type: String, enum: ["Pending", "Active", "Completed"], default: "Pending" },
  roi_payout_count: { type: Number, default: 0 },
  roi_payout_target: { type: Number, default: 300 }, // As requested 300 cal days
  roi_last_payout_date: { type: String },
  roi_start_date: { type: String },

  // Load Fund specific fields
  payment_method: { type: String, enum: ["crypto", "wallet"], default: "crypto" },
  tx_no: { type: String, default: null },
  screenshot_url: { type: String, default: null },

  admin_audit: {
    admin_id: { type: String },
    timestamp: { type: Date }
  }
}, { timestamps: true, collection: "add_on_request_tbl" });

module.exports = mongoose.model("AddOnRequest", AddOnRequestSchema);
