const insurancePlan = {
  years: [
    {"year":1,"premium":50000.0,"guaranteed_cv":51.0,"rev_bonus":0.0,"terminal_bonus":0.0,"non_guaranteed":0.0,"withdrawal":0.0,"total_cv_base":50000.0},
    {"year":2,"premium":50000.0,"guaranteed_cv":51.0,"rev_bonus":0.0,"terminal_bonus":0.0,"non_guaranteed":0.0,"withdrawal":0.0,"total_cv_base":100000.0}
  ]
};
const y = 2;
const py = insurancePlan.years[y-1];
const insPrem = py.premium || 0;
const insOutflow = insPrem > 0 ? -insPrem : 0;
console.log({insPrem, insOutflow});
