const fs=require('fs'),path=require('path');
const out=path.join(__dirname,'matrix');fs.mkdirSync(out,{recursive:true});
const base=JSON.parse(fs.readFileSync('scripts/noai_soak_scenarios/noai_econprofile_normal_300.json'));
for(const tier of ['abundant','plentiful','normal','scarce','barren'])for(const seed of ['balance-a','balance-b','balance-c'])for(const policy of ['observe_only','merchant_route']){
 const s=structuredClone(base);s.id=`balance_${tier}_${seed.slice(-1)}_${policy}`;s.seed=seed;s.policyId=policy;s.description='Paired balance measurement; route uses 600 decisions, analysis takes the first 300 world turns.';
 s.horizon.turns=policy==='merchant_route'?600:300;s.limits.maxTurns=s.horizon.turns;s.worldSim.economyProfile=tier;s.telemetry.sampleEveryTurns=10;s.telemetry.maxSamples=100;
 fs.writeFileSync(path.join(out,s.id+'.json'),JSON.stringify(s,null,2));
}
console.log(out);
