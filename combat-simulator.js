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
   return {samples:completed,events,seed,seconds,kills:estimate(killSum,killSquare),damage:estimate(hpSum,hpSquare),
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

function enemyAreaPage(){
 current='';updateList();
 const groups=[['CombatAreas','战斗区域'],['SlayerZones','屠杀者区域'],['DarkAreas','黑暗区域'],['Dungeons','地下城']];
 const sections=new Map(groups.map(([id])=>[id,[]])),seen=new Set(),loot=savedCombatLoot(playerSave);
 const list=entries.filter(e=>e.type==='Enemy');
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
 for(const area of configEntries('Combat','Areas')){
  if(area.type!=='CombatArea'&&area.type!=='Dungeon')continue;
  const dungeon=area.type==='Dungeon';
  const ids=(area.obj.Enemies||[]).flatMap(e=>dungeon?(e.Enemies||[]).map(r=>r.Enemy):[e]);
  const enemies=[...new Set(ids)].map(id=>byKey.get('Enemy/'+shortId(id))).filter(Boolean);
  if(!enemies.length)continue;
  const group=dungeon?'Dungeons':shortId(area.obj.Category);
  for(const enemy of enemies)seen.add(enemy.key);
  (sections.get(group)||sections.get('CombatAreas')).push('<h4>'+link(area)+'</h4>'+table(enemies,dungeon));
 }
 const other=list.filter(e=>!seen.has(e.key));
 if(other.length)sections.get('CombatAreas').push('<h4>未标注区域</h4>'+table(other));
 const summary=playerSave?'<p class="muted">存档已计入可确认的翻倍几率：物品 '+pct(loot.ItemDoublingChance)+'、可埋葬物额外 '+pct(loot.BuriableDoublingChance)+'、金币 '+pct(loot.CurrencyDoublingChance)+'。临时效果和屠杀任务等有条件的加成未计入。'+(!playerSave.equipment?'重新导入旧存档后可计入当前战斗装备。':'')+'</p>':'';
 $('detail').innerHTML='<h2>敌人</h2><p>'+list.length+' 个敌人。数量与概率按基础掉落规则列出。'+(playerSave?'存档翻倍计入价值期望。':'')+'单次击杀价值含直接掉落的金币与物品出售价格。</p>'+summary+
  '<div class="toc">'+groups.map(([id,title])=>'<button type="button" data-scroll="enemy-'+esc(id)+'">'+esc(title)+'</button>').join('')+'</div>'+
  groups.map(([id,title])=>'<section id="enemy-'+esc(id)+'"><h3>'+esc(title)+'</h3>'+(id==='Dungeons'?'<p class="muted">地下城中的击杀没有掉落，通关奖励见各地下城条目。</p>':'')+sections.get(id).join('')+'</section>').join('');
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
  const formula=style.MaxHitFormula;
  const d=formula?.Data||{},l=weightedLevel(d.Levels);
  let max;
  if(shortId(formula?.Type)==='StrengthBonus')max=22+l+(l+17)*(stat.get(d.StrengthBonusStat)||0)/64;
  else if(shortId(formula?.Type)==='DamageBonus')max=(stat.get(d.MaxHitStat)||0)*(1+(stat.get(d.DamageBonusStat)||0))*(1+(l+1)/200);
  else throw new Error('这只怪物的基础伤害公式尚未支持。');
  max=Math.max(1,Math.floor(max));
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
  const evasion=Math.max(1,Math.floor((weightedLevel(defendingStyle.EvasionLevels)+9)*((stat.get(defendingStance.EvasionStat)||0)+64)));
  const accuracy=Math.max(1,Math.floor((weightedLevel(style.AccuracyRatingLevels)+9)*((stat.get(stance.AccuracyStat)||0)+64)));
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

function combatSimulatorPage(){
 stopCombatSimulation();
 const choices=(type,selected)=>entries.filter(e=>e.type===type).map(e=>
  '<option value="'+esc(G.Namespace+':'+e.obj.Id)+'"'+(e.obj.Id===selected?' selected':'')+'>'+esc(e.title)+'</option>').join('');
 const field=(label,control)=>'<label><span>'+esc(label)+'</span>'+control+'</label>';
 const select=(label,name,options)=>field(label,'<select name="'+esc(name)+'">'+options+'</select>');
 const number=(label,name,value,min,max,step=1)=>field(label,'<input type="number" name="'+esc(name)+'" value="'+value+'" min="'+min+'" max="'+max+'" step="'+step+'" required>');
 const card=(label,fields)=>'<fieldset class="calcform combat-stat-card"><legend>'+esc(label)+'</legend>'+fields+'</fieldset>';
 const enemy=entries.filter(e=>e.type==='Enemy').sort((a,b)=>a.title.localeCompare(b.title,'zh-CN')).map(e=>
  '<option value="'+esc(e.key)+'"'+(e.obj.Id==='Golbin'?' selected':'')+'>'+esc(e.title+(e.title!==e.en?' · '+e.en:''))+'</option>').join('');
 const stances=(G.Objects.AttackStance||[]).map(s=>number(titleOf('AttackStance',s.Id),'evasion-'+s.Id,640,1,1000000)).join('');
 const ratings=(G.Objects.DamageType||[]).map(s=>number(titleOf('DamageType',s.Id)+'战力值','power-'+s.Id,63,1,1000000)+
  number(titleOf('DamageType',s.Id)+'防护值','protection-'+s.Id,0,0,1000000)).join('');
 $('detail').innerHTML='<h2>战斗模拟器</h2><p>每次试验从满血开始，击杀后等待重生，玩家死亡时结束。玩家使用普通攻击，可计入面板属性和生命偷取。食物、自动进食、玩家特殊攻击、区域效果、资源消耗和掉落加成超出当前模型范围。</p>'+
  '<form id="combat-sim-form"><section><h3>怪物与模拟时长</h3><div class="combat-setup">'+select('怪物','enemy',enemy)+
  number('模拟时长（秒）','seconds',60,.1,604800,'any')+number('出现与重生间隔（秒）','spawn',3,.25,60,'any')+
  number('模拟次数','samples',1024,32,16384)+number('随机种子','seed',1,0,4294967295)+'</div></section>'+
  '<section><h3>战斗属性</h3><p>输入尚未计入目标克制的面板值。模拟会按所选怪物计算战斗三角和元素克制。</p><div class="combat-stat-grid">'+
  card('进攻属性',select('攻击姿态','stance',choices('AttackStance','Stab'))+select('伤害类型','damageType',choices('DamageType','Normal'))+
  select('元素','element',choices('Element','Neutral'))+number('攻击间隔（秒）','interval',2.4,.25,60,'any')+
  number('精准值','accuracy',750,1,1000000)+number('最低伤害','min',1,1,1000000)+number('最高伤害','max',30,1,1000000)+
  number('暴击几率（%）','crit',0,0,100,'any')+number('暴击倍率','critMultiplier',1.5,1,10,'any'))+
  card('躲避值',stances)+'<div class="combat-stat-side">'+card('战力与防护',ratings)+
  card('生命与护甲',number('最大生命值','hp',100,1,1000000)+number('护盾','ward',0,0,1000000)+
  number('护甲','armour',0,0,1000000)+number('生命偷取（%）','lifesteal',0,0,100,'any'))+'</div></div></section>'+
  '<p><button type="submit" id="combat-sim-start">开始模拟</button> <button type="button" id="combat-sim-cancel" disabled>取消模拟</button></p></form>'+
  '<p id="combat-sim-status" role="status"></p><div id="combat-sim-result"></div>';
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
 const enemy=byKey.get(value('enemy'));
 if(enemy?.type!=='Enemy')throw new Error('请选择一个怪物。');
 const {profiles,limits}=compileCombatEnemy(enemy,player);
 const input={player,profiles,seconds:number('seconds',.1,604800,false,'模拟时长'),
  spawnSeconds:number('spawn',.25,60,false,'重生间隔'),samples:number('samples',32,16384,true,'模拟次数'),
  seed:number('seed',0,4294967295,true,'随机种子')};
 return {enemy,limits,input};
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
function combatSimulationResults(enemy,limits,result){
 const estimate=x=>fmt(x.mean)+' ± '+fmt(x.margin);
 const drops=combatDropExpectations(enemy.obj).map(([key,each])=>{
  const entry=byKey.get(key),expected=result.kills.mean*each;
  return [cell(entry?.title||'—',eLink(entry)),cell(each),cell(expected)];
 }).sort((a,b)=>b[2].value-a[2].value);
 const missing=limits.length?'<p class="note">以下机制未计入结果：'+esc(limits.join('、'))+'。它们可能显著改变承伤、击杀数和掉落。</p>':'';
 return '<h3>'+eLink(enemy)+' · 模拟结果</h3>'+missing+
  '<p><b>累计承伤</b> '+estimate(result.damage)+' HP　 <b>预计击杀</b> '+estimate(result.kills)+'　 <b>模拟死亡比例</b> '+pct(result.deathRate)+'</p>'+
  '<p>平均净失血 '+fmt(result.netLoss)+' HP，平均剩余生命 '+fmt(result.remaining)+' HP。</p>'+
  '<p>'+fmt(result.seconds)+' 秒 · '+fmt(result.samples,0)+' 次试验 · 种子 '+fmt(result.seed,0)+'。± 为近似 95% 抽样误差，实际结果还受模型覆盖的机制影响。</p>'+
  '<h3>基础掉落期望</h3>'+(drops.length?dataTable(['掉落','每次击杀期望','所选时长内期望'],drops):'<p class="muted">暂无基础掉落。</p>');
}
function startCombatSimulation(form){
 const status=$('combat-sim-status'),resultBox=$('combat-sim-result');
 stopCombatSimulation();
 resultBox.innerHTML='';
 let request;
 try{request=readCombatSimulation(form);}
 catch(error){status.textContent=error.message;return;}
 const {enemy,limits,input}=request;
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
   if(message.result)resultBox.innerHTML=combatSimulationResults(enemy,limits,message.result);
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
$('detail').addEventListener('click',event=>{
 if(event.target.id!=='combat-sim-cancel')return;
 stopCombatSimulation();
 $('combat-sim-start').disabled=false;$('combat-sim-cancel').disabled=true;
 $('combat-sim-status').textContent='已取消模拟。';
});
