'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'resources', 'browser-start');
const guide = require('../resources/browser-start/settings.guide.json');
const pkg = require('../package.json');
const { DEFAULT_GAME_RULES, normalizeGameRules } = require('../out/gameRulesCore');
const { parseBrowserSetup } = require('../out/browserSetupCore');
const config = pkg.contributes.configuration.properties;
const enums = {
    diceDifficulty: ['Easy', 'Normal', 'Hard'], travelEncounterDensity: ['low', 'medium', 'high'],
    economyProfile: ['abundant', 'plentiful', 'normal', 'scarce', 'barren'],
    merchantTravelMode: ['instant_free', 'world_time'],
    playerRole: ['merchant', 'adventurer', 'retainer', 'smith', 'ruler'],
    aiParticipationPolicy: ['always', 'onDemand', 'simulationOnly'],
};
const gameRules = Object.fromEntries(Object.entries(guide.gameRules).map(([key, description]) => {
    const value = DEFAULT_GAME_RULES[key];
    if (value === undefined) throw new Error(`Missing rule ${key}`);
    const schema = { type: typeof value === 'number' ? 'integer' : typeof value, default: value, description };
    if (enums[key]) schema.enum = enums[key];
    if (typeof value === 'number') {
        schema.minimum = normalizeGameRules({ [key]: -Number.MAX_SAFE_INTEGER })[key];
        schema.maximum = normalizeGameRules({ [key]: Number.MAX_SAFE_INTEGER })[key];
    }
    return [key, schema];
}));
const settings = Object.fromEntries(Object.entries(guide.settings).map(([key, description]) => {
    if (!config[key]) throw new Error(`Missing config ${key}`);
    const { type, default: value, enum: choices, minimum, maximum } = config[key];
    const schema = { type, default: value, description };
    if (choices) schema.enum = choices;
    if (minimum !== undefined) schema.minimum = minimum;
    if (maximum !== undefined) schema.maximum = maximum;
    if (key.endsWith('.volume')) { schema.minimum = 0; schema.maximum = 100; }
    return [key, schema];
}));
const obj = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const str = (maxLength = 2000, required = true) => ({ type: 'string', minLength: required ? 1 : 0, maxLength });
const array = (items, minItems = 0, maxItems = 20) => ({ type: 'array', items, minItems, maxItems });
const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'LoreRelay browser start package v1',
    ...obj({
        format: { const: 'lorerelay-browser-start/1', type: 'string' },
        scenario: obj({
            format: { const: 'text-adventure-scenario/1.0', type: 'string' },
            meta: obj({ title: str(120), description: str(), author: str(120), version: str(40), tags: array(str(80)) }, ['title']),
            setup: obj({
                world: str(10000), protagonist: str(4000), tone: str(4000), rules: str(4000), theme: str(120),
                imageMode: { type: 'string', enum: ['natural', 'none'], default: 'none' },
                playerCharacter: obj({ name: str(120), description: str(4000), personality: str(2000), scenario: str(2000), arrivalReason: str(2000) }, ['name', 'description']),
                gameOver: obj({ mode: { type: 'string', enum: ['relaxed', 'standard', 'hardcore'] }, onHpZero: { type: 'boolean' }, allowImpossibleActions: { type: 'boolean' } }),
            }, ['world', 'protagonist', 'tone', 'playerCharacter']),
            opening: obj({
                narrative: str(12000), summary: str(4000), options: array(str(400), 1, 6),
                status: obj({ location: str(400), time: str(400), condition: str(800), funds: str(400) }),
            }, ['narrative', 'options', 'status']),
        }, ['format', 'meta', 'setup', 'opening']),
        gameRules: obj(gameRules), settings: obj(settings), recommendations: array(str(1000), 1, 20),
    }, ['format', 'scenario', 'gameRules', 'settings', 'recommendations']),
};
const example = {
    format: 'lorerelay-browser-start/1',
    scenario: {
        format: 'text-adventure-scenario/1.0', meta: { title: '霧の港の小さな依頼', description: '会話と探索を中心とした穏やかな冒険' },
        setup: {
            world: '潮風と朝霧に包まれる港町。灯台守から一通の手紙が届いた。',
            protagonist: '旅する記録係のアオ。人の話を聞き、町の小さな謎を記録する。',
            tone: '会話と探索中心。戦闘は控えめ。返答は短めで、次にできることを提示する。', theme: 'modern', imageMode: 'none',
            playerCharacter: { name: 'アオ', description: 'ノートと雨合羽を持つ旅する記録係。灯台守の手紙を頼りに港町へ来た。' },
        },
        opening: { narrative: '朝霧の中、港町へ到着した。手紙には「灯台で待つ」とだけ書かれている。カフェからはパンの香りが漂ってくる。', options: ['灯台へ向かう', 'カフェで話を聞く'], status: { location: '港の遊歩道', time: '朝', condition: '良好', funds: '旅費に余裕あり' } },
    },
    gameRules: guide.presets.lightweight.gameRules, settings: guide.presets.lightweight.settings,
    recommendations: ['環境が不明なので軽量設定を選びました。', '会話と探索を中心に、戦闘と背景シミュレーションを控えます。'],
};
parseBrowserSetup(JSON.stringify(example), schema);
for (const preset of Object.values(guide.presets)) parseBrowserSetup(JSON.stringify({ ...example, gameRules: preset.gameRules, settings: preset.settings }), schema);
const outputs = {
    'settings.schema.json': JSON.stringify(schema, null, 2) + '\n',
    'settings.presets.json': JSON.stringify(guide.presets, null, 2) + '\n',
    'example.json': JSON.stringify(example, null, 2) + '\n',
    'AIに貼る説明.txt': `LoreRelayの新しい冒険を作ってください。次の希望と基準を使い、最後に完成したJSONを一つ返してください。\nファイルを作れる場合はlorerelay-start.jsonとしてダウンロードできる形にしてください。作れない場合はJSONコードブロックを一つ返してください。\n\n【私の希望】\n世界観・主人公・遊び方：ここを書き換える\n速度や文体の希望：ここを書き換える\n利用環境：不明（接続はPCの既存設定を使う）\n\n【選び方と各項目の効果】\n${JSON.stringify(guide, null, 2)}\n\n【出力形式と設定の辞書】\n${JSON.stringify(schema, null, 2)}\n\n【完成例：内容は私の希望に合わせて作り直す】\n${JSON.stringify(example, null, 2)}\n\nこの辞書以外のキーを足さないでください。背景画像・音声の自動生成は初版の起動では無効です。recommendationsに推奨理由と妥協点を書いてください。\n`,
};
for (const [name, content] of Object.entries(outputs)) {
    const target = path.join(dir, name);
    if (process.argv.includes('--check')) {
        if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== content) throw new Error(`Stale browser kit: ${name}`);
    } else fs.writeFileSync(target, content, 'utf8');
}
console.log('Browser start kit: dictionary, presets, example and pasteable prompt agree.');
