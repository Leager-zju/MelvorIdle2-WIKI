// The kernel is shared by the dedicated worker, offline fallback and verifier.
function createCombatKernel(){
 const tickRate=60,workLimit=60000000;
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 function ticks(ms){
  const value=ms/(1000/tickRate),floor=Math.floor(value);
  return Math.max(1,value-floor===.5?floor+(floor%2):Math.round(value));
 }
 function hitChance(accuracy,evasion){
  return accuracy<evasion?accuracy/(2*evasion):1-evasion/(2*accuracy);
 }
 function resistance(power,protection,triangle=0){
  return clamp(clamp(protection/(power+protection),0,.7)*(1+triangle),0,1);
 }
 function damage(raw,factor,ward,maxWard,armour){
  if(raw<=0)return 0;
  return Math.max(1,Math.floor(raw*factor*(maxWard?1-ward/maxWard:1)-armour));
 }
 function createJob({player,profiles,seconds,spawnSeconds,samples,seed}){
  const end=Math.floor(seconds*tickRate),spawn=ticks(spawnSeconds*1000),playerInterval=ticks(player.interval);
  let state=seed>>>0,completed=0,events=0,deaths=0;
  let killSum=0,killSquare=0,hpSum=0,hpSquare=0,remainingSum=0;
  let hp=player.hp,enemyHp=0,ward=0,enemyWard=0,armour=0,enemyArmour=0;
  let playerAt=0,enemyAt=0,spawnAt=spawn,profile,attack,hitIndex=0,trialKills=0,trialDamage=0;
  function random(){
   state=(state+0x6D2B79F5)|0;
   let n=Math.imul(state^(state>>>15),state|1);
   n^=n+Math.imul(n^(n>>>7),n|61);
   return ((n^(n>>>14))>>>0)/4294967296;
  }
  function roll(min,max){return min===max?min:min+Math.floor(random()*(max-min+1));}
  function weighted(rows){
   if(rows.length===1)return rows[0];
   const r=random();
   for(const row of rows)if(r<row.until)return row;
   return rows[rows.length-1];
  }
  function finish(){
   completed++;
   if(!hp)deaths++;
   killSum+=trialKills;killSquare+=trialKills*trialKills;
   hpSum+=trialDamage;hpSquare+=trialDamage*trialDamage;remainingSum+=hp;
   hp=player.hp;trialKills=0;trialDamage=0;spawnAt=spawn;
  }
  function summary(){
   const estimate=(sum,square)=>({mean:sum/completed,margin:completed>1?1.96*Math.sqrt(Math.max(0,(square-sum*sum/completed)/(completed-1)/completed)):0});
   const remaining=remainingSum/completed;
   return {samples:completed,events,seconds,kills:estimate(killSum,killSquare),damage:estimate(hpSum,hpSquare),
    deathRate:deaths/completed,remaining,netLoss:player.hp-remaining};
  }
  function step(limit){
   while(completed<samples&&limit-->0){
    if(++events>workLimit)throw new Error('超过本次计算上限，请缩短时长或减少模拟次数。');
    if(spawnAt!==null){
     if(spawnAt+Math.min(playerInterval,profiles[0].interval)>end&&profiles.length===1){finish();continue;}
     profile=weighted(profiles);
     playerAt=spawnAt+playerInterval;enemyAt=spawnAt+profile.interval;spawnAt=null;
     enemyHp=profile.hp;enemyWard=profile.ward;enemyArmour=profile.armour;
     ward=player.ward;armour=player.armour;attack=weighted(profile.attacks);hitIndex=0;
    }
    const tick=Math.min(playerAt,enemyAt);
    if(tick>end){finish();continue;}
    if(playerAt===tick){
     playerAt+=playerInterval;
     if(profile.playerHit>0&&(profile.playerHit===1||random()<profile.playerHit)){
      let raw=roll(profile.playerMin,profile.playerMax);
      if(player.crit>0&&random()<player.crit)raw=Math.floor(raw*player.critMultiplier);
      if(raw>0){
       const hit=damage(raw,profile.playerFactor,enemyWard,profile.ward,enemyArmour);
       const taken=Math.min(enemyHp,hit);
       enemyHp-=taken;
       if(enemyWard>0)enemyWard--;
       if(hit>=enemyArmour)enemyArmour=0;
       if(player.lifesteal>0)hp=Math.min(player.hp,hp+Math.max(1,Math.floor(taken*player.lifesteal)));
      }
     }
    }
    // The game ticks both actors before processing deaths, with player death resolved first.
    while(enemyAt===tick){
     const hit=attack.hits[hitIndex];
     if(!attack.avoidable||profile.enemyHit===1||(profile.enemyHit>0&&random()<profile.enemyHit)){
      let raw=0;
      for(let i=0;i<hit.damage.length;i++){
       const part=hit.damage[i],kind=part[0];
       raw+=kind===0?roll(part[1],part[2]):Math.trunc((kind===1?enemyHp:hp)*part[2]);
      }
      if(raw>0){
       const amount=damage(raw,attack.factor,ward,player.ward,armour);
       const taken=Math.min(hp,amount);
       hp-=taken;trialDamage+=taken;
       if(ward>0)ward--;
       if(amount>=armour)armour=0;
       if(profile.lifesteal>0&&enemyHp>0)enemyHp=Math.min(profile.hp,enemyHp+Math.max(1,Math.floor(taken*profile.lifesteal)));
      }
     }
     hitIndex++;
     if(hitIndex===attack.hits.length){
      enemyAt+=profile.interval;attack=weighted(profile.attacks);hitIndex=0;
     }else enemyAt+=attack.hits[hitIndex].wait-(hitIndex===1?1:0);
    }
    if(!hp)finish();
    else if(!enemyHp){trialKills++;spawnAt=tick+spawn;}
   }
   return completed===samples;
  }
  return {step,summary,completed:()=>completed};
 }
 return {ticks,hitChance,resistance,damage,createJob};
}

