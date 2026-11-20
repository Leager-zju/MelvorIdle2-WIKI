// Player save import: decode a save file (.sav, Brotli → binary) or an exported save string (Base64 → Brotli →
// binary) into the long-lasting
// bonuses a player owns, then recompute the recipe table (XP, cycle time, expected product value).
// Format read from the game's SaveReader / component ReadFrom IL (save version 31): every entity and
// component is length-prefixed, so unknown parts are skipped by size.
const SAVE_STORAGE_KEY='save';
const SAVE_MIN_VERSION=29;// the newest layout this reader was checked against is 31; older layouts differ in the experience block

function saveReader(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),utf8=new TextDecoder('utf-8',{fatal:true});
 let p=0;
 const need=n=>{if(n<0||p+n>bytes.length)throw new Error('存档内容不完整或格式无法识别。');};
 const r={
  get pos(){return p;},set pos(v){p=v;},
  u8(){need(1);return bytes[p++];},
  bool(){return r.u8()!==0;},
  i32(){need(4);const v=view.getInt32(p,true);p+=4;return v;},
  i64(){need(8);const v=Number(view.getBigInt64(p,true));p+=8;return v;},
  f64(){need(8);const v=view.getFloat64(p,true);p+=8;return v;},
  n7(){let v=0,shift=0;for(;;){const x=r.u8();v|=(x&0x7f)<<shift;if(x<0x80)return v;shift+=7;if(shift>28)throw new Error('存档内容格式无法识别。');}},
  str(){const n=r.n7();need(n);const v=utf8.decode(bytes.subarray(p,p+n));p+=n;return v;},
  skip(n){need(n);p+=n;},
  count(){const n=r.i32();if(n<0||n>1e6)throw new Error('存档内容格式无法识别。');return n;},
  region(read){const n=r.count(),end=p+n;need(n);const v=read(end);p=end;return v;}
 };
 return r;
}

// Brotli-compressed save (a .sav / .bak file, or a Base64-decoded export string) → raw save bytes. The game's
// Brotli stream omits its final empty block, so if a plain decode fails, one "last, empty" meta-block byte
// (0x03) is appended and decoding is retried.
function decompressSave(bytes){
 const padded=new Uint8Array(bytes.length+1);padded.set(bytes);padded[bytes.length]=3;
 for(const input of [padded.subarray(0,bytes.length),padded]){
  try{const raw=BrotliDecode(new Int8Array(input.buffer,input.byteOffset,input.length));return new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength);}catch{}
 }
 throw new Error('存档解压失败：请确认是游戏“导出存档”得到的完整字符串，或存档目录中的 .sav 文件。');
}
function decodeSaveString(text){
 const clean=String(text||'').replace(/\s+/g,'');
 if(!clean)throw new Error('请选择存档文件，或粘贴游戏导出的存档字符串。');
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)||clean.length%4)throw new Error('这不是有效的存档字符串：只能包含 Base64 字符。');
 let binary;try{binary=atob(clean);}catch{throw new Error('这不是有效的存档字符串：Base64 解码失败。');}
 return decompressSave(Uint8Array.from(binary,c=>c.charCodeAt(0)));
}

function parseSave(bytes){
 const r=saveReader(bytes),version=r.i32();
 if(version<SAVE_MIN_VERSION)throw new Error('存档版本 '+version+' 过旧，请在当前版本游戏中重新导出。');
 r.skip(16);const character=r.str();r.str();r.i64();for(let i=0;i<4;i++)r.str();
 const totalLevel=r.i32();r.i64();r.i64();r.bool();
 const save={version,character,totalLevel,xp:{},toolbelt:{},equipment:[],pets:{},tasks:{},shop:{},astrology:{},hunting:{journal:{},animals:{}}};
 const entities=r.count();
 for(let i=0;i<entities;i++){
  const entity=shortId(r.str());
  r.region(end=>{const components=r.count();for(let j=0;j<components;j++){const component=r.str();r.region(cend=>readSaveComponent(r,save,entity,component,cend));}});
 }
 return save;
}

