"""Render the archived measurements; no simulation or game writes. Requires matplotlib."""
import gzip, json, pathlib, hashlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = pathlib.Path(__file__).resolve().parent
data = json.loads(gzip.decompress((ROOT/'observations.json.gz').read_bytes()))
runs = {r['id']: r for r in data['runs']}
tiers = ['abundant', 'plentiful', 'normal', 'scarce', 'barren']
colors = ['#27856c', '#6ba348', '#3979b5', '#d08b31', '#c04d50']
plt.rcParams.update({'font.size': 10, 'axes.spines.top': False, 'axes.spines.right': False, 'figure.facecolor': 'white'})

def series(run, limit=300):
    return [f for f in run['frames'] if f['worldTurn'] <= limit]

def save(fig, name):
    fig.savefig(ROOT/(name+'.png'), dpi=170, bbox_inches='tight')
    fig.savefig(ROOT/(name+'.svg'), bbox_inches='tight')
    plt.close(fig)

def cargo(f):
    c=f.get('cargo', [])
    return sum(x.get('qty',x.get('quantity',0)) for x in c) if isinstance(c,list) else 0

fig, ax = plt.subplots(2,2,figsize=(12,8),layout='constrained')
summary=[]
for tier,col in zip(tiers,colors):
    route=series(runs[f'balance_{tier}_a_merchant_route']); obs=series(runs[f'balance_{tier}_a_observe_only'])
    x=[f['worldTurn'] for f in route]
    ax[0,0].plot(x,[f['credits'] for f in route],label=tier,color=col)
    ax[0,1].plot(x,[cargo(f) for f in route],color=col)
    ax[1,0].plot(x,[f['markets']['south_port']['wheat']['priceIndex'] for f in route],color=col)
    ax[1,1].plot([f['worldTurn'] for f in obs],[f['markets']['south_port']['wheat']['stock'] for f in obs],color=col)
    keys=['worldTurn','credits','cargo','currentLocationId','actionCounts','markets','factions','regions','events']
    canonical=lambda seq:json.dumps([{k:f.get(k) for k in keys} for f in seq],sort_keys=True)
    summary.append({'tier':tier,'cash300':route[-1]['credits'],'cargoUnits300':cargo(route[-1]),'actions300':route[-1]['actionCounts'],
     'routeSeedsEqual':all(canonical(route)==canonical(series(runs[f'balance_{tier}_{s}_merchant_route'])) for s in ['b','c']),
     'observeSeedsEqual':all(canonical(obs)==canonical(series(runs[f'balance_{tier}_{s}_observe_only'])) for s in ['b','c'])})
ax[0,0].axhline(500,color='#666666',ls=':',lw=1,label='initial cash / idle cash')
for a,title,y in zip(ax.flat,['Merchant: cash (not total wealth)','Merchant: unsold cargo','Merchant: South Port wheat price','Idle: South Port wheat stock'],['credits','units','price index','units']):
    a.set(title=title,xlabel='world turn',ylabel=y);a.grid(alpha=.2)
ax[0,0].legend(ncol=2,fontsize=9)
fig.suptitle('Economy tiers | same fixture, world turns 0-300\nSeeds a/b/c are deterministic replications; legacy runner policy sees internal prices',fontsize=13)
save(fig,'economy-comparison')

fig,ax=plt.subplots(2,2,figsize=(12,8),layout='constrained')
recovery=[]
for tier,col in zip(tiers,colors):
    rr=runs[f'noai_famine_{tier}_250']; fs=series(rr)
    market=next(iter(fs[0]['markets'])); item=next(iter(fs[0]['markets'][market])); faction=next(iter(fs[0]['factions']))
    x=[f['worldTurn'] for f in fs]
    ax[0,0].plot(x,[f['markets'][market][item]['priceIndex'] for f in fs],color=col,label=tier)
    ax[0,1].plot(x,[f['markets'][market][item]['stock'] for f in fs],color=col)
    food=[f['factions'][faction]['resources'].get('food') for f in fs]
    ev=[(f['worldTurn'],e.get('category')) for f in fs for e in f.get('events',[])]
    recovery.append({'tier':tier,'market':market,'commodity':item,'faction':faction,'firstFoodZero':next((f['worldTurn'] for f,v in zip(fs,food) if v==0),None),'lastFood':food[-1],'events':ev,'finalPrice':fs[-1]['markets'][market][item]['priceIndex'],'finalStock':fs[-1]['markets'][market][item]['stock']})
    ax[1,0].plot(x,food,color=col)
