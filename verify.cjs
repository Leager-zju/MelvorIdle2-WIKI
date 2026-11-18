// Exercise the generated page without opening or disturbing the desktop.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 2);
const nodes = new Map();
function element(id) {
  if (!nodes.has(id)) nodes.set(id, {value:'',innerHTML:'',textContent:'',dataset:{},hidden:true,classList:{toggle(){},remove(){}},
    appendChild(){},addEventListener(){},insertAdjacentHTML(pos,html){this.innerHTML+=html;},setAttribute(){},removeAttribute(){},
    querySelector(){return null;},querySelectorAll(){return [];},scrollTop:0});
  return nodes.get(id);
}
element('payload').textContent = scripts[0][1];
const context = vm.createContext({document:{getElementById:element,createElement:()=>element(Symbol()),body:element('body'),addEventListener(){},title:''},
  window:{addEventListener(){},scrollTo(){}},MutationObserver:class {observe(){}},location:{hash:'',replace(){}},setTimeout,clearTimeout,console});
vm.runInContext(scripts[1][1], context);
assert.match(element('detail').innerHTML, /1,811/);
assert.match(html, /<link rel="icon" href="assets\/[0-9a-f]+\.webp">/);
assert.match(html, /<img src="assets\/[0-9a-f]+\.webp" alt="Melvor Idle 2">/);
assert.match(element('footer').innerHTML, /v\d+\.\d+/);
// Published online: the site is not branded "offline", and player text doesn't say "this machine".
assert.doesNotMatch(html.slice(0,html.indexOf('<script')),/离线 Wiki/);
for(const code of ['wikiHome()','infoPage()','toolsPage()']){vm.runInContext(code,context);assert.doesNotMatch(element('detail').innerHTML+element('footer').innerHTML,/离线 Wiki|本机/,code);}
vm.runInContext('wikiHome()',context);
assert.match(element('wiki-nav').innerHTML, /%40skill%2FWoodcutting/);
assert.equal(vm.runInContext('entries.length', context), 10929);
assert.equal(vm.runInContext('name(byKey.get("Item/StoneSword").obj,"Item")', context), '石制剑');
element('search').value = 'Shrimp';
vm.runInContext('updateList()',context);
assert.match(element('list').innerHTML, /RawShrimp/);
assert.match(element('list').innerHTML, /%40search%2FShrimp/);
element('search').value = '石制剑';
vm.runInContext('updateList()',context);
assert.match(element('list').innerHTML, /StoneSword/);
// Exact name ranks first; skill entries are de-duplicated.
assert.equal(vm.runInContext('searchEntries("Shrimp")[0].key',context),'Item/Shrimp');
assert.equal(vm.runInContext('searchEntries("伐木").filter(e=>/NavigationOption/.test(e.type)).length',context),1);
element('search').value='';
vm.runInContext('showWikiEntry("Enemy/Golbin")',context);
assert.match(element('detail').innerHTML, /Item%2FStoneSword/);
assert.match(element('detail').innerHTML, /4.3478%/);
vm.runInContext('showWikiEntry("Item/StoneSword")',context);
assert.match(element('detail').innerHTML,/ArtisanRecipe%2FStoneSword/);
assert.match(element('detail').innerHTML,/Enemy%2FGolbin/);
assert.match(element('detail').innerHTML,/class="infobox"/);
assert.match(element('detail').innerHTML,/class="lead"/);
assert.match(element('detail').innerHTML,/装备属性/);
// Placeholder outputs (zero chance / zero quantity) must not appear as item sources.
assert.equal(vm.runInContext('sourceRows.some(r=>r.chance===0||r.max===0)',context),false);
assert.equal(vm.runInContext('(sourcesByItem.get("MelvorBase:NormalLog")||[]).some(r=>r.entry.type==="FarmingRecipe")',context),false);
vm.runInContext('routePage("@search/Log")',context);
assert.match(element('detail').innerHTML,/Item%2FNormalLog/);
vm.runInContext('routePage("@links/Item/NormalLog")',context);
assert.match(element('detail').innerHTML,/FiremakingRecipe%2FNormalLog/);
vm.runInContext('routePage("@index")',context);
assert.match(element('detail').innerHTML,/%40table%2FEnemy/);
assert.equal(vm.runInContext('esc("<img onerror=alert(1)>")',context),'&lt;img onerror=alert(1)&gt;');
// Render every object, not only the examples, to catch unusual structures.
vm.runInContext('for (const e of entries) { render(e.obj); }',context,{timeout:60000});
const run = code => vm.runInContext(code,context,{timeout:60000});
assert.equal(run('byKey.has("FiremakingBonfire/Normal") || byKey.has("ShopPurchase/UnlockBonfire")'),false);
assert.equal(run('skillConfig("Firemaking").Bonfires'),undefined);
assert.equal(run('skillConfig("Shop").Purchases.some(p=>p.Id==="MelvorBase:UnlockBonfire")'),false);
assert.equal(run('skillConfig("Firemaking").ValueStatistics.some(s=>s.Id.includes("Bonfire"))'),false);
assert.equal(run('previewEntry(href("FiremakingBonfire/Normal"))'),undefined);
assert.equal(run('searchEntries("普通篝火").length'),0);
assert.equal(run('searchEntries("Unlock Bonfire").length'),0);
assert.equal(run('searchEntries("生篝火烤野猪").some(e=>e.key==="Quest/MQ3")'),true);
for(const key of ['FiremakingBonfire/Normal','ShopPurchase/UnlockBonfire','@table/FiremakingBonfire']){
 run('routePage('+JSON.stringify(key)+')');
 assert.match(element('detail').innerHTML,/欢迎来到/);
}
for(const code of ['indexPage()','browse("ShopPurchase")','showSkill("Firemaking")','showBoosts("Firemaking")','showBoosts("Woodcutting")']){
 run(code);
 assert.doesNotMatch(element('detail').innerHTML,/FiremakingBonfire|UnlockBonfire|解锁篝火|普通篝火|魔法树篝火/,code);
}
assert.match(html, /id="link-preview"[^>]*role="tooltip" hidden/);
assert.equal(run('previewEntry(href("Item/NormalLog")).key'),'Item/NormalLog');
assert.equal(run('previewEntry(href("@skill/Woodcutting")).obj.Entity'),'MelvorBase:Woodcutting');
assert.equal(run('previewEntry("#%")'),undefined);
assert.equal(run('previewEntry(href("@table/Item"))'),undefined);
assert.match(run('previewMarkup(byKey.get("Item/NormalLog"))'),/普通原木[\s\S]*Normal Log[\s\S]*<b>来源<\/b>[\s\S]*<b>用途<\/b>/);
assert.match(run('previewMarkup(byKey.get("Item/SpikemossLeaf"))'),/<b>用途<\/b>[\s\S]*<b>使用效果<\/b>/);
assert.match(run('previewMarkup({...byKey.get("Enemy/Golbin"),title:"<img>"})'),/&lt;img&gt;/);
run('showWikiEntry("Item/SpikemossLeaf")');
assert.match(element('detail').innerHTML,/<section id="item-uses">[\s\S]*?消耗数量[\s\S]*?<\/section>[\s\S]*?<h3>使用效果<\/h3>/);
run('showWikiEntry("Item/GrapplingHook")');
assert.match(element('detail').innerHTML,/<section id="item-uses"><h3>物品用途<\/h3><p class="muted">暂无已知的配方材料、费用或其他消耗记录。<\/p><\/section>[\s\S]*?<h3>使用效果<\/h3>/);
assert.match(run('contentsMarkup([{id:"card-1",title:"经验与产出",nested:false}])'),/data-section-id="card-1"/);
assert.match(run('contentsMarkup([{id:"card-1",title:"<img>",nested:false}])'),/\&lt;img\&gt;/);
assert.doesNotMatch(run('contentsMarkup([{id:"card-1",title:"<img>",nested:false}])'),/<img>/);
assert.match(run('boostCards(boostsFor("Thieving"))'),/<section class="boost-section"><h3 id="boost-section-0">/);
// Mastery ranks and their rewards are one merged table.
run('showSkill("Attack")');
assert.match(element('detail').innerHTML,/精通阶级与奖励 · 7/);
assert.doesNotMatch(element('detail').innerHTML,/<h3>精通奖励/);
assert.match(run('masterySection("Attack")'),/5%[\s\S]*?\+10%/);
// Rank and bonus tables are one merged page, whichever route is used.
run('browse("MasteryGuildBonus")');const masteryAll=element('detail').innerHTML;
const noIds=html=>html.replace(/\bt\d+\b/g,'t');
run('browse("MasteryGuildRank")');assert.equal(noIds(element('detail').innerHTML),noIds(masteryAll));
assert.match(masteryAll,/精通公会阶级与奖励/);
assert.match(masteryAll,/175 个阶级/);
assert.match(masteryAll,/MasteryGuildRank%2FApprenticeSwordsman[\s\S]*?\+10%/);
// Tables spanning several skills are split into one titled section per skill.
assert.equal((masteryAll.match(/class="skill-group-title"/g)||[]).length,25);
assert.doesNotMatch(masteryAll,/<th[^>]*><button data-sort="0">技能/);
for(const type of ['Item','ArtisanRecipe','Pet','MasteryGuildTask']){
 run('browse('+JSON.stringify(type)+')');const page=element('detail').innerHTML;
 assert.ok((page.match(/class="skill-group-title"/g)||[]).length>=2,type);
 // every entry still appears exactly once across the sections
 assert.equal((page.match(/<tr><td/g)||[]).length,run('G.Objects['+JSON.stringify(type)+'].length'),type);
}
// A list belonging to one skill stays a single table.
run('browse("FiremakingRecipe")');assert.doesNotMatch(element('detail').innerHTML,/skill-group-title/);
run('browse("Item")');assert.match(element('detail').innerHTML,/其他物品（非技能产出）/);
run('browse("Enemy")');assert.doesNotMatch(element('detail').innerHTML,/skill-group-title/);
assert.equal(run('skillOfEntry(byKey.get("MasteryGuildTask/WoodcuttingTask3"))'),'Woodcutting');
assert.match(run('masteryTaskObjectives(byKey.get("MasteryGuildTask/WoodcuttingTask3"))'),/砍倒 15,000 棵[\s\S]*WoodcuttingRecipe%2FNormalTree[\s\S]*MasteryGuildTask%2FWoodcuttingTask2/);
assert.match(run('masteryTaskObjectives(byKey.get("MasteryGuildTask/FishingTask3"))'),/钓鱼<\/a> 等级 60/);
assert.match(run('masteryTaskObjectives(byKey.get("MasteryGuildTask/AttackTask144"))'),/装备 <a href="#Item%2FAmuletOfMelee"/);
assert.match(run('masteryTaskObjectives(byKey.get("MasteryGuildTask/RanchingTask7"))'),/饲养至少 1 只 [\s\S]*RanchingAnimal%2FChicken/);
assert.match(run('masteryTaskObjectives(byKey.get("MasteryGuildTask/WoodcuttingTask43"))'),/获得 <a href="#Item%2FBirdNest"/);
assert.match(run('masteryTaskObjectives(byKey.get("MasteryGuildTask/AstrologyTask7"))'),/累计解锁 4 个主要占星节点/);
assert.match(run('masteryTaskObjectives(byKey.get("MasteryGuildTask/AstrologyTask119"))'),/观察 [\s\S]*AstrologyItemEvent%2FStarfall[\s\S]* 1 次/);
for(const e of ['showSkill("Fishing")','browse("MasteryGuildTask")','showWikiEntry("MasteryGuildTask/FishingTask3")']){
 run(e);
 const page=element('detail').innerHTML;
 const tasks=e.startsWith('showSkill')?page.split('<h3>精通任务 · ')[1]?.split('</section>')[0]:page;
 assert.ok(tasks?.includes('钓鱼</a> 等级 60'),e);
 assert.ok(!tasks.includes('无额外要求'),e);
}
assert.equal(run('entries.filter(e=>e.type==="MasteryGuildTask").every(e=>!(/无额外要求|^<span class="muted">—/.test(masteryTaskObjectives(e))))'),true);
assert.equal(run('skillOfEntry(byKey.get("Pet/WoodcuttingMasterPet"))'),'Woodcutting');
run('showWikiEntry("Item/NormalLog")');
assert.match(element('detail').innerHTML,/<h4 class="skill-group-title">[^<]*<img[^>]*>伐木 · 1<\/h4>/);
run('indexPage()');assert.doesNotMatch(element('detail').innerHTML,/%40table%2FMasteryGuildBonus/);
// Long tables scroll inside a fixed-height box; short ones don't.
assert.match(run('dataTable(["a"],Array.from({length:16},(_,i)=>[cell(i)]))'),/class="tablewrap scroll" tabindex="0" role="region"/);
assert.doesNotMatch(run('dataTable(["a"],Array.from({length:15},(_,i)=>[cell(i)]))'),/tablewrap scroll/);
assert.match(run('boostCards(boostsFor("Thieving"))'),/id="boost-section-0"/);
assert.match(run('boostRowsHtml(boostsFor("Thieving").filter(r=>r.key==="Item/GrapplingHook"))[0][4].html'),/<summary>抓钩 · 生效条件与获取途径/);
assert.doesNotMatch(run('boostCards(boostsFor("Thieving"))'),/<details(?! open)/);
assert.equal(run('boostRecords.length'),2566);
assert.equal(run('effectGrants.length'),199);
assert.equal(run('allBoostRecords.length'),2765);
assert.equal(run('allBoostRecords.filter(r=>!r.skills.length).length'),0);
assert.equal(run('boostsFor("Prayer").some(r=>r.key==="MasteryGuildBonus/PrayerRank4")'),true);
assert.equal(run('boostsFor("Attack").some(r=>r.key==="Item/SnakeFangRing"&&!!r.m.Modifier)'),true);
assert.equal(run('new Set(boostRecords.map(r=>r.key+"#"+r.path)).size'),2566);
assert.equal(run('boostsFor("Thieving").some(r=>r.key==="Item/GrapplingHook")'),true);
assert.equal(run('boostsFor("Woodcutting").some(r=>r.key==="AstrologyNode/DeedreeA1")'),true);
assert.equal(run('boostsFor("Thieving").some(r=>r.key==="Item/TroutSushi")'),true);
assert.equal(run('boostsFor("Thieving").some(r=>r.key==="ShopPurchase/Misdirection")'),true);
assert.equal(run('boostsFor("Woodcutting").some(r=>r.key==="AstrologyBonusesEvent/Aurora"&&r.m.StatGroup==="GlobalPercentActionInterval")'),true);
assert.match(run('effectText(boostsFor("Thieving").find(r=>r.key==="Item/GrapplingHook"&&r.m.Stat.Name==="PercentInterval").m)'),/-1%/);
assert.match(run('parentText(byKey.get("AstrologyNode/DeedreeA1"))'),/AstrologyConstellation%2FDeedree/);
assert.equal(run('Math.abs(sourcesByItem.get("MelvorBase:StoneSword").find(r=>r.entry.key==="Enemy/Golbin").chance-1/23)<1e-12'),true);
assert.equal(run('sourcesByItem.get("MelvorBase:StoneSword").some(r=>r.entry.key==="ArtisanRecipe/StoneSword")'),true);
assert.equal(run('usesByItem.get("MelvorBase:Stone").some(r=>r.entry.key==="ArtisanRecipe/StoneSword")'),true);
assert.equal(run('xpForLevel(2)'),83);
assert.equal(run('xpForLevel(99)'),13034427);
assert.equal(run('recipeTime(byKey.get("WoodcuttingRecipe/NormalTree"))'),3000);
assert.equal(run('recipeTime(byKey.get("ArtisanRecipe/StoneSword"))'),4000);
assert.equal(run('dropStats(1,0,.95).atLeast'),0);
assert.equal(run('dropStats(0,100,.95).needed'),Infinity);
assert.equal(run('dropStats(1,100,.95).needed'),1);
assert.ok(Math.abs(run('dropStats(.01,100,.95).atLeast')-(1-.99**100))<1e-12);
assert.equal(run('production(byKey.get("ArtisanRecipe/StoneSword"),100,4000).costs[0].Quantity'),200);
assert.throws(()=>run('production(byKey.get("ArtisanRecipe/StoneSword"),-1,4000)'));
assert.throws(()=>run('xpForLevel(0)'));
assert.throws(()=>run('dropStats(-.1,100,.95)'));
assert.equal(run('sortValues("10","2")'),8);
assert.equal(run('csvValue("=SUM(A1)")'),'"\'=SUM(A1)"');
assert.match(run('compareEquipment("Item/StoneSword","Item/DefaultWeapon")'),/B − A/);
const boostHref = /href="#[^"]*(?:%40boosts|@boosts|%2FBoosts|\/Boosts)/i;
const rawContent = /<pre|<code|完整配置|原始 JSON|字段路径|组件配置|LocalContext|FromContext|StatsType|EntityConfig|MelvorBase:/;
const assertPlayerPage = () => assert.doesNotMatch(element('detail').innerHTML.replace(/<[^>]*>/g,''),rawContent);
assert.doesNotMatch(html.slice(0,html.indexOf('<script')),boostHref);
for(const code of ['wikiHome()','showWikiEntry("Item/GrapplingHook")','showWikiEntry("Enemy/Golbin")','showSkills()',
 'toolsPage()','guidesPage()','infoPage()','combatPage()','equipmentPage()','browse("Item")','browse("ShopPurchase")','showSaved()','indexPage()','searchPage("Log")','linksHerePage("Item/NormalLog")']) {
 run(code);assert.doesNotMatch(element('detail').innerHTML,boostHref,code);assertPlayerPage();
}
// Every article page (with infobox and lead) renders without errors or raw internal fields.
for(const key of JSON.parse(run('JSON.stringify(entries.filter(e=>playerTypes.has(e.type)).map(e=>e.key))'))){
 run('showWikiEntry('+JSON.stringify(key)+')');assertPlayerPage();
}
assert.doesNotMatch(run('compareEquipment("Item/StoneSword","Item/DefaultWeapon")'),boostHref);
for(const id of JSON.parse(run('JSON.stringify(skillEntries.map(s=>s.id))'))){
 run('showSkill('+JSON.stringify(id)+')');assert.match(element('detail').innerHTML,boostHref);assertPlayerPage();
 run('showBoosts('+JSON.stringify(id)+')');assert.doesNotMatch(element('detail').innerHTML,boostHref);assertPlayerPage();
}
for(const key of JSON.parse(run('JSON.stringify(entries.map(e=>e.key))'))){
 const text=run('render(byKey.get('+JSON.stringify(key)+').obj)').replace(/<[^>]*>/g,'');
 assert.doesNotMatch(text,rawContent,key);
}
run('showBoosts("all")');assert.match(element('detail').innerHTML,/技能总览/);assert.doesNotMatch(element('detail').innerHTML,boostHref);
run('showBoosts("Bank")');assert.match(element('detail').innerHTML,/技能总览/);
assert.match(run('render({Stat:{StatsType:"MelvorBase:Experience",Name:"PercentXPGained"},Value:.02,LocalContext:{Component:{Entity:"MelvorBase:Woodcutting",Component:"Experience"}},Scaling:{Type:"MelvorBase:Level",Data:{Experience:{Entity:"MelvorBase:Strength",Component:"Experience"}}}})'),/每级力量/);
assert.match(run('requirementText([{Type:"MelvorBase:Level",Data:{Component:{Entity:"MelvorBase:Agility"},Level:70}}])'),/70/);
// "A" + "or B" render on one line as "A 或 B".
const orReq=run('requirementText([{Type:"MelvorBase:Level",Data:{IsOr:false,Component:{Entity:"MelvorBase:Woodcutting"},Level:8}},{Type:"MelvorBase:Level",Data:{IsOr:true,Component:{Entity:"MelvorBase:Farming"},Level:6}},{Type:"MelvorBase:Level",Data:{IsOr:false,Component:{Entity:"MelvorBase:Mining"},Level:3}}])');
assert.equal((orReq.match(/<li>/g)||[]).length,2);
assert.match(orReq,/<li>[^]*?等级 8 <b class="or">或<\/b> [^]*?等级 6<\/li>/);
assert.doesNotMatch(orReq,/或：/);
const report=JSON.parse(run('JSON.stringify({objects:entries.length,modifiers:boostRecords.length,sources:boostByOwner.size,effectGrants:effectGrants.length,skills:skillEntries.length,unscoped:boostsFor("unknown").length,perSkill:Object.fromEntries(skillEntries.map(s=>[s.id,{modifiers:boostsFor(s.id).length,sources:new Set(boostsFor(s.id).map(r=>r.key)).size}]))})'));
fs.writeFileSync(__dirname+'/verification-report.json',JSON.stringify(report,null,2));
console.log('PASS: all objects and skill/Boosts pages; exact modifier coverage; source chains; bilingual search; loot weights; XP curve; production; comparison; export escaping.');
console.log(JSON.stringify(report));
