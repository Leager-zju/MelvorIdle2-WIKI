// Query pages use the installed game's data; no first-game balance values are copied.
Object.assign(typeNames,{EquipmentSetBonus:'装备套装',ThievingDistraction:'扒窃干扰',ThievingHeistBonus:'扒窃劫案奖励',HuntingJournalBonus:'狩猎日志奖励',AstrologyBonusesEvent:'占星事件',RareBonusesEvent:'稀有事件',RanchingEnclosureUpgrade:'围栏升级',TurnCountingEffect:'回合效果',StackingEffect:'叠加效果',AttackChargingEffect:'攻击充能效果',AttackCountingEffect:'攻击计数效果',AgilityTechnique:'敏捷技巧',FarmingCategory:'种植类别',RanchingAnimalVariant:'动物变种',CombatTriangleBonus:'战斗三角',ElementalBonus:'元素加成',OvergrowthEffect:'过度生长效果',RandomMagnitudeEffect:'随机强度效果',StunEffect:'眩晕效果',DamageOverTimeEffect:'持续伤害效果',AttackStance:'攻击姿态',Imbuement:'附魔'});
Object.assign(labels,{LocalContext:'适用范围',FromContext:'经验 / 事件来源范围',Scaling:'动态缩放',StatGroup:'全局属性',StatsType:'属性系统',Modifiers:'修饰',UnlockLevel:'解锁等级',ItemCount:'套装件数',LinkedShopPurchase:'关联商店购买',UnlockKnowledge:'解锁知识',Duration:'持续时间',Turns:'回合',Charges:'充能',ConsumesOn:'消耗触发',Trigger:'触发方式',SecondaryRequirements:'额外条件',Slots:'槽位',CombatEffect:'战斗效果',Effects:'效果',Effect:'效果',BonusesWhenGrown:'成熟时加成',JournalModifierTemplate:'日志加成模板',BaitModifierTemplate:'诱饵加成模板',WateringModifierTemplate:'浇水加成模板'});
const playerTypes=new Set(Object.keys(typeNames).filter(t=>!['RecipeCategory','RecipeSubcategory','FarmingCategory'].includes(t)));
function fmt(n,d=2){
 if(!Number.isFinite(n))return '—';
 const shown=n.toLocaleString('zh-CN',{maximumFractionDigits:Math.min(d,2)});
 return shown==='-0'?'0':shown;
}
const pct=n=>Number.isFinite(n)?fmt(n*100)+'%':'—';
function signed(n){const shown=fmt(n);return n>0&&shown!=='0'?'+'+shown:shown;}
const displayText=text=>plain(text).replace(/(?<![\w.])[-+]?\d+\.\d{3,}(?![\d.])/g,n=>n.startsWith('+')?signed(Number(n)):fmt(Number(n)));
const shortId=x=>String(x||'').split(':').pop();
const itemEntry=id=>byKey.get('Item/'+shortId(id));
const href=key=>'#'+encodeURIComponent(key);
const pageLink=(key,text)=>'<a href="'+href(key)+'">'+esc(text)+'</a>';
function icon(e,size=28){
 const path=e?.obj?.Icon||e?.obj?.Media||(typeof e?.obj?.Sprite==='string'?e.obj.Sprite:null),source=DATA.icons[path];if(!source)return '';
 return '<img class="icon" src="'+esc(source)+'" width="'+size+'" height="'+size+'" alt="" loading="lazy">';
}
const eLink=e=>e?icon(e)+link(e):'—';
const refLink=(id,type)=>{const e=byKey.get(type+'/'+shortId(id));return e?eLink(e):esc(shortId(id));};
const skillEntries=[...new Map(entries.filter(e=>['SkillNavigationOption','LegacySkillNavigationOption'].includes(e.type)).map(e=>[shortId(e.obj.Entity),e])).entries()].map(([id,e])=>({id,title:e.title,entry:e}));
const skillById=new Map(skillEntries.map(s=>[s.id,s]));
const combatSkills=['Attack','Strength','Defence','Hitpoints','Ranged','Magic','Prayer','Slayer'];
const skillName=id=>skillById.get(id)?.title||tr(id);
const skillLink=id=>pageLink('@skill/'+id,skillName(id));
const boostLink=id=>pageLink('@boosts/'+id,skillName(id)+' / Boosts');
const skillConfig=id=>G.EntityConfig[G.Namespace+':'+id]||{};
const sourceLabels={Item:'物品 / 装备 / 药水 / 食物',ShopPurchase:'商店升级',MasteryGuildBonus:'精通公会',AstrologyNode:'占星节点',AstrologyConstellation:'占星星座',Pet:'宠物',EquipmentSetBonus:'装备套装',HuntingJournalBonus:'狩猎日志',ThievingDistraction:'扒窃干扰',ThievingHeistBonus:'劫案奖励',Prayer:'祈祷',CombatPassive:'战斗被动',FarmingRecipe:'成熟作物',FarmingCategory:'种植操作',HuntingAnimal:'诱饵 / 无陷阱狩猎',RanchingAnimalVariant:'动物变种'};
function walk(value,callback,path='',ancestors=[]){
 if(!value||typeof value!=='object')return;
 callback(value,path,ancestors);
 for(const [k,v] of Object.entries(value))if(v&&typeof v==='object')walk(v,callback,path+(Array.isArray(value)?'['+k+']':(path?'.':'')+k),[...ancestors,value]);
}
function entityIds(value){const result=new Set();walk(value,o=>{if(!Array.isArray(o)&&typeof o.Entity==='string'&&skillById.has(shortId(o.Entity)))result.add(shortId(o.Entity));});return [...result];}
const statsSkills={WoodcuttingAction:'Woodcutting',MiningAction:'Mining',FishingAction:'Fishing',FishingBait:'Fishing',FiremakingAction:'Firemaking',CookingAction:'Cooking',FarmingAction:'Farming',RanchingAction:'Ranching',HuntingAction:'Hunting',HerbloreAction:'Herblore',Agility:'Agility',AstrologyAction:'Astrology',ThievingAction:'Thieving',SlayerTasks:'Slayer',Prayer:'Prayer',MagicSpell:'Magic',GrainMill:'Farming',GrainMillInventory:'Farming'};
function modifierSkills(m){
 if(m.StatGroup)return skillEntries.map(s=>s.id);
 const type=shortId(m.Stat.StatsType),local=m.LocalContext||{};
 const explicit=entityIds(local).filter(s=>s!=='Combat');
 if(explicit.length)return explicit;
 if(local.CombatLevel&&skillById.has(shortId(local.CombatLevel)))return [shortId(local.CombatLevel)];
 if(statsSkills[type])return [statsSkills[type]];
 if(type==='ArtisanAction')return ['Smithing','Fletching','Crafting','Runecrafting','Beastcrafting'];
 if(['Character','Target','CombatEffect','CombatAction','CombatLoot','CombatAreas','CombatFood','AmmoConsumption'].includes(type)||local.Component?.Entity===G.Namespace+':Combat'){
  const style=shortId(local.CombatStyle);if(style==='Melee')return ['Attack','Strength','Defence','Hitpoints'];
  if(style==='Ranged')return ['Ranged','Defence','Hitpoints'];if(style==='Magic')return ['Magic','Defence','Hitpoints'];
  return combatSkills;
 }
 if(type==='BankInventory')return ['Bank'];
 if(type==='ItemBurying')return ['Prayer'];
 if(type==='Toolbelt')return skillEntries.map(s=>s.id);
 if(type==='Experience')return shortId(m.FromContext?.Type)==='CombatExperience'?combatSkills:entityIds(m.FromContext);
 return [];
}
function statName(m){return m.StatGroup||m.Stat.Name;}
function boostGroup(m){
 const s=statName(m);
 if(/XP|Xp|Experience/.test(s))return '经验';if(/Interval|Steps|Speed/.test(s))return '间隔与步骤';
 if(/Doubl/.test(s))return '产出翻倍';if(/Preserv|Cost|Consumption/.test(s))return '保留与消耗';
 if(/Currency|Loot|Reward|Sale|ProductQuantity/.test(s))return '收益与产出';if(/Stealth|Fortune|Perception/.test(s))return '潜行与幸运';
 if(/Chance|Success/.test(s))return '成功率与特殊概率';if(/Damage|Hit|Accuracy|Defence|Protection|Power|Attack|Light|Darkness|Health/.test(s))return '战斗与生存';
 return '其他';
}
const boostRecords=[];
const effectGrants=[];
for(const e of entries)walk(e.obj,(o,path,ancestors)=>{
 if(!Array.isArray(o)&&typeof o.Value==='number'&&(typeof o.Stat==='object'&&o.Stat?.StatsType||o.StatGroup)){
  const parents=ancestors.filter(p=>!Array.isArray(p));
  const gates=parents.map(p=>Object.fromEntries(Object.entries(p).filter(([k,v])=>['ItemCount','UnlockLevel','Duration','Turns','Charges','MaxDuration','Requirements','UnlockRequirements','Condition','ConsumesOn','Trigger'].includes(k)&&v!=null))).filter(p=>Object.keys(p).length);
  boostRecords.push({key:e.key,path,m:o,skills:modifierSkills(o),group:boostGroup(o),gates});
 }
 if(!Array.isArray(o)&&o.Modifier?.Effect&&o.Modifier?.Trigger&&o.Character){
  const gates=ancestors.filter(p=>!Array.isArray(p)).map(p=>Object.fromEntries(Object.entries(p).filter(([k,v])=>['ItemCount','Requirements','UnlockRequirements','Condition','ConsumesOn','Trigger'].includes(k)&&v!=null))).filter(p=>Object.keys(p).length);
  effectGrants.push({key:e.key,path,m:o,skills:combatSkills,group:'触发与战斗效果',gates});
 }
});
const allBoostRecords=[...boostRecords,...effectGrants];
const boostByOwner=new Map();for(const r of allBoostRecords){if(!boostByOwner.has(r.key))boostByOwner.set(r.key,[]);boostByOwner.get(r.key).push(r);}
const boostGroups=['经验','间隔与步骤','产出翻倍','保留与消耗','收益与产出','潜行与幸运','成功率与特殊概率','战斗与生存','触发与战斗效果','其他'];
function findTemplate(m){
 if(m.Modifier)return null;
 if(m.StatGroup)return G.GlobalModifierDescriptions.find(d=>d.StatGroup===m.StatGroup)?.TemplateString;
 const local=Object.keys(m.LocalContext||{}).filter(k=>m.LocalContext[k]!=null).sort().join('|');
 const from=Object.keys(m.FromContext?.Data||{}).filter(k=>m.FromContext.Data[k]!=null).sort().join('|');
 return G.ComponentModifierDescriptions.find(d=>d.Key.Stat.StatsType===m.Stat.StatsType&&d.Key.Stat.Name===m.Stat.Name&&
  [...d.Key.LocalContextObjectCombination].sort().join('|')===local&&
  (!d.Key.FromContextType||d.Key.FromContextType===m.FromContext?.Type)&&
  (!d.Key.FromContextObjectCombination||[...d.Key.FromContextObjectCombination].sort().join('|')===from))?.TemplateString;
}
function valueText(m,token){
 const v=m.Value;
 if(token.includes(':cond:')){const rules=token.split(':cond:')[1].slice(0,-1).split('|');for(const rule of rules){const match=rule.match(/^(>=|<=|>|<|=)(-?[\d.]+)\?(.*)$/);if(!match)continue;const b=Number(match[2]);if(({'>=':v>=b,'<=':v<=b,'>':v>b,'<':v<b,'=':v===b})[match[1]])return match[3];}return '';}
 if(/intervaltime|numbertime/.test(token))return fmt(v/1000)+' 秒';
 const format=token.includes('+')?signed:fmt;
 if(token.includes('%'))return format(v*100)+'%';
 return format(v);
}
function contextText(m,path){
 const parts=path.split('.');let value=parts.shift()==='FromContext'?m.FromContext?.Data:m.LocalContext;
 for(const part of parts){if(part==='DisplayName'){
   if(typeof value==='string'){if(value.startsWith('Placeholder:'))return '对应目标（由来源实例化）';const list=resolve(value,'');return list.length?list[0].title:skillName(shortId(value));}
   if(value?.Entity)return skillName(shortId(value.Entity));return '';
  }value=value?.[part];}
 return typeof value==='string'?tr(value):'';
}
function effectText(m){
 if(m.Modifier){const mod=m.Modifier,id=mod.Effect.Data?.Effect,e=resolve(id||'','Effect')[0],trigger=shortId(mod.Trigger.Type),mode=mod.Trigger.Data?.Type;return (tr(mode||trigger)||mode||trigger)+' · '+pct(m.Chance)+' · '+(mod.AppliesTo==='Self'?'自身':'目标')+'获得'+(e?.title||tr(shortId(mod.Effect.Type)));}
 const template=findTemplate(m);
 const effect=template?plain(tr(template)).replace(/\{Value[^{}]*\}/g,t=>valueText(m,t)).replace(/\{((?:LocalContext|FromContext)\.[^{}]+)\}/g,(_,p)=>contextText(m,p)||'指定目标'):humanWord(statName(m))+' '+signed(m.Value);
 return m.Scaling?.Data?.Experience?'每级'+skillName(shortId(m.Scaling.Data.Experience.Entity))+'：'+effect:effect;
}
function boostValue(m){if(m.Modifier)return pct(m.Chance)+' 触发';const t=findTemplate(m)||'';return (/\{Value[^{}]*%/.test(t)?signed(m.Value*100)+'%':(/\{Value[^{}]*(?:intervaltime|numbertime)/.test(t)?signed(m.Value/1000)+' 秒':signed(m.Value)))+(m.Scaling?' / 级':'');}
function sourceKind(r){
 const e=byKey.get(r.key);
 if(e.type==='Item')return r.path.includes(':Food')?'食物效果':r.path.includes(':Toolbelt')?(/Potion/.test(e.obj.Id)?'药水':'工具腰带装备'):r.path.includes(':Equipment')?'战斗装备':'物品效果';
 return sourceLabels[e.type]||typeNames[e.type]||e.type;
}
function readableScope(value){return render(value);}
function requirementText(list){return list?.length?render(list):'';}
function boostScope(r){
 const m=r.m,parts=[];
 if(m.StatGroup)parts.push('<p>适用于全局效果。</p>');
 if(m.LocalContext)parts.push(readableScope(m.LocalContext));
 if(m.Modifier)parts.push('<p>'+esc(effectText(m))+'</p>');
 if(m.FromContext)parts.push('<p><b>适用方式：</b>'+render(m.FromContext)+'</p>');
 if(m.Condition)parts.push('<p><b>生效条件：</b>'+render(m.Condition)+'</p>');
 if(m.Scaling)parts.push('<p>效果随 '+playerRef(m.Scaling.Data?.Experience?.Entity||'','Entity')+' 等级变化。</p>');
 for(const gate of r.gates)parts.push(render(gate));
 return parts.join('')||'<span class="muted">无额外生效条件。</span>';
}
const ownerFields={AstrologyNode:/^(MinorNodes|MajorNodes)\[/,Pet:/^Pets\[/,CombatPassive:/Passives\[/,ThievingHeistBonus:/HeistBonuses\[/,ThievingDistraction:/^(AvailableDistractions|Distractions)\[/,EquipmentSetBonus:/SetBonus/,OvergrowthEffect:/Overgrowth/};
function grantingParents(e){
 const refs=reverse.get(G.Namespace+':'+e.obj.Id)||[];
 return [...new Set(refs.filter(r=>r.key!==e.key&&(ownerFields[e.type]?.test(r.path)||(/Effect$/.test(e.type)&&/CombatEffect|\.Effect$|\.Effects\[/.test(r.path)))).map(r=>r.key))].map(k=>byKey.get(k));
}
function gateText(e,empty='<span class="muted">无额外要求</span>'){const o=e.obj;return [o.Requirements,o.UnlockRequirements,o.AccessRequirements,o.SecondaryRequirements,...Object.values(o.Capabilities||{}).map(c=>c.Requirements)].filter(v=>v?.length).map(requirementText).join('')||empty;}
function masteryTaskObjectives(e){
 const {Goal,ConditionGoal,TriggerGoal,LinkedTask}=e.obj;
 const goals=[Goal,ConditionGoal,TriggerGoal].filter(Boolean).map(goal=>render(goal)).join('<br>');
 const linked=byKey.get('MasteryGuildTask/'+shortId(LinkedTask));
 return gateText(e,'')+goals+(linked?'<div class="gamefact">'+pageLink(linked.key,'查看关联任务')+'</div>':'')||'<span class="muted">—</span>';
}
const masteryTaskCategory=e=>byKey.get('MasteryGuildCategory/'+shortId(e.obj.Category));
const skillDetailHeaders=['条目','要求 / 目标','详情'];
const masteryTaskHeaders=['任务','任务类别','完成奖励（精通点数）','要求 / 目标','详情'];
function skillDetailRows(list){
 return list.map(e=>{
  const details=cell('',e.obj.Description?esc(displayText(tr(e.obj.Description))):pageLink(e.key,'查看详情'));
  const title=cell(e.title,eLink(e));
  if(e.type!=='MasteryGuildTask')return [title,cell('',gateText(e)+(e.obj.Goal?render(e.obj.Goal):'')),details];
  const category=masteryTaskCategory(e),points=category?.obj.BasePoints;
  const label=category?esc(category.title)+(category.en!==category.title?' <small class="en">'+esc(category.en)+'</small>':''):'—';
  return [title,cell(points,label),cell(points,fmt(points,0)),cell('',masteryTaskObjectives(e)),details];
 });
}
function parentText(e){
 const parents=grantingParents(e);
 let text=parents.length?parents.map(p=>eLink(p)+'<div>'+gateText(p)+'</div>').join('<hr>'):'';
 if(e.type==='AstrologyNode')for(const p of parents){const idx=p.obj.MinorNodes?.indexOf(G.Namespace+':'+e.obj.Id);if(idx>=0)text+='<p>小节点顺序 '+(idx+1)+'；对应知识阈值：'+fmt(p.obj.MinorNodeUnlockKnowledge?.[idx])+'</p>';}
 for(const [id,c] of Object.entries(G.EntityConfig))for(const field of ['MasteryGuildBonuses','MasteryGuildRanks','Pets'])if(c[field]?.some(r=>r.Id===G.Namespace+':'+e.obj.Id))text+='<p>'+skillLink(shortId(id))+' · '+({MasteryGuildBonuses:'精通奖励',MasteryGuildRanks:'精通阶级',Pets:'宠物'})[field]+'</p>';
 return text;
}
// Typed item sources: only actual item fields are indexed, so same-ID recipes do not become false references.
const sourceRows=[],useRows=[];
// Zero-chance / zero-quantity outputs are unfinished placeholders in the data (e.g. flowers "producing" Normal Log).
function addSource(e,row,basis,chance=null,quantity=null){if(!row?.Item||chance===0||(row.MaxQuantity??row.Quantity??quantity)===0)return;sourceRows.push({entry:e,item:row.Item,basis,chance,min:row.MinQuantity??row.Quantity??quantity,max:row.MaxQuantity??row.Quantity??quantity});}
function weighted(e,rows,basis,chance=1){const total=(rows||[]).reduce((s,r)=>s+(r.Weight||0),0);for(const r of rows||[])addSource(e,r,basis,total>0&&chance!==null?chance*r.Weight/total:null);}
function dropBundle(e,bundle,basis){if(!bundle)return;for(const r of bundle.FixedItems||[])addSource(e,r,basis+' · 固定',1);for(const [i,t] of (bundle.ItemTables||[]).entries())weighted(e,t.Table,basis+' · 表 '+(i+1),t.Chance);}
for(const e of entries){
 const o=e.obj;
 if(o.Product)addSource(e,o.Product,e.type==='WoodcuttingRecipe'?'每次砍倒':e.type==='MiningRecipe'?'每次挖掘':'主要产出',e.type==='MiningRecipe'?o.BaseProductChance:1);
 for(const r of o.Products||[])addSource(e,r,'完成配方 / 生产周期',r.Chance??1);
 for(const [field,basis] of [['RandomProductsPerHit','每次命中'],['RandomProductsPerCut','每次砍倒'],['SpecialProducts','特殊产出判定'],['SurveyingProducts','调查产出']])for(const r of o[field]||[])addSource(e,r,basis,r.Chance??null);
 if(o.RandomProducts)weighted(e,o.RandomProducts,'普通钓鱼产出',o.FishChance??null);
 dropBundle(e,o.Drops,'击败敌人');if(o.Rewards?.FixedItems)dropBundle(e,o.Rewards,'完成奖励');
 const open=o.Capabilities?.['MelvorBase:Openable'];if(open){for(const r of open.AlwaysDrops||[])addSource(e,r,'打开容器 · 固定',1);weighted(e,open.DropTable,'打开容器');}
 if(e.type==='ThievingRecipe'){weighted(e,o.CommonDropTable,'普通战利品（成功后）',o.BaseCommonLootChance);weighted(e,o.RareDropTable,'稀有战利品（成功后）',o.BaseRareLootChance);weighted(e,o.CompletionDropTable,'完成战利品（条件概率）',1);}
 if(e.type==='ShopPurchase')for(const r of o.Provides?.Items||[])addSource(e,r,'商店购买',1);
 if(e.type==='ItemUpgrade')addSource(e,{Item:o.UpgradedItem,Quantity:o.QuantityPerUpgrade},'物品升级',1);
 if(o.Reward?.Item)addSource(e,o.Reward,'事件奖励',o.Chance??null);
 walk(o,(node,path)=>{
  if(!Array.isArray(node)&&typeof node.Item==='string'&&/Ingredients|Costs|Eats|Treats|EntryCost/.test(path))useRows.push({entry:e,item:node.Item,path,quantity:node.Quantity});
  if(e.type==='Quest'&&!Array.isArray(node)&&typeof node.Item==='string'&&/Rewards/.test(path))addSource(e,node,'任务奖励',node.Chance??1);
 });
}
const sourcesByItem=new Map(),usesByItem=new Map();
for(const [rows,map] of [[sourceRows,sourcesByItem],[useRows,usesByItem]])for(const r of rows){if(!map.has(r.item))map.set(r.item,[]);map.get(r.item).push(r);}
function acquisition(e){
 const id=G.Namespace+':'+e.obj.Id,rows=e.type==='Item'?(sourcesByItem.get(id)||[]):[];
 return (rows.length?'<ul>'+rows.map(r=>'<li>'+eLink(r.entry)+' · '+esc(r.basis)+' · '+quantity(r)+' · '+pct(r.chance)+'</li>').join('')+'</ul>':'')+parentText(e)+gateText(e);
}
function quantity(r){return r.min==null?'—':r.min===r.max?fmt(r.min):fmt(r.min)+'–'+fmt(r.max);}
function cell(value,html){return {value,html:html??esc(typeof value==='number'?fmt(value):value??'—')};}
let tableIndex=0;
const LONG_TABLE_ROWS=15;// longer tables get a fixed-height scroll box with a sticky header
function dataTable(headers,rows,id='t'+(++tableIndex),tableClass=''){
 return '<div class="tabletools"><label>筛选本表 <input type="search" data-filter="'+id+'" placeholder="名称、英文或表内文本"></label><button data-export="'+id+'">导出 CSV</button><small>'+rows.length+' 行 · 点击列标题排序'+(rows.length>LONG_TABLE_ROWS?' · 表内滚动查看全部':'')+'</small></div><div class="tablewrap'+(rows.length>LONG_TABLE_ROWS?' scroll':'')+'"'+(rows.length>LONG_TABLE_ROWS?' tabindex="0" role="region" aria-label="可滚动表格，共 '+rows.length+' 行"':'')+'><table class="querytable '+esc(tableClass)+'" id="'+id+'"><thead><tr>'+headers.map((h,i)=>'<th scope="col" aria-sort="none"><button data-sort="'+i+'">'+esc(h)+' ↕</button></th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(c=>'<td data-value="'+esc(c?.value??'')+'">'+(c?.html??cell(c).html)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function boostCards(records){
 return boostGroups.map((group,index)=>{
  const rows=records.filter(r=>r.group===group);
  return rows.length?'<section class="boost-section"><h3 id="boost-section-'+index+'">'+esc(group)+' · '+rows.length+'</h3>'+dataTable(['来源','来源类型','效果','数值','说明'],boostRowsHtml(rows),'boost-table-'+index,'boost-table')+'</section>':'';
 }).join('');
}
function boostRowsHtml(records){return records.map(r=>{const e=byKey.get(r.key),parents=grantingParents(e),title=(e.type==='AstrologyNode'&&parents.length?parents.map(p=>p.title).join(' / ')+' · ':'')+e.title;return [cell(title,icon(e)+pageLink(e.key,title)+'<small class="en">'+esc(e.en)+'</small>'),cell(sourceKind(r)),cell(effectText(r.m),'<b>'+esc(effectText(r.m))+'</b>'),cell(r.m.Value??r.m.Chance,esc(boostValue(r.m))),cell('', '<details open><summary>'+esc(title)+' · 生效条件与获取途径</summary>'+boostScope(r)+'<h4>获取途径</h4>'+acquisition(e)+'</details>')];});}
let boostState={skill:'all',group:'',source:'',query:'',global:true};
function boostsFor(skill){return allBoostRecords.filter(r=>skill==='all'||(skill==='unknown'?!r.skills.length:r.skills.includes(skill)));}
function showBoosts(skill){
 if(!skillById.has(skill)){showSkills();return;}
 if(boostState.skill!==skill)boostState={skill,group:'',source:'',query:'',global:true};
 current='';updateList();const all=boostsFor(skill),src=[...new Set(all.map(r=>byKey.get(r.key).type))].sort();
 const rows=all.filter(r=>(!boostState.group||r.group===boostState.group)&&(!boostState.source||byKey.get(r.key).type===boostState.source)&&(boostState.global||!r.m.StatGroup)&&(!boostState.query||(byKey.get(r.key).search+' '+grantingParents(byKey.get(r.key)).map(e=>e.search).join(' ')+' '+effectText(r.m)).toLowerCase().includes(boostState.query.toLowerCase())));
 $('detail').innerHTML='<div class="breadcrumb">'+skillLink(skill)+' / Boosts</div><h2>'+esc(skillName(skill))+' / Boosts</h2><p>查看加成、来源和生效条件。共 '+new Set(all.map(r=>r.key)).size+' 个来源。</p><div class="boost-controls"><label>加成类别<select id="boost-group"><option value="">全部效果</option>'+boostGroups.map(g=>'<option '+(boostState.group===g?'selected':'')+'>'+g+'</option>').join('')+'</select></label><label>来源类型<select id="boost-source"><option value="">全部来源</option>'+src.map(t=>'<option value="'+t+'" '+(boostState.source===t?'selected':'')+'>'+esc(sourceLabels[t]||typeNames[t]||humanWord(t))+'</option>').join('')+'</select></label><label>搜索来源 / 效果<input id="boost-query" type="search" value="'+esc(boostState.query)+'" placeholder="例如：经验、间隔、抓钩"></label><label class="check"><input id="boost-global" type="checkbox" '+(boostState.global?'checked':'')+'>含全局加成</label><button id="boost-apply">应用筛选</button></div><div class="toc">'+boostGroups.filter(g=>all.some(r=>r.group===g)).map(g=>'<button data-boost-group="'+g+'">'+g+' ('+all.filter(r=>r.group===g).length+')</button>').join('')+'</div><p class="muted">显示 '+rows.length+' 条效果。限定目标、持续时间和触发要求见说明；互斥或有条件的效果不能直接相加。</p>'+boostCards(rows);
 $('detail').scrollTop=0;
}
function configEntries(skill,field){
 const rows=skillConfig(skill)[field]||[];
 const prefer={Recipes:skill==='Smithing'||['Crafting','Fletching','Runecrafting','Beastcrafting'].includes(skill)?'ArtisanRecipe':{Woodcutting:'WoodcuttingRecipe',Mining:'MiningRecipe',Cooking:'CookingRecipe',Fishing:'FishingRecipe',Firemaking:'FiremakingRecipe',Farming:'FarmingRecipe',Herblore:'HerbloreRecipe',Thieving:'ThievingRecipe'}[skill],MasteryGuildTasks:'MasteryGuildTask',MasteryGuildBonuses:'MasteryGuildBonus',MasteryGuildRanks:'MasteryGuildRank',Pets:'Pet',Constellations:'AstrologyConstellation',Animals:skill==='Ranching'?'RanchingAnimal':'HuntingAnimal',Courses:'AgilityCourse'}[field];
 return rows.flatMap(r=>{const found=byId.get(r.Id)||[];return prefer?found.filter(e=>e.type===prefer):found;});
}
function levelOf(o){const requirements=o.Requirements||o.UnlockRequirements||[];return Math.max(0,...requirements.filter(r=>shortId(r.Type)==='Level').map(r=>r.Data.Level||0),o.Level||0);}
function entrySkills(e){
 if(e.type==='Item')return (e.obj.BankTags||[]).map(t=>shortId(t.BankTag)).filter(s=>skillById.has(s));
 return entityIds(e.obj.Requirements).filter(s=>s!=='Combat');
}
function recipeTime(e){const o=e.obj;
 if(e.type==='WoodcuttingRecipe')return o.BaseInterval*o.BaseMaxHealth;
 if(e.type==='ArtisanRecipe')return o.BaseInterval*Math.max(1,o.Steps);
 if(e.type==='FishingRecipe')return (o.BaseMinInterval+o.BaseMaxInterval)/2;
 if(e.type==='HerbloreRecipe')return o.BasePreparingInterval+o.BaseHeatingInterval+o.BaseStirringInterval+o.BaseBottlingInterval;
 if(['CookingRecipe','FiremakingRecipe','FarmingRecipe','MiningRecipe'].includes(e.type))return o.BaseInterval;
 return null;
}
function recipeRows(list){return list.map(e=>{const ms=recipeTime(e),outputs=sourceRows.filter(r=>r.entry===e&&/主要|产出|完成配方/.test(r.basis));return [cell(e.title,eLink(e)+'<small class="en">'+esc(e.en)+'</small>'),cell(levelOf(e.obj),gateText(e)),cell(e.obj.BaseExperience??'',fmt(e.obj.BaseExperience)),cell(ms??'',ms?fmt(ms/1000)+' 秒':'见详情'),cell(ms&&e.obj.BaseExperience?e.obj.BaseExperience*3600000/ms:'',ms&&e.obj.BaseExperience?fmt(e.obj.BaseExperience*3600000/ms):'—'),cell('',outputs.map(r=>refLink(r.item,'Item')+' × '+quantity(r)).join('<br>')),cell('',e.obj.Ingredients?render(e.obj.Ingredients):'—')];});}
function rankRewards(bonuses,rankId){
 return bonuses.filter(b=>(b.obj.Requirements||[]).some(r=>r.Data?.Rank===rankId)).map(b=>{
  const effects=(boostByOwner.get(b.key)||[]).map(r=>esc(effectText(r.m))+(r.m.Condition?'（'+render(r.m.Condition)+'）':''));
  const rw=b.obj.Rewards||{},gifts=[...(rw.Items||[]),...(rw.Currencies||[])];
  const extra=(b.obj.Requirements||[]).filter(r=>!r.Data?.Rank);
  const note=b.obj.CustomDescription?esc(displayText(tr(b.obj.CustomDescription))):'';
  return (effects.length?'<ul>'+effects.map(x=>'<li>'+x+'</li>').join('')+'</ul>':'')+(gifts.length?render(gifts):'')+(extra.length?requirementText(extra):'')+(!effects.length&&!gifts.length?'<span class="muted">'+(note||'无奖励')+'</span>':'');
 }).join('')||'<span class="muted">—</span>';
}
function masteryTotalPoints(skill){
 return configEntries(skill,'MasteryGuildTasks').reduce((total,e)=>total+masteryTaskCategory(e)?.obj.BasePoints,0);
}
const masteryRankPoints=(rank,total)=>Math.ceil(total*(rank.obj.PointPercentRequired??NaN));
function masteryRankTable(ranks,skill,id){
 const total=masteryTotalPoints(skill),bonuses=configEntries(skill,'MasteryGuildBonuses');
 const rows=ranks.map(e=>{
  const ratio=e.obj.PointPercentRequired,points=masteryRankPoints(e,total);
  return [cell(e.title,link(e)),cell(points,fmt(points,0)),cell(ratio,pct(ratio)),cell('',rankRewards(bonuses,G.Namespace+':'+e.obj.Id))];
 });
 return dataTable(['阶级','所需精通点数','所需精通进度','奖励'],rows,id);
}
function masterySection(id){
 const ranks=configEntries(id,'MasteryGuildRanks');
 if(!ranks.length)return '';
 return '<section><h3>精通阶级与奖励 · '+ranks.length+'</h3><p class="muted">累计达到所需精通点数即可晋升并获得对应奖励。</p>'+masteryRankTable(ranks,id,'mastery')+'</section>';
}
// One table for all skills: guild ranks and the rewards they unlock (both type routes land here).
function masteryTablePage(){
 const ranks=skillEntries.flatMap(s=>configEntries(s.id,'MasteryGuildRanks'));
 $('detail').innerHTML='<div class="breadcrumb">'+pageLink('','首页')+' › '+pageLink('@index','全部条目')+'</div><h2>精通公会阶级与奖励</h2><p>累计达到所需精通点数即可晋升并获得对应奖励。共 '+ranks.length+' 个阶级，按技能分区。</p>'+
  skillSections(ranks,skillOfEntry,(list,skill)=>masteryRankTable(list,skill));
}
// Owning skill of an entry: the skill config that lists it, else the skill named by its goal / trigger / requirements.
const skillFields=['Recipes','Animals','Courses','Constellations','MasteryGuildRanks','MasteryGuildBonuses','MasteryGuildTasks','Pets'];
const ownerSkill=new Map();
for(const s of skillEntries)for(const field of skillFields)for(const e of configEntries(s.id,field))if(!ownerSkill.has(e.key))ownerSkill.set(e.key,s.id);
function skillOfEntry(e){return ownerSkill.get(e.key)||entityIds([e.obj.Goal,e.obj.Trigger,e.obj.Requirements,e.obj.UnlockRequirements]).find(s=>s!=='Combat')||'';}
// Items go under the skill that produces them (a guaranteed product first); items no skill makes go to "其他".
function skillOfItem(e){const rows=(sourcesByItem.get(G.Namespace+':'+e.obj.Id)||[]).filter(r=>ownerSkill.has(r.entry.key));return ownerSkill.get((rows.find(r=>r.chance===1)||rows[0])?.entry.key)||'';}
// Split a list spanning several skills into one titled section per skill (game order, "其他" last).
function skillSections(list,skillOf,renderPart,{tag='h3',other='其他'}={}){
 const groups=new Map([...skillEntries.map(s=>[s.id,[]]),['',[]]]);
 for(const x of list)(groups.get(skillOf(x))??groups.get('')).push(x);
 const used=[...groups].filter(([,rows])=>rows.length);
 if(used.length<2)return renderPart(list,used[0]?.[0]||'');
 return used.map(([skill,rows])=>'<section class="skill-group"><'+tag+' class="skill-group-title">'+(skill?skillIcon(skill,22)+esc(skillName(skill)):esc(other))+' · '+rows.length+'</'+tag+'>'+renderPart(rows,skill)+'</section>').join('');
}
function showSkill(id){
 const s=skillById.get(id);if(!s){wikiHome();return;}current='';updateList();
 const recipes=configEntries(id,'Recipes');const tabs=['Recipes','Animals','Courses','Constellations','MasteryGuildRanks','MasteryGuildBonuses','MasteryGuildTasks','Pets'];
 $('detail').innerHTML='<div class="breadcrumb">'+pageLink('@skills','技能总览')+'</div><h2>'+icon(s.entry,42)+esc(s.title)+'</h2><p>'+esc(s.entry.en)+' · '+boostLink(id)+' · '+pageLink('@guides','训练与解锁指南')+'</p><div class="note"><b>查看本技能的全部加成来源：</b> '+boostLink(id)+'。经验、间隔、翻倍、保留、收益和特殊效果均可按来源筛选。</div><h3>技能解锁条件</h3>'+gateText(s.entry)+(recipes.length?'<h3>配方与等级解锁</h3><p class="muted">基础周期：伐木按生命值次命中、工匠按步骤计时；钓鱼使用平均间隔。未计加成、失败、额外等待与银行满等中断。基础 XP/h 是该假设下的参考值。</p>'+dataTable(['目标 / 配方','解锁条件','基础 XP','基础周期','基础 XP/h','产物','材料'],recipeRows(recipes),'recipes'):'')+tabs.filter(f=>f!=='Recipes').map(field=>{if(field==='MasteryGuildRanks')return masterySection(id);if(field==='MasteryGuildBonuses')return '';const list=configEntries(id,field);return list.length?'<section><h3>'+esc(({Animals:'动物',Courses:'敏捷路线',Constellations:'星座',MasteryGuildRanks:'精通阶级',MasteryGuildBonuses:'精通奖励',MasteryGuildTasks:'精通任务',Pets:'宠物'})[field])+' · '+list.length+'</h3>'+dataTable(field==='MasteryGuildTasks'?masteryTaskHeaders:skillDetailHeaders,skillDetailRows(list))+'</section>':'';}).join('');
 $('detail').scrollTop=0;
}
function relatedTable(e,kind){const id=G.Namespace+':'+e.obj.Id,opts={tag:'h4'};
 if(kind==='sources'){const rows=sourcesByItem.get(id)||[];return rows.length?skillSections(rows,r=>skillOfEntry(r.entry),part=>dataTable(['来源','获取方式','数量','基础概率','条件'],part.map(r=>[cell(r.entry.title,eLink(r.entry)),cell(r.basis),cell(r.min??'',quantity(r)),cell(r.chance??'',pct(r.chance)),cell('',gateText(r.entry))])),{...opts,other:'其他来源'}):'<p class="muted">暂无已知的直接获取途径。</p>';}
 const rows=[...new Map((usesByItem.get(id)||[]).map(r=>[r.entry.key,r])).values()];return rows.length?skillSections(rows,r=>skillOfEntry(r.entry),part=>dataTable(['用于','消耗数量','条件'],part.map(r=>[cell(r.entry.title,eLink(r.entry)),cell(r.quantity??'',fmt(r.quantity)),cell('',gateText(r.entry))])),{...opts,other:'其他用途'}):'<p class="muted">暂无已知的配方材料、费用或其他消耗记录。</p>';
}
function entryBoosts(e){const records=boostByOwner.get(e.key)||[];return records.length?'<h3>使用效果</h3><ul>'+records.map(r=>'<li>'+esc(effectText(r.m))+(r.m.Condition?'，需满足：'+render(r.m.Condition):'')+'</li>').join('')+'</ul>':'';}
function shopSections(list,renderPart){
 const shop=skillConfig('Shop');
 const order=field=>new Map([...(shop[field]||[])].sort((a,b)=>a.Priority-b.Priority).map((r,i)=>[shortId(r.Id),i]));
 const categories=order('Categories'),subcategories=order('Subcategories');
 const rank=(order,id)=>order.get(id)??order.size;
 const purchases=new Map([...subcategories.keys()].map(id=>[id,[]]));
 for(const e of list){
  const id=shortId(e.obj.Subcategory);
  const key=byKey.has('ShopSubcategory/'+id)?id:'';
  if(!purchases.has(key))purchases.set(key,[]);
  purchases.get(key).push(e);
 }
 const groups=new Map();
 for(const [id,rows] of [...purchases].sort(([a],[b])=>rank(subcategories,a)-rank(subcategories,b))){
  const sub=byKey.get('ShopSubcategory/'+id);
  if(!sub&&!rows.length)continue;
  const category=byKey.get('ShopCategory/'+shortId(sub?.obj.Category));
  if(!groups.has(category))groups.set(category,[]);
  groups.get(category).push([sub,rows]);
 }
 return [...groups].sort(([a],[b])=>rank(categories,a?.obj.Id)-rank(categories,b?.obj.Id)).map(([category,sections])=>
  '<section><h3 class="skill-group-title">'+icon(category,22)+esc(category?.title||'其他')+'</h3>'+
  sections.map(([sub,rows])=>'<h4 class="skill-group-title">'+esc(sub?.title||'未分类')+'</h4>'+
   (rows.length?renderPart(rows):'<p class="muted">暂无购买项目。</p>')).join('')+'</section>').join('');
}
function browse(type){
 if(type==='MasteryGuildRank'||type==='MasteryGuildBonus')return masteryTablePage();
 const list=entries.filter(e=>e.type===type);current='';updateList();
 let headers=['名称','分类','等级 / 条件','出售价格'],toRows=part=>part.map(e=>[cell(e.title,eLink(e)+'<small class="en">'+esc(e.en)+'</small>'),cell(shortId(e.obj.Category)||typeNames[type]||type,render(e.obj.Category||e.obj.Capabilities?.['MelvorBase:Equipment']?.Type||typeNames[type]||type)),cell(levelOf(e.obj),gateText(e)),cell(e.obj.SellsFor?.Quantity??'',e.obj.SellsFor?render(e.obj.SellsFor):'—')]);
 if(/Recipe$/.test(type)){headers=['目标 / 配方','解锁','基础 XP','基础周期','基础 XP/h','产物','材料'];toRows=recipeRows;}
 if(type==='Enemy'){headers=['敌人','等级属性','元素','掉落表'];toRows=part=>part.map(e=>[cell(e.title,eLink(e)),cell('',render(e.obj.Levels)),cell(shortId(e.obj.Element),render(e.obj.Element)),cell('',pageLink(e.key,'查看掉落与区域'))]);}
 if(type==='ShopPurchase'){headers=['商店项目','费用','解锁条件','提供'];toRows=part=>part.map(e=>[cell(e.title,eLink(e)),cell('',render(e.obj.Costs)),cell(levelOf(e.obj),gateText(e)),cell('',render(e.obj.Provides))]);}
 if(type==='Pet'||type==='MasteryGuildTask'){headers=type==='MasteryGuildTask'?masteryTaskHeaders:skillDetailHeaders;toRows=skillDetailRows;}
 // Skill-related lists are split into one section per skill; others stay a single table.
 const skillOf=type==='Item'?skillOfItem:/Recipe$/.test(type)||type==='Pet'||type==='MasteryGuildTask'?skillOfEntry:null;
 const table=part=>dataTable(headers,toRows(part));
 const body=type==='ShopPurchase'?shopSections(list,table):skillOf?skillSections(list,skillOf,table,{other:type==='Item'?'其他物品（非技能产出）':'其他'}):dataTable(headers,toRows(list),'browse');
 const grouping=type==='ShopPurchase'?' · 按商店类别与子类别分区':skillOf?' · 按技能分区':'';
 $('detail').innerHTML='<h2>'+esc(typeNames[type]||type)+'</h2><p>'+list.length+' 个条目'+grouping+' · 所有列可排序，支持表内筛选与导出。</p>'+body;$('detail').scrollTop=0;
}
function showSkills(){current='';updateList();$('detail').innerHTML='<h2>技能总览</h2><p>查看技能的解锁要求、配方、训练与相关效果。</p><div class="skillgrid">'+skillEntries.map(s=>'<article>'+icon(s.entry,38)+'<h3>'+skillLink(s.id)+'</h3><small>'+esc(s.entry.en)+'</small><p>'+configEntries(s.id,'Recipes').length+' 个配方</p></article>').join('')+'</div>';}
const storage={get(key,fallback){try{return JSON.parse(localStorage.getItem('melvor2-wiki-'+key))??fallback;}catch{return fallback;}},set(key,value){try{localStorage.setItem('melvor2-wiki-'+key,JSON.stringify(value));}catch{}}};
let favorites=storage.get('favorites',[]).filter(k=>byKey.has(k)),recent=storage.get('recent',[]).filter(k=>byKey.has(k));
function remember(key){recent=[key,...recent.filter(k=>k!==key)].slice(0,16);storage.set('recent',recent);}
function equipmentStats(e){const equip=e.obj.Capabilities?.['MelvorBase:Equipment'];const map=new Map();for(const r of equip?.Stats?.Stats||[])map.set(shortId(r.Stat),r.Value);for(const [type,label] of [['PowerRatings','威力'],['ProtectionRatings','防护']])for(const r of equip?.Stats?.[type]||[])map.set(label+' / '+shortId(r.DamageType),r.Value);return map;}
const equipment=entries.filter(e=>e.type==='Item'&&e.obj.Capabilities?.['MelvorBase:Equipment']);
function equipmentPage(){
 const rows=equipment.map(e=>[cell(e.title,eLink(e)),cell(shortId(e.obj.Capabilities['MelvorBase:Equipment'].Type),render(e.obj.Capabilities['MelvorBase:Equipment'].Type)),cell('',render(e.obj.Capabilities['MelvorBase:Equipment'].Requirements)),cell('',render(e.obj.Capabilities['MelvorBase:Equipment'].Stats)),cell('',pageLink(e.key,'来源与效果'))]);
 const options=equipment.map(e=>'<option value="'+esc(e.key)+'">'+esc(e.title+' / '+e.en)+'</option>').join('');
 $('detail').innerHTML='<h2>装备属性与对比</h2><p>比较装备基础属性与使用效果。</p><div class="calcform"><label>装备 A<select id="compare-a">'+options+'</select></label><label>装备 B<select id="compare-b">'+options+'</select></label><button id="compare-run">比较</button></div><div id="compare-result"></div>'+dataTable(['装备','类型','装备条件','基础属性','详情'],rows,'equipment');
}
function compareEquipment(a,b){const ea=byKey.get(a),eb=byKey.get(b),sa=equipmentStats(ea),sb=equipmentStats(eb);const keys=[...new Set([...sa.keys(),...sb.keys()])];return dataTable(['属性',ea.title,eb.title,'B − A'],keys.map(k=>[cell(k,tr(k)),cell(sa.get(k)||0),cell(sb.get(k)||0),cell((sb.get(k)||0)-(sa.get(k)||0),signed((sb.get(k)||0)-(sa.get(k)||0)))]))+'<h3>装备 A 加成</h3>'+entryBoosts(ea)+'<h3>装备 B 加成</h3>'+entryBoosts(eb);}
function xpForLevel(level){if(!Number.isInteger(level)||level<1||level>200)throw new Error('等级范围为 1–200');let sum=0;const base=Math.pow(2,1/7);for(let i=1;i<level;i++)sum+=Math.floor(i+300*Math.pow(base,i));return Math.floor(sum/4);}
function dropStats(p,n,confidence){if(!Number.isFinite(p)||p<0||p>1||!Number.isSafeInteger(n)||n<0||!Number.isFinite(confidence)||confidence<=0||confidence>=1)throw new Error('概率需为 0–100%，次数需为非负整数，目标概率需大于 0% 且小于 100%');return {expected:p*n,atLeast:p===1?(n>0?1:0):-Math.expm1(n*Math.log1p(-p)),needed:p===0?Infinity:p===1?1:Math.ceil(Math.log1p(-confidence)/Math.log1p(-p))};}
function production(e,actions,interval,xpBonus=0){if(!Number.isSafeInteger(actions)||actions<1||actions>1e9||!Number.isFinite(interval)||interval<=0||!Number.isFinite(xpBonus)||xpBonus< -100)throw new Error('输入有效的次数、间隔与经验加成');return {time:actions*interval/1000,xp:actions*(e.obj.BaseExperience||0)*(1+xpBonus/100),costs:(e.obj.Ingredients?.Items||[]).map(r=>({...r,Quantity:r.Quantity*actions})),products:(e.obj.Products||(e.obj.Product?[e.obj.Product]:[])).map(r=>({...r,Quantity:(r.Quantity||1)*(r.Chance??1)*actions}))};}
function toolsPage(){const recipes=entries.filter(e=>recipeTime(e)&&e.obj.BaseExperience!=null);$('detail').innerHTML='<h2>计算工具与经验表</h2><div class="toc"><a href="#xp-tool" data-scroll="xp-tool">经验与升级</a><a href="#drop-tool" data-scroll="drop-tool">掉落概率</a><a href="#production-tool" data-scroll="production-tool">生产与材料</a></div><section id="xp-tool"><h3>升级所需经验</h3><p>标准技能曲线已从游戏程序的经验表核对；当前技能默认上限 99，以上为虚拟等级。特殊技巧 / 动物日志使用独立经验表。</p><div class="calcform"><label>当前经验<input id="xp-current" type="number" min="0" value="0"></label><label>目标等级<input id="xp-target" type="number" min="1" max="200" value="99"></label><label>每小时经验<input id="xp-rate" type="number" min="0" value="10000"></label><button id="xp-run">计算升级</button></div><p id="xp-result" role="status"></p><h3>等级 1–120 经验表</h3>'+dataTable(['等级','累计经验','本级所需经验'],Array.from({length:120},(_,i)=>[cell(i+1),cell(xpForLevel(i+1)),cell(i?xpForLevel(i+1)-xpForLevel(i):0)]),'xp-table')+'</section><section id="drop-tool"><h3>掉落概率</h3><p>假定每次独立且概率固定；重复掉落表、保底和动态加成不能直接套用。</p><div class="calcform"><label>单次概率（%）<input id="drop-p" type="number" value="1" min="0" max="100" step="any"></label><label>判定次数<input id="drop-n" type="number" value="100" min="0"></label><label>目标至少一次概率（%）<input id="drop-confidence" type="number" value="95" min="0" max="100" step="any"></label><button id="drop-run">计算掉率</button></div><p id="drop-result" role="status"></p></section><section id="production-tool"><h3>生产时间与材料</h3><p>自行确认完整周期。默认按无加成基础周期填入；狩猎、扒窃等多阶段或失败机制不自动推算。产出是数学期望；不计随机附加掉落及保留、翻倍。</p><div class="calcform"><label>配方<select id="production-recipe">'+recipes.map(e=>'<option value="'+esc(e.key)+'">'+esc(e.title+' / '+e.type)+'</option>').join('')+'</select></label><label>完成次数<input id="production-n" type="number" min="1" max="1000000000" value="100"></label><label>完整周期（毫秒）<input id="production-interval" type="number" value="'+recipeTime(recipes[0])+'" min="1"></label><label>经验加成（%）<input id="production-xp" type="number" value="0" min="-100" step="any"></label><button id="production-run">计算生产</button></div><div id="production-result" role="status"></div></section>';}
function guidesPage(){
 $('detail').innerHTML='<h2>攻略与机制导航</h2><p>查找技能解锁、训练、材料规划和战斗准备方法。</p><div class="toc">'+['新手路线','训练与加成','赚钱与材料','战斗准备','精通与占星','常见问题与术语'].map((t,i)=>'<a href="#guide-'+i+'" data-scroll="guide-'+i+'">'+t+'</a>').join('')+'</div><section id="guide-0"><h3>新手路线：按解锁条件推进</h3><p>查看各技能解锁要求，先准备指定等级和物品。请结合技能等级、任务进度和所需物品安排解锁顺序。</p>'+dataTable(['系统 / 技能','解锁要求','加成'],entries.filter(e=>/NavigationOption$/.test(e.type)&&e.type!=='LegacySkillNavigationOption').map(e=>[cell(e.title,eLink(e)),cell('',gateText(e)),cell('',skillById.has(shortId(e.obj.Entity))?skillLink(shortId(e.obj.Entity)):'—')]))+'</section><section id="guide-1"><h3>训练与加成</h3><ol><li>进入技能页，按等级与材料选择可用配方。</li><li>打开对应 Boosts，依次查看经验、间隔、翻倍与保留类别。</li><li>展开“条件与获取”，核对限定目标、占星节点、装备槽位与触发条件。</li><li>用生产计算器输入实际完整周期，估算经验、时间和材料。</li></ol>'+pageLink('@skills','查看技能')+'</section><section id="guide-2"><h3>赚钱与材料规划</h3><p>物品表支持按出售价格排序。物品页列直接获取途径和材料用途；配方页显示基础产出。净收益需要扣除原材料与货币成本，再结合真实成功率和加成，不能只按单价判断。</p>'+pageLink('@table/Item','物品价格表')+' · '+pageLink('@table/ShopPurchase','商店升级与费用')+' · '+pageLink('@tools','生产计算器')+'</section><section id="guide-3"><h3>战斗准备</h3><p>先查区域要求、敌人属性与攻击效果，再用装备页对比基础属性。食物、祈祷、药水、套装与宠物效果可以在战斗技能 Boosts 中查询。当前未提供未经实战验证的“绝对安全挂机”结论。</p>'+pageLink('@combat','战斗查询')+' · '+pageLink('@equipment','装备对比')+'</section><section id="guide-4"><h3>精通与占星</h3><p>技能页可以查看精通阶级、任务与奖励；占星节点可以查看所属星座和解锁要求。</p>'+pageLink('@table/AstrologyConstellation','星座表')+' · '+pageLink('@table/MasteryGuildBonus','精通奖励表')+'</section><section id="guide-5"><h3>常见问题与术语</h3>'+dataTable(['术语 / 问题','含义'],[['XP','技能经验；XP/h 是每小时经验。'],['间隔','动作或步骤耗时，1000 毫秒 = 1 秒；步骤不一定等于完整配方。'],['翻倍与保留','翻倍改变产出，保留改变消耗；不必然提高经验。'],['基础掉率与表内占比','基础掉率表示每次判定的几率；表内占比表示抽中该奖励时在同组奖励中所占比例。'],['随等级变化的效果','按对应技能等级提高的效果会注明每级收益。'],['为什么物品无法获得？','部分内容可能尚未开放，暂时无法在游戏中获得。'],['与初代 Wiki 的关系','对齐玩家查询功能；初代 DLC、召唤、城镇等不存在于本机数据的系统不会伪造。'],['离线记录存在哪里？','收藏和最近浏览保存在当前浏览器本地；移动文件或清除网站数据可能改变或清除这些记录。']].map(r=>r.map(x=>cell(x))))+'</section>';
}
function combatPage(){ $('detail').innerHTML='<h2>战斗资料</h2><div class="toc">'+[['Enemy','敌人'],['CombatArea','战斗区域'],['Dungeon','地下城'],['Attack','攻击'],['MagicSpell','魔法'],['Prayer','祈祷'],['EquipmentSetBonus','装备套装'],['CombatPassive','战斗被动']].map(([t,n])=>pageLink('@table/'+t,n)).join('')+'</div><h3>战斗技能</h3><div class="toc">'+combatSkills.map(skillLink).join('')+'</div><h3>区域与地下城</h3>'+dataTable(['区域','类别','解锁条件','敌人 / 波次'],entries.filter(e=>['CombatArea','Dungeon'].includes(e.type)).map(e=>[cell(e.title,eLink(e)),cell(e.type,typeNames[e.type]),cell(levelOf(e.obj),gateText(e)),cell('',render(e.obj.Enemies))]),'areas');}
function infoPage(){ $('detail').innerHTML='<h2>关于本 Wiki</h2><p>Melvor Idle 2 中文 Wiki 是非官方玩家资料站，用于查询技能、物品、配方与战斗资料。内容根据游戏 v'+esc(DATA.version)+' 的数据文件整理，游戏更新后会随之更新。</p><p>可以直接在线浏览，也可以从 <a href="https://github.com/Leager-zju/MelvorIdle2-WIKI">GitHub 仓库</a>下载，双击 index.html 离线使用。收藏与最近浏览只保存在你当前的浏览器里。</p><p>技能相关加成请从具体技能页面查看。游戏内容与图像版权归 Games by Malcs 所有。</p>';}
function showSaved(){ $('detail').innerHTML='<h2>收藏与最近浏览</h2><h3>收藏</h3>'+(favorites.map(k=>'<p>'+eLink(byKey.get(k))+'</p>').join('')||'<p class="muted">在条目页点击“收藏此页”。</p>')+'<h3>最近浏览</h3>'+recent.map(k=>'<p>'+eLink(byKey.get(k))+'</p>').join('');}
// Replace baseline routing while preserving its existing, shareable object keys.
function routeWiki(){
 let key;try{key=decodeURIComponent(location.hash.slice(1));}catch{key='';}
 if(key.startsWith('@random')){const pool=entries.filter(e=>articleTypes.has(e.type));location.replace('#'+encodeURIComponent(pool[Math.floor(Math.random()*pool.length)].key));return;}
 routePage(key);afterRoute(key);
}
function routePage(key){
 if(key.endsWith('/Boosts')&&skillById.has(key.split('/')[0]))return showBoosts(key.split('/')[0]);
 if(skillById.has(key))return showSkill(key);
 if(byKey.has(key))return showWikiEntry(key);
 const [route,...rest]=key.split('/'),id=rest.join('/');
 if(route==='@search')return searchPage(id);if(route==='@links')return linksHerePage(id);if(route==='@index')return indexPage();
 if(route==='@boosts')return skillById.has(id)?showBoosts(id):showSkills();if(route==='@skill')return showSkill(id);if(route==='@table'&&types.includes(id))return browse(id);
 if(route==='@skills')return showSkills();if(route==='@equipment')return equipmentPage();if(route==='@combat')return combatPage();
 if(route==='@tools')return toolsPage();if(route==='@combat-simulator')return combatSimulatorPage();if(route==='@guides')return guidesPage();if(route==='@info')return infoPage();if(route==='@favorites')return showSaved();
 wikiHome();
}
function navigate(key){if(decodeURIComponent(location.hash.slice(1))===key)routeWiki();else location.hash=encodeURIComponent(key);}
function applyBoostFilters(){boostState.group=$('boost-group').value;boostState.source=$('boost-source').value;boostState.query=$('boost-query').value;boostState.global=$('boost-global').checked;showBoosts(boostState.skill);}
function sortValues(a,b,direction=1){const numeric=a!==''&&b!==''&&Number.isFinite(Number(a))&&Number.isFinite(Number(b));return direction*(numeric?Number(a)-Number(b):String(a).localeCompare(String(b),'zh-CN',{numeric:true}));}
function csvValue(v){let text=String(v??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
$('list').addEventListener('mousedown',event=>event.preventDefault());// keep focus so the link click lands
let queryTimer;$('search').addEventListener('input',()=>{clearTimeout(queryTimer);queryTimer=setTimeout(updateList,120);});
$('search').addEventListener('focus',updateList);
$('search').addEventListener('blur',()=>{$('list').hidden=true;});
$('search').addEventListener('keydown',event=>{
 if(event.key==='Escape'){$('list').hidden=true;return;}
 if(event.key!=='Enter')return;clearTimeout(queryTimer);updateList();const q=$('search').value.trim();if(!q)return;
 const top=filtered[0],exact=top&&[top.title,top.en].some(t=>t.toLowerCase()===q.toLowerCase());
 navigate(exact?top.key:'@search/'+q);$('search').blur();
});
$('detail').addEventListener('input',event=>{
 const input=event.target;if(input.dataset.filter){const query=input.value.toLowerCase();for(const row of $(input.dataset.filter).tBodies[0].rows)row.hidden=!row.textContent.toLowerCase().includes(query);}
});
$('detail').addEventListener('change',event=>{if(event.target.id==='production-recipe')$('production-interval').value=recipeTime(byKey.get(event.target.value));});
$('detail').addEventListener('click',event=>{
 const target=event.target.closest('button,a');if(!target)return;
 if(target.dataset.scroll){event.preventDefault();$(target.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'});return;}
 if(target.dataset.boostGroup){boostState.group=target.dataset.boostGroup;showBoosts(boostState.skill);return;}
 if(target.dataset.sort!==undefined){const th=target.closest('th'),table=target.closest('table'),index=Number(target.dataset.sort),direction=th.getAttribute('aria-sort')==='ascending'?-1:1;for(const h of table.querySelectorAll('th'))h.setAttribute('aria-sort','none');th.setAttribute('aria-sort',direction===1?'ascending':'descending');const rows=[...table.tBodies[0].rows];rows.sort((a,b)=>sortValues(a.cells[index].dataset.value,b.cells[index].dataset.value,direction));rows.forEach(r=>table.tBodies[0].appendChild(r));return;}
 if(target.dataset.export){const table=$(target.dataset.export),rows=[...table.rows].filter(r=>!r.hidden),csv='\ufeff'+rows.map(r=>[...r.cells].map(c=>csvValue(c.innerText)).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Melvor2-'+target.dataset.export+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
 if(target.id==='boost-apply')return applyBoostFilters();
 if(target.id==='bookmark'){const key=target.dataset.key;favorites=favorites.includes(key)?favorites.filter(k=>k!==key):[...favorites,key];storage.set('favorites',favorites);target.textContent=favorites.includes(key)?'取消收藏':'收藏此页';return;}
 if(target.id==='compare-run'){$('compare-result').innerHTML=compareEquipment($('compare-a').value,$('compare-b').value);return;}
 try{
  if(target.id==='xp-run'){const xp=Number($('xp-current').value),level=Number($('xp-target').value),rate=Number($('xp-rate').value);if(!Number.isFinite(xp)||xp<0||!Number.isFinite(rate)||rate<0)throw new Error('当前经验和每小时经验必须为非负数');const need=Math.max(0,xpForLevel(level)-xp);$('xp-result').textContent='目标累计 '+fmt(xpForLevel(level))+' XP；还需 '+fmt(need)+' XP'+(rate>0?'；约 '+fmt(need/rate)+' 小时':'；输入速率后可计算时间');}
  if(target.id==='drop-run'){const r=dropStats(Number($('drop-p').value)/100,Number($('drop-n').value),Number($('drop-confidence').value)/100);$('drop-result').textContent='期望命中 '+fmt(r.expected)+' 次；至少一次概率 '+pct(r.atLeast)+'；达到目标概率约需 '+(Number.isFinite(r.needed)?fmt(r.needed,0)+' 次':'无法达到');}
  if(target.id==='production-run'){const e=byKey.get($('production-recipe').value),r=production(e,Number($('production-n').value),Number($('production-interval').value),Number($('production-xp').value));$('production-result').innerHTML='<p>时间 '+fmt(r.time/3600)+' 小时 · 经验 '+fmt(r.xp)+' XP</p><h4>消耗材料</h4>'+render(r.costs)+'<h4>期望主产出</h4>'+render(r.products);}
 }catch(error){const id=target.id==='xp-run'?'xp-result':target.id==='drop-run'?'drop-result':'production-result';$(id).textContent=error.message;}
});
