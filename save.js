// Player save import: decode an exported save string (Base64 → Brotli → binary) into the long-lasting
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

// Base64 export string → raw save bytes. The game's Brotli stream omits its final empty block, so if a plain
// decode fails, one "last, empty" meta-block byte (0x03) is appended and decoding is retried.
function decodeSaveString(text){
 const clean=String(text||'').replace(/\s+/g,'');
 if(!clean)throw new Error('请粘贴游戏导出的存档字符串。');
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)||clean.length%4)throw new Error('这不是有效的存档字符串：只能包含 Base64 字符。');
 let binary;try{binary=atob(clean);}catch{throw new Error('这不是有效的存档字符串：Base64 解码失败。');}
 const packed=new Uint8Array(binary.length+1);for(let i=0;i<binary.length;i++)packed[i]=binary.charCodeAt(i);packed[binary.length]=3;
 for(const input of [packed.subarray(0,binary.length),packed]){
  try{const raw=BrotliDecode(new Int8Array(input.buffer,input.byteOffset,input.length));return new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength);}catch{}
 }
 throw new Error('存档解压失败：请确认粘贴的是游戏“导出存档”得到的完整字符串。');
}

function parseSave(bytes){
 const r=saveReader(bytes),version=r.i32();
 if(version<SAVE_MIN_VERSION)throw new Error('存档版本 '+version+' 过旧，请在当前版本游戏中重新导出。');
 r.skip(16);const character=r.str();r.str();r.i64();for(let i=0;i<4;i++)r.str();
 const totalLevel=r.i32();r.i64();r.i64();r.bool();
 const save={version,character,totalLevel,xp:{},toolbelt:{},pets:{},tasks:{},shop:{},astrology:{}};
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
 }else if(component==='Pets'){
  const pets=[];for(let n=r.count();n>0;n--){const pet=r.str();r.region(()=>{if(r.bool())pets.push(pet);});}
  save.pets[entity]=pets;
 }else if(component==='MasteryGuild'){
  if(r.bool())r.str();
  const done=[];
  for(let n=r.count();n>0;n--){const task=r.str();r.region(()=>{
   // Same rule as ActiveMasteryGuildTask.CheckIfMet for tasks without condition / trigger goals.
   let complete=false;if(r.bool()){r.str();complete=r.region(()=>{r.f64();return r.bool();});}
   const triggerMet=r.bool();if(complete&&saveTaskCountable(task,triggerMet))done.push(task);
  });}
  save.tasks[entity]=done;
 }else if(entity==='Shop'&&component==='Shop'){
  r.bool();r.bool();r.bool();r.i32();r.i32();
  for(let n=r.count();n>0;n--){const amount=r.i32();save.shop[r.str()]=amount;}
 }else if(entity==='Astrology'&&component==='Action')readSaveAstrology(r,save);
}
// Tasks with a condition goal need live game state to confirm; count them only when they have no condition.
function saveTaskCountable(task,triggerMet){const o=byKey.get('MasteryGuildTask/'+shortId(task))?.obj;return !!o&&!o.ConditionGoal&&(!o.TriggerGoal||triggerMet);}

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
function playerBoosts(save){
 const owned=playerSources(save),records=[];
 for(const r of boostRecords){
  const o=owned.get(r.key);if(!o||r.m.Condition||r.m.FromContext)continue;
  if(r.key.startsWith('Item/')&&!r.path.includes(':Toolbelt'))continue;
  if(r.key.startsWith('AstrologyConstellation/')&&!/PerMinorNodeBonuses/.test(r.path))continue;
  if(r.gates.some(g=>g.ItemCount||g.Duration||g.Turns||g.Charges||g.Trigger))continue;
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
// Sell value of one unit of the main product (the item flat-quantity bonuses add to).
function primaryValue(e){const r=sourceRows.find(r=>r.entry===e&&/主要|完成配方|每次砍倒|每次挖掘|普通钓鱼/.test(r.basis));return r?(itemEntry(r.item)?.obj.SellsFor?.Quantity||0)*(r.chance??1):0;}

// ---------- State ----------
let playerSave=null;
function loadPlayerSave(text){const save=parseSave(decodeSaveString(text));save.loadedAt=Date.now();playerSave=save;playerBoostsMemo=null;storage.set(SAVE_STORAGE_KEY,save);return save;}
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
$('save-import').addEventListener('click',()=>{
 try{const save=loadPlayerSave($('save-text').value);$('save-text').value='';updateSaveControls('已读取存档：'+save.character+' · 总等级 '+fmt(save.totalLevel,0));toggleSavePanel(false);routeWiki();}
 catch(error){updateSaveControls(error.message);}
});
$('save-clear').addEventListener('click',()=>{clearPlayerSave();updateSaveControls('已清除存档，表格恢复基础值。');routeWiki();});
updateSaveControls();
