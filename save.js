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
 const save={version,character,totalLevel,xp:{},toolbelt:{},equipment:[],pets:{},tasks:{},shop:{},astrology:{},agilityTechniques:{},masteryStatistics:{},hunting:{journal:{},animals:{}}};
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
 }else if(entity==='Agility'&&component==='Action'&&save.version<=31){
  save.agilityShortcuts=readAgilityShortcuts(r);
 }else if(entity==='Agility'&&component==='Techniques'&&save.version<=31){
  for(let n=r.count();n>0;n--){const id=r.str();r.region(techniqueEnd=>{if(techniqueEnd-r.pos===8)save.agilityTechniques[id]=r.f64();});}
 }else if(component==='Statistics'&&save.version<=31){
  readMasteryStatistics(r,save,entity,end);
 }else if(entity==='Shop'&&component==='Shop'){
  r.bool();r.bool();r.bool();r.i32();r.i32();
  for(let n=r.count();n>0;n--){const amount=r.i32();save.shop[r.str()]=amount;}
 }else if(entity==='Astrology'&&component==='Action')readSaveAstrology(r,save);
 else if(entity==='Hunting'&&component==='Journal'){
  for(let n=r.count();n>0;n--){const id=r.str();r.region(()=>{r.bool();save.hunting.journal[id]=r.f64();});}
  if(end-r.pos>=8){save.hunting.rareSpecies=r.count();save.hunting.collectables=r.count();}
 }else if(entity==='Hunting'&&component==='Action')readSaveHunting(r,save.hunting.animals);
}

// StatisticsComponent writes value, item and currency groups before each skill's specialized groups.
const masteryStatisticKeys=new Map(Object.entries({
 ValueStatistic:'',ItemStatistic:'Item',AgilityCourseStatistic:'Course',AstrologyEventStatistic:'Event',
 RanchingAnimalStatistic:'Animal',SlayerMasterStatistic:'Master',HuntingAnimalSpecies:'Species'
}));
const masteryStatisticIds=new Set((G.Objects.MasteryGuildTask||[]).map(task=>task.ConditionGoal?.Data?.Statistic).filter(Boolean));
const statisticExtraGroups={Agility:1,Astrology:2,Hunting:2,Ranching:1,Slayer:1};
function readMasteryStatistics(r,save,entity,end){
 for(let group=0;group<3+(statisticExtraGroups[entity]||0)&&r.pos<end;group++){
  for(let n=r.count();n>0;n--){
   const id=r.str();
   r.region(statEnd=>{
    if(!masteryStatisticIds.has(id))return;
    if(!group){
     if(statEnd-r.pos===8)save.masteryStatistics[id]=r.f64();
     return;
    }
    const entries=[];
    for(let i=r.count();i>0;i--){const value=r.f64();entries.push([r.str(),value]);}
    if(r.pos===statEnd)save.masteryStatistics[id]=Object.fromEntries(entries);
   });
  }
 }
}