const combatKernel=createCombatKernel();

function combatDropRows(enemy){
 const rows=[],bundle=enemy.Drops||{};
 function add(type,id,row,chance){
  const min=row.MinQuantity??row.Quantity,max=row.MaxQuantity??row.Quantity??min;
  if(id&&Number.isFinite(min)&&Number.isFinite(max)&&max>0&&Number.isFinite(chance)&&chance>0)rows.push({key:type+'/'+shortId(id),min,max,chance});
 }
 for(const row of bundle.FixedItems||[])add('Item',row.Item,row,1);
 for(const row of bundle.FixedCurrencies||[])add('Currency',row.Currency,row,1);
 for(const table of bundle.ItemTables||[]){
  const weight=(table.Table||[]).reduce((sum,row)=>sum+(row.Weight||0),0);
  if(weight>0)for(const row of table.Table)add('Item',row.Item,row,table.Chance*row.Weight/weight);
 }
 return rows;
}

function combatDropTotals(rows,bonus={}){
 const totals=new Map();
 for(const {key,min,max,chance} of rows){
  const bury=byKey.get(key)?.obj.Capabilities?.[G.Namespace+':Bury'];
  const multiplier=key.startsWith('Currency/')?1+(bonus.CurrencyDoublingChance||0):
   (1+(bonus.ItemDoublingChance||0))*(1+(bury?(bonus.BuriableDoublingChance||0):0));
  totals.set(key,(totals.get(key)||0)+(min+max)/2*chance*multiplier);
 }
 return [...totals];
}
function combatDropExpectations(enemy,bonus){return combatDropTotals(combatDropRows(enemy),bonus);}

function combatDropValue(drops){
 return drops.reduce((sum,[key,qty])=>{
  if(key==='Currency/GoldPieces')return sum+qty;
  const price=byKey.get(key)?.obj.SellsFor;
  return sum+(price?.Currency===G.Namespace+':GoldPieces'?qty*price.Quantity:0);
 },0);
}

function enemyCombatCard(entry){
 const enemy=entry.obj,levels=new Map(enemy.Levels.map(r=>[r.Key,r.Value]));
 const stats=new Map(enemy.Stats.Stats.map(r=>[shortId(r.Stat),r.Value]));
 const stances=enemy.Stances.map(r=>byKey.get('AttackStance/'+shortId(r.Stance)));
 const styles=stances.map(stance=>byKey.get('CombatStyle/'+shortId(stance.obj.CombatStyle)));
 const level=Math.max(1,...styles.map(style=>Math.floor(style.obj.CombatLevelRatios.reduce(
  (total,r)=>total+(levels.get(r.Level)??1)*r.Ratio,0))));
 const hp=10*(levels.get(styles[0].obj.MaxHitpointsLevel)??1);
 const badge=(label,value,img)=>'<span class="enemy-stat">'+img+'<span>'+esc(label)+' <b>'+esc(value)+'</b></span></span>';
 const statBadge=(label,value,path)=>badge(label,value,icon({obj:{Icon:'res://Assets/'+path+'.png'}},16));
 const special=[['Armour','Icons/Defence_64'],['MaximumWard','Items/WardingShield'],['Lifesteal','Icons/Lifesteal']]
  .filter(([id])=>stats.get(id)).map(([id,path])=>statBadge(titleOf('CombatStat',id),id==='Lifesteal'?pct(stats.get(id)):fmt(stats.get(id)),path));
 const element=byKey.get('Element/'+shortId(enemy.Element));
 return '<details class="enemy-combat"><summary>战斗属性</summary><div class="enemy-combat-stats">'+
  statBadge('战斗等级',fmt(level),'Icons/Combat_64')+statBadge('生命值',fmt(hp),'Icons/Hitpoints')+special.join('')+
  stances.map((stance,i)=>badge(styles[i].title+' ·',stance.title,icon(styles[i],16))).join('')+
  badge('元素',element.title,icon(element,16))+statBadge('攻击间隔',fmt(stats.get('AttackInterval')/1000)+' 秒','Icons/TimeInterval_48')+
  '</div></details>';
}