function readSaveComponent(r,save,entity,component,end){
 if(component==='Experience'&&end-r.pos===8)save.xp[entity]=r.f64();
 else if(component==='Toolbelt'&&end-r.pos>=4){
  const slots={};for(let n=r.count();n>0;n--){const slot=r.str();r.region(()=>{const qty=r.i32();if(r.bool())slots[slot]={item:r.str(),qty};});}
  save.toolbelt[entity]=slots;
 }else if(entity==='Combat'&&component==='Equipment'){
  // The active slots come before saved loadouts. Occupied secondary slots add no bonuses.
  save.combatWeapon=null;
  for(let n=r.count();n>0;n--){const slot=shortId(r.str());r.region(()=>{r.i32();const occupied=r.bool();if(r.bool()){const item=r.str();if(!occupied){save.equipment.push(item);if(slot==='Weapon')save.combatWeapon=item;}}});}
 }else if(entity==='Combat'&&component==='Player'&&save.version<=31){
  // PlayerComponent writes three regions, then the inline idle, attack or stunned turn.
  for(let i=0;i<3;i++)r.region(()=>{});
  const turn=r.i32();
  if(turn<0||turn>2)return;
  r.bool();
  if(turn===1){r.str();r.skip(29);} // Hit timer (13 bytes) and four counters.
  if(turn===2){r.str();r.i32();}
  r.skip(12);
  for(let n=r.count();n>0;n--)r.str();
  r.bool();
  const stances=[];
  for(let n=r.count();n>0;n--)stances.push([r.str(),r.str()]);
  if(r.pos<=end)save.combatStances=Object.fromEntries(stances);
 }else if(entity==='Combat'&&component==='MagicSpells'&&save.version<=31){
  if(r.bool())save.combatSpell=r.str();
 }else if(component==='Pets'){
  const pets=[];for(let n=r.count();n>0;n--){const pet=r.str();r.region(()=>{if(r.bool())pets.push(pet);});}
  save.pets[entity]=pets;
 }else if(component==='MasteryGuild'){
  if(r.bool())r.str();
  const done=[];
  for(let n=r.count();n>0;n--){const task=r.str();r.region(()=>{
   const goal=byKey.get('MasteryGuildTask/'+shortId(task))?.obj;
   const activeGoal=r.bool();
   let complete=!goal?.Goal;if(activeGoal){r.str();complete=r.region(()=>{r.f64();return r.bool();});}
   const triggerMet=r.bool();
   // shortcut: condition goals are evaluated by the game; keep them visible until their state can be verified from the save.
   if(goal&&!goal.ConditionGoal&&complete&&(!goal.TriggerGoal||triggerMet))done.push(task);
  });}
  save.tasks[entity]=done;
 }else if(entity==='Shop'&&component==='Shop'){
  r.bool();r.bool();r.bool();r.i32();r.i32();
  for(let n=r.count();n>0;n--){const amount=r.i32();save.shop[r.str()]=amount;}
 }else if(entity==='Astrology'&&component==='Action')readSaveAstrology(r,save);
 else if(entity==='Hunting'&&component==='Journal'){
  for(let n=r.count();n>0;n--){const id=r.str();r.region(()=>{r.bool();save.hunting.journal[id]=r.f64();});}
 }else if(entity==='Hunting'&&component==='Action')readSaveHunting(r,save.hunting.animals);
}

function readSaveHunting(r,animals){
 r.bool();r.bool();r.skip(12); // ActionComponent and TickTimer
 for(let n=r.count();n>0;n--){const id=r.str();r.region(()=>{
  r.skip(12);const trap=r.bool()?r.str():null;
  r.bool();if(r.bool())r.str();
  r.i32();const bait=r.bool();r.skip(9);
  animals[id]={trap,bait,trapless:r.bool()};
 });}
}

