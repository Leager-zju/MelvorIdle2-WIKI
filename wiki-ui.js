// Wiki shell: sidebar, navboxes, article pages with infobox, main page, search / index / links-here pages.
const VERSION=DATA.version;
const articleTypes=new Set(['Item','Enemy','CombatArea','Dungeon','Quest','Pet','ShopPurchase','ThievingRecipe','HuntingAnimal','RanchingAnimal','AgilityObstacle','MagicSpell','Prayer','EquipmentSetBonus','AstrologyConstellation']);
const titleOf=(type,id)=>byKey.get(type+'/'+shortId(id))?.title||humanWord(id);
const skillIcon=(id,size=20)=>icon(skillById.get(id)?.entry,size);
const skillGroups=[['Combat','战斗技能'],['NonCombat','采集与生产技能'],['Passive','被动技能']].map(([cat,fallback])=>({title:byKey.get('LegacySidebarCategory/'+cat)?.title||fallback,skills:skillEntries.filter(s=>shortId(s.entry.obj.Category)===cat)}));
const tableLinks=[['Item','物品'],['@equipment','装备'],['Enemy','敌人'],['CombatArea','战斗区域'],['Dungeon','地下城'],['ShopPurchase','商店'],['Quest','任务'],['Pet','宠物'],['ItemUpgrade','物品升级'],['AstrologyConstellation','星座'],['MasteryGuildRank','精通阶级与奖励']];
const tableHref=t=>t.startsWith('@')?t:'@table/'+t;

function navboxRow(group,items){return '<div class="navbox-row"><div class="navbox-group">'+group+'</div><div class="navbox-list">'+items.join('<span class="sep"> • </span>')+'</div></div>';}
function mainNavbox(){
 return '<nav class="navbox" aria-label="Melvor Idle 2 导航"><div class="navbox-title">Melvor Idle 2 · 游戏版本 '+esc(VERSION)+'</div>'+
  skillGroups.map(g=>navboxRow(esc(g.title),g.skills.map(s=>skillIcon(s.id)+skillLink(s.id)))).join('')+
  navboxRow('其他',[pageLink('@guides','新手指南与攻略'),pageLink('@combat','战斗'),pageLink('@skills','技能总览'),pageLink('@tools','经验表与计算器'),pageLink('@index','全部条目索引'),pageLink('@random','随机条目')])+
  navboxRow('参考表',tableLinks.map(([t,n])=>pageLink(tableHref(t),n)))+'</nav>';
}
// Items made by recipes of the same category (e.g. all logs); other types group by their own category.
const categoryItems=new Map();
for(const r of sourceRows)if(/Recipe$/.test(r.entry.type)&&r.entry.obj.Category){const c=r.entry.obj.Category;if(!categoryItems.has(c))categoryItems.set(c,new Set());categoryItems.get(c).add(r.item);}
function relatedNavbox(e){
 let cat,list;
 if(e.type==='Item'){cat=(sourcesByItem.get(G.Namespace+':'+e.obj.Id)||[]).find(r=>/Recipe$/.test(r.entry.type)&&r.entry.obj.Category)?.entry.obj.Category;list=cat?[...categoryItems.get(cat)].map(itemEntry).filter(Boolean):[];}
 else if(typeof e.obj.Category==='string'){cat=e.obj.Category;list=entries.filter(x=>x.type===e.type&&x.obj.Category===cat);}
 if(!list||list.length<2)return '';
 const name=byId.get(cat)?.[0]?.title||humanWord(cat);
 return '<nav class="navbox" aria-label="'+esc(name)+'"><div class="navbox-title">'+esc(name)+'</div><div class="navbox-list solo">'+list.slice(0,80).map(x=>(x===e?'<b>'+icon(x,20)+esc(x.title)+'</b>':icon(x,20)+link(x))).join('<span class="sep"> • </span>')+'</div></nav>';
}

