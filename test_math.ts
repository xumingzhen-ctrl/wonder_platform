const rates = { CNY: 1, USD: 0.14678 }; // user's stale local storage
function toBase(amount, currency, rates, base) {
  if (currency === base) return amount;
  const from = rates[currency] ?? 1;
  const to = rates[base] ?? 1;
  return amount * from / to;
}
console.log("70k USD to CNY:", toBase(70000, "USD", rates, "CNY"));
console.log("70k USD to CNY - 100k CNY:", toBase(70000, "USD", rates, "CNY") - 100000);
