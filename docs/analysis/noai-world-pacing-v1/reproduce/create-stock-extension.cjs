const fs=require('fs'),path=require('path');const dir=path.join(__dirname,'pacing-stock-extension');fs.mkdirSync(dir,{recursive:true});
const s=JSON.parse(fs.readFileSync('.test-runs/pacing-surplus/pacing_supply_surplus_merchant_route.json'));s.id='pacing_stock_long_merchant_route';s.horizon.turns=2000;s.limits.maxTurns=2000;fs.writeFileSync(path.join(dir,s.id+'.json'),JSON.stringify(s,null,2));
