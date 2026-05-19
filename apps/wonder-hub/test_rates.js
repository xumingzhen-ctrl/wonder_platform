const rates = { CNY: 1, USD: 7.25, HKD: 0.93 };
function toBase(amount, currency, rates, base) {
  if (currency === base) return amount;
  const from = rates[currency] ?? 1;
  const to = rates[base] ?? 1;
  return amount * from / to;
}

console.log("Base CNY:");
console.log("70k USD to CNY:", toBase(70000, "USD", rates, "CNY"));
console.log("50k CNY to CNY:", toBase(50000, "CNY", rates, "CNY"));
console.log("Ratio:", toBase(70000, "USD", rates, "CNY") / toBase(50000, "CNY", rates, "CNY"));

console.log("\nBase USD (No refresh):");
console.log("70k USD to USD:", toBase(70000, "USD", rates, "USD"));
console.log("50k CNY to USD:", toBase(50000, "CNY", rates, "USD"));
console.log("Ratio:", toBase(70000, "USD", rates, "USD") / toBase(50000, "CNY", rates, "USD"));

console.log("\nBase USD (Refreshed):");
const refreshed = { CNY: 0.138, USD: 1, HKD: 0.128 };
console.log("70k USD to USD:", toBase(70000, "USD", refreshed, "USD"));
console.log("50k CNY to USD:", toBase(50000, "CNY", refreshed, "USD"));
console.log("Ratio:", toBase(70000, "USD", refreshed, "USD") / toBase(50000, "CNY", refreshed, "USD"));
