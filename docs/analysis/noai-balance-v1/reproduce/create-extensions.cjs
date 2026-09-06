const fs=require('fs'),path=require('path');
const dir='.test-runs/extensions';fs.mkdirSync(dir,{recursive:true});
for(const [source,id,policy,turns] of [
 ['.test-runs/matrix/balance_abundant_a_merchant_route.json','balance_long_abundant_route','merchant_route',2000],
 ['.test-runs/matrix/balance_plentiful_a_merchant_route.json','balance_long_plentiful_route','merchant_route',2000],
 ['scripts/noai_soak_scenarios/noai_famine_normal_250.json','balance_long_famine_normal','merchant_stress',1000],
 ['scripts/noai_soak_scenarios/noai_famine_barren_250.json','balance_long_famine_barren','merchant_stress',1000]
]){const s=JSON.parse(fs.readFileSync(source));s.id=id;s.policyId=policy;s.horizon.turns=turns;s.limits.maxTurns=turns;s.limits.timeoutMs=180000;s.telemetry.maxSamples=100;fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify(s,null,2));}
