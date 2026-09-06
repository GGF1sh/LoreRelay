const fs=require('fs'),path=require('path');
const biomes=['forest','desert','mountain','sea','coast','city','plains','swamp','wasteland','ruins','dungeon','underground','snow','volcanic','other'];
const dir=path.join(__dirname,'biomes');fs.mkdirSync(dir,{recursive:true});
const base=JSON.parse(fs.readFileSync('.test-runs/matrix/balance_normal_a_observe_only.json'));
for(const biome of biomes){
 const rel=`.test-runs/biome-fixtures/${biome}`;fs.mkdirSync(rel,{recursive:true});
 for(const file of ['world_forge.json','world_state.json','game_state.json','game_rules.json'])fs.copyFileSync(`scripts/noai_soak_scenarios/fixtures/merchant_three_market/${file}`,`${rel}/${file}`);
 const forge=JSON.parse(fs.readFileSync(`${rel}/world_forge.json`));for(const r of forge.geography.regions)r.biome=biome;fs.writeFileSync(`${rel}/world_forge.json`,JSON.stringify(forge));
 const s=structuredClone(base);s.id=`balance_biome_${biome}`;s.workspace.fixturePath=rel;fs.writeFileSync(path.join(dir,s.id+'.json'),JSON.stringify(s,null,2));
}
