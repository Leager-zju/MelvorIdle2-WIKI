// Exercise the generated page without opening or disturbing the desktop.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const output = process.argv[2] || __dirname;
const html = fs.readFileSync(path.join(output,'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 2);
const data = JSON.parse(scripts[0][1]);
const referenceSnapshot = data.report.source_sha256 === '770b22a1c5bf37ab4e3bee0ba8b396a8008ecaa8d970270c3e9ed6d07ceffd3b';
for(const asset of new Set(Object.values(data.icons))){
 assert.match(asset,/^assets\/[0-9a-f]{24}\.(png|webp)$/);
 assert.ok(fs.statSync(path.join(output,asset)).size>0,asset);
}
const nodes = new Map();
const detailChange=[];
function element(id) {
  if (!nodes.has(id)) nodes.set(id, {value:'',innerHTML:'',textContent:'',dataset:{},hidden:true,classList:{toggle(){},remove(){}},
    appendChild(){},addEventListener(type,fn){if(id==='detail'&&type==='change')detailChange.push(fn);},insertAdjacentHTML(pos,html){this.innerHTML+=html;},setAttribute(){},removeAttribute(){},
    querySelector(){return null;},querySelectorAll(){return [];},scrollTop:0});
  return nodes.get(id);
}
element('payload').textContent = scripts[0][1];
const context = vm.createContext({document:{getElementById:element,createElement:()=>element(Symbol()),body:element('body'),addEventListener(){},title:''},
  window:{addEventListener(){},scrollTo(){}},MutationObserver:class {observe(){}},location:{hash:'',replace(){}},setTimeout,clearTimeout,console,
  atob:s=>Buffer.from(s,'base64').toString('latin1'),TextDecoder,localStorage:{getItem(){return null;},setItem(){}}});
vm.runInContext(scripts[1][1], context);
assert.match(html, /<main id="detail"><h2 class="home-title">梅尔沃放置2 Wiki<\/h2>/);
const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)[1];
const sitemap = fs.readFileSync(path.join(__dirname,'sitemap.xml'),'utf8');
assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]),[canonical]);
assert.match(context.document.title,/^梅尔沃放置2 Wiki/);
assert.match(html, /<link rel="icon" href="assets\/[0-9a-f]+\.(png|webp)">/);
assert.match(html, /<img src="assets\/[0-9a-f]+\.(png|webp)" alt="Melvor Idle 2">/);
assert.match(element('footer').innerHTML, /v\d+\.\d+/);
// Published online: the site is not branded "offline", and player text doesn't say "this machine".
assert.doesNotMatch(html.slice(0,html.indexOf('<script')),/离线 Wiki/);
for(const code of ['wikiHome()','infoPage()','toolsPage()']){vm.runInContext(code,context);assert.doesNotMatch(element('detail').innerHTML+element('footer').innerHTML,/离线 Wiki|本机/,code);}
vm.runInContext('wikiHome()',context);
// Home: the gold guide replaced the featured item; each stage lists only level-gated, material-free actions in its band.
assert.match(element('detail').innerHTML,/各阶段金币获取指南/);
assert.doesNotMatch(element('detail').innerHTML,/今日推荐物品/);
for(const [stage,lo,hi] of JSON.parse(vm.runInContext('JSON.stringify(moneyStages)',context))){
 const section=(element('detail').innerHTML.split('<h4>'+stage+'（')[1]||'').split('</ul>')[0];
 assert.ok(section,stage);
 for(const [,key] of section.matchAll(/href="#([^"]+)"/g)){
  const k=JSON.stringify(decodeURIComponent(key)),level=vm.runInContext('levelOf(byKey.get('+k+').obj)',context);
  assert.ok(level>=lo&&level<=hi,stage+' '+k);assert.ok(vm.runInContext('levelOnly(byKey.get('+k+'))',context),k);
 }
}
assert.match(element('wiki-nav').innerHTML, /%40skill%2FWoodcutting/);
// Placeholder outputs (zero chance / zero quantity) must not appear as item sources.
assert.equal(vm.runInContext('sourceRows.some(r=>r.chance===0||r.max===0)',context),false);
vm.runInContext('routePage("@index")',context);
assert.match(element('detail').innerHTML,/%40table%2FEnemy/);
assert.equal(vm.runInContext('esc("<img onerror=alert(1)>")',context),'&lt;img onerror=alert(1)&gt;');
// Render every object, not only the examples, to catch unusual structures.
vm.runInContext('for (const e of entries) { render(e.obj); }',context,{timeout:60000});
const run = code => vm.runInContext(code,context,{timeout:60000});
assert.equal(run('fmt(1.23456,6)'),'1.23');
assert.equal(run('fmt(1.235)'),'1.24');
assert.equal(run('fmt(2)'),'2');
assert.equal(run('signed(-0.001)'),'0');
assert.equal(run('pct(1/23)'),'4.35%');
assert.equal(run('displayText("v0.11.6 · +0.025%")'),'v0.11.6 · +0.03%');
assert.match(run('dataTable(["数值"],[[cell(1.23456)]])'),/<td data-value="1\.23456">1\.23<\/td>/);
const packedEntries = Object.entries(data.game.Objects).flatMap(([type,objects])=>objects.map(obj=>[type+'/'+obj.Id,obj]));
assert.equal(run('entries.length'),packedEntries.length);
assert.equal(run('byKey.size'),packedEntries.length);
assert.ok(run(`(()=>{
 const item=entries.find(e=>e.type==='Item'&&e.title!==e.en&&/[\u4e00-\u9fff]/.test(e.title));
 return item&&[item.title,item.en].every(query=>searchEntries(query).includes(item));
})()`),'an item must be searchable by both its Chinese and English names');
assert.ok(run(`sourceRows.every(row=>byKey.has(row.entry.key)&&itemEntry(row.item)) &&
 useRows.every(row=>byKey.has(row.entry.key)&&itemEntry(row.item))`),'source and use rows should resolve to game entries');