function buildSidebar(){
 const section=(title,links)=>'<div class="nav-section"><h2>'+title+'</h2><ul>'+links.map(l=>'<li>'+l+'</li>').join('')+'</ul></div>';
 $('wiki-nav').innerHTML=section('导航',[pageLink('','首页'),pageLink('@guides','新手指南'),pageLink('@skills','技能总览'),pageLink('@index','全部条目'),pageLink('@random','随机条目')])+
  skillGroups.map(g=>section(esc(g.title),g.skills.map(s=>skillIcon(s.id,18)+skillLink(s.id)))).join('')+
  section('参考表',tableLinks.map(([t,n])=>pageLink(tableHref(t),n)))+
  section('工具',[pageLink('@tools','经验表与计算器'),pageLink('@combat-simulator','战斗模拟器'),pageLink('@equipment','装备对比'),pageLink('@favorites','收藏与最近浏览'),pageLink('@info','关于本 Wiki')]);
 $('footer').innerHTML='<p>Melvor Idle 2 中文 Wiki · 数据来自游戏 <b>v'+esc(VERSION)+'</b> · 收录 '+fmt(entries.filter(e=>playerTypes.has(e.type)).length,0)+' 个条目</p><p class="muted">非官方玩家资料站，可在线浏览，也可下载后离线使用。游戏内容与图像版权归 Games by Malcs 所有。数值为游戏基础配置，实际效果以游戏内为准。'+pageLink('@info','关于本 Wiki')+'</p>';
}