// AstrologyActionComponent: ActionComponent (IsStarted), TickTimer (bool + 3 × int32), two view flags,
// then one region per constellation: knowledge, unlocked minor nodes, unlocked major nodes.
function readSaveAstrology(r,save){
 r.bool();r.bool();r.i32();r.i32();r.i32();r.bool();r.bool();
 for(let n=r.count();n>0;n--){const id=r.str();r.region(()=>{r.f64();const nodes=[];for(let m=r.count();m>0;m--)nodes.push(r.str());for(let m=r.count();m>0;m--)nodes.push(r.str());save.astrology[id]=nodes;});}
}

// ---------- Player bonuses ----------
function saveLevel(skill,save){const xp=save.xp[skill];if(!Number.isFinite(xp))return 1;let level=1;while(level<99&&xpForLevel(level+1)<=xp)level++;return level;}
function masteryRankKey(skill,save){
 const tasks=configEntries(skill,'MasteryGuildTasks'),ranks=configEntries(skill,'MasteryGuildRanks');if(!ranks.length)return null;
 const done=new Set(save.tasks[skill]||[]),total=masteryTotalPoints(skill);
 const have=tasks.filter(t=>done.has(G.Namespace+':'+t.obj.Id)).reduce((s,t)=>s+(masteryTaskCategory(t)?.obj.BasePoints||0),0);
 let rank=0;for(let i=1;i<ranks.length&&have>=Math.ceil(total*ranks[i].obj.PointPercentRequired);i++)rank=i;
 return {rank:ranks[rank],index:rank,have,total};
}
// Owned long-lasting sources: equipped toolbelt items, shop purchases, astrology nodes (+ per-node constellation
// bonuses), unlocked pets and mastery-guild rank rewards. Potions, sets, events and combat effects are left out.
function playerSources(save){
 const owned=new Map(),add=(key,times=1,label='')=>{if(byKey.has(key))owned.set(key,{times:(owned.get(key)?.times||0)+times,label});};
 for(const [skill,slots] of Object.entries(save.toolbelt))for(const s of Object.values(slots))add('Item/'+shortId(s.item),1,skillName(skill)+' 工具腰带');
 for(const [id,n] of Object.entries(save.shop))if(n>0)add('ShopPurchase/'+shortId(id),n,'商店');
 for(const [id,nodes] of Object.entries(save.astrology)){
  const c=byKey.get('AstrologyConstellation/'+shortId(id)),minor=nodes.filter(n=>c?.obj.MinorNodes?.includes(n));
  for(const n of nodes)add('AstrologyNode/'+shortId(n),1,'占星');
  if(minor.length)add('AstrologyConstellation/'+shortId(id),minor.length,'占星（每个小节点）');
 }
 for(const pets of Object.values(save.pets))for(const p of pets)add('Pet/'+shortId(p),1,'宠物');
 for(const s of skillEntries){const m=masteryRankKey(s.id,save);if(!m)continue;
  for(const b of configEntries(s.id,'MasteryGuildBonuses')){const need=(b.obj.Requirements||[]).map(q=>q.Data?.Rank).filter(Boolean);
   if(need.length&&need.every(id=>configEntries(s.id,'MasteryGuildRanks').findIndex(r=>G.Namespace+':'+r.obj.Id===id)<=m.index))add(b.key,1,'精通公会');}
 }
 return owned;
}
// Which bonus records count: owned source, item bonuses only from the toolbelt capability, no conditions / triggers.
function unconditionalSaveBoost(r){return !r.m.Condition&&!r.m.FromContext&&!r.gates.some(g=>g.ItemCount||g.Duration||g.Turns||g.Charges||g.Trigger);}
function playerBoosts(save){
 const owned=playerSources(save),records=[];
 for(const r of boostRecords){
  const o=owned.get(r.key);if(!o||!unconditionalSaveBoost(r))continue;
  if(r.key.startsWith('Item/')&&!r.path.includes(':Toolbelt'))continue;
  if(r.key.startsWith('AstrologyConstellation/')&&!/PerMinorNodeBonuses/.test(r.path))continue;
  records.push({...r,times:r.key.startsWith('ShopPurchase/')||r.key.startsWith('AstrologyConstellation/')?o.times:1,label:o.label});
 }
 return records;
}