const combatAreas=configEntries('Combat','Areas').filter(e=>e.type==='CombatArea'||e.type==='Dungeon').map(area=>{
 const ids=(area.obj.Enemies||[]).flatMap(e=>area.type==='Dungeon'?(e.Enemies||[]).map(r=>r.Enemy):[e]);
 return {area,enemies:[...new Set(ids)].map(id=>byKey.get('Enemy/'+shortId(id))).filter(Boolean)};
}).filter(group=>group.enemies.length);
const markedCombatEnemies=new Set(combatAreas.flatMap(group=>group.enemies));
const unmarkedCombatEnemies=entries.filter(e=>e.type==='Enemy'&&!markedCombatEnemies.has(e));
const simulationAreas=new Map(combatAreas.map(({area,enemies})=>[area.key,enemies]));
if(unmarkedCombatEnemies.length)simulationAreas.set('unmarked',unmarkedCombatEnemies);

function enemyAreaPage(){
 current='';updateList();
 const groups=[['CombatAreas','战斗区域'],['SlayerZones','屠杀者区域'],['DarkAreas','黑暗区域'],['Dungeons','地下城']];
 const sections=new Map(groups.map(([id])=>[id,[]])),loot=savedCombatLoot(playerSave);
 function table(enemies,dungeon=false){
  const rows=enemies.map(e=>{
   const drops=dungeon?[]:combatDropRows(e.obj),value=combatDropValue(combatDropTotals(drops,loot));
   const items=drops.length?'<ul>'+drops.map(row=>{
    const item=byKey.get(row.key),chance=row.chance<.00005?'&lt;0.01%':pct(row.chance);
    return '<li><span>'+(item?icon(item,18)+link(item):'—')+'</span> <span class="drop-roll">× '+quantity(row)+' <span class="drop-chance">'+chance+'</span></span></li>';
   }).join('')+'</ul>':'—';
   return [cell(e.title,eLink(e)+'<small class="en">'+esc(e.en)+'</small>'),cell('',items),cell(value,fmt(value)+' 金币'),cell('',enemyCombatCard(e))];
  });
  return dataTable(['敌人','掉落物、数量与概率','单次击杀价值期望'+(playerSave?'（存档）':''),'战斗属性'],rows,undefined,'enemy-area-table');
 }
 for(const {area,enemies} of combatAreas){
  const dungeon=area.type==='Dungeon';
  const group=dungeon?'Dungeons':shortId(area.obj.Category);
  (sections.get(group)||sections.get('CombatAreas')).push('<h4>'+link(area)+'</h4>'+table(enemies,dungeon));
 }
 if(unmarkedCombatEnemies.length)sections.get('CombatAreas').push('<h4>未标注区域</h4>'+table(unmarkedCombatEnemies));
 const summary=playerSave?'<p class="muted">存档已计入可确认的翻倍几率：物品 '+pct(loot.ItemDoublingChance)+'、可埋葬物额外 '+pct(loot.BuriableDoublingChance)+'、金币 '+pct(loot.CurrencyDoublingChance)+'。临时效果和屠杀任务等有条件的加成未计入。'+(!playerSave.equipment?'重新导入旧存档后可计入当前战斗装备。':'')+'</p>':'';
 $('detail').innerHTML='<h2>敌人</h2><p>'+(markedCombatEnemies.size+unmarkedCombatEnemies.length)+' 个敌人。数量与概率按基础掉落规则列出。'+(playerSave?'存档翻倍计入价值期望。':'')+'单次击杀价值含直接掉落的金币与物品出售价格。</p>'+summary+
  '<div class="toc">'+groups.map(([id,title])=>'<button type="button" data-scroll="enemy-'+esc(id)+'">'+esc(title)+'</button>').join('')+'</div>'+
  groups.map(([id,title])=>'<section id="enemy-'+esc(id)+'"><h3>'+esc(title)+'</h3>'+(id==='Dungeons'?'<p class="muted">地下城中的击杀没有掉落，通关奖励见各地下城条目。</p>':'')+sections.get(id).join('')+'</section>').join('');
}

function combatBaseMaxHit(style,weightedLevel,stat){
 const {Type,Data:d}=style.MaxHitFormula||{},l=weightedLevel(d?.Levels);
 if(shortId(Type)==='StrengthBonus')return Math.floor(22+l+(l+17)*stat(d.StrengthBonusStat)/64);
 if(shortId(Type)==='DamageBonus')return Math.floor(stat(d.MaxHitStat)*(1+stat(d.DamageBonusStat))*(1+(l+1)/200));
 throw new Error('该战斗方式的基础伤害公式尚未支持。');
}

function combatBaseRating(level,bonus){return Math.floor((level+9)*(bonus+64));}

