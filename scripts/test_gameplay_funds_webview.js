'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const read = name => fs.readFileSync(path.join(__dirname, '../webview/modules', name), 'utf8');
const state = read('10-game-state.js'), world = read('85-world.js');
const elements = new Map();
const element = id => {
  if (id === 'dynamic-resources-container' || id === 'world-commerce-details') return null;
  if (!elements.has(id)) elements.set(id, {style:{}, textContent:'', innerHTML:'', classList:{add(){},remove(){}}});
  return elements.get(id);
};
const context = vm.createContext({document:{getElementById:element}, _worldViewMsg:null});
vm.runInContext(state.slice(state.indexOf('let lastNarrativeFunds;'), state.indexOf('function isInputLocked()')), context);
// Execute the actual immediate worldView render entry, not just the leaf formatter.
vm.runInContext(world.slice(world.indexOf('function renderPlayerCommerce('), world.indexOf('function renderPlayerCommerce(') + world.slice(world.indexOf('function renderPlayerCommerce(')).indexOf('\nfunction ', 1)), context);
context.status = Object.freeze({funds:'500 credits, empty wagon'});
vm.runInContext('updateStatus(status)', context);
assert.equal(element('status-funds').textContent, '500 credits, empty wagon');
vm.runInContext('renderPlayerCommerce({credits:488},true,true)',context);
assert.equal(element('status-funds').textContent, '488 credits');
vm.runInContext('_worldViewMsg={enableCommerce:true,playerCommerce:{credits:500}}; updateStatus(status)',context);
assert.equal(element('status-funds').textContent,'500 credits','reload uses canonical funds');
vm.runInContext('renderPlayerCommerce({credits:0},true,true)',context);
assert.equal(element('status-funds').textContent,'0 credits');
assert.equal(element('status-row-funds').style.display,'');
vm.runInContext('renderPlayerCommerce({credits:0},false,true)',context);
assert.equal(element('status-funds').textContent,'500 credits, empty wagon','Commerce OFF retains narrative');
vm.runInContext('renderPlayerCommerce({credits:NaN},true,true)',context);
assert.equal(element('status-funds').textContent,'500 credits, empty wagon');
assert.equal(context.status.funds,'500 credits, empty wagon','display never mutates canonical narrative');
console.log('Gameplay funds projection: passed.');

vm.runInContext(world.slice(world.indexOf('function renderWorldView('), world.indexOf('function renderWorldView(') + world.slice(world.indexOf('function renderWorldView(')).indexOf('\nfunction ', 1)), context);
vm.runInContext('renderWorldView({enabled:false}); updateStatus({funds:"12 silver"})',context);
assert.equal(element('status-funds').textContent,'12 silver','disabled World Forge clears stale commerce projection');
console.log('World disabled after commerce: passed.');

vm.runInContext('_worldViewMsg={enabled:true,currentLocationId:"south_port",locationPinCatalog:[{locationId:"south_port",locationName:"South Port"}]}; updateStatus({location:"Elda Shop"})',context);
assert.equal(element('status-location').textContent,'South Port','reload uses canonical current location');
vm.runInContext('renderStatusLocation({enabled:true,currentLocationId:"elda_shop",locationPinCatalog:[{locationId:"elda_shop",locationName:"Elda Shop"}]})',context);
assert.equal(element('status-location').textContent,'Elda Shop','travel refresh updates status');
vm.runInContext('renderWorldView({enabled:false}); updateStatus({location:"Narrative location"})',context);
assert.equal(element('status-location').textContent,'Narrative location','disabled world restores narrative');
console.log('Gameplay location projection: passed.');