// Does a bonus apply to this recipe? Every non-null local-context field must match the recipe.
function boostAppliesTo(m,skill,e){
 if(m.StatGroup)return m.StatGroup==='GlobalPercentActionInterval';
 const ctx=m.LocalContext||{},o=e.obj,id=G.Namespace+':'+o.Id;
 if(shortId(ctx.Component?.Entity)!==skill)return false;
 for(const [k,v] of Object.entries(ctx)){
  if(v==null||k==='Component')continue;
  if(k==='Recipe'){if(v!==id)return false;}
  else if(k==='Category'){if(v!==o.Category)return false;}
  else if(k==='Subcategory'){if(v!==o.Subcategory)return false;}
  else if(k==='Location'){if(v!==o.Location)return false;}
  else return false;// item / currency / effect specific bonuses are not part of the base recipe numbers
 }
 return true;
}
const recipeSkillTypes={WoodcuttingRecipe:'Woodcutting',MiningRecipe:'Mining',FishingRecipe:'Fishing',CookingRecipe:'Cooking',FiremakingRecipe:'Firemaking',FarmingRecipe:'Farming',HerbloreRecipe:'Herblore',ThievingRecipe:'Thieving',GrainMillRecipe:'Farming'};
function recipeSkill(e){return recipeSkillTypes[e.type]||skillOfEntry(e);}
// Interval-type stats per recipe phase: fishing has min / max, herblore has one per step.
const intervalStats={PercentInterval:'all',GlobalPercentActionInterval:'all',PercentMinInterval:'min',PercentMaxInterval:'max',PercentPreparingInterval:'BasePreparingInterval',PercentHeatingInterval:'BaseHeatingInterval',PercentStirringInterval:'BaseStirringInterval',PercentBottlingInterval:'BaseBottlingInterval'};
const flatIntervalStats={FlatInterval:'all',FlatMinInterval:'min',FlatMaxInterval:'max'};
function boostTotals(save,skill,e){
 const t={xp:0,percent:{},flat:{},doubling:0,quantity:0,percentQuantity:0,applied:[]};
 for(const r of playerBoostsCache(save)){
  if(!boostAppliesTo(r.m,skill,e))continue;
  const stat=r.m.StatGroup||r.m.Stat.Name,type=r.m.StatGroup?'':shortId(r.m.Stat.StatsType);
  const scale=r.m.Scaling?.Data?.Experience?saveLevel(shortId(r.m.Scaling.Data.Experience.Entity),save):1,v=r.m.Value*scale*r.times;
  let used=true;
  if(type==='Experience'&&stat==='PercentXPGained')t.xp+=v;
  else if(intervalStats[stat])t.percent[intervalStats[stat]]=(t.percent[intervalStats[stat]]||0)+v;
  else if(flatIntervalStats[stat])t.flat[flatIntervalStats[stat]]=(t.flat[flatIntervalStats[stat]]||0)+v;
  else if(stat==='DoublingChance')t.doubling+=v;
  else if(stat==='FlatProductQuantity')t.quantity+=v;
  else if(stat==='PercentProductQuantity')t.percentQuantity+=v;
  else used=false;
  if(used)t.applied.push(r);
 }
 return t;
}
let playerBoostsMemo=null;
function playerBoostsCache(save){if(playerBoostsMemo?.save!==save)playerBoostsMemo={save,records:playerBoosts(save)};return playerBoostsMemo.records;}