function savedCombatFields(save){
 if(!save?.combatStances||save.combatWeapon===undefined)return null;
 const ns=G.Namespace+':',get=(type,id)=>byKey.get(type+'/'+shortId(id))?.obj;
 const equipped=save.equipment.map(id=>get('Item',id)?.Capabilities);
 const weapon=(save.combatWeapon?get('Item',save.combatWeapon):get('Item','DefaultWeapon'))?.Capabilities;
 const gear=weapon?.[ns+'Weapon'],stances=get('WeaponType',gear?.Type)?.Stances;
 const savedStance=save.combatStances[gear?.Type];
 const stanceId=stances?.includes(savedStance)?savedStance:stances?.[0];
 const stance=get('AttackStance',stanceId),style=get('CombatStyle',stance?.CombatStyle);
 if(!style)return null;
 const spell=style.UsesSpells?get('MagicSpell',save.combatSpell):null;
 const element=(style.UsesSpells?spell?.Element:gear.Elements?.[0])||ns+'Neutral';
 if(!save.combatWeapon)equipped.push(weapon);
 const stats=[...equipped.map(item=>item?.[ns+'Equipment']?.Stats),spell?.Stats];
 const sum=(field,key,id)=>stats.reduce((total,block)=>total+(block?.[field]||[]).reduce((n,row)=>n+(row[key]===id?row.Value:0),0),0);
 const records=[...playerBoostsCache(save),...equippedSaveBoosts(save),
  ...(stance.Bonuses?.Component||[]).filter(m=>!m.Condition&&!m.FromContext).map(m=>({m,times:1}))];
 const modifiers=records.filter(({m})=>m.Stat?.StatsType===ns+'Character'&&m.LocalContext?.Component?.Entity===ns+'Combat'&&
  m.LocalContext.Component.Component==='Player'&&!m.Scaling);
 const bonus=(name,scope={})=>modifiers.reduce((total,{m,times})=>{
  if(m.Stat.Name!==name)return total;
  const context={CombatStyle:stance.CombatStyle,AttackStance:stanceId,Element:element,...scope};
  return Object.entries(m.LocalContext).every(([k,v])=>k==='Component'||v==null||context[k]===v)?total+m.Value*times:total;
 },0);
 const level=id=>Math.trunc(saveLevel(shortId(id),save)+bonus('FlatCombatLevel',{CombatLevel:id}));
 const weightedLevel=rows=>(rows||[]).reduce((total,r)=>total+level(r.Level)*r.Ratio,0);
 const stat=id=>{
  const scope={CombatStat:id},raw=(sum('Stats','Stat',id)+bonus('FlatCombatStatValue',scope))*(1+bonus('PercentCombatStatValue',scope));
  const lower=Math.floor(raw);
  return get('CombatStat',id)?.IsPercent?raw:raw-lower===.5&&lower%2===0?lower:Math.round(raw);
 };
 const max=Math.max(1,Math.floor(combatBaseMaxHit(style,weightedLevel,stat)*(1+bonus('PercentMaxHit'))+bonus('FlatMaxHit')));
 const fields={
  stance:stanceId,damageType:gear.DamageType,element,
  interval:Math.max(250,Math.floor(stat(style.AttackIntervalStat)*(1+bonus('PercentAttackInterval'))+bonus('FlatAttackInterval')))/1000,
  accuracy:Math.max(1,Math.floor(combatBaseRating(weightedLevel(style.AccuracyRatingLevels),stat(stance.AccuracyStat))*(1+bonus('PercentAccuracyRating')))),
  min:Math.min(max,Math.max(1,Math.floor(1+bonus('FlatMinHit')+max*bonus('MinHitBasedOnMaxHit')))),max,
  crit:Math.min(100,Math.max(0,bonus('FlatCriticalHitChance')*100)),critMultiplier:Math.max(1,1.5+bonus('FlatCriticalHitMultiplier')),
  hp:Math.max(1,Math.floor(level(style.MaxHitpointsLevel)*10*(1+bonus('PercentMaxHitpoints'))+bonus('FlatMaxHitpoints'))),
  ward:Math.max(0,stat(style.MaxWardStat)),armour:Math.max(0,stat(style.ArmourStat)),lifesteal:Math.min(100,Math.max(0,stat(style.LifestealStat)*100))
 };
 for(const s of G.Objects.AttackStance||[]){
  const scope={CombatStyle:s.CombatStyle,AttackStance:ns+s.Id},defence=get('CombatStyle',s.CombatStyle);
  const base=combatBaseRating(weightedLevel(defence.EvasionLevels),stat(s.EvasionStat));
  fields['evasion-'+s.Id]=Math.max(1,Math.floor(base*(1+bonus('PercentEvasionRating',scope))+bonus('FlatEvasionRating',scope)));
 }
 for(const d of G.Objects.DamageType||[]){
  const id=ns+d.Id,scope={DamageType:id};
  fields['power-'+d.Id]=Math.max(1,Math.trunc((sum('PowerRatings','DamageType',id)+bonus('FlatPowerRating',scope))*(1+bonus('PercentPowerRating',scope))));
  fields['protection-'+d.Id]=Math.max(0,Math.trunc((sum('ProtectionRatings','DamageType',id)+bonus('FlatProtectionRating',scope))*(1+bonus('PercentProtectionRating',scope))));
 }
 // shortcut: reconstruct stable stats only; extend the estimate when active effects can be tracked over a fight.
 return {fields,missingSpell:style.UsesSpells&&!spell};
}

