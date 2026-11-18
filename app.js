
'use strict';
const DATA=JSON.parse(document.getElementById('payload').textContent);
const G=DATA.game,T=DATA.translations,C=DATA.contextual;
const typeNames={Item:'物品',Enemy:'敌人',ArtisanRecipe:'工匠配方',CookingRecipe:'烹饪配方',WoodcuttingRecipe:'伐木',MiningRecipe:'采矿',FishingRecipe:'钓鱼',FiremakingRecipe:'生火',FarmingRecipe:'种植配方',HerbloreRecipe:'草药配方',ShopPurchase:'商店购买',Quest:'任务',CombatArea:'战斗区域',Dungeon:'地下城',ItemUpgrade:'物品升级',MasteryGuildTask:'精通公会任务',MasteryGuildBonus:'精通公会奖励',MasteryGuildRank:'精通公会阶级',Pet:'宠物',MagicSpell:'魔法',Prayer:'祈祷',Attack:'攻击',CombatPassive:'战斗被动',RanchingAnimal:'畜牧动物',RanchingAnimalVariant:'动物变种',RanchingEnclosure:'畜牧围栏',HuntingAnimal:'狩猎动物',HuntingLocation:'狩猎地点',ThievingRecipe:'扒窃目标',ThievingLocation:'扒窃地点',AgilityCourse:'敏捷路线',AgilityObstacle:'敏捷障碍',AstrologyConstellation:'占星星座',AstrologyNode:'占星节点',SkillNavigationOption:'技能解锁',LegacySkillNavigationOption:'技能入口',FarmingPlot:'种植地块',FishingLocation:'钓鱼地点',Currency:'货币',NPC:'角色',RecipeCategory:'配方分类',RecipeSubcategory:'配方子类'};
const labels={Id:'ID',DisplayName:'名称',Singular:'单数',Plural:'复数',Description:'描述',SellsFor:'出售价格',Currency:'货币',Quantity:'数量',Capabilities:'物品能力',Requirements:'使用 / 解锁条件',DisplayRequirements:'显示条件',UnlockRequirements:'解锁条件',Level:'等级',Levels:'等级属性',Stats:'属性',Stat:'属性类型',Value:'值',Type:'类型',Data:'条件数据',Component:'组件',Entity:'技能 / 实体',Ingredients:'消耗材料',Costs:'费用',Items:'物品',Currencies:'货币',Products:'产出',Product:'主要产出',BaseExperience:'基础经验',BaseInterval:'基础间隔（毫秒）',BaseMinInterval:'最短基础间隔（毫秒）',BaseMaxInterval:'最长基础间隔（毫秒）',Chance:'概率（0–1）',Weight:'权重（非百分比）',MinQuantity:'最少数量',MaxQuantity:'最多数量',Drops:'掉落',FixedItems:'固定掉落',ItemTables:'随机掉落表',Table:'表',FixedCurrencies:'货币掉落',Category:'分类',Subcategory:'子类',BaseMaxHealth:'基础生命',BaseProductChance:'基础产出概率（0–1）',RandomProductsPerHit:'每次命中的随机产出',RandomProductsPerCut:'每次砍倒的随机产出',RandomProducts:'随机产物',SpecialProducts:'特殊产物',FishChance:'鱼类概率（0–1）',JunkItem:'垃圾产物',Bonuses:'加成',Rewards:'奖励',Reward:'奖励',Provides:'提供',Steps:'步骤',Goal:'目标',Goals:'目标',IsOr:'或条件',Enemies:'敌人',Attacks:'攻击',Passives:'被动',DamageType:'伤害类型',Element:'元素',AttackInterval:'攻击间隔',BasePoints:'基础点数',DefaultBuyLimit:'购买上限',RootItems:'原始物品',UpgradedItem:'升级后物品',QuantityPerUpgrade:'每次升级数量',Equipment:'装备',CombatStyle:'战斗风格',Stance:'姿态',Stances:'姿态',PowerRatings:'威力',ProtectionRatings:'防护',MaxProgress:'目标数量',Recipe:'配方',Location:'地点',Item:'物品',Rank:'阶级',Skill:'技能',Global:'全局',Condition:'条件',Scaling:'缩放',IgnoreCompletion:'不计入收集完成度',CustomDescription:'自定义描述',Dialogue:'对话',DialogueText:'对话文本',Npc:'角色',CompletedDescription:'完成描述',AutomationCosts:'自动化费用',AutomationRequirements:'自动化条件',Difficulty:'难度',BaseKnowledge:'基础知识',PointPercentRequired:'所需点数比例',Regrows:'再生次数',RegrowInterval:'再生间隔（毫秒）',AttackStance:'攻击姿态',Charges:'次数',Amount:'数量'};
const $=id=>document.getElementById(id);
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tr=(x,context='')=>typeof x==='string'?(C[context+'\x04'+x]||T[x]||x):x;
const plain=x=>String(x??'').replace(/\[\/?[^\]]+\]/g,'');
const english=o=>typeof o.DisplayName==='object'?(o.DisplayName?.Singular||o.Id):(o.DisplayName||o.TrackName||o.Id);
const name=(o,type)=>plain(tr(english(o),type+'.DisplayName'));
const entries=[],byKey=new Map(),byId=new Map(),reverse=new Map();
for(const [type,objects] of Object.entries(G.Objects))for(const obj of objects){
 const key=type+'/'+obj.Id,entry={key,type,obj,title:name(obj,type),en:english(obj)};
 entry.search=(entry.title+' '+entry.en+' '+obj.Id+' '+plain(tr(obj.Description||obj.CustomDescription||''))).toLowerCase();
 entries.push(entry);byKey.set(key,entry);const id=G.Namespace+':'+obj.Id;if(!byId.has(id))byId.set(id,[]);byId.get(id).push(entry);
}
function collect(value,path,entry){
 if(typeof value==='string'&&value.startsWith(G.Namespace+':')){if(!reverse.has(value))reverse.set(value,[]);reverse.get(value).push({key:entry.key,path});}
 else if(Array.isArray(value))value.forEach((v,i)=>collect(v,path+'['+i+']',entry));
 else if(value&&typeof value==='object')for(const [k,v] of Object.entries(value))collect(v,path?path+'.'+k:k,entry);
}
entries.forEach(e=>collect(e.obj,'',e));
function resolve(id,field){
 const candidates=byId.get(id)||[];
 const expected={Item:'Item',UpgradedItem:'Item',JunkItem:'Item',Currency:'Currency',Enemy:'Enemy',Enemies:'Enemy',Npc:'NPC',Rank:'MasteryGuildRank',ShopPurchase:'ShopPurchase',Attack:'Attack',Attacks:'Attack',Location:'FishingLocation'}[field];
 if(expected){const exact=candidates.find(e=>e.type===expected);if(exact)return [exact];}
 return candidates;
}
function link(e){return '<a href="#'+encodeURIComponent(e.key)+'">'+esc(e.title)+'</a>';}
function render(value,field='',depth=0){return playerRender(value,field,depth);}
const types=Object.keys(G.Objects).filter(t=>G.Objects[t].length);
const priority=['Item','Enemy','ArtisanRecipe','CookingRecipe','WoodcuttingRecipe','MiningRecipe','FishingRecipe','FiremakingRecipe','FarmingRecipe','HerbloreRecipe','ShopPurchase','CombatArea','Dungeon','Quest','SkillNavigationOption'];
types.sort((a,b)=>(priority.includes(a)?priority.indexOf(a):999)-(priority.includes(b)?priority.indexOf(b):999)||a.localeCompare(b));
let shown=200,current='',filtered=[];
// Exact name first, then prefix, then substring; ties prefer common types and shorter names.
function searchEntries(query){
 const q=query.trim().toLowerCase();if(!q)return [];
 const rank=e=>{const t=e.title.toLowerCase(),n=e.en.toLowerCase();return t===q||n===q?0:t.startsWith(q)||n.startsWith(q)?1:(t+' '+n).includes(q)?2:3;};
 const seen=new Set();
 return entries.filter(e=>playerTypes.has(e.type)&&e.search.includes(q)).map(e=>[rank(e),types.indexOf(e.type),e]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2].title.length-b[2].title.length).map(x=>x[2])
  .filter(e=>{const id=/NavigationOption$/.test(e.type)?'skill:'+e.obj.Entity:e.key;return !seen.has(id)&&seen.add(id);});
}
function updateList(){
 const q=$('search').value.trim();filtered=searchEntries(q);
 $('list').innerHTML=filtered.slice(0,10).map(e=>'<a class="suggestion" href="#'+encodeURIComponent(e.key)+'">'+icon(e,24)+'<span>'+esc(e.title)+'<small>'+esc(typeNames[e.type]||e.type)+' · '+esc(e.en)+'</small></span></a>').join('')+
  (q?'<a class="suggestion all" href="#'+encodeURIComponent('@search/'+q)+'">'+(filtered.length?'查看全部 '+filtered.length.toLocaleString()+' 个结果':'没有匹配条目，可尝试英文名')+'：“'+esc(q)+'” →</a>':'');
 $('list').hidden=!q||document.activeElement!==$('search');
}
function showEntry(key,skip=[]){
 const e=byKey.get(key);if(!e){wikiHome();return;}current=key;updateList();
 const fields=['Description','CustomDescription','SellsFor','Requirements','UnlockRequirements','BaseExperience','BaseInterval','BaseMinInterval','BaseMaxInterval','Ingredients','Costs','Product','Products','Provides','Rewards','Capabilities','Stats','Levels','Steps','Enemies','Bonuses','BonusesWhenGrown','Trigger','Goal','UnlockLevel','PointPercentRequired','MinorNodeUnlockKnowledge','MajorNodes','MinorNodes','Passives','Attacks','Element','DamageType','Difficulty','BaseKnowledge'].filter(k=>!skip.includes(k));
 $('detail').innerHTML=fields.filter(k=>e.obj[k]!=null&&!(Array.isArray(e.obj[k])&&!e.obj[k].length)).map(k=>'<section><h3>'+esc(playerFields[k]||humanWord(k))+'</h3>'+render(e.obj[k],k)+'</section>').join('');
 $('detail').scrollTop=0;
}
