async function test() {
  const r = await fetch("https://open.er-api.com/v6/latest/USD");
  const d = await r.json();
  const inverted = {USD:1};
  for(const [k,v] of Object.entries(d.rates)){
    if(Number(v)>0) inverted[k] = parseFloat((1/Number(v)).toFixed(6));
  }
  console.log("Raw API:", { CNY: d.rates.CNY, HKD: d.rates.HKD, EUR: d.rates.EUR });
  console.log("Inverted:", { CNY: inverted.CNY, HKD: inverted.HKD, EUR: inverted.EUR });
  
  // Now test conversion with inverted
  function toBase(amount, currency, rates, base) {
    if (currency === base) return amount;
    const from = rates[currency] ?? 1;
    const to = rates[base] ?? 1;
    return amount * from / to;
  }
  
  console.log("Convert 100 CNY to USD:", toBase(100, "CNY", inverted, "USD"));
  console.log("Convert 100 HKD to USD:", toBase(100, "HKD", inverted, "USD"));
}
test();
