'use strict';
const assert = require('assert/strict');
const { normalizeWorldPacing, worldPacingPreset, tickFactionFoodSupply, tickFactionConflicts, projectWorldPacing, parseFactionFoodSupply, parseFactionFoodStatuses, parseFactionConflicts } = require('../out/worldPacingCore');
const { parseWorldForge } = require('../out/worldForgeCore');
const { parseWorldState } = require('../out/worldStateCore');
const { evolveRelationships } = require('../out/npcRelationshipCore');
const { isFoodCrisisEvent } = require('../out/livingWorldTypes');
const base = () => ({ forge: { meta: { worldName: 'test' }, geography: { regions: [{ id: 'known', name: 'Known' }, { id: 'hidden', name: 'SECRET' }],
 locations: [{ id: 'market', regionId: 'known' }, { id: 'secret', regionId: 'hidden' }] }, factions: [
 { id: 'a', name: 'A', enemies: ['b'], foodSupply: { marketLocationId: 'market', commodityId: 'grain', dailyDemand: 2, reserveTarget: 6 } },
 { id: 'b', name: 'B', enemies: ['a'], foodSupply: { marketLocationId: 'market', commodityId: 'grain', dailyDemand: 2, reserveTarget: 6 } }] },
 state: { format: 'lorerelay-world-state/1.0', worldTurn: 1, factions: { a: { power: 40, resources: { food: 0 } }, b: { power: 40, resources: { food: 0 } } },
 regions: { known: { controllingFaction: 'a' }, hidden: { controllingFaction: 'b' } }, markets: { market: { grain: { stock: 7, priceIndex: 1 } } }, globalEvents: [] } });
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS', name); }
test('presets normalize and partial settings preserve other choices', () => {
 const base = worldPacingPreset('stable').worldPacing;
 assert.equal(normalizeWorldPacing({ conflictRestDays: 8 }, base).foodDemandMultiplier, 0);
 assert.equal(normalizeWorldPacing({ foodDemandMultiplier: NaN }).foodDemandMultiplier, 1);
 assert.equal(normalizeWorldPacing({ conflictActiveDays: -1 }).conflictActiveDays, 1);
 assert.equal(worldPacingPreset('demanding').economyProfile, 'scarce');
});
test('two factions consume shared stock once, covering daily demand before buffers', () => {
 const { forge, state } = base(); const events = [];
 tickFactionFoodSupply(forge, state, normalizeWorldPacing({}), events);
 assert.equal(state.markets.market.grain.stock, 0);
 assert.equal(state.factions.a.resources.food + state.factions.b.resources.food, 3);
 assert.equal(state.factionFoodStatus.a.status, 'supplied'); assert.equal(state.factionFoodStatus.b.status, 'supplied');
 assert.equal(events.length, 0);
});
test('shortage emits once and market replenishment recovers without a new shock', () => {
 const { forge, state } = base(); state.markets.market.grain.stock = 0;
 const first=[];tickFactionFoodSupply(forge,state,normalizeWorldPacing({}),first);assert.equal(first.length,2);assert(first.every(isFoodCrisisEvent));
 const second=[];state.worldTurn++;tickFactionFoodSupply(forge,state,normalizeWorldPacing({}),second);assert.equal(second.length,0);
 state.markets.market.grain.stock = 4;const recovery=[];state.worldTurn++;tickFactionFoodSupply(forge,state,normalizeWorldPacing({}),recovery);
 assert.equal(recovery.length,2);assert(recovery.every(e=>!isFoodCrisisEvent(e)));assert.equal(state.markets.market.grain.stock,0);
});
test('stopped or unconnected supply does not silently consume reserves', () => {
 const { forge, state }=base();state.factions.a.resources.food=20;
 tickFactionFoodSupply(forge,state,worldPacingPreset('stable').worldPacing,[]);assert.equal(state.factions.a.resources.food,20);
 delete forge.factions[0].foodSupply;tickFactionFoodSupply(forge,state,normalizeWorldPacing({}),[]);
 assert.equal(state.factions.a.resources.food,20);assert.equal(state.factionFoodStatus.a.status,'unconfigured');
});
test('disabled Commerce pauses market-backed demand without consuming retained stock or reserves', () => {
 const {forge,state}=base();state.factions.a.resources.food=5;
 tickFactionFoodSupply(forge,state,normalizeWorldPacing({}),[],false);
 assert.equal(state.markets.market.grain.stock,7);assert.equal(state.factions.a.resources.food,5);
 assert.equal(state.factionFoodStatus.a.status,'paused');assert.equal(state.factionFoodStatus.b.status,'paused');
});
test('supply parsing requires a valid staple market binding', () => {
 const raw = require('../sample-scenarios/trade-routes/world_forge.json');
 assert(parseWorldForge(raw).factions[0].foodSupply);
 const changed=structuredClone(raw);changed.commerce.commodities[0].role='material';assert.equal(parseWorldForge(changed).factions[0].foodSupply,undefined);
});
test('reciprocal enemies tick once and active/rest phases survive parsing', () => {
 const {forge,state}=base();const p=normalizeWorldPacing({conflictActiveDays:2,conflictRestDays:2});
 let events=[];tickFactionConflicts(forge,state,p,events);assert.equal(events.length,1);assert.equal(state.factions.a.power,39.5);
 state.worldTurn=2;tickFactionConflicts(forge,state,p,[]);assert.equal(state.factions.a.power,39);
 state.worldTurn=3;events=[];tickFactionConflicts(forge,state,p,events);assert.equal(state.factions.a.power,39);assert.equal(state.factionConflicts['a|b'].phase,'resting');
 assert.equal(evolveRelationships({registry:{a:{factionId:'a'},b:{factionId:'b'}},positions:{},relationships:{},worldTurn:3,stepEvents:events}).factionChanges.length,0);
 const loaded=parseWorldState(JSON.parse(JSON.stringify(state)));assert.deepEqual(loaded.factionConflicts,state.factionConflicts);
 state.worldTurn=5;tickFactionConflicts(forge,state,p,[]);assert.equal(state.factions.a.power,38.5);
});
test('exhausted power never farms wins, and stopped conflict does not reset hostility', () => {
 const {forge,state}=base();state.factions.b.power=0;
 for(let n=0;n<1000;n++){state.worldTurn++;tickFactionConflicts(forge,state,normalizeWorldPacing({}),[]);}
 assert.equal(state.factions.a.power,40);assert.equal(state.factionConflicts['a|b'].phase,'exhausted');
 tickFactionConflicts(forge,state,worldPacingPreset('stable').worldPacing,[]);assert.deepEqual(forge.factions[0].enemies,['b']);
});
test('active paced conflict changes morale, while resting and stopped conflict do not', () => {
 const {forge,state}=base();state.factions.a.power=60;state.factions.b.power=40;state.factions.a.morale=50;state.factions.b.morale=50;
 const p=normalizeWorldPacing({conflictActiveDays:1,conflictRestDays:2});
 tickFactionConflicts(forge,state,p,[]);assert.equal(state.factions.a.morale,52);assert.equal(state.factions.b.morale,48);
 state.worldTurn=2;tickFactionConflicts(forge,state,p,[]);assert.equal(state.factionConflicts['a|b'].phase,'resting');
 assert.equal(state.factions.a.morale,52);assert.equal(state.factions.b.morale,48);
 state.worldTurn=3;tickFactionConflicts(forge,state,{...p,conflictEnabled:false},[]);
 assert.equal(state.factions.a.morale,52);assert.equal(state.factions.b.morale,48);
});
test('a faction in multiple active conflicts receives one averaged morale update', () => {
 const {forge,state}=base();forge.factions.push({id:'c',name:'C',enemies:['a']});forge.factions[0].enemies.push('c');
 state.factions.a.power=80;state.factions.a.morale=50;state.factions.b.power=40;state.factions.c={power:40,morale:50,resources:{}};
 tickFactionConflicts(forge,state,normalizeWorldPacing({}),[]);assert.equal(state.factions.a.morale,52);
});
test('co-location caps at friendship, events can reach ally, stopping preserves values', () => {
 const common={registry:{a:{locationId:'x'},b:{locationId:'x'}},positions:{},relationshipPace:'standard'};
 let relationships={};for(let worldTurn=1;worldTurn<=300;worldTurn++)relationships=evolveRelationships({...common,relationships,worldTurn}).relationships;
 assert.equal(relationships['a|b'],30);
 for(let worldTurn=301;worldTurn<307;worldTurn++)relationships=evolveRelationships({...common,relationships,worldTurn,agencyMoves:[{npcId:'a',reason:'restock'},{npcId:'b',reason:'restock'}]}).relationships;
 assert(relationships['a|b']>=70);
 assert.deepEqual(evolveRelationships({...common,relationshipPace:'stopped',relationships,worldTurn:400}).relationships,relationships);
});
test('public pacing projection does not disclose hidden regions, markets or opponent', () => {
 const {forge,state}=base();forge.factions[0].foodSupply.marketLocationId='secret';state.factionFoodStatus={a:{status:'shortage',demand:2,received:0}};
 tickFactionConflicts(forge,state,normalizeWorldPacing({}),[]);
 const view=projectWorldPacing(forge,state,['known']);assert.equal(view.regions[0].status,'unconfirmed');assert.equal(view.conflicts.length,0);
 assert(!JSON.stringify(view).includes('SECRET'));assert(!JSON.stringify(view).includes('shortage'));
});
// Adversarial verification: authored references, retained state, clock and settings boundaries.
test('malformed supply references and nonfinite stock cannot create food or NaN', () => {
 for(const id of ['__proto__','constructor','prototype','../market'])assert.equal(parseFactionFoodSupply({marketLocationId:id,commodityId:'grain',dailyDemand:2,reserveTarget:6}),undefined);
 assert.deepEqual(parseFactionFoodStatuses(JSON.parse('{"__proto__":{"status":"shortage"}}')),{});
 assert.deepEqual(parseFactionConflicts({x:{factionA:'__proto__',factionB:'b',phase:'active'}}),{});
 const {forge,state}=base();state.markets.market.grain.stock=NaN;tickFactionFoodSupply(forge,state,normalizeWorldPacing({}),[]);
 assert.equal(state.factions.a.resources.food,0);assert.equal(state.factionFoodStatus.a.status,'unconfigured');
});
test('stopping and resuming conflict preserves power and relation until the rest period ends', () => {
 const {forge,state}=base(),p=normalizeWorldPacing({conflictRestDays:2});
 tickFactionConflicts(forge,state,p,[]);const power=state.factions.a.power;
 for(let i=2;i<=10;i++){state.worldTurn=i;const events=[];tickFactionConflicts(forge,state,{...p,conflictEnabled:false},events);
  assert.equal(state.factions.a.power,power);assert.equal(evolveRelationships({registry:{a:{factionId:'a'},b:{factionId:'b'}},positions:{},relationships:{},worldTurn:i,stepEvents:events}).factionChanges.length,0);}
 state.worldTurn=11;tickFactionConflicts(forge,state,p,[]);assert.equal(state.factionConflicts['a|b'].phase,'resting');
 state.worldTurn=12;tickFactionConflicts(forge,state,p,[]);assert.equal(state.factions.a.power,power);
 state.worldTurn=13;tickFactionConflicts(forge,state,p,[]);assert.equal(state.factions.a.power,power-.5);
});
test('food settings take effect without erasing reserves, and detached parsing retains statuses', () => {
 const {forge,state}=base();state.factions.a.resources.food=30;
 tickFactionFoodSupply(forge,state,normalizeWorldPacing({foodDemandMultiplier:1.5}),[]);assert.equal(state.factions.a.resources.food,27);
 const snapshot=JSON.parse(JSON.stringify(state));assert.deepEqual(parseWorldState(snapshot).factionFoodStatus,state.factionFoodStatus);
 tickFactionFoodSupply(forge,state,normalizeWorldPacing({foodDemandMultiplier:0}),[]);assert.equal(state.factions.a.resources.food,27);
 tickFactionFoodSupply(forge,state,normalizeWorldPacing({foodDemandMultiplier:.5}),[]);assert.equal(state.factions.a.resources.food,26);
});
test('personal speed can stop and resume while existing relationships still affect markets', () => {
 const common={registry:{a:{locationId:'x'},b:{locationId:'x'}},positions:{},relationships:{},worldTurn:1};
 for(const [pace,delta]of [['stopped',undefined],['slow',1],['standard',2],['fast',3]])assert.equal(evolveRelationships({...common,relationshipPace:pace}).relationships['a|b'],delta);
 const stopped=evolveRelationships({...common,relationships:{'a|b':80},relationshipPace:'stopped'});assert.equal(stopped.relationships['a|b'],80);
 const {applyBondMarketEffects}=require('../out/npcBondEffectsCore');
 const input={relationships:stopped.relationships,registry:{a:{locationId:'x'},b:{locationId:'y'}},positions:{},worldTurn:1,
  markets:[{locationId:'x',commodityIds:['grain']},{locationId:'y',commodityIds:['grain']}],marketState:{x:{grain:{stock:5,priceIndex:1}},y:{grain:{stock:5,priceIndex:1}}}};
 const effects=applyBondMarketEffects(input);assert.equal(effects.effects[0].type,'ally_trade');assert.equal(effects.marketState.x.grain.stock,6);assert.equal(effects.marketState.y.grain.stock,6);
 assert.equal(evolveRelationships({...common,relationships:{'a|b':12},relationshipPace:'slow'}).relationships['a|b'],13);
});
console.log(`World pacing: ${count}/${count} passed`);