// ---------- Articles ----------
const capabilityNames={'MelvorBase:Toolbelt':'工具腰带','MelvorBase:Bury':'埋葬','MelvorBase:Compost':'堆肥','MelvorBase:FishingBait':'鱼饵','MelvorBase:HuntingTrap':'狩猎陷阱','MelvorBase:Food':'食物'};
function itemKind(e){
 const c=e.obj.Capabilities||{},eq=c['MelvorBase:Equipment'];
 if(eq)return titleOf('EquipmentType',eq.Type)+'装备';
 if(c['MelvorBase:Food'])return '食物';if(c['MelvorBase:Openable'])return '可开启的容器';
 for(const k of Object.keys(c))if(capabilityNames[k])return capabilityNames[k]+'物品';
 return '物品';
}
function activityLabel(entry,kind){
 const skill=entityIds(entry.obj.Requirements||entry.obj.UnlockRequirements).find(s=>s!=='Combat');
 if(skill&&/Recipe$|Animal$/.test(entry.type))return skillIcon(skill,18)+skillLink(skill);
 if(kind==='source'&&['Enemy','Item','Dungeon','ThievingRecipe'].includes(entry.type))return link(entry);
 return pageLink('@table/'+entry.type,typeNames[entry.type]||humanWord(entry.type));
}
function labelList(rows,kind){const labels=[...new Set(rows.map(r=>activityLabel(r.entry,kind)))];return labels.slice(0,5).join('、')+(labels.length>5?' 等':'');}
function itemLead(e){
 const id=G.Namespace+':'+e.obj.Id,sources=sourcesByItem.get(id)||[],uses=usesByItem.get(id)||[];
 let text='<b>'+esc(e.title)+'</b>（'+esc(e.en)+'）是一种'+esc(itemKind(e))+'。';
 text+=sources.length?'可通过 '+labelList(sources,'source')+' 获得。':'目前没有已知的直接获取途径。';
 if(uses.length)text+='可用于 '+labelList(uses,'use')+'。';
 return text;
}
function enemyAreas(e){return [...new Set((reverse.get(G.Namespace+':'+e.obj.Id)||[]).filter(r=>/^(CombatArea|Dungeon)\//.test(r.key)&&/^Enemies/.test(r.path)).map(r=>r.key))].map(k=>byKey.get(k));}
function infoboxRows(e){
 const o=e.obj,rows=[['英文名',esc(e.en)],['类别',pageLink('@table/'+e.type,typeNames[e.type]||humanWord(e.type))]];
 if(e.type==='Item'){
  const c=o.Capabilities||{},eq=c['MelvorBase:Equipment'];
  rows.push(['种类',esc(itemKind(e))]);
  if(eq)rows.push(['装备要求',gateText({obj:{Requirements:eq.Requirements}})]);
  if(c['MelvorBase:Food'])rows.push(['回复生命',fmt(c['MelvorBase:Food'].BaseHealing)]);
  const id=G.Namespace+':'+o.Id;
  if(sourcesByItem.has(id))rows.push(['物品来源',labelList(sourcesByItem.get(id),'source')]);
  if(usesByItem.has(id))rows.push(['物品用途',labelList(usesByItem.get(id),'use')]);
 }else{
  if(typeof o.Category==='string')rows.push(['分类',esc(byId.get(o.Category)?.[0]?.title||humanWord(o.Category))]);
  if(o.Requirements?.length||o.UnlockRequirements?.length)rows.push(['要求',gateText(e)]);
  if(o.BaseExperience!=null)rows.push(['基础经验',fmt(o.BaseExperience)+' XP']);
  const ms=recipeTime(e);if(ms)rows.push(['基础耗时',fmt(ms/1000)+' 秒']);
 }
 if(e.type==='Enemy'){
  for(const l of o.Levels||[])rows.push([esc(skillName(shortId(l.Key))),fmt(l.Value)]);
  const interval=o.Stats?.Stats?.find(s=>shortId(s.Stat)==='AttackInterval');if(interval)rows.push(['攻击间隔',fmt(interval.Value/1000)+' 秒']);
  if(o.Element)rows.push(['元素',esc(titleOf('Element',o.Element))]);
  const areas=enemyAreas(e);if(areas.length)rows.push(['出没地点',areas.map(link).join('、')]);
 }
 if(e.type==='MasteryGuildRank')rows.push(['所需精通点数',fmt(masteryRankPoints(e,masteryTotalPoints(skillOfEntry(e))),0)]);
 if(o.SellsFor)rows.push(['出售价格',render(o.SellsFor)]);
 return rows;
}
function infobox(e){
 const desc=displayText(tr(e.obj.Description||e.obj.CustomDescription||''));
 return '<table class="infobox"><caption>'+esc(e.title)+'</caption>'+(icon(e,96)?'<tr><td colspan="2" class="infobox-image">'+icon(e,96)+'</td></tr>':'')+
  (desc?'<tr><td colspan="2" class="infobox-desc">'+esc(desc)+'</td></tr>':'')+infoboxRows(e).map(([k,v])=>'<tr><th scope="row">'+k+'</th><td>'+v+'</td></tr>').join('')+'</table>';
}
function equipmentSection(e){
 const c=e.obj.Capabilities||{},eq=c['MelvorBase:Equipment'];if(!eq)return '';
 const rows=[...equipmentStats(e)].map(([k,v])=>{
  const [kind,type]=k.split(' / '),label=type?kind+'（'+titleOf('DamageType',type)+'）':titleOf('CombatStat',k);
  return '<tr><th scope="row">'+esc(label)+'</th><td>'+(k==='AttackInterval'?fmt(v/1000)+' 秒':signed(v))+'</td></tr>';
 }).join('');
 const extra=Object.fromEntries(Object.entries(eq).filter(([f])=>!['Type','Requirements','Stats','Bonuses','OccupiesSlots'].includes(f)));
 return '<section><h3>装备属性</h3><p>装备槽位：'+esc(titleOf('EquipmentType',eq.Type))+'</p>'+(rows?'<table class="data statgrid">'+rows+'</table>':'')+(c['MelvorBase:Weapon']?render(c['MelvorBase:Weapon']):'')+(Object.values(extra).some(v=>v!=null&&v!==false&&!(Array.isArray(v)&&!v.length))?render(extra):'')+'</section>';
}
function capabilitySections(e){
 return Object.entries(e.obj.Capabilities||{}).filter(([k])=>capabilityNames[k]&&k!=='MelvorBase:Food').map(([k,v])=>{
  const rest=Object.fromEntries(Object.entries(v).filter(([f])=>!['Bonuses','CompostModifierTemplate'].includes(f)));
  return '<section><h3>'+esc(capabilityNames[k])+'</h3>'+render(rest)+'</section>';
 }).join('');
}
function showWikiEntry(key){
 const e=byKey.get(key);if(!e)return wikiHome();
 if(/NavigationOption$/.test(e.type)&&skillById.has(shortId(e.obj.Entity)))return showSkill(shortId(e.obj.Entity));
 const isItem=e.type==='Item',isMasteryTask=e.type==='MasteryGuildTask';
 showEntry(key,['Description','CustomDescription','SellsFor','Requirements','UnlockRequirements','BaseExperience','BaseInterval','BaseMinInterval','BaseMaxInterval',...(isItem?['Capabilities']:[]),...(e.type==='Enemy'?['Levels','Element','DamageType']:[]),...(isMasteryTask?['Goal']:[])]);
 const details=(isMasteryTask?'<section><h3>要求 / 目标</h3>'+masteryTaskObjectives(e)+'</section>':'')+$('detail').innerHTML;
 const drops=sourceRows.filter(r=>r.entry===e);
 const loot=drops.length?'<section><h3>'+(isItem?'开启可获得':'产出与掉落')+'</h3>'+dataTable(['产物','获取方式','数量','基础概率'],drops.map(r=>[cell(itemEntry(r.item)?.title||r.item,refLink(r.item,'Item')),cell(r.basis),cell(r.min??'',quantity(r)),cell(r.chance??'',pct(r.chance))]))+'</section>':'';
 const lead=isItem?itemLead(e):'<b>'+esc(e.title)+'</b>（'+esc(e.en)+'）是 Melvor Idle 2 中的'+esc(typeNames[e.type]||humanWord(e.type))+'。';
 const body=isItem?'<section id="item-sources"><h3>物品来源</h3>'+relatedTable(e,'sources')+'</section><section id="item-uses"><h3>物品用途</h3>'+relatedTable(e,'uses')+'</section>'+equipmentSection(e)+entryBoosts(e)+capabilitySections(e)+loot:loot+entryBoosts(e)+details;
 $('detail').innerHTML='<div class="breadcrumb">'+pageLink('','首页')+' › '+pageLink('@table/'+e.type,typeNames[e.type]||humanWord(e.type))+'</div><h2>'+esc(e.title)+'</h2>'+
  '<div class="pageactions"><button id="bookmark" data-key="'+esc(key)+'">'+(favorites.includes(key)?'★ 取消收藏':'☆ 收藏此页')+'</button>'+pageLink('@links/'+key,'链入页面')+'</div>'+
  infobox(e)+'<p class="lead">'+lead+'</p>'+body+'<div class="clear"></div>'+relatedNavbox(e);
 remember(key);
}

// ---------- Special pages ----------
function wikiHome(){
 current='';updateList();
 const items=entries.filter(e=>e.type==='Item'&&icon(e)&&sourcesByItem.has(G.Namespace+':'+e.obj.Id));
 const featured=items[Math.floor(Date.now()/864e5)%items.length];
 const starters=entries.filter(e=>/^(Skill|Combat)NavigationOption$/.test(e.type)).sort((a,b)=>(a.obj.Requirements?.length||0)-(b.obj.Requirements?.length||0)).slice(0,6);
 const card=(title,html)=>'<section class="home-card"><h3>'+title+'</h3>'+html+'</section>';
 $('detail').innerHTML='<h2 class="home-title">欢迎来到 Melvor Idle 2 中文 Wiki</h2>'+
  '<p class="lead">这是一份根据 <b>Melvor Idle 2 v'+esc(VERSION)+'</b> 游戏数据整理的中文玩家资料站。目前收录 <b>'+fmt(G.Objects.Item.length,0)+'</b> 个物品、<b>'+fmt(G.Objects.Enemy.length,0)+'</b> 个敌人、<b>'+fmt(skillEntries.length,0)+'</b> 个技能和 <b>'+fmt(G.Objects.Quest.length,0)+'</b> 个任务。初次游玩请先阅读'+pageLink('@guides','新手指南')+'。</p>'+
  '<div class="summary">'+[['物品',G.Objects.Item.length,'@table/Item'],['敌人',G.Objects.Enemy.length,'@table/Enemy'],['技能',skillEntries.length,'@skills'],['任务',G.Objects.Quest.length,'@table/Quest']].map(([k,v,h])=>'<a class="stat" href="'+href(h)+'"><b>'+fmt(v,0)+'</b>'+k+'</a>').join('')+'</div>'+
  '<h3>主要导航</h3>'+mainNavbox()+
  '<div class="home-grid">'+
  card('新手入门','<p>游戏开始时只有少数技能可用，其余技能需要达成等级或物品条件后解锁。</p><ul>'+starters.map(e=>'<li>'+eLink(e)+'：'+gateText(e)+'</li>').join('')+'</ul>'+pageLink('@guides','查看完整解锁路线 →'))+
  card('今日推荐物品',featured?'<div class="featured">'+icon(featured,64)+'<div><b>'+link(featured)+'</b><p>'+itemLead(featured)+'</p></div></div>':'')+
  card('其他重要条目','<ul><li>'+pageLink('@guides','攻略与机制导航')+'</li><li>'+pageLink('@tools','经验表')+'：1–120 级所需经验</li><li>'+pageLink('@tools','计算工具')+'：升级时间、掉率、生产材料</li><li>'+pageLink('@equipment','装备对比')+'</li><li>'+pageLink('@index','全部条目索引')+'</li><li>'+pageLink('@info','关于本 Wiki')+'</li></ul>')+
  card('最近浏览',(recent.length?'<ul>'+recent.slice(0,8).map(k=>'<li>'+eLink(byKey.get(k))+'</li>').join('')+'</ul>':'<p class="muted">浏览过的条目会出现在这里。</p>')+(favorites.length?'<h4>收藏</h4>'+favorites.map(k=>'<span class="pill">'+eLink(byKey.get(k))+'</span>').join(''):''))+
  '</div>';
}
function searchPage(q){
 $('search').value=q;const results=searchEntries(q),counts=new Map();
 for(const e of results)counts.set(e.type,(counts.get(e.type)||0)+1);
 $('detail').innerHTML='<h2>搜索结果：“'+esc(q)+'”</h2><p>共找到 '+fmt(results.length,0)+' 个条目'+(results.length>300?'，显示前 300 个':'')+'。</p>'+
  (counts.size>1?'<div class="toc"><button data-type-filter="" aria-pressed="true">全部 ('+results.length+')</button>'+[...counts].map(([t,n])=>'<button data-type-filter="'+esc(t)+'" aria-pressed="false">'+esc(typeNames[t]||t)+' ('+n+')</button>').join('')+'</div>':'')+
  (results.length?'<ul class="results">'+results.slice(0,300).map(e=>{const d=displayText(tr(e.obj.Description||''));return '<li data-type="'+esc(e.type)+'">'+icon(e,32)+'<div>'+link(e)+' <small>'+esc(typeNames[e.type]||e.type)+' · '+esc(e.en)+'</small>'+(d?'<p>'+esc(d.length>120?d.slice(0,120)+'…':d)+'</p>':'')+'</div></li>';}).join('')+'</ul>':'<p class="muted">没有找到匹配条目。可以尝试英文名、更短的关键词，或浏览'+pageLink('@index','全部条目索引')+'。</p>');
}
function indexPage(){
 const list=types.filter(t=>playerTypes.has(t)&&G.Objects[t].length&&t!=='MasteryGuildBonus');
 const label=t=>t==='MasteryGuildRank'?'精通公会阶级与奖励':typeNames[t];
 $('detail').innerHTML='<h2>全部条目索引</h2><p>按类别浏览全部 '+fmt(list.reduce((s,t)=>s+G.Objects[t].length,0)+G.Objects.MasteryGuildBonus.length,0)+' 个条目。每个列表都支持筛选、排序与导出。</p><div class="indexgrid">'+list.map(t=>'<a href="'+href('@table/'+t)+'"><b>'+esc(label(t))+'</b><small>'+fmt(G.Objects[t].length,0)+' 个'+(t==='MasteryGuildRank'?'阶级':'条目')+'</small></a>').join('')+'</div>';
}
function linksHerePage(key){
 const e=byKey.get(key);if(!e)return wikiHome();
 const refs=[...new Set((reverse.get(G.Namespace+':'+e.obj.Id)||[]).map(r=>r.key))].filter(k=>k!==key).map(k=>byKey.get(k)).filter(x=>playerTypes.has(x.type));
 $('detail').innerHTML='<div class="breadcrumb">'+link(e)+'</div><h2>链入页面：'+esc(e.title)+'</h2><p>以下 '+refs.length+' 个条目引用了“'+esc(e.title)+'”（包括同名的配方或技能目标）。</p>'+(refs.length?'<ul class="columns">'+refs.map(x=>'<li>'+eLink(x)+' <small>'+esc(typeNames[x.type]||x.type)+'</small></li>').join('')+'</ul>':'<p class="muted">没有其他条目引用此页。</p>');
}

function previewEntry(hash){
 if(!hash?.startsWith('#'))return;
 let key;try{key=decodeURIComponent(hash.slice(1));}catch{return;}
 return byKey.get(key)||skillById.get(key.startsWith('@skill/')?key.slice(7):key)?.entry;
}
function previewMarkup(e){
 const isItem=e.type==='Item',id=G.Namespace+':'+e.obj.Id;
 const kind=isItem?itemKind(e):typeNames[e.type]||'条目';
 const desc=displayText(tr(e.obj.Description||e.obj.CustomDescription||''));
 const row=(label,value)=>value?'<p><b>'+label+'</b> '+esc(value)+'</p>':'';
 const titles=rows=>[...new Set((rows||[]).map(r=>r.entry.title))].slice(0,3).join('、');
 return '<div class="preview-title">'+icon(e,40)+'<div><strong>'+esc(e.title)+'</strong><small>'+esc(kind+(e.en!==e.title?' · '+e.en:''))+'</small></div></div>'+
  (desc?'<p>'+esc(desc)+'</p>':'')+(isItem?row('来源',titles(sourcesByItem.get(id)))+row('用途',titles(usesByItem.get(id)))+row('使用效果',(boostByOwner.get(e.key)||[]).slice(0,2).map(r=>effectText(r.m)).join('、')):'');
}

const linkPreview=$('link-preview');
let previewLink,previewTimer;
function hideLinkPreview(){
 clearTimeout(previewTimer);
 previewLink?.removeAttribute('aria-describedby');
 previewLink=null;
 linkPreview.hidden=true;
}
function queueLinkPreview(link){
 if(link===previewLink)return;
 hideLinkPreview();
 const entry=previewEntry(link?.getAttribute('href'));
 if(!entry)return;
 previewLink=link;
 previewTimer=setTimeout(()=>{
  if(!link.isConnected)return hideLinkPreview();
  linkPreview.innerHTML=previewMarkup(entry);
  linkPreview.style.maxHeight='';
  linkPreview.hidden=false;
  const rect=link.getBoundingClientRect(),margin=8;
  const viewport=document.documentElement;
  const width=linkPreview.offsetWidth,height=linkPreview.offsetHeight;
  const below=viewport.clientHeight-rect.bottom-margin,above=rect.top-margin;
  const placeAbove=height>below&&above>below;
  const available=Math.max(0,placeAbove?above:below);
  linkPreview.style.maxHeight=available+'px';
  linkPreview.style.left=Math.max(margin,Math.min(rect.left,viewport.clientWidth-width-margin))+'px';
  linkPreview.style.top=(placeAbove?rect.top-linkPreview.offsetHeight:rect.bottom)+'px';
  link.setAttribute('aria-describedby',linkPreview.id);
 },300);
}
document.addEventListener('pointerover',event=>{
 if(event.pointerType==='mouse'&&!linkPreview.contains(event.target))queueLinkPreview(event.target.closest('a[href^="#"]'));
});
document.addEventListener('pointerout',event=>{
 if(event.pointerType!=='mouse'||!previewLink)return;
 if((previewLink.contains(event.target)||linkPreview.contains(event.target))&&
    !previewLink.contains(event.relatedTarget)&&!linkPreview.contains(event.relatedTarget))hideLinkPreview();
});
document.addEventListener('focusin',event=>{
 if(event.target.matches('a[href^="#"]:focus-visible'))queueLinkPreview(event.target);
});
document.addEventListener('focusout',event=>{if(event.target===previewLink)hideLinkPreview();});
document.addEventListener('keydown',event=>{if(event.key==='Escape')hideLinkPreview();});
window.addEventListener('scroll',event=>{if(event.target!==linkPreview)hideLinkPreview();},{capture:true,passive:true});
window.addEventListener('resize',hideLinkPreview);
document.addEventListener('click',hideLinkPreview);

function afterRoute(key){
 hideLinkPreview();
 stopCombatSimulation();
 const main=$('detail');
 if(key&&!key.startsWith('@links/'))main.insertAdjacentHTML('beforeend',mainNavbox());
 document.title=(key?(main.querySelector('h2')?.textContent||'Melvor Idle 2')+' - ':'')+'Melvor Idle 2 中文 Wiki';
 const target=href(key);
 for(const a of $('wiki-nav').querySelectorAll('a')){if(a.getAttribute('href')===target)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
 $('wiki-nav').classList.remove('open');$('menu-toggle').setAttribute('aria-expanded','false');
 if(!key.startsWith('@search/'))$('search').value='';
 $('list').hidden=true;window.scrollTo(0,0);
}
$('menu-toggle').addEventListener('click',()=>{const open=$('wiki-nav').classList.toggle('open');$('menu-toggle').setAttribute('aria-expanded',String(open));});
$('detail').addEventListener('click',event=>{
 const button=event.target.closest('button[data-type-filter]');if(!button)return;
 for(const b of $('detail').querySelectorAll('button[data-type-filter]'))b.setAttribute('aria-pressed',String(b===button));
 for(const li of $('detail').querySelectorAll('.results li'))li.hidden=!!button.dataset.typeFilter&&li.dataset.type!==button.dataset.typeFilter;
});
document.addEventListener('keydown',event=>{if(event.key==='/'&&!/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName||'')){event.preventDefault();$('search').focus();}});
buildSidebar();
window.addEventListener('hashchange',routeWiki);
routeWiki();