function compileCombatEnemy(entry,player){
 const enemy=entry.obj,limits=new Set();
 const {ticks,hitChance,resistance}=combatKernel;
 const get=(type,id)=>byKey.get(type+'/'+shortId(id));
 const stat=new Map((enemy.Stats?.Stats||[]).map(r=>[r.Stat,r.Value]));
 const levels=new Map((enemy.Levels||[]).map(r=>[r.Key,r.Value]));
 const getRating=(field,id)=>(enemy.Stats?.[field]||[]).find(r=>r.DamageType===id)?.Value??0;
 const weightedLevel=rows=>(rows||[]).reduce((total,r)=>total+(levels.get(r.Level)??1)*r.Ratio,0);
 const playerStyle=get('AttackStance',player.stance)?.obj.CombatStyle;
 const playerElement=player.element;
 let immune=false,minHitFraction=0;
 for(const id of enemy.Passives||[]){
  const passive=get('CombatPassive',id),mods=passive?.obj.Modifiers;
  let partial=!mods||!!(mods.CombatEffect?.length||mods.Global?.length);
  for(const m of mods?.Component||[]){
   const scope=m.LocalContext;
   const applies=scope?.Component?.Entity===G.Namespace+':Combat'&&scope.Component.Component==='Enemy';
   const fixed=applies&&!m.Condition&&!m.Scaling&&!m.FromContext&&Object.keys(scope).every(k=>['Component','CombatStyle'].includes(k)||scope[k]==null);
   if(fixed&&m.Stat?.Name==='ImmunityFrom')immune||=m.Value>0&&(!scope.CombatStyle||scope.CombatStyle===playerStyle);
   else if(fixed&&!scope.CombatStyle&&m.Stat?.Name==='MinHitBasedOnMaxHit')minHitFraction+=m.Value;
   else partial=true;
  }
  if(partial)limits.add('被动 '+(passive?.title||'（游戏数据未解析）'));
 }
 if(enemy.PauseOnSpawn)limits.add('生成时自动暂停');
 const normal=G.Namespace+':Normal';
 const distribution=new Map();
 for(const r of enemy.Attacks||[])if(r.Chance>0)distribution.set(r.Attack,(distribution.get(r.Attack)||0)+r.Chance);
 const attackTotal=[...distribution.values()].reduce((a,b)=>a+b,0);
 if(attackTotal<1)distribution.set(normal,(distribution.get(normal)||0)+1-attackTotal);
 const weights=Math.max(1,attackTotal);
 const stanceRows=(enemy.Stances||[]).filter(s=>s.Weight>0);
 if(!playerStyle||!stanceRows.length)throw new Error('无法读取该怪物或玩家的攻击姿态。');
 const stanceWeight=stanceRows.reduce((sum,s)=>sum+s.Weight,0);
 let stanceUntil=0;
 const profiles=stanceRows.map(s=>{
  const stance=get('AttackStance',s.Stance)?.obj,style=get('CombatStyle',stance?.CombatStyle)?.obj;
  const defendingStance=get('AttackStance',player.stance).obj;
  const defendingStyle=get('CombatStyle',defendingStance.CombatStyle)?.obj;
  if(!style||!defendingStyle)throw new Error('游戏数据中缺少战斗方式。');
  const max=Math.max(1,combatBaseMaxHit(style,weightedLevel,id=>stat.get(id)||0));
  const min=Math.min(max,Math.max(1,Math.floor(1+max*minHitFraction)));
  const triangle=(G.Objects.CombatTriangleBonus||[]).find(b=>b.PlayerStyle===playerStyle&&b.EnemyStyle===stance.CombatStyle);
  const elemental=(G.Objects.ElementalBonus||[]).find(b=>b.PlayerElement===playerElement&&b.EnemyElement===enemy.Element);
  const bonus=(entry,name)=>(entry?.Bonuses?.Component||[]).filter(m=>m.Stat.Name===name).reduce((n,m)=>n+m.Value,0);
  const playerMax=Math.max(1,Math.floor(player.max*(1+bonus(elemental,'PercentMaxHit'))*(1+bonus(triangle,'MaxHitCombatTriangle'))));
  let attackUntil=0;
  const attacks=[...distribution].map(([id,weight])=>{
   const attackEntry=get('Attack',id),attack=attackEntry?.obj||get('Attack',normal)?.obj;
   if(!attack?.Hits?.length)throw new Error('游戏数据中缺少攻击的伤害配置。');
   if(!attackEntry||attack.PreHitEffects?.length||attack.OnHitEffects?.length)limits.add('攻击效果 '+(attackEntry?.title||'（游戏数据未解析）'));
   const type=attack.DamageType||enemy.DamageType||normal;
   const factor=1-resistance(Math.max(1,getRating('PowerRatings',type)),player.protection[type]??0,bonus(triangle,'ResistanceCombatTriangle'));
   const hits=attack.Hits.flatMap(hit=>{
    const parts=hit.Damage.map(({Character,Formula})=>{
     const kind=shortId(Formula.Type),percent=Formula.Data?.Percent;
     if(Number.isFinite(percent)){
      if(kind==='NormalDamage'&&Character==='Attacker')return [0,Math.trunc(min*percent),Math.trunc(max*percent)];
      if(kind==='MaxHit'&&Character==='Attacker')return [0,Math.trunc(max*percent),Math.trunc(max*percent)];
      if(kind==='CurrentHitpoints'&&['Attacker','Target'].includes(Character))return [Character==='Attacker'?1:2,0,percent];
     }
     limits.add('伤害公式 '+(attackEntry?.title||'（游戏数据未解析）'));
     return [0,0,0];
    });
    return Array.from({length:hit.Count},()=>({damage:parts,wait:ticks(hit.Interval)}));
   });
   if(!hits.length)throw new Error('游戏数据中缺少有效攻击段数。');
   attackUntil+=weight/weights;
   return {hits,until:attackUntil,factor,avoidable:attack.IsAvoidable!==false};
  });
  const evasion=Math.max(1,combatBaseRating(weightedLevel(defendingStyle.EvasionLevels),stat.get(defendingStance.EvasionStat)||0));
  const accuracy=Math.max(1,combatBaseRating(weightedLevel(style.AccuracyRatingLevels),stat.get(stance.AccuracyStat)||0));
  stanceUntil+=s.Weight/stanceWeight;
  return {
   until:stanceUntil,hp:10*(levels.get(style.MaxHitpointsLevel)??1),
   interval:ticks(Math.max(250,stat.get(style.AttackIntervalStat)??250)),
   ward:Math.max(0,Math.trunc(stat.get(style.MaxWardStat)||0)),armour:Math.max(0,Math.trunc(stat.get(style.ArmourStat)||0)),
   lifesteal:Math.max(0,stat.get(style.LifestealStat)||0),attacks,
   playerMin:Math.min(player.min,playerMax),playerMax,playerHit:immune?0:hitChance(player.accuracy,evasion),
   playerFactor:1-resistance(player.power[player.damageType]??1,getRating('ProtectionRatings',player.damageType)),
   enemyHit:hitChance(accuracy,player.evasion[s.Stance]??1)
  };
 });
 return {profiles,limits:[...limits]};
}