function readAgilityShortcuts(r){
 r.bool();
 if(r.bool())r.str();
 if(r.bool()){r.str();if(r.bool())r.str();}
 let built=0;
 for(let n=r.count();n>0;n--){
  const course=byKey.get('AgilityCourse/'+shortId(r.str()))?.obj;
  r.region(()=>{
   if(!course)return;
   for(let m=r.count();m>0;m--){
    const id=r.str(),path=course.Paths.includes(id)&&byKey.get('AgilityCoursePath/'+shortId(id))?.obj;
    r.region(()=>{
     if(!path)return;
     r.bool();if(r.bool())r.str();
     for(let k=r.count();k>0;k--){
      const obstacle=r.str();
      r.region(()=>{if(path.Obstacles.includes(obstacle)&&r.bool())built++;});
     }
    });
   }
  });
 }
 return built;
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
function savedMasteryTaskComplete(entry,save,done){
 const ns=G.Namespace+':',o=entry.obj;
 if(done.has(ns+o.Id))return true;
 const condition=o.ConditionGoal,data=condition?.Data;
 if(!data||o.Goal||o.TriggerGoal)return false;
 const skill=shortId(data.Component?.Entity);
 const type=shortId(condition.Type);
 if(masteryStatisticKeys.has(type)){
  const key=masteryStatisticKeys.get(type),stat=save.masteryStatistics?.[data.Statistic];
  return (key?stat?.[data[key]]:stat)>=data.Value;
 }
 switch(type){
  case 'Level':return Number.isFinite(save.xp[skill])&&saveLevel(skill,save)>=data.Level;
  case 'PetUnlocked':return (save.pets[skill]||[]).includes(data.Pet);
  case 'AstrologyMajorNodeUnlockCount':
  case 'AstrologyMinorNodeUnlockCount':{
   const nodes=save.astrology[data.Constellation]||[];
   const constellation=byKey.get('AstrologyConstellation/'+shortId(data.Constellation))?.obj;
   const group=shortId(condition.Type)==='AstrologyMajorNodeUnlockCount'?'MajorNodes':'MinorNodes';
   return (constellation?.[group]||[]).filter(node=>nodes.includes(node)).length>=data.Count;
  }
  case 'AgilityShortcutsCreated':return save.agilityShortcuts>=data.Count;
  case 'AgilityTechniqueLevel':
  case 'AgilityNumTechniquesLevel':{
   const level=data.Level,root=2**(1/3.25);
   const xp=Math.floor((level*(level-1)+600*(2**(level/3.25)-root)/(root-1))/6);
   const qualified=Object.entries(save.agilityTechniques||{}).filter(([id,value])=>
    value>=xp&&byKey.get('AgilityTechnique/'+shortId(id))?.obj.LevelCap>=level);
   return type==='AgilityTechniqueLevel'?qualified.some(([id])=>id===data.Technique):qualified.length>=data.NumTechniques;
  }
  case 'HuntingUniqueRareSpeciesFound':return save.hunting?.rareSpecies>=data.Count;
  case 'HuntingUniqueCollectablesFound':return save.hunting?.collectables>=data.Count;
  case 'HuntingMaxLevelAnimals':return Object.entries(save.hunting?.journal||{}).filter(([id,xp])=>
   byKey.get('HuntingAnimal/'+shortId(id))?.obj.LogToJournal&&huntingJournalLevel(xp)>=data.Level).length>=data.Count;
  default:return false;
 }
}
function masteryRankKey(skill,save){
 const tasks=configEntries(skill,'MasteryGuildTasks'),ranks=configEntries(skill,'MasteryGuildRanks');if(!ranks.length)return null;
 const done=new Set(save.tasks[skill]||[]),total=masteryTotalPoints(skill);
 const have=tasks.filter(t=>savedMasteryTaskComplete(t,save,done)).reduce((s,t)=>s+(masteryTaskCategory(t)?.obj.BasePoints||0),0);
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
  const reached=new Set(configEntries(s.id,'MasteryGuildRanks').slice(0,m.index+1).map(r=>G.Namespace+':'+r.obj.Id));
  for(const b of configEntries(s.id,'MasteryGuildBonuses')){const need=b.obj.Requirements||[];
   if(need.length&&need.every(r=>shortId(r.Type)==='MasteryGuildRank'&&reached.has(r.Data?.Rank)))add(b.key,1,'精通公会');}
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
 if(m.StatGroup)return ['GlobalPercentActionInterval','GlobalFlatActionInterval'].includes(m.StatGroup);
 const ctx=m.LocalContext||{},o=e.obj,id=G.Namespace+':'+o.Id;
 if(shortId(ctx.Component?.Entity)!==skill)return false;
 for(const [k,v] of Object.entries(ctx)){
  if(v==null||k==='Component')continue;
  if(k==='Recipe'){if(v!==id)return false;}
  else if(k==='Category'){if(v!==o.Category)return false;}
  else if(k==='Subcategory'){if(v!==o.Subcategory)return false;}
  else if(k==='Location'){if(v!==o.Location)return false;}
  else if(k==='RecipeType'){if(e.type!=='ThievingRecipe'||v!==o.RecipeType)return false;}
  else if(k==='Item'){if(!recipeModelStats[e.type]?.includes(m.Stat?.Name)||!o[scopedRecipeItems[m.Stat.Name]]?.some(row=>row.Item===v&&row.Quantity>0))return false;}
  else if(k==='Currency'){if(e.type!=='FiremakingRecipe'||!/CurrencyReward$/.test(m.Stat?.Name)||v!==o.CurrencyReward?.Currency)return false;}
  else return false;
 }
 return true;
}
const recipeSkillTypes={WoodcuttingRecipe:'Woodcutting',MiningRecipe:'Mining',FishingRecipe:'Fishing',CookingRecipe:'Cooking',FiremakingRecipe:'Firemaking',FarmingRecipe:'Farming',HerbloreRecipe:'Herblore',ThievingRecipe:'Thieving',GrainMillRecipe:'Farming'};
function recipeSkill(e){return recipeSkillTypes[e.type]||skillOfEntry(e);}
// Interval-type stats per recipe phase: fishing has min / max, herblore has one per step.
const intervalStats={PercentInterval:'all',GlobalPercentActionInterval:'all',PercentMinInterval:'min',PercentMaxInterval:'max',PercentPreparingInterval:'BasePreparingInterval',PercentHeatingInterval:'BaseHeatingInterval',PercentStirringInterval:'BaseStirringInterval',PercentBottlingInterval:'BaseBottlingInterval'};
const flatIntervalStats={FlatInterval:'all',GlobalFlatActionInterval:'all',FlatMinInterval:'min',FlatMaxInterval:'max'};
const thievingStatsKeys=['FlatStealth','PercentStealth','FlatPerception','PercentPerception','FlatFortune','FlatFortuneUnderSuccess',
 'PercentCommonLootChance','PercentRareLootChance','PercentCurrencyLootChance','PercentCurrencyReward','FlatCurrencyReward',
 'StunAvoidanceChance','PercentStunInterval','FlatStunInterval','FlatStages','SkipStageChance'];
const recipeModelStats={
 ArtisanRecipe:['FlatSteps','SkipStepChance','FlatProductQuantity','PercentProductQuantity'],
 CookingRecipe:['FlatProficiency','FlatDifficulty','FlatProductQuantity','PercentProductQuantity'],
 WoodcuttingRecipe:['FlatMaxHealth','PercentMaxHealth','DoubleDamageChance','InstantCutChance','WeakSpotChance',
  'FlatOnHitItemChance','PercentOnHitItemChance','FlatOnHitItemQuantity','FlatOnCutItemChance','PercentOnCutItemChance'],
 MiningRecipe:['PercentIncreaseRockBreakChance','FlatMinimumProspecting','FlatOnHitItemChance','PercentOnHitItemChance',
  'BarItemChance','StoneItemChance','EssenceItemChance','AdditionalProductQuantityChance','ShatterChance'],
 FishingRecipe:['FlatFishChance','IncreasedFishChance','JunkRerollChance','JunkToGP','FlatSpecialProductQuantity',
  'FlatSpecialProductChance','IncreasedSpecialProductChance','SecondSpecialItemChance'],
 FiremakingRecipe:['FlatProductChance','IncreasedProductChance','FlatProductQuantity','FlatCurrencyReward','PercentCurrencyReward']
};
const scopedRecipeItems={
 FlatOnHitItemChance:'RandomProductsPerHit',PercentOnHitItemChance:'RandomProductsPerHit',FlatOnHitItemQuantity:'RandomProductsPerHit',
 FlatOnCutItemChance:'RandomProductsPerCut',PercentOnCutItemChance:'RandomProductsPerCut',
 FlatSpecialProductQuantity:'SpecialProducts',FlatSpecialProductChance:'SpecialProducts',IncreasedSpecialProductChance:'SpecialProducts',
 FlatProductChance:'Products',IncreasedProductChance:'Products',FlatProductQuantity:'Products',PercentProductQuantity:'Products'
};
const probability=p=>Math.min(1,Math.max(0,p));
function expectedSteps(steps,outcomes){
 const remaining=[0];
 for(let i=1;i<=steps;i++)remaining.push(1+outcomes.reduce((sum,[advance,chance])=>sum+chance*remaining[Math.max(0,i-advance)],0));
 return remaining[steps];
}
function boostTotals(save,skill,e){
 const t={xp:0,percent:{},flat:{},doubling:0,quantity:0,percentQuantity:0,applied:[]};
 if(recipeModelStats[e.type])t.model={};
 if(e.type==='ThievingRecipe')t.thieving=Object.fromEntries(thievingStatsKeys.map(key=>[key,0]));
 for(const r of playerBoostsCache(save)){
  if(!boostAppliesTo(r.m,skill,e))continue;
  const stat=r.m.StatGroup||r.m.Stat.Name,type=r.m.StatGroup?'':shortId(r.m.Stat.StatsType);
  const experience=r.m.Scaling?.Data?.Experience;
  if(r.m.Scaling&&!experience)continue;
  const v=r.m.Value*r.times*(experience?saveLevel(shortId(experience.Entity),save):1);
  let used=true;
  if(type==='Experience'&&stat==='PercentXPGained')t.xp+=v;
  else if(intervalStats[stat])t.percent[intervalStats[stat]]=(t.percent[intervalStats[stat]]||0)+v;
  else if(flatIntervalStats[stat])t.flat[flatIntervalStats[stat]]=(t.flat[flatIntervalStats[stat]]||0)+v;
  else if(stat==='DoublingChance')t.doubling+=v;
  else if(t.model&&recipeModelStats[e.type].includes(stat)){
   const item=r.m.LocalContext?.Item,key=item?stat+'#'+item:stat;
   t.model[key]=(t.model[key]||0)+v;
  }
  else if(stat==='FlatProductQuantity')t.quantity+=v;
  else if(stat==='PercentProductQuantity')t.percentQuantity+=v;
  else if(t.thieving&&type==='ThievingAction'&&thievingStatsKeys.includes(stat))t.thieving[stat]+=v;
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
function savedUnscopedCombatBonuses(save,component,type,totals){
 if(!save)return totals;
 for(const {m,times} of [...playerBoostsCache(save),...equippedSaveBoosts(save)]){
  const ctx=m.LocalContext,stat=m.Stat?.Name;
  if(m.Stat?.StatsType!==G.Namespace+':'+type||!(stat in totals)||ctx?.Component?.Entity!==G.Namespace+':Combat'||ctx.Component.Component!==component)continue;
  if(Object.keys(ctx).some(k=>k!=='Component'&&ctx[k]!=null))continue;
  const experience=m.Scaling?.Data?.Experience;
  if(m.Scaling&&!experience)continue;
  totals[stat]+=m.Value*times*(experience?saveLevel(shortId(experience.Entity),save):1);
 }
 return totals;
}
function savedCombatLoot(save){
 const chances=savedUnscopedCombatBonuses(save,'Loot','CombatLoot',{ItemDoublingChance:0,BuriableDoublingChance:0,CurrencyDoublingChance:0});
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
function savedThievingStats(e,save,t,xp){
 const o=e.obj,bonus=t.thieving,level=saveLevel('Thieving',save);
 const scale=(base,flat=0,percent=0)=>Math.max(0,Math.floor((base+flat)*(1+percent)));
 const stealth=scale(level,bonus.FlatStealth,bonus.PercentStealth),perception=scale(o.Perception,bonus.FlatPerception,bonus.PercentPerception);
 const successChance=probability((100+stealth)/(100+perception));
 const interval=scaledInterval(e,o.BaseInterval,t.percent.all,t.flat.all);
 // A failed pickpocket retries the same stage after any stun (2 s base).
 const stunMs=scale(2000,bonus.FlatStunInterval,bonus.PercentStunInterval);
 const timerMs=ms=>ms===0?0:combatKernel.ticks(ms)*1000/60;
 const ms=(timerMs(interval)+(1-successChance)*(1-probability(bonus.StunAvoidanceChance))*timerMs(stunMs))/successChance;
 const skip=probability(bonus.SkipStageChance),stages=Math.max(1,o.Stages+Math.trunc(bonus.FlatStages));
 const rolls=expectedSteps(stages,[[1,1-skip],[2,skip]]);
 const fortune=bonus.FlatFortune+(successChance<1?bonus.FlatFortuneUnderSuccess:0);
 const double=1+probability(t.doubling);
 const itemValue=(rows,chance)=>{
  const weight=(rows||[]).reduce((n,r)=>n+r.Weight,0);
  if(!weight||!chance)return 0;
  return rows.reduce((value,r)=>{
   const min=r.MinQuantity??r.Quantity,max=r.MaxQuantity??r.Quantity;
   let total=0;
   for(let quantity=min;quantity<=max;quantity++)total+=Math.floor(quantity*(1+fortune/100));
   return value+r.Weight/weight*total/(max-min+1)*(itemEntry(r.Item)?.obj.SellsFor?.Quantity||0);
  },0)*chance*double;
 };
 const loot=itemValue(o.CommonDropTable,probability(o.BaseCommonLootChance*(1+bonus.PercentCommonLootChance)))+
  itemValue(o.RareDropTable,probability(o.BaseRareLootChance*(1+bonus.PercentRareLootChance)))+itemValue(o.CompletionDropTable,1)/rolls;
 const c=o.CurrencyReward;
 const gold=c&&shortId(c.Currency)==='GoldPieces'?probability(o.BaseCurrencyLootChance*(1+bonus.PercentCurrencyLootChance))*
  (scale(c.MinQuantity??c.Quantity,bonus.FlatCurrencyReward,bonus.PercentCurrencyReward)+scale(c.MaxQuantity??c.Quantity,bonus.FlatCurrencyReward,bonus.PercentCurrencyReward))/2:0;
 return {xp,ms,xpMs:ms*rolls,value:gold+loot,successChance,applied:t.applied};
}

// Per-action values use the game's actual reward rolls and quantity rounding.
function savedModeledRecipeStats(e,save,t,xp){
 const o=e.obj,b=(stat,item='')=>(t.model[stat]||0)+(item?t.model[stat+'#'+item]||0:0);
 const sale=id=>{const price=itemEntry(id)?.obj.SellsFor;return shortId(price?.Currency)==='GoldPieces'?price.Quantity:0;};
 const double=1+probability(t.doubling),cash=c=>shortId(c?.Currency)==='GoldPieces'?c.Quantity:0;
 const value=(rows,chance,quantity)=> (rows||[]).reduce((sum,r)=>sum+chance(r)*Math.max(0,quantity(r))*sale(r.Item),0);
 const hitDrops=(rows,cut=false)=>value(rows,r=>probability((r.Chance+b(cut?'FlatOnCutItemChance':'FlatOnHitItemChance',r.Item))*
  (1+b(cut?'PercentOnCutItemChance':'PercentOnHitItemChance',r.Item))),
 r=>r.Quantity+(cut?0:Math.trunc(b('FlatOnHitItemQuantity',r.Item))));
 const interval=savedRecipeTime(e,t);
 if(e.type==='WoodcuttingRecipe'){
  const health=Math.max(1,Math.ceil((o.BaseMaxHealth+b('FlatMaxHealth'))*(1+b('PercentMaxHealth'))));
  const instant=probability(b('InstantCutChance')),weak=probability(b('WeakSpotChance')),dbl=probability(b('DoubleDamageChance'));
  const weakDamage=3+Math.trunc(.1*health);
  const hits=expectedSteps(health,[[health,instant],[1,(1-instant)*(1-weak)*(1-dbl)],
   [2,(1-instant)*(1-weak)*dbl],[weakDamage,(1-instant)*weak*(1-dbl)],[weakDamage*2,(1-instant)*weak*dbl]]);
  const rewards=(Math.max(0,(o.Product?.Quantity||0)+Math.trunc(t.quantity))*sale(o.Product?.Item)+
   hits*hitDrops(o.RandomProductsPerHit)+hitDrops(o.RandomProductsPerCut,true))*double;
  return {xp,ms:interval/o.BaseMaxHealth*hits,value:rewards};
 }
 if(e.type==='MiningRecipe'){
  const chance=probability(o.BaseProductChance*(1+b('PercentIncreaseRockBreakChance')));
  const guaranteedAfter=chance>0?Math.max(1,Math.ceil((.9999-probability(b('FlatMinimumProspecting')))/chance)):Infinity;
  const hits=chance>0?(1-(1-chance)**guaranteedAfter)/chance:Infinity;
  const shatter=probability(b('ShatterChance'));
  const product=(Math.max(0,(o.Product?.Quantity||0)+Math.trunc(t.quantity))+probability(b('AdditionalProductQuantityChance')))*
   sale(o.Product?.Item)*(1+2*shatter);
  const extra=(stat,items)=>probability(b(stat))*items.reduce((sum,r)=>sum+sale(r.Id),0);
  const bonus=hitDrops(o.RandomProductsPerHit)+extra('StoneItemChance',skillConfig('Mining').StoneItems||[])+
   extra('EssenceItemChance',skillConfig('Mining').EssenceItems||[]);
  return {xp:xp*(1+shatter),xpMs:interval*hits,ms:interval,value:(bonus+(product+probability(b('BarItemChance'))*sale(o.BarItem))/hits)*double};
 }
 if(e.type==='FishingRecipe'){
  const chance=probability((o.FishChance+b('FlatFishChance'))*(1+b('IncreasedFishChance')));
  const fish=chance+(1-chance)*probability(b('JunkRerollChance'));
  const weight=(o.RandomProducts||[]).reduce((n,r)=>n+r.Weight,0);
  const regular=weight?value(o.RandomProducts,r=>fish*r.Weight/weight,r=>(r.MinQuantity+r.MaxQuantity)/2):0;
  const junkSale=sale(o.JunkItem),junkBonus=b('JunkToGP'),doubled=double-1;
  const junk=(1-fish)*(junkBonus>0?((1-doubled)*Math.trunc(junkSale*junkBonus)+doubled*Math.trunc(2*junkSale*junkBonus)):junkSale*double);
  const specials=(o.SpecialProducts||[]).map(r=>({r,chance:r.Chance*(1+b('IncreasedSpecialProductChance',r.Item))+b('FlatSpecialProductChance',r.Item)}))
   .sort((a,b)=>a.chance-b.chance);
  let miss=1,special=0;
  for(const {r,chance} of specials){
   const p=probability(chance);
   special+=miss*p*Math.max(0,r.Quantity+Math.trunc(b('FlatSpecialProductQuantity',r.Item)))*sale(r.Item);
   miss*=1-p;
  }
  return {xp,ms:interval,value:junk+(regular+special*(1+(1-miss)*probability(b('SecondSpecialItemChance'))))*double};
 }
 if(e.type==='FiremakingRecipe'){
  const drops=value(o.Products,r=>probability(r.Chance*(1+b('IncreasedProductChance',r.Item))+b('FlatProductChance',r.Item)),
   r=>r.Quantity+Math.trunc(b('FlatProductQuantity',r.Item)));
  const baseCash=cash(o.CurrencyReward);
  const gold=baseCash?Math.max(1,Math.trunc(baseCash*(1+b('PercentCurrencyReward'))+b('FlatCurrencyReward'))):0;
  return {xp,ms:interval,value:(drops+gold)*double};
 }
 const cooking=e.type==='CookingRecipe';
 const success=cooking?probability((69+Math.max(0,saveLevel('Cooking',save)+b('FlatProficiency')))/(69+Math.max(0,o.Difficulty+b('FlatDifficulty')))):1;
 const rewards=value(o.Products,r=>r.Chance??1,r=>Math.max(1,Math.trunc((r.Quantity+b('FlatProductQuantity',r.Item))*(1+b('PercentProductQuantity',r.Item)))));
 if(cooking)return {xp:xp*success,ms:interval,value:rewards*success*double,successChance:success};
 const skip=probability(b('SkipStepChance')),steps=Math.max(1,o.Steps+Math.trunc(b('FlatSteps')));
 return {xp,ms:interval/Math.max(1,o.Steps)*expectedSteps(steps,[[1,1-skip],[2,skip]]),value:rewards*double};
}

// Recipe numbers with the player's bonuses; with no save they equal the base columns.
function savedRecipeStats(e,save){
 const skill=recipeSkill(e),baseXp=e.obj.BaseExperience;
 if(!save||!skill)return {xp:baseXp,ms:recipeTime(e),value:recipeValue(e),applied:[]};
 const t=boostTotals(save,skill,e),xp=baseXp==null?baseXp:baseXp*(1+t.xp);
 if(t.thieving)return savedThievingStats(e,save,t,xp);
 if(t.model)return {...savedModeledRecipeStats(e,save,t,xp),applied:t.applied};
 const double=1+Math.min(1,Math.max(0,t.doubling));
 const value=(recipeValue(e)*(1+t.percentQuantity)+t.quantity*primaryValue(e))*double;
 return {xp,ms:recipeTime(e)?savedRecipeTime(e,t):null,value,applied:t.applied};
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
function toggleSavePanel(open=$('save-panel').hidden){$('save-panel').hidden=!open;$('save-toggle').setAttribute('aria-expanded',String(open));if(open)$('save-pick').focus?.();}
restorePlayerSave();
$('save-toggle').addEventListener('click',()=>toggleSavePanel());
async function importSave(read){
 try{const save=loadPlayerSave(await read());$('save-text').value='';updateSaveControls('已读取存档：'+save.character+' · 总等级 '+fmt(save.totalLevel,0));toggleSavePanel(false);routeWiki();}
 catch(error){updateSaveControls(error.message);}
}
$('save-import').addEventListener('click',()=>importSave(()=>decodeSaveString($('save-text').value)));
// Browsers can't open the file dialog in a given folder, so copy the folder path for the dialog's address bar.
const SAVE_DIR='%APPDATA%\\Games By Malcs\\Melvor Idle 2\\steam';
$('save-dir').value=SAVE_DIR;
for(const type of ['focus','click'])$('save-dir').addEventListener(type,event=>event.target.select());
$('save-pick').addEventListener('click',()=>{
 // Start both inside the click: each needs the user's gesture, and awaiting the copy could get the dialog blocked.
 let copy;try{copy=navigator.clipboard.writeText(SAVE_DIR);}catch(error){copy=Promise.reject(error);}
 copy.then(()=>updateSaveControls('已复制存档目录。在文件窗口按 Alt+D、Ctrl+V、回车。'),()=>updateSaveControls('无法自动复制。选中上方目录后按 Ctrl+C，再粘贴到文件窗口的地址栏。'));
 $('save-file').click();
});
$('save-file').addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';if(file)importSave(async()=>decompressSave(new Uint8Array(await file.arrayBuffer())));});
$('save-clear').addEventListener('click',()=>{clearPlayerSave();updateSaveControls('已清除存档，表格恢复基础值。');routeWiki();});
updateSaveControls();