function equippedSaveBoosts(save){
 return (save.equipment||[]).flatMap(id=>(boostByOwner.get('Item/'+shortId(id))||[])
  .filter(r=>r.path.startsWith('Capabilities.MelvorBase:Equipment.Bonuses.')&&unconditionalSaveBoost(r)).map(r=>({...r,times:1})));
}
function savedCombatLoot(save){
 const chances={ItemDoublingChance:0,BuriableDoublingChance:0,CurrencyDoublingChance:0};
 if(!save)return chances;
 for(const {m,times} of [...playerBoostsCache(save),...equippedSaveBoosts(save)]){
  const ctx=m.LocalContext,stat=m.Stat?.Name;
  if(m.Stat?.StatsType!==G.Namespace+':CombatLoot'||!(stat in chances)||ctx?.Component?.Entity!==G.Namespace+':Combat'||ctx.Component.Component!=='Loot')continue;
  if(Object.keys(ctx).some(k=>k!=='Component'&&ctx[k]!=null))continue;
  const experience=m.Scaling?.Data?.Experience;
  if(m.Scaling&&!experience)continue;
  chances[stat]+=m.Value*times*(experience?saveLevel(shortId(experience.Entity),save):1);
 }
 for(const k of Object.keys(chances))chances[k]=Math.min(1,Math.max(0,chances[k]));
 return chances;
}

// Interval formulas from each skill's *ActionStats (IL): artisan / herblore / cooking add the flat bonus
// after the percent, the others before it. Never below 1 ms.
const flatAfterPercent=new Set(['ArtisanRecipe','HerbloreRecipe','CookingRecipe']);
function scaledInterval(e,base,percent=0,flat=0){return Math.max(1,Math.floor(flatAfterPercent.has(e.type)?base*(1+percent)+flat:(base+flat)*(1+percent)));}
// Cycle time with the player's bonuses, following recipeTime's per-skill breakdown.
function savedRecipeTime(e,t){
 const o=e.obj,all=t.percent.all||0,flat=t.flat.all||0,at=(base,p=0,f=0)=>scaledInterval(e,base,all+p,flat+f);
 if(e.type==='FishingRecipe'){// FishingActionStats.GetIntervalRange: a max below the min is raised to the min
  const min=at(o.BaseMinInterval,t.percent.min,t.flat.min),max=Math.max(min,at(o.BaseMaxInterval,t.percent.max,t.flat.max));
  return (min+max)/2;
 }
 if(e.type==='HerbloreRecipe')return ['BasePreparingInterval','BaseHeatingInterval','BaseStirringInterval','BaseBottlingInterval'].reduce((s,k)=>s+at(o[k],t.percent[k]),0);
 if(e.type==='WoodcuttingRecipe')return at(o.BaseInterval)*o.BaseMaxHealth;
 if(e.type==='ArtisanRecipe')return at(o.BaseInterval)*Math.max(1,o.Steps);
 const base=recipeTime(e);return base?at(base):base;
}
// Recipe numbers with the player's bonuses; with no save they equal the base columns.
function savedRecipeStats(e,save){
 const skill=recipeSkill(e),xp=e.obj.BaseExperience;
 if(!save||!skill)return {xp,ms:recipeTime(e),value:recipeValue(e),applied:[]};
 const t=boostTotals(save,skill,e),double=1+Math.min(1,Math.max(0,t.doubling));
 const value=(recipeValue(e)*(1+t.percentQuantity)+t.quantity*primaryValue(e))*double;
 return {xp:xp==null?xp:xp*(1+t.xp),ms:recipeTime(e)?savedRecipeTime(e,t):null,value,applied:t.applied};
}

function huntingJournalLevel(xp){
 const root=2**(1/7);
 let level=1;
 for(let next=2;next<=25;next++){
  const threshold=Math.floor((next*next-next+100*(2**(next/3.5)-root)/(root-1))/12);
  if(!(xp>=threshold))break;
  level=next;
 }
 return level;
}

