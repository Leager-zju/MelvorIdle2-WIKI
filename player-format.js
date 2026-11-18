// Keep extraction details in the files, and present gameplay facts in the Wiki.
const playerWords={Flat:'固定',Percent:'百分比',Global:'全局',Max:'最大',Min:'最小',Base:'基础',Hit:'命中',Hits:'命中',Damage:'伤害',Interval:'间隔',Chance:'几率',Success:'成功',Tracking:'追踪',Trapping:'捕获',Stealth:'隐匿',Fortune:'幸运',Perception:'感知',Product:'产物',Quantity:'数量',Item:'物品',Items:'物品',Currency:'货币',Reward:'奖励',Gained:'获得',Gain:'获得',Preservation:'保留',Preserve:'保留',Doubling:'翻倍',Cost:'消耗',Consumption:'消耗',Accuracy:'精准',Rating:'评分',Bonus:'加成',Strength:'力量',Defence:'防御',Ranged:'远程',Magic:'魔法',Melee:'近战',Health:'生命',Protection:'防护',Power:'威力',Light:'光照',Darkness:'黑暗',Stun:'眩晕',Avoidance:'避免',Avoid:'避免',Loot:'战利品',Common:'普通',Rare:'稀有',Steps:'步骤',Step:'步骤',Stacks:'层数',Count:'数量',Level:'等级',XP:'经验',Xp:'经验',Experience:'经验',Action:'动作',Player:'玩家',Target:'目标',Enemy:'敌人',Self:'自身',True:'是',False:'否',On:'当',At:'在',When:'当',First:'首次',Attack:'攻击',Attacked:'受到攻击',Start:'开始',Fight:'战斗',End:'结束',Turn:'回合',Ended:'结束',Performed:'完成',Only:'仅',Successful:'成功',Failed:'失败',Increased:'提高',Decreased:'降低',Over:'超过',Under:'低于',Critical:'暴击',DamageOverTime:'持续伤害',Combat:'战斗',Toolbelt:'工具腰带',Equipment:'装备',Food:'食物',Bury:'埋葬',Compost:'堆肥',Openable:'可开启',Fish:'鱼类',Fishing:'钓鱼',Mining:'采矿',Woodcutting:'伐木',Firemaking:'生火',Cooking:'烹饪',Farming:'种植',Hunting:'狩猎',Thieving:'扒窃',Agility:'灵巧',Astrology:'占星',Prayer:'祈祷',Slayer:'屠杀',Limit:'上限',Efficiency:'效率',Threshold:'阈值',Auto:'自动',Eat:'进食'};
const playerFields={...labels,FitsInSlot:'装备槽位',OccupiesSlots:'占用槽位',CanEquipQuantity:'可叠加装备',ConsumesOn:'消耗时机',SuccessfulActionOnly:'仅成功时消耗',FailedActionOnly:'仅失败时消耗',AlwaysDrops:'必定获得',DropTable:'随机奖励',CommonDropTable:'普通战利品',RareDropTable:'稀有战利品',CompletionDropTable:'完成奖励',Type:'种类',Data:'条件',Component:'技能',Character:'角色',Configuration:'效果',LocalContext:'适用范围',FromContext:'获得方式',Scaling:'按等级变化',Modifiers:'效果',CombatEffect:'特殊效果',IgnoreCompletion:'不计入收集进度',BaseInterval:'基础耗时',BaseMinInterval:'最短耗时',BaseMaxInterval:'最长耗时',BaseProductChance:'基础产出几率',Chance:'几率',FishChance:'钓到鱼的几率',Weight:'表内占比',Stats:'属性',PowerRatings:'威力',ProtectionRatings:'防护',Bonuses:'效果',BonusesWhenGrown:'成熟时效果',PerMinorNodeBonuses:'每个小节点的效果',StacksToAdd:'增加层数',Turns:'持续回合',ItemCount:'需要套装件数',DefaultStacksToAdd:'每次增加层数',StacksRequired:'触发所需层数',DefaultBuyLimit:'最多购买数量',Percent:'比例',Amount:'数量',Value:'数量',MaxProgress:'目标数量',Trigger:'获得方式',Conditions:'条件',Condition:'生效条件',TargetType:'目标种类',Technique:'技巧',TechniqueLevel:'技巧等级',Constellation:'星座',BasePreparingInterval:'准备耗时',BaseHeatingInterval:'加热耗时',BaseStirringInterval:'搅拌耗时',BaseBottlingInterval:'装瓶耗时',ProductInterval:'产出间隔',UnlockLevel:'解锁等级',PointPercentRequired:'所需精通进度',Requirements:'要求',UnlockRequirements:'解锁要求',AccessRequirements:'进入要求',SecondaryRequirements:'额外要求',DisplayRequirements:'显示要求',FixedItems:'固定奖励',ItemTables:'随机奖励',FixedCurrencies:'货币奖励',CurrencyReward:'货币奖励',BaseCurrencyLootChance:'获得货币的基础几率',BaseCommonLootChance:'普通战利品基础几率',BaseRareLootChance:'稀有战利品基础几率',CanWater:'可以浇水',CanCompost:'可以施肥',AttractsDisease:'可能染病',AttractsPests:'可能遭受虫害',Regrows:'再生次数',Difficulty:'难度',Damage:'伤害',Perception:'感知',MinCombatLevel:'最低战斗等级',MaxCombatLevel:'最高战斗等级',MinDamage:'最低伤害',MaxDamage:'最高伤害',Count:'数量',Duration:'持续时间',Charges:'可用次数',ScaleFactor:'获得难度',MinimumCount:'至少数量',SameEnclosure:'需在同一围栏',WithoutFail:'不允许失败',UsingBait:'使用诱饵',BaseKnowledge:'基础知识',BasePoints:'基础点数',UnlockText:'解锁说明',Observation:'观察内容',TriggerGoal:'触发目标',ConditionGoal:'附加目标',LinkedTask:'关联任务',TimedCompletionRewards:'限时奖励',CompletionRewards:'完成奖励',EntryCost:'进入费用',PurchaseCosts:'购买费用',LifespanInterval:'寿命',BaseVariantInterval:'成长耗时',Eats:'食物消耗',Treats:'零食',Variants:'变种',BaseVariant:'幼年形态',Satisfaction:'满意度',Element:'元素',Elements:'元素',Attacks:'攻击技能',Passives:'被动效果',Effect:'效果',AppliesTo:'作用目标',BankTags:'物品用途',Goal:'目标'};
const hiddenPlayerFields=new Set(['Id','Icon','Media','Sprite','SpriteOffset','LeafMedia','IsOr','StatsType','FromContextType','LocalContextObjectCombination','FromContextObjectCombination','IgnoreCompletion','IsCustom','Priority','ShowInMilestones','ShowSubcategoryButtons','OnlyShowWhenRecipesAvailable','ShowPurchasedIndicator','IsScarySpider','LogToEventLog','LogToJournal','CategoryColorHex','AllowBulkPurchase','ShowBuyLimit','OverrideMusicTrack','PauseOnSpawn','Height','DisplayPriority','DefaultItemOrder','TemplateString','NodeType']);
function humanWord(value){
 const raw=String(value??''),id=raw.split(':').pop();
 if(raw.startsWith('Placeholder:'))return '对应目标';
 const translated=tr(id);if(translated!==id)return plain(translated);
 if(playerWords[id])return playerWords[id];
 const words=id.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/([A-Z])([A-Z][a-z])/g,'$1 $2').split(/[_ ]+/);
 return words.map(w=>playerWords[w]||w).join(' ');
}
function playerRef(value,field=''){
 const id=shortId(value);
 if(field==='Entity'||field==='Experience')return skillById.has(id)?skillLink(id):esc(humanWord(id));
 const candidates=resolve(value,field);
 return candidates.length?link(candidates[0]):esc(humanWord(value));
}
function eventText(value){
 const d=value.Data||{},type=shortId(value.Type),skill=shortId(d.Component?.Entity||d.Experience?.Entity);
 const ref=(key,kind)=>d[key]?playerRef(d[key],kind||key):'';
 const prefix='';// "or" is shown by the list renderer joining items ("A 或 B"); a lone or-condition is just a requirement.
 if(type==='Level'&&d.Experience)return '随 '+playerRef(d.Experience.Entity,'Entity')+' 等级提高';
 if(type==='Level')return prefix+skillLink(skill)+' 等级 '+fmt(d.Level);
 if(type==='ShopPurchase')return prefix+'购买 '+ref('ShopPurchase')+(d.Amount?' × '+fmt(d.Amount):'');
 if(type==='MasteryGuildRank')return prefix+'精通达到 '+ref('Rank');
 if(type==='AgilityTechniqueLevel')return prefix+ref('Technique')+' 等级 '+fmt(d.Level);
 if(type==='QuestComplete')return prefix+'完成任务 '+ref('Quest');
 if(type==='QuestStepActive')return prefix+'正在进行 '+ref('Quest')+(d.Step!=null?' 第 '+(d.Step+1)+' 步':'');
 if(type==='EnemyCombatLevelCondition')return prefix+'敌人战斗等级 '+fmt(d.MinCombatLevel||1)+(d.MaxCombatLevel?'–'+fmt(d.MaxCombatLevel):' 及以上');
 if(type==='CharacterUsingCombatStyle')return prefix+'使用 '+ref('Style','CombatStyle');
 if(type==='CharacterUsingStance')return prefix+'使用 '+ref('Stance');
 if(type==='EquipmentItemEquipped')return prefix+'装备 '+ref('Item');
 if(type==='ToolbeltItemEquipped')return prefix+'在工具腰带装备 '+ref('Item')+(d.Quantity?' × '+fmt(d.Quantity):'');
 if(type==='WoodcuttingCutTree'&&d.MaxProgress!=null)return '砍倒 '+fmt(d.MaxProgress)+' 棵'+(d.Recipe?' '+refLink(d.Recipe,'WoodcuttingRecipe'):'树');
 if(type==='PetUnlocked')return '找到宠物 '+refLink(d.Pet,'Pet');
 if(type==='HuntingMaxLevelAnimals')return '将 '+fmt(d.Count)+' 种狩猎动物提升至 '+fmt(d.Level)+' 级';
 if(type==='HuntingUniqueRareSpeciesFound')return '在狩猎中发现 '+fmt(d.Count)+' 种不同的稀有物种';
 if(type==='HuntingUniqueCollectablesFound')return '在狩猎中发现 '+fmt(d.Count)+' 种不同的收藏品';
 if(type==='HuntingAnimalSpecies'&&shortId(d.Statistic)==='HuntingAnimalSpeciesTrapped')return '捕获 '+refLink(d.Species,'HuntingAnimalSpecies')+' × '+fmt(d.Value);
 if(type==='RanchingSameAnimalCount')return '饲养至少 '+fmt(d.MinimumCount)+' 只 '+refLink(d.Animal,'RanchingAnimal')+(d.SameEnclosure?'（需在同一围栏）':'');
 if(type==='RanchingAnimalStatistic'&&shortId(d.Statistic)==='RanchingAnimalTimeSpentAliveStatistic')return '让 '+refLink(d.Animal,'RanchingAnimal')+' 累计存活 '+fmt(d.Value)+' 小时';
 if(type==='AgilityNumTechniquesLevel')return '将至少 '+fmt(d.NumTechniques)+' 项灵巧技巧提升至 '+fmt(d.Level)+' 级';
 if(type==='AgilityShortcutsCreated')return '在灵巧训练路线中开辟 '+fmt(d.Count)+' 条捷径';
 if(type==='AgilityCourseStatistic'&&shortId(d.Statistic)==='AgilityCourseCompleted')return '完成 '+refLink(d.Course,'AgilityCourse')+' '+fmt(d.Value)+' 次';
 if(type==='AstrologyEventStatistic'&&shortId(d.Statistic)==='AstrologyTimesEventObserved'){
  const event=shortId(d.Event);
  const target=byKey.get('AstrologyObservationEvent/'+event)||byKey.get('AstrologyItemEvent/'+event);
  return '观察 '+(target?eLink(target):esc(humanWord(event)))+' '+fmt(d.Value)+' 次';
 }
 if(type==='SlayerMasterStatistic'&&shortId(d.Statistic)==='SlayerMasterTasksCompleted')return '为 '+refLink(d.Master,'SlayerMaster')+' 完成 '+fmt(d.Value)+' 个屠杀任务';
 if(type==='ValueStatistic'&&/^AstrologyTotal(Major|Minor)NodesUnlocked$/.test(shortId(d.Statistic)))return '累计解锁 '+fmt(d.Value)+' 个'+(d.Statistic.includes('Major')?'主要':'小')+'占星节点';
 if(type==='DemoLocked')return '需要完整版本';
 if(type.endsWith('Statistic')){
  const action=/Killed/.test(d.Statistic)?'击败':/Sold/.test(d.Statistic)?'出售':/FromSale/.test(d.Statistic)?'出售累计获得':/Gained|Found/.test(d.Statistic)?'获得':'累计';
  return prefix+action+' '+(['Item','Enemy','Currency','Master','Animal'].filter(k=>d[k]).map(k=>ref(k)).join(' · '))+' '+fmt(d.Value);
 }
 if(type==='FightingSlayerTask')return prefix+'进行屠杀任务';
 if(type==='ChancePerExperience')return (skill?skillLink(skill)+' 获得经验时有机会获得':'获得经验时有机会获得');
 if(type==='CombatInArea')return prefix+'在 '+(ref('Area')||ref('Category')||'指定区域')+' 战斗';
 if(/Astrology(Major|Minor)NodeUnlockCount/.test(type))return prefix+ref('Constellation')+' 解锁 '+fmt(d.Count)+' 个'+(type.includes('Major')?'主':'小')+'节点';
 if(type==='AstrologyMajorNodeUnlocked')return prefix+'解锁 '+ref('MajorNode');
 if(type==='OnAttack'||type==='WhenAttacked')return esc(humanWord(d.Type||type));
 if(type==='AtStartOfFight')return '战斗开始时';
 if(type==='NormalDamage')return '造成 '+pct(d.Percent)+' 常规伤害';
 const targets=['Item','Enemy','Recipe','Animal','Location','Quest','Master','PotionGroup','Technique','Category','Subcategory','Stance','Style','Constellation','Effect'].filter(k=>d[k]).map(k=>ref(k)).join(' · ');
 const progress=d.MaxProgress??d.Value??d.Amount;
 const extra=Object.fromEntries(Object.entries(d).filter(([k,v])=>!['Component','Id','IsOr','Item','Enemy','Recipe','Animal','Location','Quest','Master','PotionGroup','Technique','Category','Subcategory','Stance','Style','Constellation','Effect','MaxProgress','Value','Amount','Statistic'].includes(k)&&v!=null));
 const title=humanWord(type);
 return prefix+esc(title)+(targets?'：'+targets:'')+(progress!=null?' × '+fmt(progress):'')+(Object.keys(extra).length?playerRender(extra):'');
}
function playerRender(value,field='',depth=0){
 if(value==null)return '<span class="muted">—</span>';
 if(typeof value==='boolean')return value?'是':'否';
 if(typeof value==='number'){
  if(/Interval$/.test(field))return fmt(value/1000,3)+' 秒';
  if(/Chance|Percent|Satisfaction/.test(field))return pct(value);
  return fmt(value,6);
 }
 if(typeof value==='string'){
  if(value.startsWith('res://'))return '';
  if(value.includes(':')&&/^(MelvorBase|Placeholder):/.test(value))return playerRef(value,field);
  return esc(plain(tr(value))).replace(/\n/g,'<br>');
 }
 if(depth>10)return '<span class="muted">效果取决于当前目标与状态</span>';
 if(Array.isArray(value)){
  if(!value.length)return '<span class="muted">无</span>';
  const weighted=value.every(v=>v&&typeof v==='object'&&typeof v.Weight==='number'),total=weighted?value.reduce((sum,v)=>sum+v.Weight,0):0;
  // An "or" condition joins the previous one on the same line: "A 或 B" (rendered without its own "或：" prefix).
  const lines=[];
  for(const v of value){
   const join=v?.Data?.IsOr&&lines.length,item=join?{...v,Data:{...v.Data,IsOr:false}}:v;
   const html=playerRender(item,field,depth+1)+(weighted&&total?' · 表内占比 '+pct(v.Weight/total):'');
   if(join)lines[lines.length-1]+=' <b class="or">或</b> '+html;else lines.push(html);
  }
  return '<ul>'+lines.map(x=>'<li>'+x+'</li>').join('')+'</ul>';
 }
 if(value.Type&&value.Data)return eventText(value);
 if(value.Stat&&typeof value.Value==='number'){
  if(typeof value.Stat==='object')return esc(effectText(value));
  return playerRef(value.Stat,'Stat')+' '+playerRender(value.Value,/Interval/.test(value.Stat)?'BaseInterval':'Value');
 }
 if(value.StatGroup&&typeof value.Value==='number')return esc(effectText(value));
 if(value.Modifier?.Effect)return esc(effectText(value));
 if(value.Item||value.Currency){
  const key=value.Item?'Item':'Currency';let text=playerRef(value[key],key);
  if(value.Quantity!=null)text+=' × '+fmt(value.Quantity);else if(value.MinQuantity!=null)text+=' × '+(value.MinQuantity===value.MaxQuantity?fmt(value.MinQuantity):fmt(value.MinQuantity)+'–'+fmt(value.MaxQuantity));
  if(value.Chance!=null)text+=' · '+pct(value.Chance)+' 几率';return text;
 }
 if(value.Key&&value.Value!=null)return playerRef(value.Key)+' '+playerRender(value.Value,'Value');
 if(value.Entity)return playerRef(value.Entity,'Entity');
 const rows=Object.entries(value).filter(([k,v])=>v!=null&&!(Array.isArray(v)&&!v.length)&&!hiddenPlayerFields.has(k)&&k!=='Weight'&&!/Media|Texture|Audio|Colour|Color|Sprite|Background|Image|SoundEffect/.test(k));
 return rows.map(([k,v])=>{
  if(['Global','Component','CombatEffect','Modifiers','Configuration','Data','Capabilities','Stats'].includes(k))return playerRender(v,k,depth+1);
  if(k.startsWith('MelvorBase:'))return '<div class="gamefact"><b>'+esc(humanWord(k))+'</b>'+playerRender(v,k,depth+1)+'</div>';
  const label=playerFields[k]||humanWord(k);
  return '<div class="gamefact"><span class="factlabel">'+esc(label)+'：</span>'+playerRender(v,k,depth+1)+'</div>';
 }).join('')||'<span class="muted">无额外效果</span>';
}