function simulationEnemyOptions(area,selected){
 return (simulationAreas.get(area)||[]).map(e=>'<option value="'+esc(e.key)+'"'+(e.key===selected?' selected':'')+'>'+esc(e.title+(e.title!==e.en?' · '+e.en:''))+'</option>').join('');
}
function combatSpawnSeconds(save){
 const {FlatSpawnInterval,PercentSpawnInterval}=savedUnscopedCombatBonuses(save,'Action','CombatAction',{FlatSpawnInterval:0,PercentSpawnInterval:0});
 // CombatActionComponent.OnDataLoaded uses 3000 ms; CombatActionStats applies percent before flat.
 return Math.max(250,Math.trunc(3000*(1+PercentSpawnInterval)+FlatSpawnInterval))/1000;
}
function combatSimulatorPage(){
 stopCombatSimulation();
 const saveStats=savedCombatFields(playerSave),saved=saveStats?.fields;
 const setupNames=['seconds','samples'];
 const previous=$('combat-sim-form')?.elements;
 const setup=previous&&setupNames.map(name=>previous.namedItem(name).value);
 const area=previous?.namedItem('area').value||'CombatArea/GolbinForest';
 const selectedEnemy=previous?.namedItem('enemy').value||'Enemy/Golbin';
 const choices=(type,selected)=>entries.filter(e=>e.type===type).map(e=>
  '<option value="'+esc(G.Namespace+':'+e.obj.Id)+'"'+(e.obj.Id===selected?' selected':'')+'>'+esc(e.title)+'</option>').join('');
 const field=(label,control)=>'<label><span>'+esc(label)+'</span>'+control+'</label>';
 const select=(label,name,options)=>field(label,'<select name="'+esc(name)+'">'+options+'</select>');
 const number=(label,name,value,min,max,step=1)=>field(label,'<input type="number" name="'+esc(name)+'" value="'+esc(saved?.[name]??value)+'" min="'+min+'" max="'+max+'" step="'+step+'" required>');
 const card=(label,fields)=>'<fieldset class="calcform combat-stat-card"><legend>'+esc(label)+'</legend>'+fields+'</fieldset>';
 const areas=[...simulationAreas.keys()].map(key=>'<option value="'+esc(key)+'"'+(key===area?' selected':'')+'>'+esc(byKey.get(key)?.title||'未标注区域')+'</option>').join('');
 const stances=(G.Objects.AttackStance||[]).map(s=>number(titleOf('AttackStance',s.Id),'evasion-'+s.Id,640,1,1000000)).join('');
 const ratings=(G.Objects.DamageType||[]).map(s=>number(titleOf('DamageType',s.Id)+'战力值','power-'+s.Id,63,1,1000000)+
  number(titleOf('DamageType',s.Id)+'防护值','protection-'+s.Id,0,0,1000000)).join('');
 $('detail').innerHTML='<h2>战斗模拟器</h2><p>每次试验从满血开始，击杀后等待重生，玩家死亡时结束。玩家使用普通攻击，可计入面板属性和生命偷取。食物、自动进食、玩家特殊攻击、区域效果、资源消耗和掉落加成超出当前模型范围。</p>'+
  '<form id="combat-sim-form"><section><h3>怪物与模拟时长</h3><div class="combat-setup">'+select('区域','area',areas)+select('怪物','enemy',simulationEnemyOptions(area,selectedEnemy))+
  number('模拟时长（秒）','seconds',60,.1,604800,'any')+number('模拟次数','samples',1024,32,16384)+'</div></section>'+
  '<section><h3>战斗属性</h3><p>'+(saved?'已按存档中的等级、当前装备、姿态、法术和可确认的长期加成估算。可手动调整。祈祷、套装和临时效果未计入。'+
  (saveStats.missingSpell?' 存档未记录当前攻击法术，请核对元素和伤害。':''):playerSave?'请重新导入存档以自动填入战斗属性。':'可在顶栏导入存档，自动填入战斗属性。')+
  ' 模拟会按所选怪物计算战斗三角和元素克制。</p><div class="combat-stat-grid">'+
  card('进攻属性',select('攻击姿态','stance',choices('AttackStance',shortId(saved?.stance)||'Stab'))+select('伤害类型','damageType',choices('DamageType',shortId(saved?.damageType)||'Normal'))+
  select('元素','element',choices('Element',shortId(saved?.element)||'Neutral'))+number('攻击间隔（秒）','interval',2.4,.25,60,'any')+
  number('精准值','accuracy',750,1,1000000)+number('最低伤害','min',1,1,1000000)+number('最高伤害','max',30,1,1000000)+
  number('暴击几率（%）','crit',0,0,100,'any')+number('暴击倍率','critMultiplier',1.5,1,10,'any'))+
  card('躲避值',stances)+'<div class="combat-stat-side">'+card('战力与防护',ratings)+
  card('生命与护甲',number('最大生命值','hp',100,1,1000000)+number('护盾','ward',0,0,1000000)+
  number('护甲','armour',0,0,1000000)+number('生命偷取（%）','lifesteal',0,0,100,'any'))+'</div></div></section>'+
  '<p><button type="submit" id="combat-sim-start">开始模拟</button> <button type="button" id="combat-sim-cancel" disabled>取消模拟</button></p></form>'+
  '<p id="combat-sim-status" role="status"></p><div id="combat-sim-result"></div>';
 if(setup)setupNames.forEach((name,i)=>{$('combat-sim-form').elements.namedItem(name).value=setup[i];});
}