function huntingModifiers(e,save,setting){
 const animal=e.obj,id=G.Namespace+':'+animal.Id;
 const level=animal.LogToJournal?huntingJournalLevel(save?.hunting?.journal?.[id]):1;
 const trapless=animal.EnableTrapless&&setting?.trapless;
 const trap=trapless?null:itemEntry(setting?.trap)?.obj;
 const cap=trap?.Capabilities?.[G.Namespace+':HuntingTrap'];
 const compatible=cap?.TrapType===animal.TrapType?cap:null;
 const totals={},failure={};
 const scope={Animal:id,Location:animal.Location,Tool:animal.Tool,TrapType:animal.TrapType};
 const add=(target,m,times)=>{
  const global={GlobalFlatActionInterval:'Flat',GlobalPercentActionInterval:'Percent'}[m.StatGroup];
  if(global){
   for(const phase of ['Tracking','Trapping']){
    const stat=global+phase+'Interval';target[stat]=(target[stat]||0)+m.Value*times;
   }
   return;
  }
  const ctx=m.LocalContext;
  if(m.Stat?.StatsType!==G.Namespace+':HuntingAction'||ctx?.Component?.Entity!==G.Namespace+':Hunting'||ctx.Component.Component!=='Action'||
     Object.entries(ctx).some(([k,v])=>k!=='Component'&&v!=null&&scope[k]!==v))return;
  target[m.Stat.Name]=(target[m.Stat.Name]||0)+m.Value*times;
 };
 if(save){
  for(const {m,times} of playerBoostsCache(save)){
   const xpSkill=m.Scaling?.Data?.Experience;
   if(!m.Scaling||xpSkill)add(totals,m,times*(xpSkill?saveLevel(shortId(xpSkill.Entity),save):1));
  }
  for(const {obj} of configEntries('Hunting','JournalLevelBonuses')){
   if(obj.UnlockLevel<=level)for(const m of obj.JournalModifierTemplate||[])add(totals,m,1);
  }
  for(const m of (trapless?animal.TraplessBonuses:compatible?.TrapBonuses)||[])add(totals,m,1);
  for(const m of compatible?.FailBonuses||[])add(failure,m,1);
  if(setting?.bait)for(const m of animal.BaitModifierTemplate||[])add(totals,m,1);
 }
 return {level,totals,failure};
}

function huntingIntervalMean(low,high=low){
 const tick=1000/60;
 low=Math.max(tick,low);high=Math.max(low,high);
 if(high===low)return combatKernel.ticks(low)*tick;
 // Integrate the rounded timer over the continuous uniform interval.
 const area=x=>{const n=Math.round(x);return n*(x-n/2);};
 return (area(high/tick)-area(low/tick))/(high/tick-low/tick)*tick;
}

function huntingTrapDistribution(success,doubling,failChance,failDouble){
 const chance=n=>Math.max(0,Math.min(1,n));
 let remaining=1,failures=0,averageDouble=0;
 for(let i=0;remaining>0;i++){
  const p=chance(success+i*failChance),d=chance(doubling+i*failDouble);
  if(p===0&&failChance<=0)return {failures:Infinity,averageDouble:0};
  const fixedP=!failChance||p===1&&failChance>0;
  const fixedD=!failDouble||d===0&&failDouble<0||d===1&&failDouble>0;
  if(p===1||fixedP&&fixedD){
   return {failures:failures+remaining*(1-p)/p,averageDouble:averageDouble+remaining*d};
  }
  averageDouble+=remaining*p*d;
  remaining*=1-p;
  failures+=remaining;
 }
 return {failures,averageDouble};
}

