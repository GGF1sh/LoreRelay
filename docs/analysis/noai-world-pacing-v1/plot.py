"""Render archived fixture observations only; never executes game simulation."""
import gzip, json, pathlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=pathlib.Path(__file__).resolve().parent
data=json.loads(gzip.decompress((ROOT/'observations.json.gz').read_bytes()))
before=json.loads(gzip.decompress((ROOT.parent/'noai-balance-v1/observations.json.gz').read_bytes()))
runs={r['id']:r for r in data['runs']}
plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False})
colors={'stable':'#27856c','changing':'#3979b5','demanding':'#c04d50'}
def frames(id,limit=300): return [f for f in runs[id]['frames'] if f['worldTurn']<=limit]
def save(fig,name):
    for ext in ['png','svg']:
        target=ROOT/(name+'.'+ext)
        fig.savefig(target,dpi=160,bbox_inches='tight')
        if ext=='svg': target.write_text('\n'.join(line.rstrip() for line in target.read_text(encoding='utf-8').splitlines())+'\n',encoding='utf-8')
    plt.close(fig)

fig,ax=plt.subplots(3,2,figsize=(12,12),layout='constrained')
for preset,color in colors.items():
    idle=frames(f'pacing_{preset}_a_observe_only');route=frames(f'pacing_{preset}_a_merchant_route')
    x=[f['worldTurn'] for f in idle];rx=[f['worldTurn'] for f in route]
    ax[0,0].plot(x,[sum(g['resources']['food'] for g in f['factions'].values())/3 for f in idle],color=color,label=preset)
    ax[0,1].plot(rx,[f['credits'] for f in route],color=color,label=preset)
    for market,style in [('north_farm','-'),('south_port','--')]:
        ax[1,0].plot(rx,[f['markets'][market]['wheat']['priceIndex'] for f in route],color=color,ls=style,label=f'{preset}: {market}')
        ax[1,1].plot(rx,[f['markets'][market]['wheat']['stock'] for f in route],color=color,ls=style,label=f'{preset}: {market}')
    total=0;events=[]
    for f in idle: total+=len(f.get('events',[]));events.append(total)
    ax[2,0].plot(x,events,color=color,label=preset)
    ax[2,1].plot(x,[f['factions']['faction_port']['power'] for f in idle],color=color,label=preset)
titles=['Faction food reserves (idle; mean of 3)','Player credits (merchant route)', 'Wheat price index (route)', 'Wheat stock (route)', 'Cumulative events (idle; not a quality score)', 'Port faction power (idle)']
for a,title in zip(ax.flat,titles): a.set_title(title);a.set_xlabel('World turn');a.grid(alpha=.15)
ax[0,0].legend();ax[1,0].legend(fontsize=8,ncol=2)
fig.suptitle('World pacing recommendations: identical initial fixture, seed balance-a')
save(fig,'recommendations')

fig,ax=plt.subplots(2,2,figsize=(12,8),layout='constrained')
old=next(h for h in before['hosts'] if h['id']=='host-relations-true-balance-a')['frames']
new=data['npc']['frames']
for series,label,col in [(old,'before: legacy Host','#888888'),(new,'after: paced Host','#3979b5')]:
    ax[0,0].plot([f['worldTurn'] for f in series],[max((f.get('relationships') or {}).values(),default=0) for f in series],label=label,color=col)
ax[0,0].axhline(30,ls=':',color='#27856c',label='friend threshold');ax[0,0].set_title('Observed NPC affinity: same co-location Host fixture');ax[0,0].legend()
for id,label in [('pacing_demanding_a_observe_only','demand3; passive supply1'),('pacing_supply_recovery_observe_only','production2 + passive1'),('pacing_supply_surplus_merchant_route','production3; merchant active')]:
    series=frames(id);ax[0,1].plot([f['worldTurn'] for f in series],[sum(v['status']=='shortage' for v in (f.get('foodStatus') or {}).values()) for f in series],label=label)
ax[0,1].set_title('Shortage recovery: number of affected factions');ax[0,1].legend(fontsize=8)
series=frames('pacing_stock_long_merchant_route',1000)
ax[1,0].plot([f['worldTurn'] for f in series],[f['markets']['south_port']['wheat']['stock'] for f in series],color='#c04d50')
ax[1,0].set_title('Remaining surplus stock: core runner extension')
series=data['stock']['frames'];ax[1,1].plot([f['worldTurn'] for f in series],[f['markets']['south_port']['wheat']['stock'] for f in series],label='South Port stock')
ax[1,1].plot([f['worldTurn'] for f in series],[f['factions']['faction_port']['resources']['food'] for f in series],label='Port food reserve')
ax[1,1].set_title('Real Host: repeated imports with local production');ax[1,1].legend()
for a in ax.flat: a.set_xlabel('World turn');a.grid(alpha=.15)
fig.suptitle('Before/after and limits — distinct fixture paths labelled separately')
save(fig,'recovery-and-limits')