const expectedModifiers = [], expectedGrants = [];
function collectBoosts(key, value, field=''){
 if(!value||typeof value!=='object')return;
 if(typeof value.Value==='number'&&(value.Stat?.StatsType||value.StatGroup))expectedModifiers.push(key+'#'+field);
 if(value.Modifier?.Effect&&value.Modifier.Trigger&&value.Character)expectedGrants.push(key+'#'+field);
 for(const [name,child] of Object.entries(value)){
  collectBoosts(key,child,Array.isArray(value)?field+'['+name+']':(field?field+'.':'')+name);
 }
}
for(const [key,obj] of packedEntries)collectBoosts(key,obj);
for(const [collection,expected] of [['boostRecords',expectedModifiers],['effectGrants',expectedGrants]]){
 const actual=JSON.parse(run('JSON.stringify('+collection+'.map(r=>r.key+"#"+r.path).sort())'));
 assert.deepEqual(actual,expected.sort(),collection);
}
assert.equal(run('byKey.has("FiremakingBonfire/Normal") || byKey.has("ShopPurchase/UnlockBonfire")'),false);
assert.equal(run('skillConfig("Firemaking").Bonfires'),undefined);
assert.equal(run('skillConfig("Shop").Purchases.some(p=>p.Id==="MelvorBase:UnlockBonfire")'),false);
assert.equal(run('skillConfig("Firemaking").ValueStatistics.some(s=>s.Id.includes("Bonfire"))'),false);
assert.equal(run('previewEntry(href("FiremakingBonfire/Normal"))'),undefined);
assert.equal(run('searchEntries("普通篝火").length'),0);
assert.equal(run('searchEntries("Unlock Bonfire").length'),0);
for(const key of ['FiremakingBonfire/Normal','ShopPurchase/UnlockBonfire','@table/FiremakingBonfire']){
 run('routePage('+JSON.stringify(key)+')');
 assert.match(element('detail').innerHTML,/梅尔沃放置2 Wiki/);
}
for(const code of ['indexPage()','browse("ShopPurchase")','showSkill("Firemaking")','showBoosts("Firemaking")','showBoosts("Woodcutting")']){
 run(code);
 assert.doesNotMatch(element('detail').innerHTML,/FiremakingBonfire|UnlockBonfire|解锁篝火|普通篝火|魔法树篝火/,code);
}
assert.match(html, /id="link-preview"[^>]*role="tooltip" hidden/);
assert.ok(run('previewEntry(href(entries.find(e=>e.type==="Item").key))?.type==="Item"'));
assert.equal(run('previewEntry(href("@skill/Woodcutting")).obj.Entity'),'MelvorBase:Woodcutting');
assert.equal(run('previewEntry("#%")'),undefined);
assert.equal(run('previewEntry(href("@table/Item"))'),undefined);
assert.match(run('contentsMarkup([{id:"card-1",title:"经验与产出",nested:false}])'),/data-section-id="card-1"/);
assert.match(run('contentsMarkup([{id:"card-1",title:"<img>",nested:false}])'),/\&lt;img\&gt;/);
assert.doesNotMatch(run('contentsMarkup([{id:"card-1",title:"<img>",nested:false}])'),/<img>/);
{
 const main=element('detail'),nav=element('page-toc'),queried=main.querySelectorAll,navQuery=nav.querySelectorAll;
 const heading=(tagName,id,textContent,inTable=false)=>({tagName,id,textContent,closest:s=>inTable&&s.includes('table')?{}:null,getClientRects:()=>[]});
 const group=heading('H3','enemy-CombatAreas','战斗区域'),area=heading('H4','','哥布林森林'),tableHeading=heading('H4','','表内标题',true);
 const dark=heading('H3','enemy-DarkAreas','黑暗区域'),darkArea=heading('H4','','阴森荒原');
 main.querySelectorAll=selector=>selector==='h3, h4, details > summary'?[group,area,tableHeading,dark,darkArea]:selector==='[id]'?[group,dark,{id:'page-section-1'}]:[];
 function button(sectionId,parentId){
  const attrs=new Map(parentId?[]:[['aria-expanded','false']]);
  return {dataset:{sectionId,parentId},hidden:!!parentId,attrs,hasAttribute:k=>attrs.has(k),setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
 }
 const combatButton=button(group.id),forestButton=button('page-section-2',group.id),darkButton=button(dark.id),darkAreaButton=button('page-section-3',dark.id);
 nav.querySelectorAll=()=>[combatButton,forestButton,darkButton,darkAreaButton];
 context.document.documentElement={scrollHeight:1000};
 run('syncPageContents()');
 assert.match(nav.innerHTML,/data-section-id="enemy-CombatAreas" aria-expanded="false" aria-controls="toc-link-page-section-2">战斗区域[^]*?data-section-id="page-section-2" class="nested" id="toc-link-page-section-2" data-parent-id="enemy-CombatAreas" hidden>哥布林森林<\/button>/);
 assert.doesNotMatch(nav.innerHTML,/表内标题/);
 assert.equal(combatButton.attrs.get('aria-expanded'),'true');
 assert.equal(forestButton.hidden,false);
 assert.equal(darkAreaButton.hidden,true);
 run('pinnedSection="page-section-3";updateContentsPosition()');
 assert.equal(darkButton.attrs.get('aria-expanded'),'true');
 assert.equal(combatButton.attrs.get('aria-expanded'),'false');
 assert.equal(forestButton.hidden,true);
 assert.equal(darkAreaButton.hidden,false);
 assert.equal(darkAreaButton.attrs.get('aria-current'),'location');
 main.querySelectorAll=queried;
 nav.querySelectorAll=navQuery;
 run('syncPageContents()');
}
// Mastery ranks and their rewards are one merged table.
run('showSkill("Attack")');
assert.doesNotMatch(element('detail').innerHTML,/<h3>精通奖励/);
// Rank and bonus tables are one merged page, whichever route is used.
run('browse("MasteryGuildBonus")');const masteryAll=element('detail').innerHTML;
const noIds=html=>html.replace(/\bt\d+\b/g,'t');
run('browse("MasteryGuildRank")');assert.equal(noIds(element('detail').innerHTML),noIds(masteryAll));
assert.match(masteryAll,/精通公会阶级与奖励/);
assert.match(masteryAll,/所需精通点数/);
assert.equal((masteryAll.match(/class="skill-group-title"/g)||[]).length,run('skillEntries.filter(s=>configEntries(s.id,"MasteryGuildRanks").length).length'));
assert.doesNotMatch(masteryAll,/<th[^>]*><button data-sort="0">技能/);
for(const type of ['Item','ArtisanRecipe','Pet','MasteryGuildTask']){
 run('browse('+JSON.stringify(type)+')');const page=element('detail').innerHTML;
 assert.ok((page.match(/class="skill-group-title"/g)||[]).length>=2,type);
 // every entry still appears exactly once across the sections
 assert.equal((page.match(/<tr><td/g)||[]).length,run('G.Objects['+JSON.stringify(type)+'].length'),type);
}
// A list belonging to one skill stays a single table.
run('browse("FiremakingRecipe")');assert.doesNotMatch(element('detail').innerHTML,/skill-group-title/);
run('routePage("@table/ShopPurchase")');
const shopPage=element('detail').innerHTML;
const listedPurchases=[...shopPage.matchAll(/<tr><td[^>]*>(?:<img[^>]*>)?<a href="#(ShopPurchase%2F[^"]+)"/g)].map(m=>decodeURIComponent(m[1])).sort();
assert.deepEqual(listedPurchases,packedEntries.map(([key])=>key).filter(key=>key.startsWith('ShopPurchase/')).sort());
assert.match(run('shopSections([{obj:{Subcategory:"MelvorBase:Missing"}},{obj:{}}],rows=>String(rows.length))'),/>其他<\/h3><h4[^>]*>未分类<\/h4>2<\/section>/);
assert.equal(run('entries.filter(e=>e.type==="MasteryGuildTask").every(e=>Number.isInteger(masteryTaskCategory(e)?.obj.BasePoints))'),true);
assert.equal(run('entries.filter(e=>e.type==="MasteryGuildTask").every(e=>!(/无额外要求|^<span class="muted">—/.test(masteryTaskObjectives(e))))'),true);
run('indexPage()');assert.doesNotMatch(element('detail').innerHTML,/%40table%2FMasteryGuildBonus/);
// Long tables scroll inside a fixed-height box; short ones don't.
assert.match(run('dataTable(["a"],Array.from({length:16},(_,i)=>[cell(i)]))'),/class="tablewrap scroll" tabindex="0" role="region"/);
assert.doesNotMatch(run('dataTable(["a"],Array.from({length:15},(_,i)=>[cell(i)]))'),/tablewrap scroll/);
assert.match(run('boostCards(boostsFor("Thieving"))'),/<details><summary>/);
assert.doesNotMatch(run('boostCards(boostsFor("Thieving"))'),/<details open/);
assert.equal(run('allBoostRecords.filter(r=>!r.skills.length).length'),0);
assert.equal(run('dropStats(1,0,.95).atLeast'),0);
assert.equal(run('dropStats(0,100,.95).needed'),Infinity);
assert.equal(run('dropStats(1,100,.95).needed'),1);
assert.ok(Math.abs(run('dropStats(.01,100,.95).atLeast')-(1-.99**100))<1e-12);
assert.throws(()=>run('production({obj:{}},-1,4000)'),/输入有效的次数/);
assert.equal(run('production({obj:{Ingredients:{Items:[{Quantity:2}]}}},100,4000).costs[0].Quantity'),200);
assert.throws(()=>run('xpForLevel(0)'));
assert.throws(()=>run('dropStats(-.1,100,.95)'));
assert.equal(run('sortValues("10","2")'),8);
assert.equal(run('csvValue("=SUM(A1)")'),'"\'=SUM(A1)"');
const boostHref = /href="#[^"]*(?:%40boosts|@boosts|%2FBoosts|\/Boosts)/i;
const rawContent = /<pre|<code|完整配置|原始 JSON|字段路径|组件配置|LocalContext|FromContext|StatsType|EntityConfig|MelvorBase:/;
const assertPlayerPage = () => {
 const text=element('detail').innerHTML.replace(/<[^>]*>/g,'');
 assert.doesNotMatch(text,rawContent);
 // Tags become spaces so numbers in adjacent table cells are not read as one long decimal.
 assert.ok(!/(?<![\w.])\d+\.\d{3,}(?![\d.])/.test(element('detail').innerHTML.replace(/<[^>]*>/g,' ')),'player numbers have at most two decimal places');
};
assert.match(element('wiki-nav').innerHTML,/#%40combat-simulator">战斗模拟器/);
run('routePage("@combat-simulator")');
const combatPageHtml=element('detail').innerHTML;
const combatSetup=combatPageHtml.split('<div class="combat-setup">')[1].split('</div>')[0];
assert.deepEqual([...combatSetup.matchAll(/name="([^"]+)"/g)].map(m=>m[1]),['area','enemy','seconds','samples']);
assert.match(combatSetup,/<option value="CombatArea\/GolbinForest" selected>/);
assert.match(combatSetup,/<option value="Enemy\/Golbin" selected>/);
assert.doesNotMatch(combatSetup,/value="Enemy\/GreenSlime"/);
assert.match(run('simulationEnemyOptions("CombatArea/SlimeForest")'),/value="Enemy\/GreenSlime"/);
assert.match(run('simulationEnemyOptions("Dungeon/HobgolbinCamp")'),/value="Enemy\/GhelbaktheHobChief"/);
assert.ok(run('entries.filter(e=>e.type==="Enemy").every(e=>[...simulationAreas.values()].some(group=>group.includes(e)))'));
const areaEnemy={value:'Enemy/Golbin',innerHTML:''};
const changedArea={name:'area',value:'CombatArea/SlimeForest',form:{id:'combat-sim-form',elements:{namedItem:()=>areaEnemy}}};
detailChange.forEach(fn=>fn({target:changedArea}));
assert.match(areaEnemy.innerHTML,/value="Enemy\/GreenSlime"/);
assert.doesNotMatch(areaEnemy.innerHTML,/value="Enemy\/Golbin"/);
const combatDefaults=Object.fromEntries([...combatPageHtml.matchAll(/name="([^"]+)" value="([^"]+)"/g)].map(m=>[m[1],m[2]]));
Object.assign(combatDefaults,{area:'CombatArea/GolbinForest',enemy:'Enemy/Golbin',stance:'MelvorBase:Stab',element:'MelvorBase:Neutral',damageType:'MelvorBase:Normal'});
context.COMBAT_FORM={elements:{namedItem:name=>({value:combatDefaults[name]})}};
const beforeSeed=Date.now(),request=run('readCombatSimulation(COMBAT_FORM)');
assert.ok(request.input.seed>=beforeSeed&&request.input.seed<=Date.now());
assert.equal(request.input.spawnSeconds,3);
combatDefaults.area='CombatArea/SlimeForest';
assert.throws(()=>run('readCombatSimulation(COMBAT_FORM)'),/该区域/);
combatDefaults.area='Dungeon/HobgolbinCamp';
assert.equal(run('readCombatSimulation(COMBAT_FORM).dungeon'),true);
assert.doesNotMatch(combatPageHtml,/name="(?:hp|lifesteal)"/);
assert.match(combatPageHtml,/<h2>战斗模拟器<\/h2>[^]*?name="seconds"[^]*?name="evasion-Stab"[^]*?name="power-Normal"[^]*?name="protection-Normal"/);
assert.deepEqual([...combatPageHtml.matchAll(/<fieldset class="calcform combat-stat-card"><legend>([^<]+)<\/legend>/g)].map(m=>m[1]),
 ['进攻属性','躲避值','战力与防护','护盾与护甲']);
assert.match(combatPageHtml,/<h3>战斗属性<\/h3>[^]*?<label><span>攻击间隔（秒）<\/span><input[^>]+name="interval"/);
assertPlayerPage();
assert.equal(run('combatKernel.hitChance(300,600)'),.25);
assert.equal(run('combatKernel.hitChance(600,300)'),.75);
assert.equal(run('combatKernel.resistance(1,99)'),.7);
assert.equal(run('combatKernel.damage(40,.5,2,4,3)'),7);
assert.equal(run('combatKernel.damage(0,1,0,0,0)'),0);
assert.equal(run('combatKernel.ticks(2400)'),144);
assert.throws(()=>run('combatNumber("",1,1000,true,"模拟时长")'),/模拟时长/);
const combatFixture=`({
 player:{ward:0,armour:0,interval:1000,crit:0},
 profiles:[{hp:1,ward:0,armour:0,interval:120,lifesteal:0,playerMin:1,playerMax:1,playerHit:1,playerFactor:1,enemyHit:1,
  attacks:[{factor:1,avoidable:true,hits:[{damage:[[0,10,10]],wait:1}]}]}],
 seconds:8,spawnSeconds:3,samples:32,seed:0
})`;
const combatRun=overrides=>JSON.parse(run(`(()=>{
 const input=${combatFixture}; ${overrides}
 const job=combatKernel.createJob(input);
 while(!job.step(1)){}
 return JSON.stringify(job.summary());
})()`));
assert.deepEqual(combatRun('').damage,{mean:0,margin:0});
const simultaneous='input.profiles[0].interval=60;';
assert.equal(combatRun(simultaneous+'input.seconds=3.99;').damage.mean,0);
const fullDuration=combatRun(simultaneous);
assert.deepEqual(fullDuration.damage,{mean:20,margin:0});
assert.deepEqual(fullDuration.kills,{mean:2,margin:0});
assert.equal(combatRun(simultaneous+'input.profiles[0].playerHit=0;').damage.mean,50);
assert.equal(combatRun(simultaneous+'input.profiles[0].playerHit=0;input.player.ward=2;input.player.armour=3;').damage.mean,30);
const multiHit=combatRun('input.seconds=5.3; input.player.interval=60000; input.profiles[0].interval=60; input.profiles[0].attacks[0].hits.push({damage:[[0,5,5]],wait:16});');
assert.equal(multiHit.damage.mean,25);
const dotRule={id:'MelvorBase:Burn',kind:'DamageOverTime',owner:1,target:0,chance:1,mods:[],stacks:1,maxStacks:1,interval:30,procs:2,formula:{kind:'Fixed',value:3}};
const dotFight=simultaneous+'input.seconds=4.75;input.player.interval=60000;input.profiles[0].attacks[0].onHit='+JSON.stringify([dotRule])+';';
assert.equal(combatRun(dotFight).damage.mean,13);
assert.equal(combatRun(dotFight+'input.player.interval=1000;').damage.mean,13); // The final proc lands during respawn.
assert.equal(combatRun(dotFight+'input.player.ward=2;').damage.mean,1);
const stunRule={id:'MelvorBase:Stun',kind:'Stun',owner:1,target:0,chance:1,mods:[],turns:1};
const stunFight=simultaneous+'input.seconds=5.1;input.profiles[0].hp=2;';
assert.equal(combatRun(stunFight).kills.mean,1);
assert.equal(combatRun(stunFight+'input.profiles[0].attacks[0].onHit='+JSON.stringify([stunRule])+';').kills.mean,0);
const slowRule={id:'MelvorBase:Ensnared',kind:'TurnCounting',owner:0,target:0,chance:1,turns:1,mods:[['PercentAttackInterval','',.5]]};
const slowFight='input.seconds=5.1;input.profiles[0].hp=2;input.profiles[0].ratings=[{accuracy:1000000,evasion:1,type:"MelvorBase:Normal",interval:1000},{accuracy:1,evasion:1,type:"MelvorBase:Normal",interval:2000}];input.profiles[0].enemyPower={};input.profiles[0].enemyProtection=0;input.player.power={};input.player.protection={};';
assert.equal(combatRun(slowFight).kills.mean,1);
assert.equal(combatRun(slowFight+'input.profiles[0].hooks=[{OnAttack:'+JSON.stringify([slowRule])+ '},{}];').kills.mean,0);
const seeded=simultaneous+'input.profiles[0].playerHit=.5;';
assert.deepEqual(combatRun(seeded),combatRun(seeded));
const combatPlayer=`{
 stance:'MelvorBase:Stab',element:'MelvorBase:Neutral',damageType:'MelvorBase:Normal',
 interval:2400,accuracy:750,min:1,max:30,crit:0,critMultiplier:1.5,ward:0,armour:0,
 evasion:{'MelvorBase:Stab':640},power:{'MelvorBase:Normal':63},protection:{'MelvorBase:Normal':0}
}`;
const soulrip=run(`compileCombatEnemy({
 obj:{...byKey.get('Enemy/Golbin').obj,Attacks:[{Attack:'MelvorBase:Soulrip',Chance:1}]}
},${combatPlayer})`);
assert.ok(soulrip.limits.some(text=>text.startsWith('按玩家生命值计算的伤害 ')));
const resultMarkup=dungeon=>run('combatSimulationResults(byKey.get("Enemy/Golbin"),'+dungeon+',[],{seconds:8,samples:32,damage:{mean:20,margin:0},kills:{mean:2,margin:0}})');
assert.match(resultMarkup(false),/总扣血量<\/b> 20 ± 0 HP[^]*预计击杀<\/b> 2 ± 0[^]*基础掉落期望[^]*Item%2FStoneSword/);
assert.doesNotMatch(resultMarkup(false),/死亡比例|剩余生命/);
assert.match(resultMarkup(true),/地下城击杀没有掉落/);
assert.doesNotMatch(resultMarkup(true),/Item%2FStoneSword/);
assert.ok(run(`entries.filter(e=>e.type==='Enemy').every(e=>compileCombatEnemy(e,${combatPlayer}).profiles.every(p=>
 p.hp>0&&p.interval>0&&p.attacks.length&&p.attacks.every(a=>Number.isFinite(a.factor))))`));
assert.equal(run(`Object.fromEntries(combatDropExpectations({Drops:{
 FixedItems:[{Item:'MelvorBase:Stone',MinQuantity:1,MaxQuantity:3}],
 ItemTables:[{Chance:.5,Table:[{Item:'MelvorBase:Stone',MinQuantity:2,MaxQuantity:4,Weight:1},{Item:'MelvorBase:Ash',Quantity:1,Weight:3}]}]
 }}))['Item/Stone']`),2.375);
assert.doesNotMatch(html.slice(0,html.indexOf('<script')),boostHref);
for(const code of ['wikiHome()','showWikiEntry("Item/GrapplingHook")','showWikiEntry("Enemy/Golbin")','showSkills()',
 'toolsPage()','guidesPage()','infoPage()','combatPage()','equipmentPage()','browse("Item")','browse("ShopPurchase")','showSaved()','indexPage()','searchPage("Log")','linksHerePage("Item/NormalLog")']) {
 run(code);assert.doesNotMatch(element('detail').innerHTML,boostHref,code);assertPlayerPage();
}
// Every article page (with infobox and lead) renders without errors or raw internal fields.
for(const key of JSON.parse(run('JSON.stringify(entries.filter(e=>playerTypes.has(e.type)).map(e=>e.key))'))){
 run('showWikiEntry('+JSON.stringify(key)+')');assertPlayerPage();
}
const comparison=run('compareEquipment(equipment[0].key,equipment[1].key)');
assert.match(comparison,/B − A/);
assert.doesNotMatch(comparison,boostHref);
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
assert.equal(run('xpForLevel(2)'),83);
assert.equal(run('xpForLevel(99)'),13034427);
// Recipe tables expose separate sortable columns for per-action and hourly values.
const recipeValueColumns=/<button data-sort="6">单次产物期望价值 ↕<\/button>[^]*?<button data-sort="7">每小时价值 ↕<\/button>/;
for(const type of JSON.parse(run('JSON.stringify(types.filter(t=>/Recipe$/.test(t)&&playerTypes.has(t)))'))){
 run('browse('+JSON.stringify(type)+')');assert.match(element('detail').innerHTML,recipeValueColumns,type);
 assert.equal(run('entries.filter(e=>e.type==='+JSON.stringify(type)+').every(e=>{const v=recipeValue(e);return Number.isFinite(v)&&v>=0;})'),true,type);
}
run('showSkill("Woodcutting")');assert.match(element('detail').innerHTML,recipeValueColumns);
assert.equal(run('huntingJournalLevel(29)'),1);
assert.equal(run('huntingJournalLevel(30)'),2);
assert.equal(run('huntingJournalLevel(57)'),3);
assert.equal(run('huntingTrapDistribution(0,.2,0,0).failures'),Infinity);
const changingTrap=JSON.parse(run('JSON.stringify(huntingTrapDistribution(.4,.2,.1,-.1))'));
assert.ok(Math.abs(changingTrap.failures-1.06392)<1e-10);
assert.ok(Math.abs(changingTrap.averageDouble-.11)<1e-10);
assert.ok(Math.abs(run('huntingCaptureQuantity(2,1,1)')-1.3003125)<1e-10);
for(const page of ['showSkill("Hunting")','browse("HuntingAnimal")']){
 run(page);
 const markup=element('detail').innerHTML;
 assert.match(markup,/<h3>狩猎区域<\/h3>[^]*?<h4>[^]*?期望周期[^]*?单次掉落价值期望[^]*?每小时价值/);
 const rows=[...markup.matchAll(/<tr><td[^>]*>(?:<img[^>]*>)?<a href="#HuntingAnimal%2F([^"]+)"/g)].map(m=>m[1]);
 assert.equal(rows.length,run('G.Objects.HuntingAnimal.length'));
 assert.equal(new Set(rows).size,rows.length);
 assertPlayerPage();
}
// ---- Save import: build a small version-31 save the way the game writes it, then read it back. ----
{
 const zlib=require('node:zlib');
 const w=[];const i32=v=>{const b=Buffer.alloc(4);b.writeInt32LE(v);w.push(b);};const u8=v=>w.push(Buffer.from([v]));
 const f64=v=>{const b=Buffer.alloc(8);b.writeDoubleLE(v);w.push(b);};const i64=v=>{const b=Buffer.alloc(8);b.writeBigInt64LE(BigInt(v));w.push(b);};
 const str=s=>{const b=Buffer.from(s,'utf8');let n=b.length;const p=[];do{let x=n&0x7f;n>>=7;if(n)x|=0x80;p.push(x);}while(n);w.push(Buffer.from(p),b);};
 const region=fill=>{const before=w.length;fill();const body=Buffer.concat(w.splice(before));i32(body.length);w.push(body);};
 const ns='MelvorBase:';
 i32(31);w.push(Buffer.alloc(16));str('Tester');str('Standard');i64(0);for(let k=0;k<4;k++)str('');i32(321);i64(0);i64(0);u8(0);
 const entity=(id,components)=>{str(ns+id);region(()=>{i32(components.length);for(const [cid,fill] of components){str(cid);region(fill);}});};
 const task=(id,goal,complete,trigger)=>{str(ns+id);region(()=>{u8(goal!==null?1:0);if(goal!==null){str(goal);region(()=>{f64(complete?200:0);u8(+complete);});}u8(+trigger);});};
 i32(8);
 entity('Woodcutting',[
  ['Experience',()=>f64(13034431)],// level 99
  ['Toolbelt',()=>{i32(1);str(ns+'WoodcuttingTool');region(()=>{i32(1);u8(1);str(ns+'ReinforcedWoodcuttersAxe');});}],
  ['Pets',()=>{i32(1);str(ns+'Woody');region(()=>{u8(0);u8(0);});}],
  ['MasteryGuild',()=>{u8(0);i32(3);task('WoodcuttingTask1','0',true,true);task('WoodcuttingTask2','1',false,true);task('WoodcuttingTask43',null,false,true);}],
  ['Unknown',()=>{i32(7);str('skipped by size');}]
 ]);
 entity('Ranching',[['MasteryGuild',()=>{u8(0);i32(2);task('RanchingTask201',null,false,true);task('RanchingTask202',null,false,false);}]]);
 entity('Shop',[['Shop',()=>{u8(1);u8(0);u8(1);i32(0);i32(0);i32(5);for(const [id,n] of [['WoodenAxeHandle',1],['OakAxeHandle',1],['Cheese',5],['BananaTreeSeed',50],['OakTrackingStick',1]]){i32(n);str(ns+id);}}]]);
 entity('Hunting',[
  ['Journal',()=>{i32(1);str(ns+'WildChicken');region(()=>{u8(1);f64(30);u8(0);f64(0);f64(0);});i32(0);i32(0);}],
  ['Action',()=>{u8(0);u8(0);i32(0);i32(240);i32(0);i32(1);str(ns+'WildChicken');region(()=>{
   i32(0);i32(0);i32(0);u8(1);str(ns+'ReinforcedSnare');u8(0);u8(0);i32(0);u8(1);i32(0);u8(0);i32(0);u8(0);
  });u8(1);u8(0);u8(0);u8(0);u8(1);}]
 ]);
 entity('Astrology',[['Action',()=>{u8(0);u8(1);i32(0);i32(166);i32(0);u8(0);u8(1);i32(2);str(ns+'Deedree');region(()=>{f64(10);i32(1);str(ns+'DeedreeA1');i32(0);});str(ns+'Hyden');region(()=>{f64(0);i32(0);i32(1);str(ns+'HydenMajor3');});}]]);
 entity('Combat',[
  ['Toolbelt',()=>{i32(1);str(ns+'CombatUtility');region(()=>{i32(1);u8(1);str(ns+'ScarabCharm');});}],
  ['Equipment',()=>{i32(4);for(const [slot,item,occupied] of [['Amulet','GoldTopazAmulet',0],['RingSlot1','GoldTopazRing',0],['Weapon','StoneSword',0],['Offhand','StoneSword',1]]){str(ns+slot);region(()=>{i32(1);u8(occupied);u8(1);str(ns+item);});}i32(0);}],
  ['Player',()=>{for(let k=0;k<3;k++)region(()=>i32(0));i32(1);u8(1);str(ns+'Normal');u8(0);for(let k=0;k<7;k++)i32(0);
   i32(0);i64(0);i32(1);str(ns+'Slash');u8(0);
   i32(1);str(ns+'Sword');str(ns+'Slash');i32(1);str(ns+'Loadout1');str(ns+'Stab');}],
  ['MagicSpells',()=>{u8(1);str(ns+'AirStrike');u8(0);u8(0);u8(0);u8(0);i32(0);i32(0);}]
 ]);
 entity('Hitpoints',[['Experience',()=>f64(1200)]]);
 entity('NotAnEntity',[['Anything',()=>{f64(1);}]]);
 const raw=Buffer.concat(w),packed=zlib.brotliCompressSync(raw),exported=packed.toString('base64');
 context.SAVE_STRING=exported;
 const save=JSON.parse(run('JSON.stringify(parseSave(decodeSaveString(SAVE_STRING)))'));
 // A .sav file is the same Brotli stream without Base64 (the game also omits the final empty block).
 context.SAVE_FILE=new Uint8Array(packed);
 assert.deepEqual(JSON.parse(run('JSON.stringify(parseSave(decompressSave(SAVE_FILE)))')),save);
 assert.throws(()=>run('decompressSave(new Uint8Array([1,2,3]))'),/解压失败/);
 assert.match(html,/<input id="save-dir" type="text" readonly aria-describedby="save-hint">/);
 assert.equal(element('save-dir').value,'%APPDATA%\\Games By Malcs\\Melvor Idle 2\\steam');// matches the Steam save folder
 assert.equal(save.version,31);assert.equal(save.character,'Tester');assert.equal(save.totalLevel,321);
 assert.equal(save.toolbelt.Woodcutting[ns+'WoodcuttingTool'].item,ns+'ReinforcedWoodcuttersAxe');
 assert.deepEqual(save.equipment,[ns+'GoldTopazAmulet',ns+'GoldTopazRing',ns+'StoneSword']);
 assert.equal(save.combatWeapon,ns+'StoneSword');
 assert.deepEqual(save.combatStances,{[ns+'Sword']:ns+'Slash'});
 assert.equal(save.combatSpell,ns+'AirStrike');
 assert.deepEqual(save.pets.Woodcutting,[]);// locked pet
 assert.deepEqual(save.tasks.Woodcutting,[ns+'WoodcuttingTask1']);
 assert.deepEqual(save.tasks.Ranching,[ns+'RanchingTask201']);
 assert.equal(save.shop[ns+'WoodenAxeHandle'],1);assert.deepEqual(save.astrology[ns+'Deedree'],[ns+'DeedreeA1']);
 assert.deepEqual(save.hunting,{journal:{[ns+'WildChicken']:30},animals:{[ns+'WildChicken']:{trap:ns+'ReinforcedSnare',bait:true,trapless:false}}});
 assert.equal(run('saveLevel("Woodcutting",'+JSON.stringify(save)+')'),99);
 for(const bad of ['','not base64!','QUJD'])assert.throws(()=>run('decodeSaveString('+JSON.stringify(bad)+')'),bad);
 assert.throws(()=>run('parseSave(new Uint8Array([31,0,0,0]))'),/不完整|无法识别/);
 // Recipe numbers: no save = base values; with the save, owned bonuses that match each recipe apply.
 run('playerSave=null');
 const base=JSON.parse(run('JSON.stringify(savedRecipeStats(byKey.get("WoodcuttingRecipe/NormalTree"),null))'));
 assert.equal(base.xp,run('byKey.get("WoodcuttingRecipe/NormalTree").obj.BaseExperience'));
 run('playerSave=parseSave(decodeSaveString(SAVE_STRING));playerBoostsMemo=null');
 assert.equal(run('savedCombatFields({...playerSave,combatStances:undefined})'),null);
 run('combatSimulatorPage()');
 const savedCombatHtml=element('detail').innerHTML;
 const customSpawn=run(`combatSpawnSeconds({...playerSave, equipment:[...playerSave.equipment,'MelvorBase:GoldJadestoneRing'],
  toolbelt:{...playerSave.toolbelt,Combat:{CombatUtility:{item:'MelvorBase:MonsterLure',qty:1}}}})`);
 assert.equal(customSpawn,2.4);
 assert.match(savedCombatHtml,/已按存档中的等级/);
 assert.match(savedCombatHtml,/<option value="MelvorBase:Slash" selected>/);
 for(const [field,value] of Object.entries({interval:2.7,accuracy:840,max:26,'power-Normal':56,'evasion-Stab':640})){
  assert.ok(savedCombatHtml.includes('name="'+field+'" value="'+value+'"'),field);
 }
 assert.equal(run('savedCombatFields({...playerSave,equipment:[],combatWeapon:null}).fields.interval'),4);
 const wand=run('entries.find(e=>e.type==="Item"&&e.obj.Capabilities?.["MelvorBase:Weapon"]?.Type==="MelvorBase:Wand").obj.Id');
 const magic=JSON.parse(run(`JSON.stringify(savedCombatFields({...playerSave,equipment:[${JSON.stringify(ns+wand)}],combatWeapon:${JSON.stringify(ns+wand)}}))`));
 assert.equal(magic.fields.element,ns+'Air');
 assert.ok(magic.fields.max>=25);
 assert.equal(magic.missingSpell,false);
 if(referenceSnapshot){
  const hunt=withSave=>JSON.parse(run('JSON.stringify(huntingStats(byKey.get("HuntingAnimal/WildChicken"),'+(withSave?'playerSave':'null')+'))'));
  const baseHunt=hunt(false),savedHunt=hunt(true);
  assert.ok(Math.abs(baseHunt.ms-74500)<1e-7);
  assert.ok(savedHunt.ms<baseHunt.ms&&savedHunt.value>baseHunt.value);
  const mods=JSON.parse(run('JSON.stringify(huntingModifiers(byKey.get("HuntingAnimal/WildChicken"),playerSave,playerSave.hunting.animals["MelvorBase:WildChicken"]))'));
  assert.equal(mods.level,2);
  assert.equal(mods.totals.SkipTrackingStepChance,.02);
  assert.equal(mods.totals.PercentTrappingInterval,-.1);
  assert.equal(mods.failure.FlatTrappingSuccessChance,.05);
  run('showSkill("Hunting")');
  assert.match(element('detail').innerHTML,/期望周期（存档）[^]*?HuntingAnimal%2FWildChicken[^]*?Item%2FRawChicken[^]*?Item%2FGoldenEggCollectable[^]*?Item%2FSmallSurveyFindings/);
  assertPlayerPage();
  const loot=JSON.parse(run('JSON.stringify(savedCombatLoot(playerSave))'));
  assert.deepEqual(loot,{ItemDoublingChance:.03,BuriableDoublingChance:.08,CurrencyDoublingChance:.1});
  const expected=25*1.1+2*1.03*1.08+119/23*1.03;
  assert.ok(Math.abs(run('combatDropValue(combatDropExpectations(byKey.get("Enemy/Golbin").obj,savedCombatLoot(playerSave)))')-expected)<1e-12);
  assert.equal(run('savedCombatLoot({...playerSave,equipment:[],toolbelt:{Combat:{CombatUtility:{item:"MelvorBase:SlayerChallengeContract",qty:1}}}}).ItemDoublingChance'),0);
  run('routePage("@table/Enemy")');
  assert.match(element('detail').innerHTML,/单次击杀价值期望（存档）/);
  assert.match(element('detail').innerHTML,/Currency%2FGoldPieces"[^]*?× 10–40 <span class="drop-chance">100%/);
  assert.match(element('detail').innerHTML,/存档翻倍计入价值期望/);
  assert.ok(element('detail').innerHTML.includes('>'+run('fmt('+expected+')')+' 金币</td>'));
  assertPlayerPage();
 }
 const owned=JSON.parse(run('JSON.stringify([...playerSources(playerSave).keys()])'));
 for(const key of ['Item/ReinforcedWoodcuttersAxe','ShopPurchase/WoodenAxeHandle','ShopPurchase/OakAxeHandle','AstrologyNode/DeedreeA1'])assert.ok(owned.includes(key),key);
 assert.ok(!owned.includes('Pet/Woody'),'locked pets give no bonus');
 const stats=JSON.parse(run('JSON.stringify(savedRecipeStats(byKey.get("WoodcuttingRecipe/NormalTree"),playerSave))'));
 const used=stats.applied.map(r=>r.key);
 assert.ok(used.includes('ShopPurchase/WoodenAxeHandle')&&used.includes('AstrologyNode/DeedreeA1'),used.join());
 assert.ok(stats.xp>base.xp&&stats.value>base.value,'owned XP / doubling bonuses raise the numbers');
 assert.ok(stats.applied.every(r=>!r.m.Condition&&!r.m.FromContext),'conditional bonuses are excluded');
 // Interval formulas follow each skill's game code: flat before percent (fishing), after percent (artisan).
 assert.equal(run('scaledInterval(byKey.get("FishingRecipe/ShallowPools"),8000,-0.02,-6000)'),1960);
 assert.equal(run('scaledInterval(byKey.get("ArtisanRecipe/StoneSword"),2000,-0.02,-100)'),1860);
 assert.equal(run('savedRecipeTime(byKey.get("FishingRecipe/ShallowPools"),{percent:{min:-0.02,max:-0.02},flat:{max:-6000}})'),3920);
 run('showSkill("Woodcutting")');
 assert.match(element('detail').innerHTML,/已按存档“Tester”计算/);assert.match(element('detail').innerHTML,/XP（存档）/);
 assert.match(element('detail').innerHTML,/<button data-sort="6">单次产物期望价值（存档） ↕<\/button>[^]*?<button data-sort="7">每小时价值（存档） ↕<\/button>/);
 const savedValueCells=JSON.parse(run('JSON.stringify(recipeRows([byKey.get("WoodcuttingRecipe/NormalTree")],playerSave)[0].slice(6,8))'));
 assert.deepEqual(savedValueCells.map(c=>c.value),[stats.value,stats.value*3600000/stats.ms]);
 assertPlayerPage();
 const hasRow=(markup,key)=>new RegExp('<tr><td[^>]*>(?:<img[^>]*>)?<a href="#'+encodeURIComponent(key)+'"').test(markup);
 const setHide=checked=>{detailChange.forEach(fn=>fn({target:{id:'save-progress-hide',checked}}));return element('save-progress-results').innerHTML;};
 assert.match(element('detail').innerHTML,/隐藏已完成的任务/);
 assert.ok(hasRow(element('detail').innerHTML,'MasteryGuildTask/WoodcuttingTask1'));
 const tasks=setHide(true);
 assert.ok(!hasRow(tasks,'MasteryGuildTask/WoodcuttingTask1'));
 for(const id of ['WoodcuttingTask2','WoodcuttingTask43'])assert.ok(hasRow(tasks,'MasteryGuildTask/'+id),id);
 run('showSkill("Ranching")');
 assert.ok(!hasRow(element('detail').innerHTML,'MasteryGuildTask/RanchingTask201'));
 assert.ok(hasRow(element('detail').innerHTML,'MasteryGuildTask/RanchingTask202'));
 run('browse("MasteryGuildTask")');
 assert.ok(!hasRow(element('detail').innerHTML,'MasteryGuildTask/WoodcuttingTask1'));
 assert.ok(hasRow(setHide(false),'MasteryGuildTask/WoodcuttingTask1'));
 run('saveProgressList("MasteryGuildTask",[byKey.get("MasteryGuildTask/WoodcuttingTask1")],()=>"task")');
 assert.match(setHide(true),/没有剩余精通任务/);
 setHide(false);
 run('browse("ShopPurchase")');
 assert.match(element('detail').innerHTML,/隐藏已购买的一次性条目/);
 const shop=setHide(true);
 assert.ok(!hasRow(shop,'ShopPurchase/WoodenAxeHandle'));
 for(const id of ['CopperPickaxe','Cheese','BananaTreeSeed'])assert.ok(hasRow(shop,'ShopPurchase/'+id),id);
 assert.ok(hasRow(setHide(false),'ShopPurchase/WoodenAxeHandle'));
 run('playerSave=null;playerBoostsMemo=null;showSkill("Woodcutting")');
 assert.doesNotMatch(element('detail').innerHTML,/XP（存档）/);assert.match(element('detail').innerHTML,/基础 XP/);
 assert.doesNotMatch(element('detail').innerHTML,/save-progress-hide/);
 run('browse("ShopPurchase")');assert.doesNotMatch(element('detail').innerHTML,/save-progress-hide/);
}
// Exact game values are regression fixtures for one executable build.
if (referenceSnapshot) {
 // Expected product value per action from base chances and sell prices (hand-checked against v0.11.6 data).
 const near=(code,expected)=>{const actual=run(code);assert.ok(Math.abs(actual-expected)<1e-9,code+' = '+actual+', expected '+expected);};
 near('recipeValue(byKey.get("WoodcuttingRecipe/NormalTree"))',3+3*0.0025*28);// log per cut + bird nest per hit × 3 hits
 near('recipeValue(byKey.get("MiningRecipe/Stone"))',0.4*2);
 near('recipeValue(byKey.get("FishingRecipe/ShallowPools"))',0.8*5+0.2*5+0.01*1);// fish, junk on a miss, bait box
 near('recipeValue(byKey.get("ThievingRecipe/Citizen"))',0.85*7.5+0.105*2+0.045*5+0.0001*1+0.0099*178);
 near('recipeValue(byKey.get("ArtisanRecipe/StoneSword"))',11);
 run('showSkill("Woodcutting")');assert.match(element('detail').innerHTML,/3\.21 金币<\/td><td data-value="3852">3,852 金币\/小时<\/td>/);
 assert.equal(run('recipeRows([byKey.get("ThievingRecipe/Citizen")])[0][7].html'),'—');
 const golbin=JSON.parse(run(`JSON.stringify(compileCombatEnemy(byKey.get('Enemy/Golbin'),${combatPlayer}))`));
 assert.deepEqual(golbin.limits,[]);
 assert.equal(golbin.profiles[0].hp,20);
 assert.equal(golbin.profiles[0].interval,144);
 assert.equal(golbin.profiles[0].enemyHit,1-640/(2*825));
 assert.equal(golbin.profiles[0].attacks[0].hits[0].damage[0][2],8);
 assert.equal(run('Object.fromEntries(combatDropExpectations(byKey.get("Enemy/Golbin").obj))["Item/StoneSword"]'),1/23);
 assert.equal(run('Object.fromEntries(combatDropExpectations(byKey.get("Enemy/Golbin").obj))["Currency/GoldPieces"]'),25);
 assert.deepEqual(JSON.parse(run('JSON.stringify(combatDropRows(byKey.get("Enemy/GolbinScout").obj).find(r=>r.key==="Item/StoneArrows"))')),{
  key:'Item/StoneArrows',min:1,max:3,chance:.21875
 });
 assert.ok(Math.abs(run('combatDropValue(combatDropExpectations(byKey.get("Enemy/Golbin").obj))')-(27+119/23))<1e-12);
 assert.ok(run(`compileCombatEnemy(byKey.get('Enemy/MangroveMantis'),${combatPlayer}).profiles[0].attacks.some(a=>a.hits.length>1)`));
 assert.ok(run(`compileCombatEnemy(byKey.get('Enemy/Harpy'),${combatPlayer}).profiles[0].attacks.some(a=>a.onHit.some(e=>e.id==='MelvorBase:Haste'))`));
 const areaProfile=(enemy,area,shop)=>run(`compileCombatEnemy(byKey.get('Enemy/${enemy}'),${combatPlayer},byKey.get('CombatArea/${area}'),{...parseSave(decodeSaveString(SAVE_STRING)),shop:${JSON.stringify(shop)}})`);
 const slimed=areaProfile('GreenSlime','SlimeForest',{'MelvorBase:SlimeForestRemoval':0});
 assert.equal(slimed.profiles[0].hooks[0].OnAttack[0].id,'MelvorBase:Ensnared');
 const protectedSlime=areaProfile('GreenSlime','SlimeForest',{'MelvorBase:SlimeForestRemoval':1});
 assert.equal(protectedSlime.areaEffect.disabled,true);
 assert.equal(protectedSlime.profiles[0].hooks[0].OnAttack,undefined);
 assert.equal(protectedSlime.profiles[0].hooks[1].AtStartOfFight[0].id,'MelvorBase:Rejuvenate');
 const dragon=areaProfile('Drake','DragonsPass',{'MelvorBase:SlimeForestRemoval':1});
 assert.ok(dragon.profiles[0].base[0].some(([name,,value])=>name==='PercentAccuracyRating'&&value===-.2));
 assert.equal(areaProfile('Drake','DragonsPass',{'MelvorBase:DragonsPassRemoval':1}).areaEffect.disabled,true);
 const sand=areaProfile('SandSpitter','SeaOfSand',{'MelvorBase:SeaofSandRemoval':1});
 assert.equal(sand.areaEffect.disabled,true);
 assert.equal(areaProfile('SandScorpion','DesertPlains',{}).profiles[0].hooks[1].WhenHit[0].kind,'RandomMagnitude');
 const mining=shopPage.match(/<h3[^>]*><img[^>]*>采矿<\/h3>([^]*?)<\/section>/)?.[1];
 assert.ok(mining,'The shop should have a Mining category');
 assert.match(mining,/<h4[^>]*>采矿工具<\/h4>[^]*?ShopPurchase%2FCopperPickaxe"[^]*?<h4[^>]*>采矿常规升级<\/h4><p class="muted">暂无购买项目。<\/p>/);
 assert.match(shopPage,/>仓库栏位<\/h3>[^]*?>采矿<\/h3>/);
 run('wikiHome()');
 assert.match(element('detail').innerHTML, /1,811/);
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
 assert.match(element('detail').innerHTML, /4.35%/);
 run('showWikiEntry("Item/IntermediateWoodcuttingHat")');
 assert.match(element('detail').innerHTML,/鸟\/鹰巢几率 \+0\.03%/);
 vm.runInContext('showWikiEntry("Item/StoneSword")',context);
 assert.match(element('detail').innerHTML,/class="infobox"/);
 assert.match(element('detail').innerHTML,/class="lead"/);
 assert.match(element('detail').innerHTML,/ArtisanRecipe%2FStoneSword/);
 assert.match(element('detail').innerHTML,/Enemy%2FGolbin/);
 assert.match(element('detail').innerHTML,/装备属性/);
 assert.equal(vm.runInContext('(sourcesByItem.get("MelvorBase:NormalLog")||[]).some(r=>r.entry.type==="FarmingRecipe")',context),false);
 vm.runInContext('routePage("@search/Log")',context);
 assert.match(element('detail').innerHTML,/Item%2FNormalLog/);
 vm.runInContext('routePage("@links/Item/NormalLog")',context);
 assert.match(element('detail').innerHTML,/FiremakingRecipe%2FNormalLog/);
 assert.equal(run('searchEntries("生篝火烤野猪").some(e=>e.key==="Quest/MQ3")'),true);
 assert.match(run('previewMarkup(byKey.get("Item/NormalLog"))'),/普通原木[\s\S]*Normal Log[\s\S]*<b>来源<\/b>[\s\S]*<b>用途<\/b>/);
 assert.match(run('previewMarkup(byKey.get("Item/SpikemossLeaf"))'),/<b>用途<\/b>[\s\S]*<b>使用效果<\/b>/);
 assert.match(run('previewMarkup({...byKey.get("Enemy/Golbin"),title:"<img>"})'),/&lt;img&gt;/);
 run('showWikiEntry("Item/SpikemossLeaf")');
 assert.match(element('detail').innerHTML,/<section id="item-uses">[\s\S]*?消耗数量[\s\S]*?<\/section>[\s\S]*?<h3>使用效果<\/h3>/);
 run('showWikiEntry("Item/GrapplingHook")');
 assert.match(element('detail').innerHTML,/<section id="item-uses"><h3>物品用途<\/h3><p class="muted">暂无已知的配方材料、费用或其他消耗记录。<\/p><\/section>[\s\S]*?<h3>使用效果<\/h3>/);
 assert.match(run('boostCards(boostsFor("Thieving"))'),/<section class="boost-section"><h3 id="boost-section-0">/);
 run('showSkill("Attack")');
 assert.match(element('detail').innerHTML,/精通阶级与奖励 · 7/);
 assert.match(run('masterySection("Attack")'),/5%[\s\S]*?\+10%/);
 assert.equal(run('masteryTotalPoints("Woodcutting")'),413);
 assert.equal(run('masteryTotalPoints("Attack")'),543);
 assert.match(run('masterySection("Woodcutting")'),/所需精通点数[\s\S]*?MasteryGuildRank%2FApprenticeWoodcutter[^]*?<td data-value="21">21<\/td><td data-value="0.05">5%<\/td>/);
 assert.match(run('masterySection("Woodcutting")'),/MasteryGuildRank%2FExpertWoodcutter[^]*?<td data-value="413">413<\/td><td data-value="1">100%<\/td>/);
 run('showWikiEntry("MasteryGuildRank/ApprenticeWoodcutter")');
 assert.match(element('detail').innerHTML,/<th scope="row">所需精通点数<\/th><td>21<\/td>/);
 assert.match(masteryAll,/175 个阶级/);
 assert.match(masteryAll,/MasteryGuildRank%2FApprenticeSwordsman[\s\S]*?\+10%/);
 assert.match(masteryAll,/MasteryGuildRank%2FApprenticeSwordsman[^]*?<td data-value="28">28<\/td><td data-value="0.05">5%<\/td>/);
 // Tables spanning several skills are split into one titled section per skill.
 assert.equal((masteryAll.match(/class="skill-group-title"/g)||[]).length,25);
 run('browse("Item")');assert.match(element('detail').innerHTML,/其他物品（非技能产出）/);
 run('browse("Enemy")');
 const enemyPage=element('detail').innerHTML;
 assert.deepEqual([...enemyPage.matchAll(/<section id="enemy-[^"]+"><h3>([^<]+)<\/h3>/g)].map(m=>m[1]),['战斗区域','屠杀者区域','黑暗区域','地下城']);
 const enemyGroup=id=>enemyPage.match(new RegExp('<section id="enemy-'+id+'">[^]*?<\\/section>'))?.[0]||'';
 assert.match(enemyGroup('CombatAreas'),/CombatArea%2FGolbinForest[^]*?Enemy%2FGolbin[^]*?Item%2FStoneSword[^]*?32\.17 金币/);
 assert.match(enemyGroup('CombatAreas'),/Item%2FStoneArrows"[^]*?× 1–3 <span class="drop-chance">21\.88%/);
 assert.match(enemyGroup('CombatAreas'),/Item%2FStoneSword"[^]*?× 1 <span class="drop-chance">4\.35%/);
 assert.match(enemyGroup('SlayerZones'),/CombatArea%2FSlimeForest[^]*?Enemy%2FGreenSlime/);
 assert.match(enemyGroup('DarkAreas'),/CombatArea%2FDrearyBarrens[^]*?Enemy%2FVampire/);
 assert.match(enemyGroup('Dungeons'),/Dungeon%2FHobgolbinCamp[^]*?Enemy%2FGolbin[^]*?<td data-value="">—<\/td><td data-value="0">0 金币<\/td>/);
 assert.equal(new Set([...enemyPage.matchAll(/<tr><td[^>]*>(?:<img[^>]*>)?<a href="#Enemy%2F([^"]+)"/g)].map(m=>m[1])).size,192);
 assert.doesNotMatch(enemyPage,/每小时|魔法树篝火/);
 const rollerCard=run('enemyCombatCard(byKey.get("Enemy/BlackstoneRoller"))');
 assert.match(rollerCard,/^<details class="enemy-combat"><summary>战斗属性<\/summary>/);
 for(const label of ['战斗等级 <b>58</b>','生命值 <b>520</b>','盔甲 <b>80</b>','近战 · <b>格挡</b>','元素 <b>中立</b>','攻击间隔 <b>2.5 秒</b>']){
  assert.ok(rollerCard.includes(label),label);
 }
 assert.equal((rollerCard.match(/class="icon" src="assets\//g)||[]).length,6);
 assert.match(run('enemyCombatCard(byKey.get("Enemy/Vampire"))'),/吸血 <b>10%<\/b>/);
 assert.match(run('enemyCombatCard(byKey.get("Enemy/WillOWisp"))'),/最大守护值 <b>10<\/b>/);
 assert.ok(enemyPage.includes(rollerCard));
 run('showWikiEntry("Enemy/BlackstoneRoller")');
 assert.ok(element('detail').innerHTML.includes(rollerCard));
 assert.doesNotMatch(element('detail').innerHTML,/<h3>属性<\/h3>|<th scope="row">攻击间隔<\/th>/);
 assertPlayerPage();
 assert.equal(run('skillOfEntry(byKey.get("MasteryGuildTask/WoodcuttingTask3"))'),'Woodcutting');
 assert.deepEqual(JSON.parse(run('JSON.stringify(G.Objects.MasteryGuildCategory.map(c=>[c.Id,c.BasePoints]))')),[['Novice',1],['Easy',2],['Adept',3],['Intermediate',5],['Hard',8],['Expert',12]]);
 for(const code of ['showSkill("Woodcutting")','browse("MasteryGuildTask")']){
  run(code);
  assert.match(element('detail').innerHTML,/任务类别[\s\S]*?完成奖励（精通点数）[\s\S]*?MasteryGuildTask%2FWoodcuttingTask3[^]*?<small class="en">Adept<\/small><\/td><td data-value="3">3<\/td>/);
 }
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
 assert.equal(run('skillOfEntry(byKey.get("Pet/WoodcuttingMasterPet"))'),'Woodcutting');
 run('showWikiEntry("Item/NormalLog")');
 assert.match(element('detail').innerHTML,/<h4 class="skill-group-title">[^<]*<img[^>]*>伐木 · 1<\/h4>/);
 assert.match(run('boostCards(boostsFor("Thieving"))'),/id="boost-section-0"/);
 assert.match(run('boostRowsHtml(boostsFor("Thieving").filter(r=>r.key==="Item/GrapplingHook"))[0][4].html'),/<summary>抓钩 · 生效条件与获取途径/);
 assert.equal(run('boostRecords.length'),2566);
 assert.equal(run('effectGrants.length'),199);
 assert.equal(run('allBoostRecords.length'),2765);
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
 assert.match(run('parentText(byKey.get("AstrologyNode/DeedreeA1"))'),/取决于该星座已解锁的次要节点数量/);
 const nodeRow=(html,id)=>html.match(new RegExp('<tr><td[^>]*>(?:<img[^>]*>)?<a href="#AstrologyNode%2F'+id+'"[^]*?<\\/tr>'))?.[0]||'';
 run('routePage("AstrologyConstellation/Deedree")');
 const deedree=element('detail').innerHTML;
 assert.match(deedree,/<h3>主要节点<\/h3>[^]*?每解锁 4 个次要节点[^]*?<h3>次要节点<\/h3>[^]*?12、66、178/);
 assert.match(nodeRow(deedree,'DeedreeMajor1'),/\+8%[^]*?\+1/);
 assert.match(nodeRow(deedree,'DeedreeA1'),/\+2%/);
 assert.match(nodeRow(deedree,'DeedreeA2'),/伐木<\/a> 等级 20/);
 assertPlayerPage();
 run('routePage("AstrologyConstellation/Ameria")');
 assert.match(nodeRow(element('detail').innerHTML,'AmeriaMajor3'),/陨石雨/);
 assertPlayerPage();
 assert.equal(run('Math.abs(sourcesByItem.get("MelvorBase:StoneSword").find(r=>r.entry.key==="Enemy/Golbin").chance-1/23)<1e-12'),true);
 assert.equal(run('sourcesByItem.get("MelvorBase:StoneSword").some(r=>r.entry.key==="ArtisanRecipe/StoneSword")'),true);
 assert.equal(run('usesByItem.get("MelvorBase:Stone").some(r=>r.entry.key==="ArtisanRecipe/StoneSword")'),true);
 assert.equal(run('recipeTime(byKey.get("WoodcuttingRecipe/NormalTree"))'),3000);
 assert.equal(run('recipeTime(byKey.get("ArtisanRecipe/StoneSword"))'),4000);
 assert.equal(run('production(byKey.get("ArtisanRecipe/StoneSword"),100,4000).costs[0].Quantity'),200);
 assert.match(run('compareEquipment("Item/StoneSword","Item/DefaultWeapon")'),/B − A/);
}
const report=JSON.parse(run('JSON.stringify({objects:entries.length,modifiers:boostRecords.length,sources:boostByOwner.size,effectGrants:effectGrants.length,skills:skillEntries.length,unscoped:boostsFor("unknown").length,perSkill:Object.fromEntries(skillEntries.map(s=>[s.id,{modifiers:boostsFor(s.id).length,sources:new Set(boostsFor(s.id).map(r=>r.key)).size}]))})'));
fs.writeFileSync(path.join(output,'verification-report.json'),JSON.stringify(report,null,2));
console.log('PASS: all objects and skill/Boosts pages; exact modifier coverage; bilingual search; XP curve; production; comparison; export escaping.');
console.log(referenceSnapshot?'PASS: v0.11.6 reference data regression checks.':'Snapshot values changed; data-independent checks passed.');
console.log(JSON.stringify(report));
