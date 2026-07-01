const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const { generateQuestHooks, MAX_QUEST_HOOKS } = require(path.join(root, 'out', 'questGeneratorCore.js'));
const { parseWorldState } = require(path.join(root, 'out', 'worldStateCore.js'));

function makeWorldState() {
  return {
    format: 'lorerelay-world-state/1.1',
    worldTurn: 7,
    factions: {},
    regions: {},
    globalEvents: [],
    recentChanges: [
      {
        id: 'wce_7_resource_food_crisis',
        worldTurn: 7,
        source: 'simulation',
        category: 'resource',
        severity: 'warning',
        regionId: 'hearthmere',
        message: 'Food stores are running low.',
      },
      {
        id: 'wce_7_region_safe',
        worldTurn: 7,
        source: 'simulation',
        category: 'region',
        severity: 'info',
        regionId: 'sunmeadow',
        message: 'The patrol roads are calm.',
      },
    ],
    questHooks: [],
  };
}

function makeRegistry() {
  return {
    format: 'lorerelay-npc-registry/1.0',
    npcs: {
      captain_elowen: {
        name: 'Captain Elowen',
        disposition: { playerTrust: 50, playerRomance: 0, playerFear: 0, mood: 'worried', lastInteractionTurn: 0 },
        memories: [],
        needs: [
          {
            id: 'missing_supplies',
            type: 'material',
            description: 'The training yard needs replacement practice blades.',
            urgency: 75,
            relatedEventId: null,
          },
        ],
      },
    },
  };
}

{
  const state = makeWorldState();
  generateQuestHooks(state, makeRegistry());
  assert.strictEqual(state.questHooks.length, 2, 'warning event + urgent NPC need should create two quest hooks');
  assert(state.questHooks.some((q) => q.source === 'event' && q.relatedId === 'wce_7_resource_food_crisis'));
  assert(state.questHooks.some((q) => q.source === 'npc' && q.relatedId === 'need_captain_elowen_missing_supplies'));
  assert(!state.questHooks.some((q) => q.relatedId === 'wce_7_region_safe'), 'info events should not become quests');

  generateQuestHooks(state, makeRegistry());
  assert.strictEqual(state.questHooks.length, 2, 'running generation twice must not duplicate related quest hooks');
}

{
  const state = makeWorldState();
  state.questHooks = Array.from({ length: MAX_QUEST_HOOKS + 5 }, (_, i) => ({
    id: `quest_old_${i}`,
    title: `Old quest ${i}`,
    description: 'old',
    source: 'event',
    relatedId: `old_${i}`,
    status: i === 0 ? 'active' : 'completed',
    turnGenerated: i,
  }));
  generateQuestHooks(state, undefined);
  assert(state.questHooks.length <= MAX_QUEST_HOOKS, 'quest hooks should be capped');
  assert.strictEqual(state.questHooks[0].status, 'active', 'active quests should be kept before old completed hooks');
}

{
  const raw = {
    format: 'lorerelay-world-state/1.1',
    worldTurn: 1,
    factions: {},
    questHooks: [
      {
        id: 'quest_valid',
        title: 'x'.repeat(200),
        description: 'y'.repeat(1000),
        source: 'event',
        relatedId: 'wce_1_region_test',
        status: 'active',
        turnGenerated: 1.9,
      },
      {
        id: '../bad',
        title: 'bad',
        description: 'bad',
        source: 'event',
        relatedId: 'bad',
        status: 'available',
        turnGenerated: 1,
      },
    ],
  };
  const parsed = parseWorldState(raw);
  assert(parsed, 'world state should parse');
  assert.strictEqual(parsed.questHooks.length, 1, 'invalid quest IDs should be dropped');
  assert.strictEqual(parsed.questHooks[0].title.length, 120, 'quest title should be clamped');
  assert.strictEqual(parsed.questHooks[0].description.length, 600, 'quest description should be clamped');
  assert.strictEqual(parsed.questHooks[0].turnGenerated, 1, 'turnGenerated should be floored');
}

console.log('quest generator tests passed.');