function combatNumber(raw,min,max,integer,label){
 const value=raw===''?NaN:Number(raw);
 if(!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))throw new Error('请输入有效的'+label+'。');
 return value;
}
function readCombatSimulation(form){
 const value=name=>form.elements.namedItem(name).value;
 const number=(...args)=>combatNumber(value(args[0]),...args.slice(1));
 const getRatingRows=(type,prefix,min)=>Object.fromEntries((G.Objects[type]||[]).map(row=>
  [G.Namespace+':'+row.Id,number(prefix+row.Id,min,1000000,true,titleOf(type,row.Id))]));
 const player={
  stance:value('stance'),element:value('element'),damageType:value('damageType'),
  interval:number('interval',.25,60,false,'攻击间隔')*1000,accuracy:number('accuracy',1,1000000,true,'精准值'),
  min:number('min',1,1000000,true,'最低伤害'),max:number('max',1,1000000,true,'最高伤害'),
  crit:number('crit',0,100,false,'暴击几率')/100,critMultiplier:number('critMultiplier',1,10,false,'暴击倍率'),
  hp:number('hp',1,1000000,true,'最大生命值'),ward:number('ward',0,1000000,true,'护盾'),
  armour:number('armour',0,1000000,true,'护甲'),lifesteal:number('lifesteal',0,100,false,'生命偷取')/100,
  evasion:getRatingRows('AttackStance','evasion-',1),power:getRatingRows('DamageType','power-',1),
  protection:getRatingRows('DamageType','protection-',0)
 };
 if(player.min>player.max)throw new Error('最低伤害不能高于最高伤害。');
 const area=value('area'),enemy=simulationAreas.get(area)?.find(e=>e.key===value('enemy'));
 if(!enemy)throw new Error('请选择该区域中的怪物。');
 const {profiles,limits}=compileCombatEnemy(enemy,player);
 const dungeon=byKey.get(area)?.type==='Dungeon';
 const input={player,profiles,seconds:number('seconds',.1,604800,false,'模拟时长'),
  spawnSeconds:combatSpawnSeconds(playerSave),samples:number('samples',32,16384,true,'模拟次数'),seed:Date.now()};
 return {enemy,dungeon,limits,input};
}