function huntingStats(e,save){
 const o=e.obj,setting=save?.hunting?.animals?.[G.Namespace+':'+o.Id];
 const {level,totals,failure}=huntingModifiers(e,save,setting);
 const location=byKey.get('HuntingLocation/'+shortId(o.Location))?.obj;
 const stat=key=>totals[key]||0;
 const clamp=p=>Math.max(0,Math.min(1,p));
 const modifyChance=(base,name)=>base*(1+stat('Increased'+name))+stat('Flat'+name);
 const interval=(base,name,edge='')=>Math.floor((base+stat('Flat'+name)+(edge?stat('Flat'+edge+name):0))*
  (1+stat('Percent'+name)+(edge?stat('Percent'+edge+name):0)));
 const track=huntingIntervalMean(interval(o.BaseMinTrackInterval,'TrackingInterval','Min'),interval(o.BaseMaxTrackInterval,'TrackingInterval','Max'));
 const trap=huntingIntervalMean(interval(o.BaseMinTrapInterval,'TrappingInterval','Min'),interval(o.BaseMaxTrapInterval,'TrappingInterval','Max'));
 const survey=huntingIntervalMean(interval(location?.BaseSurveyInterval??0,'SurveyInterval'));
 const miss=1-clamp(modifyChance(o.BaseTrackSuccessChance,'TrackingSuccessChance'));
 const skip=clamp(stat('SkipTrackingStepChance'));
 const min=Math.max(0,Math.floor(o.BaseMinTrackingSteps+stat('FlatTrackingSteps')+stat('FlatMinTrackingSteps')));
 const max=Math.max(min,Math.floor(o.BaseMaxTrackingSteps+stat('FlatTrackingSteps')+stat('FlatMaxTrackingSteps')));
 const steps=min===0?[0]:[0,1];
 // With n steps remaining, a tick advances one step or skips one extra step.
 for(let n=steps.length;n<=max;n++)steps[n]=1+(1-skip)*steps[n-1]+skip*(steps[n-2]??0);
 const tracking=steps.slice(min).reduce((sum,n)=>sum+n,0)/(max-min+1);
 const {failures,averageDouble}=huntingTrapDistribution(modifyChance(o.BaseTrapSuccessChance,'TrappingSuccessChance'),
  stat('DoublingChance'),failure.FlatTrappingSuccessChance||0,failure.DoublingChance||0);
 const retrack=(1-clamp(stat('TrappingReattemptChance')))*steps[min];
 const ms=Number.isFinite(failures)?survey*(1+miss+miss*miss)+track*(tracking+failures*retrack)+trap*(1+failures):Infinity;

 const drops=new Map(),addDrop=(id,qty)=>{if(qty>0)drops.set(id,(drops.get(id)||0)+qty);};
 const quantity=p=>Math.max(1,Math.trunc((p.Quantity+stat('FlatProductQuantity'))*(1+stat('PercentProductQuantity'))));
 const species=(o.RareSpecies||[]).filter(row=>row.Weight>0);
 const rare=species.length?clamp(modifyChance(o.BaseRareSpeciesChance,'RareSpeciesChance')):0;
 for(const p of o.Products||[]){
  if(!p.Quantity||!p.Chance)continue;
  const q=quantity(p);
  const outcome=m=>huntingCaptureQuantity(q,m,level);
  const ordinary=(1-averageDouble)*outcome(1)+averageDouble*outcome(2);
  const uncommon=(1-averageDouble)*outcome(2)+averageDouble*outcome(4);
  addDrop(p.Item,p.Chance*((1-rare)*ordinary+rare*uncommon));
 }
 const weight=species.reduce((sum,row)=>sum+row.Weight,0);
 for(const row of species){
  const extra=byKey.get('HuntingAnimalSpecies/'+shortId(row.Species))?.obj.ExtraProducts;
  for(const p of extra||[])addDrop(p.Item,rare*row.Weight/weight*p.Chance*p.Quantity*(1+averageDouble));
 }
 const surveyDrops=(o.SurveyingProducts||[]).filter(p=>p.Quantity&&p.Chance);
 const noSurveyDrop=surveyDrops.reduce((p,row)=>p*(1-row.Chance),1);
 const nextSurvey=miss*noSurveyDrop;
 for(const p of surveyDrops)addDrop(p.Item,(1+nextSurvey+nextSurvey*nextSurvey)*p.Chance*quantity(p)*(1+clamp(stat('DoublingChance'))));
 const value=[...drops].reduce((sum,[id,qty])=>sum+qty*(itemEntry(id)?.obj.SellsFor?.Quantity||0),0);
 return {ms,value,drops};
}