shock=series(runs['noai_market_shock_recovery'])
for market,items in shock[0]['markets'].items():
    for item in items:
        ax[1,1].plot([f['worldTurn'] for f in shock],[f['markets'][market][item]['stock'] for f in shock],label=market+'/'+item)
for a,title,y in zip(ax.flat,['Famine fixture: first market, first commodity','Famine fixture: matching stock','Famine fixture: first faction food','Existing market-shock fixture: all stocks'],['price index','units','food units','units']):
    a.set(title=title,xlabel='world turn',ylabel=y);a.grid(alpha=.2)
ax[0,0].legend(fontsize=9);ax[1,1].legend(fontsize=7)
fig.suptitle('Existing crisis scenarios | merchant_stress policy\nMarket restocking and faction food reserves are separate state',fontsize=13)
save(fig,'crisis-recovery')

hosts={h['id']:h for h in data['hosts']}
on=hosts['host-relations-true-balance-a']['frames']; off=hosts['host-relations-false-balance-a']['frames']
fig,ax=plt.subplots(2,2,figsize=(12,8),layout='constrained')
x=[f['worldTurn'] for f in on]
for key in on[-1]['relationships']:
    ax[0,0].plot(x,[f.get('relationships',{}).get(key,0) for f in on],label=key)
for key in on[-1]['factionRelationships']:
    ax[0,0].plot(x,[f.get('factionRelationships',{}).get(key,0) for f in on],ls='--',label='factions: merchants / port')
for fac in on[-1]['factions']:
    ax[0,1].plot(x,[f['factions'][fac]['power'] for f in on],label=fac)
    ax[1,0].plot(x,[f['factions'][fac]['resources']['food'] for f in on],label=fac)
# recentChanges is a rolling window: dedupe event IDs; never sum the full window each turn.
for label,frames,color in [('NPC ON',on,'#3979b5'),('NPC OFF',off,'#c04d50')]:
    seen=set();counts=[]
    for f in frames:
        new=[e for e in f.get('events',[]) if e.get('id') not in seen]
        seen.update(e.get('id') for e in new);counts.append(len(new))
    ax[1,1].plot([f['worldTurn'] for f in frames],counts,label=label,color=color)
for a,title,y in zip(ax.flat,['Personal affinity vs faction relationship','Faction power (same ON/OFF trajectory)','Faction food (same ON/OFF trajectory)','New visible event IDs in recentChanges'],['score','power','food units','events / observed turn']):
    a.set(title=title,xlabel='world turn',ylabel=y);a.grid(alpha=.2)
ax[0,0].legend(fontsize=7);ax[0,1].legend(fontsize=7);ax[1,1].legend()
fig.suptitle('Real Host | normal economy, 3 co-located NPCs, authored conflict + food40 + storm10\n120 committed days in each of a/b; incomplete c is not drawn as a successful run',fontsize=12)
save(fig,'host-relations')

fig,ax=plt.subplots(1,2,figsize=(12,4),layout='constrained')
for label,color in [('ally','#27856c'),('enemy','#c04d50')]:
    frames=hosts['host-short-separated_'+label]['frames'];xx=[f['world']['worldTurn'] for f in frames]
    for market,ls in [('north_farm','-'),('south_port','--')]:
        ax[0].plot(xx,[f['world']['markets'][market]['wheat']['stock'] for f in frames],ls=ls,color=color,label=label+' / '+market)
        ax[1].plot(xx,[f['world']['markets'][market]['wheat']['priceIndex'] for f in frames],ls=ls,color=color)
ax[0].set(title='Wheat stock',ylabel='units');ax[1].set(title='Wheat price',ylabel='price index')
for a in ax:a.set_xlabel('world turn');a.grid(alpha=.2)
ax[0].legend(fontsize=8)
fig.suptitle('Real Host | two separated NPCs, initial personal affinity +80 / -80, normal economy')
save(fig,'host-market-bonds')

long=[]
for id,run in runs.items():
    if not id.startswith('balance_long'):continue
    fs=series(run,1000);f=fs[-1]
    long.append({'id':id,'lastWorldTurn':f['worldTurn'],'cash':f['credits'],'cargoUnits':cargo(f),'actionCounts':f['actionCounts'],'factions':f['factions'],'markets':f['markets'],'lastEvents':f['events']})
facts={'matrix':summary,'famine':recovery,'long':long}
(ROOT/'metrics.json').write_text(json.dumps(facts,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(facts,ensure_ascii=False,indent=2))