function runCombatBatches(kernel,input,send,chunkMs){
 let timer,cancelled=false;
 const job=kernel.createJob(input);
 let last=0;
 function advance(){
  if(cancelled)return;
  const deadline=performance.now()+chunkMs;
  try{
   do{
    if(job.step(2048)){send({result:job.summary()});return;}
   }while(performance.now()<deadline);
   const now=performance.now();
   if(now-last>=150){last=now;send({completed:job.completed()});}
   timer=setTimeout(advance,0);
  }catch(error){send({error:error.message});}
 }
 timer=setTimeout(advance,0);
 return ()=>{cancelled=true;clearTimeout(timer);};
}

let combatSimulation=null;
function stopCombatSimulation(){
 if(!combatSimulation)return;
 combatSimulation.stop?.();
 combatSimulation=null;
}
function combatSimulationResults(enemy,dungeon,limits,result){
 const estimate=x=>fmt(x.mean)+' ± '+fmt(x.margin);
 const drops=(dungeon?[]:combatDropExpectations(enemy.obj)).map(([key,each])=>{
  const entry=byKey.get(key),expected=result.kills.mean*each;
  return [cell(entry?.title||'—',eLink(entry)),cell(each),cell(expected)];
 }).sort((a,b)=>b[2].value-a[2].value);
 const missing=limits.length?'<p class="note">以下机制未计入结果：'+esc(limits.join('、'))+'。它们可能显著改变承伤、击杀数和掉落。</p>':'';
 return '<h3>'+eLink(enemy)+' · 模拟结果</h3>'+missing+
  '<p><b>累计承伤</b> '+estimate(result.damage)+' HP　 <b>预计击杀</b> '+estimate(result.kills)+'　 <b>模拟死亡比例</b> '+pct(result.deathRate)+'</p>'+
  '<p>平均净失血 '+fmt(result.netLoss)+' HP，平均剩余生命 '+fmt(result.remaining)+' HP。</p>'+
  '<p>'+fmt(result.seconds)+' 秒 · '+fmt(result.samples,0)+' 次试验。± 为近似 95% 抽样误差，实际结果还受模型覆盖的机制影响。</p>'+
  '<h3>基础掉落期望</h3>'+(dungeon?'<p class="muted">地下城击杀没有掉落。此处仅模拟所选怪物的重复交战。</p>':drops.length?dataTable(['掉落','每次击杀期望','所选时长内期望'],drops):'<p class="muted">暂无基础掉落。</p>');
}
function startCombatSimulation(form){
 const status=$('combat-sim-status'),resultBox=$('combat-sim-result');
 stopCombatSimulation();
 resultBox.innerHTML='';
 let request;
 try{request=readCombatSimulation(form);}
 catch(error){status.textContent=error.message;return;}
 const {enemy,dungeon,limits,input}=request;
 const start=$('combat-sim-start'),cancel=$('combat-sim-cancel');
 start.disabled=true;cancel.disabled=false;
 status.textContent='正在模拟 '+enemy.title+'…';
 const session={};
 combatSimulation=session;
 function receive(message){
  if(combatSimulation!==session)return;
  if(message.error||message.result){
   stopCombatSimulation();start.disabled=false;cancel.disabled=true;
   status.textContent=message.error||'模拟完成。';
   if(message.result)resultBox.innerHTML=combatSimulationResults(enemy,dungeon,limits,message.result);
  }else status.textContent='已完成 '+fmt(message.completed,0)+' / '+fmt(input.samples,0)+' 次模拟。';
 }
 const fallback=()=>{session.stop=runCombatBatches(combatKernel,input,receive,7);};
 const source='const kernel=('+createCombatKernel.toString()+')();const run='+runCombatBatches.toString()+';onmessage=e=>run(kernel,e.data,data=>postMessage(data),30);';
 try{
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  let worker;
  try{worker=new Worker(url);}catch(error){URL.revokeObjectURL(url);throw error;}
  session.stop=()=>{worker.terminate();URL.revokeObjectURL(url);};
  worker.onmessage=event=>receive(event.data);
  worker.onerror=event=>{
   event.preventDefault();
   if(combatSimulation!==session)return;
   session.stop();fallback();
  };
  worker.postMessage(input);
 }catch{
  session.stop?.();fallback();
 }
}
$('detail').addEventListener('submit',event=>{
 if(event.target.id!=='combat-sim-form')return;
 event.preventDefault();
 startCombatSimulation(event.target);
});
$('detail').addEventListener('change',event=>{
 const {name,value,form}=event.target;
 if(name!=='area'||form?.id!=='combat-sim-form')return;
 const enemy=form.elements.namedItem('enemy');
 enemy.innerHTML=simulationEnemyOptions(value,enemy.value);
});
$('detail').addEventListener('click',event=>{
 if(event.target.id!=='combat-sim-cancel')return;
 stopCombatSimulation();
 $('combat-sim-start').disabled=false;$('combat-sim-cancel').disabled=true;
 $('combat-sim-status').textContent='已取消模拟。';
});