function huntingCaptureQuantity(quantity,multiplier,level){
 // The mean of two uniform size/weight rolls has a triangular distribution.
 const min=.5+level/100,width=.8,units=quantity*multiplier;
 let expected=multiplier;
 for(let n=multiplier+1;n<=units*(min+width);n++){
  const x=Math.max(0,(n/units-min)/width);
  expected+=x<.5?1-2*x*x:2*(1-x)**2;
 }
 return expected;
}
// Sell value of one unit of the main product (the item flat-quantity bonuses add to).
function primaryValue(e){const r=sourceRows.find(r=>r.entry===e&&/主要|完成配方|每次砍倒|每次挖掘|普通钓鱼/.test(r.basis));return r?(itemEntry(r.item)?.obj.SellsFor?.Quantity||0)*(r.chance??1):0;}

// ---------- State ----------
let playerSave=null;
function loadPlayerSave(raw){const save=parseSave(raw);save.loadedAt=Date.now();playerSave=save;playerBoostsMemo=null;storage.set(SAVE_STORAGE_KEY,save);return save;}
function clearPlayerSave(){playerSave=null;playerBoostsMemo=null;storage.set(SAVE_STORAGE_KEY,null);}
function restorePlayerSave(){const s=storage.get(SAVE_STORAGE_KEY,null);if(s&&typeof s==='object'&&s.xp&&s.version>=SAVE_MIN_VERSION)playerSave=s;}
function saveStatusText(){return playerSave?'当前存档：'+playerSave.character+' · 总等级 '+fmt(playerSave.totalLevel,0):'未导入存档，表格显示基础值。';}
function updateSaveControls(message){
 $('save-toggle').textContent=playerSave?'存档：'+playerSave.character:'导入存档';
 $('save-toggle').classList.toggle('loaded',!!playerSave);
 $('save-status').textContent=message||saveStatusText();
 $('save-clear').hidden=!playerSave;
}
function toggleSavePanel(open=$('save-panel').hidden){$('save-panel').hidden=!open;$('save-toggle').setAttribute('aria-expanded',String(open));if(open)$('save-text').focus?.();}
restorePlayerSave();
$('save-toggle').addEventListener('click',()=>toggleSavePanel());
async function importSave(read){
 try{const save=loadPlayerSave(await read());$('save-text').value='';updateSaveControls('已读取存档：'+save.character+' · 总等级 '+fmt(save.totalLevel,0));toggleSavePanel(false);routeWiki();}
 catch(error){updateSaveControls(error.message);}
}
$('save-import').addEventListener('click',()=>importSave(()=>decodeSaveString($('save-text').value)));
// Browsers can't open the file dialog in a given folder, so copy the folder path for the dialog's address bar.
const SAVE_DIR='%APPDATA%\\Games By Malcs\\Melvor Idle 2\\steam';
$('save-dir').textContent=SAVE_DIR;
$('save-pick').addEventListener('click',()=>{
 // Start both inside the click: each needs the user's gesture, and awaiting the copy could get the dialog blocked.
 let copy;try{copy=navigator.clipboard.writeText(SAVE_DIR);}catch(error){copy=Promise.reject(error);}
 copy.then(()=>updateSaveControls('已复制存档目录：在弹出窗口的地址栏按 Ctrl+V 再回车。'),()=>updateSaveControls('无法自动复制，请手动复制上方路径到弹出窗口的地址栏。'));
 $('save-file').click();
});
$('save-file').addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';if(file)importSave(async()=>decompressSave(new Uint8Array(await file.arrayBuffer())));});
$('save-clear').addEventListener('click',()=>{clearPlayerSave();updateSaveControls('已清除存档，表格恢复基础值。');routeWiki();});
updateSaveControls();
