const { loadCommissionConfig, validateCommissionEligibility } = require("./utils/commissionUtils");

const config = loadCommissionConfig();

console.log("--- CONFIG ---");
console.log("Eligible Types:", config.eligibleAccountTypes);
console.log("Levels[0] (Pigmy):", config.commissionLevels.levels[0].Pigmy);
console.log("Levels[0] (SB):", config.commissionLevels.levels[0].SB);

const testCases = [
    {
        name: "Pigmy Account Opening",
        tx: { transaction_type: "Account Opening", account_type: "AGP005", credit: 1000 }
    },
    {
        name: "SB Account Opening",
        tx: { transaction_type: "Account Opening", account_type: "AGP001", credit: 1000 }
    },
    {
        name: "Pigmy Receipt",
        tx: { transaction_type: "Receipt", account_type: "AGP005", credit: 1000 }
    }
];

testCases.forEach(test => {
    console.log(`\n--- TEST: ${test.name} ---`);
    const result = validateCommissionEligibility(test.tx, config);
    console.log("FINAL RESULT:", result.eligible ? "✅ ELIGIBLE" : `❌ NOT ELIGIBLE (${result.reason})`);
});
