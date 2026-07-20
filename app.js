const STEMS=["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
const BRANCHES=["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const TZ=[[-180,"東(西)経180° ニュージーランド 他"],[-165,"東経165° ニューカレドニア 他"],[-150,"東経150° オーストラリア東部 他"],[-135,"東経135° 日本・韓国 他"],[-120,"東経120° 中国・フィリピン 他"],[-105,"東経105° タイ・ベトナム 他"],[-97.5,"東経97.5° ミャンマー 他"],[-90,"東経90° バングラデシュ 他"],[-82.5,"東経82.5° インド・スリランカ"],[-75,"東経75° パキスタン 他"],[-67.5,"東経67.5° アフガニスタン"],[-60,"東経60° オマーン 他"],[-52.5,"東経52.5° イラン"],[-45,"東経45° イラク・エチオピア 他"],[-30,"東経30° ギリシャ・エジプト 他"],[-15,"東経15° フランス・スウェーデン 他"],[0,"東(西)経0° イギリス・ポルトガル 他"],[45,"西経45° アルゼンチン 他"],[60,"西経60° チリ・パラグアイ 他"],[67.5,"西経67.5° ベネズエラ"],[75,"西経75° アメリカ東部 他"],[90,"西経90° アメリカ中部 他"],[105,"西経105° アメリカ山岳部 他"],[120,"西経120° アメリカ太平洋部 他"],[135,"西経135° アラスカ 他"],[150,"西経150° ハワイ 他"]];
const CITIES=[[42,"根室"],[37,"釧路"],[33,"帯広"],[29,"旭川"],[27,"稚内"],[25,"札幌"],[23,"函館"],[23,"青森"],[25,"盛岡"],[20,"秋田"],[23,"仙台"],[21,"山形"],[22,"福島"],[22,"水戸"],[20,"千葉"],[20,"宇都宮"],[16,"前橋"],[19,"さいたま"],[19,"東京"],[17,"八王子"],[19,"横浜"],[17,"小田原"],[16,"新潟"],[13,"長野"],[14,"甲府"],[14,"静岡"],[11,"浜松"],[9,"富山"],[9,"高山"],[7,"岐阜"],[10,"豊橋"],[8,"名古屋"],[7,"金沢"],[5,"福井"],[3,"大津"],[7,"四日市"],[6,"津"],[3,"京都"],[3,"奈良"],[2,"大阪"],[1,"神戸"],[0,"明石"],[1,"和歌山"],[-3,"鳥取"],[-4,"岡山"],[-4,"高松"],[-2,"徳島"],[-8,"松江"],[-10,"広島"],[-6,"高知"],[-9,"松山"],[-11,"岩国"],[-14,"山口"],[-16,"北九州"],[-18,"福岡"],[-19,"佐賀"],[-20,"長崎"],[-25,"五島列島"],[-14,"大分"],[-17,"熊本"],[-14,"宮崎"],[-18,"鹿児島"],[-22,"奄美大島"],[-29,"那覇"],[-43,"石垣"]];
const EQUATION_OF_TIME_TABLE=[
  [-3,-4,-4,-5,-5,-6,-6,-6,-7,-7,-8,-8,-8,-9,-9,-10,-10,-10,-11,-11,-11,-11,-12,-12,-12,-13,-13,-13,-13,-13,-13],
  [-13,-14,-14,-14,-14,-14,-14,-14,-14,-14,-14,-14,-14,-14,-14,-14,-14,-14,-14,-14,-14,-14,-13,-13,-13,-13,-13,-13,-13],
  [-12,-12,-12,-12,-12,-11,-11,-11,-11,-10,-10,-10,-10,-9,-9,-9,-9,-8,-8,-8,-7,-7,-7,-6,-6,-6,-6,-5,-5,-5,-4],
  [-4,-4,-3,-3,-3,-3,-2,-2,-2,-1,-1,-1,-1,0,0,0,0,1,1,1,1,1,2,2,2,2,2,2,3,3],
  [3,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4,4,4,3,3,3,3,3,3,3,3,3,3,2],
  [2,2,2,2,2,1,1,1,1,1,1,0,0,0,0,-1,-1,-1,-1,-1,-2,-2,-2,-2,-2,-3,-3,-3,-3,-3],
  [-4,-4,-4,-4,-4,-5,-5,-5,-5,-5,-5,-6,-6,-6,-6,-6,-6,-6,-6,-6,-6,-6,-6,-6,-6,-7,-7,-6,-6,-6,-6],
  [-6,-6,-6,-6,-6,-6,-6,-6,-6,-5,-5,-5,-5,-5,-4,-4,-4,-4,-4,-3,-3,-3,-3,-2,-2,-2,-2,-2,-1,-1,-1],
  [0,0,0,1,1,1,2,2,2,3,3,3,4,4,5,5,5,6,6,6,7,7,7,8,8,8,9,9,9,9],
  [10,10,11,11,11,12,12,12,13,13,13,13,14,14,14,14,15,15,15,15,15,15,16,16,16,16,16,16,16,16,16],
  [16,16,16,16,16,16,16,16,16,16,16,16,16,16,15,15,15,15,15,15,14,14,14,13,13,13,13,13,12,12],
  [11,11,10,10,10,9,9,8,8,7,7,7,6,6,5,5,4,4,3,3,2,2,1,1,0,0,-1,-1,-2,-2,-3],
];
const JAPAN_SUMMER_TIME_PERIODS={
  1948:[[5,2,1,0],[9,12,0,0]],1949:[[4,3,1,0],[9,11,0,0]],1950:[[5,7,1,0],[9,10,0,0]],1951:[[5,6,1,0],[9,9,0,0]],
};
const JAPANESE_ERAS={
  meiji:{label:'明治',start:[1868,1,25],end:[1912,7,29]},
  taisho:{label:'大正',start:[1912,7,30],end:[1926,12,24]},
  showa:{label:'昭和',start:[1926,12,25],end:[1989,1,7]},
  heisei:{label:'平成',start:[1989,1,8],end:[2019,4,30]},
  reiwa:{label:'令和',start:[2019,5,1],end:[9999,12,31]},
};
const mod=(n,m)=>((n%m)+m)%m;
let activeReading=null,prePrintTitle='';
const ELEMENT_BY_CHAR={甲:'wood',乙:'wood',丙:'fire',丁:'fire',戊:'earth',己:'earth',庚:'metal',辛:'metal',壬:'water',癸:'water',子:'water',丑:'earth',寅:'wood',卯:'wood',辰:'earth',巳:'fire',午:'fire',未:'earth',申:'metal',酉:'metal',戌:'earth',亥:'water'};
const FIVE_ELEMENTS=['wood','fire','earth','metal','water'];
const STEMS_BY_ELEMENT={wood:['甲','乙'],fire:['丙','丁'],earth:['戊','己'],metal:['庚','辛'],water:['壬','癸']};
const MONTHLY_HIDDEN_STEM_RULES={
  子:[[10,'壬'],[Infinity,'癸']],丑:[[9,'癸'],[12,'辛'],[Infinity,'己']],寅:[[7,'戊'],[14,'丙'],[Infinity,'甲']],卯:[[10,'甲'],[Infinity,'乙']],
  辰:[[9,'乙'],[12,'癸'],[Infinity,'戊']],巳:[[7,'戊'],[14,'庚'],[Infinity,'丙']],午:[[10,'丙'],[20,'己'],[Infinity,'丁']],未:[[9,'丁'],[12,'乙'],[Infinity,'己']],
  申:[[7,'戊'],[14,'壬'],[Infinity,'庚']],酉:[[10,'庚'],[Infinity,'辛']],戌:[[9,'辛'],[12,'丁'],[Infinity,'戊']],亥:[[7,'戊'],[14,'甲'],[Infinity,'壬']],
};
const TWELVE_FORTUNE_STAGES=['長生','沐浴','冠帯','建禄','帝旺','衰','病','死','墓','絶','胎','養'];
const TWELVE_FORTUNE_BIRTH_BRANCH={甲:'亥',乙:'午',丙:'寅',丁:'酉',戊:'寅',己:'酉',庚:'巳',辛:'子',壬:'申',癸:'卯'};
const EMPTY_SCORES=()=>({wood:0,fire:0,earth:0,metal:0,water:0});
const BRANCH_BASE_RULES={
  major:{
    子:{fixed:{water:3}},丑:{fixed:{water:2},flex:[null,1]},寅:{fixed:{wood:2},flex:['wood',1]},卯:{fixed:{wood:3}},
    辰:{flex:[null,3]},巳:{fixed:{fire:2},flex:['fire',1]},午:{fixed:{fire:3}},未:{fixed:{fire:2,earth:2},flex:['earth',1]},
    申:{fixed:{metal:2},flex:['metal',1]},酉:{fixed:{metal:3}},戌:{flex:[null,3]},亥:{fixed:{water:2},flex:['water',1]},
  },
  minor:{
    子:{fixed:{water:1}},丑:{flex:[null,1]},寅:{flex:['wood',1]},卯:{fixed:{wood:1}},辰:{flex:[null,1]},巳:{flex:['fire',1]},
    午:{fixed:{fire:1}},未:{flex:['earth',1]},申:{flex:['metal',1]},酉:{fixed:{metal:1}},戌:{flex:[null,1]},亥:{flex:['water',1]},
  },
};
const FORMATIONS={
  bojin:[['water',['申','亥','子','辰']],['wood',['亥','寅','卯','未']],['fire',['寅','巳','午','戌']],['metal',['巳','申','酉','丑']]],
  direction:[['water',['亥','子','丑']],['wood',['寅','卯','辰']],['fire',['巳','午','未']],['metal',['申','酉','戌']]],
  meeting:[['water',['申','子','辰']],['wood',['亥','卯','未']],['fire',['寅','午','戌']],['metal',['巳','酉','丑']]],
  pseudo:[['water',['申','亥','辰']],['wood',['亥','寅','未']],['fire',['寅','巳','戌']],['metal',['巳','申','丑']]],
};
const NON_CONSUMING_HALF_DIRECTION_PAIRS=new Set(['亥子','卯寅','午巳','申酉']);
const PAIR_KEY=(a,b)=>[a,b].sort().join('');
function makeBranchState(char,role='minor',index=0){
  const rule=BRANCH_BASE_RULES[role][char]||{},fixed={...rule.fixed},flex=rule.flex?[{element:rule.flex[0],amount:rule.flex[1],priority:99}]:[];
  return{char,role,index,capacity:role==='major'?3:1,fixed,flex,overlays:{},canceled:false,transformations:[],stamps:[],relations:[]};
}
function addStateStamp(state,label){if(!state.stamps.includes(label))state.stamps.push(label)}
function addStateRelation(state,relation){state.relations.push(relation)}
function branchStateScores(state){
  const scores=EMPTY_SCORES();if(state.canceled)return scores;
  for(const [element,amount] of Object.entries(state.fixed))scores[element]+=amount;
  for(const part of state.flex)if(part.element)scores[part.element]+=part.amount;
  for(const [element,amount] of Object.entries(state.overlays))scores[element]+=amount;
  return scores;
}
function flexibleAmount(state){return state.flex.reduce((sum,part)=>sum+part.amount,0)}
function assignFlexible(state,element,amount=Infinity,priority=9,label='五行変化'){
  let remaining=amount,changed=0;const additions=[];
  for(const part of state.flex){
    if(remaining<=0)break;
    if(part.priority<priority)continue;
    const take=Math.min(part.amount,remaining);
    if(part.element===element){
      if(take<part.amount){part.amount-=take;additions.push({element,amount:take,priority})}else part.priority=Math.min(part.priority,priority);
      remaining-=take;continue;
    }
    part.amount-=take;additions.push({element,amount:take,priority});remaining-=take;changed+=take;
  }
  state.flex=state.flex.filter(part=>part.amount>1e-9).concat(additions);
  if(changed>0)state.transformations.push(`${label}:${element}${changed}`);
  return changed;
}
function overlayAtLeast(state,element,amount,label){
  if(amount<=0)return;const before=state.overlays[element]||0;state.overlays[element]=Math.max(before,amount);
  if(state.overlays[element]>before)state.transformations.push(`${label}:${element}${state.overlays[element]-before}`);
}
function eligibleFlexibleAmount(state,priority=9){return state.flex.filter(part=>part.priority>=priority).reduce((sum,part)=>sum+part.amount,0)}
function changeableAmountToward(state,element,priority=9){return state.flex.filter(part=>part.priority>=priority&&part.element!==element).reduce((sum,part)=>sum+part.amount,0)}
function replaceFlexibleBatch(state,allocations,priority,label){
  let removing=Object.values(allocations).reduce((sum,amount)=>sum+amount,0);const kept=[];
  for(const part of state.flex){
    if(removing<=1e-9||part.priority<priority){kept.push(part);continue}
    const take=Math.min(part.amount,removing);if(part.amount>take)kept.push({...part,amount:part.amount-take});removing-=take;
  }
  for(const [element,amount] of Object.entries(allocations))if(amount>1e-9)kept.push({element,amount,priority});
  state.flex=kept;state.transformations.push(`${label}:${Object.entries(allocations).map(([element,amount])=>`${element}${Math.round(amount*100)/100}`).join('+')}`);
}
function lockFlexibleAmount(state,amount,priority){
  let remaining=amount;const additions=[];
  for(const part of state.flex){if(remaining<=1e-9||part.priority<priority)continue;const take=Math.min(part.amount,remaining);if(take<part.amount){part.amount-=take;additions.push({...part,amount:take,priority})}else part.priority=priority;remaining-=take}
  state.flex.push(...additions);
}
function applyTransformationDemands(states,demands,budgets,priority,label){
  const usable=demands.filter(demand=>demand.amount>0&&(demand.consumeSource===false||budgets[demand.source]>0)&&eligibleFlexibleAmount(states[demand.target],priority)>0);
  const bySource=new Map();for(const demand of usable){if(!bySource.has(demand.source))bySource.set(demand.source,[]);bySource.get(demand.source).push(demand)}
  for(const [source,items] of bySource){let remaining=budgets[source];items.sort((a,b)=>(a.targetOrder??a.priority??priority)-(b.targetOrder??b.priority??priority)||a.target-b.target);for(const item of items){item.provisional=item.consumeSource===false?item.amount:Math.min(item.amount,remaining);if(item.consumeSource!==false)remaining-=item.provisional}}
  const byTarget=new Map();for(const demand of usable)if(demand.provisional>0){if(!byTarget.has(demand.target))byTarget.set(demand.target,[]);byTarget.get(demand.target).push(demand)}
  for(const [target,items] of byTarget){const state=states[target],capacity=eligibleFlexibleAmount(state,priority),sourceTier=source=>source<4?0:source===4?1:2,tierGroups=new Map();
    for(const item of items){const tier=item.equalSourceTier?0:sourceTier(item.source);if(!tierGroups.has(tier))tierGroups.set(tier,[]);tierGroups.get(tier).push(item)}
    let remainingCapacity=capacity;
    for(const tierItems of [...tierGroups.entries()].sort((a,b)=>a[0]-b[0]).map(entry=>entry[1])){const requested=tierItems.reduce((sum,item)=>sum+item.provisional,0),scale=requested>remainingCapacity?remainingCapacity/requested:1,effectGroups=new Map();for(const item of tierItems){const key=`${item.dualEarth?'dual':'normal'}:${item.element}`;if(!effectGroups.has(key))effectGroups.set(key,[]);effectGroups.get(key).push(item)}for(const group of effectGroups.values()){let allowance=group.reduce((sum,item)=>sum+item.provisional,0)*scale;for(const item of group){item.actual=Math.min(item.provisional,allowance);allowance-=item.actual}}remainingCapacity=Math.max(0,remainingCapacity-tierItems.reduce((sum,item)=>sum+(item.actual||0),0))}
    const normal={},dual={};for(const item of items){if(item.consumeSource!==false)budgets[item.source]=Math.max(0,budgets[item.source]-item.actual);const bucket=item.dualEarth?dual:normal;bucket[item.element]=(bucket[item.element]||0)+item.actual;if(item.sourceOverlay)overlayAtLeast(states[item.source],item.sourceOverlay,item.actual,label)}
    const normalTotal=Object.values(normal).reduce((sum,amount)=>sum+amount,0);if(normalTotal>0)replaceFlexibleBatch(state,normal,priority,label);
    const dualTotal=Object.values(dual).reduce((sum,amount)=>sum+amount,0);if(dualTotal>0){const earthBefore=branchStateScores(state).earth;lockFlexibleAmount(state,dualTotal,priority);for(const [element,amount] of Object.entries(dual))overlayAtLeast(state,element,amount,label);const earthShortage=Math.max(0,dualTotal-earthBefore);if(earthShortage>0){state.overlays.earth=(state.overlays.earth||0)+earthShortage;state.transformations.push(`${label}:earth${earthShortage}`)}}
  }
  return usable.filter(demand=>demand.actual>0);
}
function findFormation(states,chars,excluded=new Set()){
  const used=new Set(),indices=[];
  for(const char of chars){const index=states.findIndex((state,i)=>state.char===char&&!used.has(i)&&!excluded.has(i));if(index<0)return null;used.add(index);indices.push(index)}
  return indices;
}
function applyFormation(states,entries,priority,label,condition=()=>true,amount=Infinity,excluded=new Set()){
  for(const [element,chars] of entries){const indices=findFormation(states,chars,excluded);if(!indices||!condition(element,chars,indices))continue;
    const resolvedLabel=typeof label==='function'?label(element):label;
    const changedByIndex={};
    for(const index of indices){changedByIndex[index]=assignFlexible(states[index],element,amount,priority,resolvedLabel);if(Number.isFinite(amount))for(const part of states[index].flex)part.priority=Math.min(part.priority,priority);states[index].transformations.push(resolvedLabel);addStateStamp(states[index],resolvedLabel);addStateRelation(states[index],{type:'formation',label:resolvedLabel,element})}
    return{element,chars,indices,label:resolvedLabel,priority,changedByIndex};
  }
  return null;
}
function sumStateScores(states,stemScores=EMPTY_SCORES()){
  const total={...stemScores};for(const state of states){const scores=branchStateScores(state);for(const element of FIVE_ELEMENTS)total[element]+=scores[element]}
  return total;
}
function nativeTransformElement(char){if(['亥','子','丑'].includes(char))return'water';if(['寅','卯','辰'].includes(char))return'wood';if(['巳','午','未'].includes(char))return'fire';return'metal'}
function initialTransformCapacity(state){return branchStateScores(state)[nativeTransformElement(state.char)]||0}
function adjacentPairs(states){const pairs=[];for(let i=0;i<states.length-1;i++)pairs.push([i,i+1]);return pairs}
function relationFactor(a,b){return[1,.5,.25][Math.min(2,Math.max(0,Math.abs(a-b)-1))]}
function applyNatalBranchTransformations(states,stemScores,monthBranch,stemElements,options={}){
  const notes=[],pairs=options.adjacentPairs||adjacentPairs(states),distance=options.relationFactor||relationFactor;
  const pseudoStemElements=options.pseudoStemElements||stemElements;
  const pseudoConditionLimit=options.pseudoConditionStateLimit??states.length;
  const completes=[],collectFormations=(entries,priority,label,condition,amount)=>{
    for(const entry of entries){
      const claimedWithinFormation=new Set();let complete;
      while((complete=applyFormation(states,[entry],priority,label,condition,amount,claimedWithinFormation))){
        completes.push(complete);
        for(const index of complete.indices)claimedWithinFormation.add(index);
      }
    }
  };
  collectFormations(FORMATIONS.bojin,1,'亡神',()=>true,1);
  collectFormations(FORMATIONS.direction,2,element=>({water:'北方合',wood:'東方合',fire:'南方合',metal:'西方合'})[element],()=>true,Infinity);
  collectFormations(FORMATIONS.meeting,3,element=>`三合${{wood:'木',fire:'火',earth:'土',metal:'金',water:'水'}[element]}局`,()=>true,1);
  collectFormations(FORMATIONS.pseudo,4,element=>`疑似${{wood:'木',fire:'火',earth:'土',metal:'金',water:'水'}[element]}局`,(element,chars,indices)=>pseudoStemElements.includes(element)||indices.some(index=>index<pseudoConditionLimit&&states[index].char===chars[1]&&states[index].role==='major'),1);
  let formationBudgets=null;
  if(completes.length){
    for(const complete of completes)if(complete.label==='三合火局'){
      const dogIndex=states.findIndex(state=>state.char==='戌'),horseIndex=states.findIndex(state=>state.char==='午');
      if(dogIndex>=0&&horseIndex>=0){const dog=states[dogIndex],fire=branchStateScores(dog).fire,earth=branchStateScores(dog).earth,amount=Math.max(0,fire-earth);if(amount>0){dog.overlays.earth=(dog.overlays.earth||0)+amount;dog.transformations.push(`半会:earth${amount}`);addStateRelation(states[horseIndex],{type:'influence',direction:'out',label:'半会',partner:dogIndex,element:'fire',amount,dualEarth:true});addStateRelation(dog,{type:'influence',direction:'in',label:'半会',partner:horseIndex,element:'fire',amount,dualEarth:true})}}
    }
    formationBudgets=states.map(initialTransformCapacity);
    for(const complete of completes){
      const centerByElement={water:'子',wood:'卯',fire:'午',metal:'酉'},source=complete.indices.find(index=>states[index].char===centerByElement[complete.element]);
      if(source!==undefined){
        if(complete.label==='亡神'||complete.label.startsWith('三合')){const changed=Object.values(complete.changedByIndex).reduce((sum,amount)=>sum+amount,0);if(changed>0)formationBudgets[source]=Math.max(0,formationBudgets[source]-Math.min(1,formationBudgets[source]));}
        else if(['北方合','東方合','南方合','西方合'].includes(complete.label)){const changed=complete.indices.reduce((sum,index)=>sum+states[index].transformations.reduce((partSum,item)=>{const match=item.match(new RegExp(`^${complete.label}:${complete.element}([\\d.]+)$`));return partSum+(match?Number(match[1]):0)},0),0);formationBudgets[source]=Math.max(0,formationBudgets[source]-Math.min(changed,formationBudgets[source]))}
      }
      if(complete.label.startsWith('疑似')){const changed=Object.values(complete.changedByIndex).reduce((sum,amount)=>sum+amount,0),pseudoCenter=complete.indices[1];if(changed>0)formationBudgets[pseudoCenter]=Math.max(0,formationBudgets[pseudoCenter]-Math.min(1,formationBudgets[pseudoCenter]))}
      notes.push(`${complete.label}(${complete.chars.join('・')})→${complete.element}`);
    }
  }

  const blockedPairs=new Set(),pairId=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`,cold=['亥','子','丑'].includes(monthBranch),hot=['巳','午','未'].includes(monthBranch),budgets=formationBudgets||states.map(initialTransformCapacity),supportDemands=[];
  for(const [a,b] of pairs){
    const first=states[a],second=states[b],key=PAIR_KEY(first.char,second.char);
    if(!['丑子','亥寅','卯戌','辰酉','巳申','午未'].includes(key))continue;
    blockedPairs.add(pairId(a,b));notes.push(`支合(${first.char}・${second.char})`);
    const relationElement=BRANCH_RELATION_ELEMENTS[key]||null;
    addStateStamp(first,'支合');addStateStamp(second,'支合');addStateRelation(first,{type:'pair',label:'支合',partner:b,element:relationElement});addStateRelation(second,{type:'pair',label:'支合',partner:a,element:relationElement});
    const indexOf=char=>first.char===char?a:b,branchTotals=sumStateScores(states);
    if(key==='丑子')supportDemands.push({source:indexOf('子'),target:indexOf('丑'),element:'water',amount:states[indexOf('子')].capacity});
    if(key==='亥寅'&&!cold&&branchTotals.wood>=4&&branchTotals.water<=1)supportDemands.push({source:indexOf('寅'),target:indexOf('亥'),element:'wood',amount:1});
    if(key==='辰酉')supportDemands.push({source:indexOf('酉'),target:indexOf('辰'),element:'metal',amount:states[indexOf('酉')].capacity});
    if(key==='巳申'&&!hot&&branchTotals.metal>=4&&branchTotals.fire<=1)supportDemands.push({source:indexOf('申'),target:indexOf('巳'),element:'metal',amount:1});
    if(key==='午未')supportDemands.push({source:indexOf('午'),target:indexOf('未'),element:'fire',amount:1,dualEarth:true});
  }
  applyTransformationDemands(states,supportDemands,budgets,5,'支合');

  const clashes=new Set(['午子','丑未','寅申','卯酉','戌辰','亥巳']),clashElement={子:'water',午:'fire',寅:'wood',申:'metal',卯:'wood',酉:'metal',巳:'fire',亥:'water'};
  for(const [a,b] of pairs){
    const first=states[a],second=states[b],key=PAIR_KEY(first.char,second.char);if(!clashes.has(key)||blockedPairs.has(pairId(a,b)))continue;
    notes.push(`冲(${first.char}・${second.char})`);
    addStateStamp(first,'冲');addStateStamp(second,'冲');addStateRelation(first,{type:'pair',label:'冲',partner:b});addStateRelation(second,{type:'pair',label:'冲',partner:a});
    if(key==='丑未'||key==='戌辰')continue;const totals=sumStateScores(states,stemScores);
    const firstElement=clashElement[first.char],secondElement=clashElement[second.char],firstPower=totals[firstElement]||0,secondPower=totals[secondElement]||0;
    if(firstPower>=5&&secondPower<=1){second.canceled=true;budgets[b]=0;second.transformations.push('冲・抜根')}
    else if(secondPower>=5&&firstPower<=1){first.canceled=true;budgets[a]=0;first.transformations.push('冲・抜根')}
  }

  function collectHalf(entries,priority,label,requiresCenter=false){
    const demands=[];
    for(const [element,chars] of entries){
      const sourceIndices=states.map((state,index)=>(requiresCenter?state.char===chars[1]:chars.includes(state.char))?index:-1).filter(index=>index>=0);
      const targetIndices=states.map((state,index)=>chars.includes(state.char)?index:-1).filter(index=>index>=0);
      for(const source of sourceIndices)for(const target of targetIndices){
        if(source===target||states[source].char===states[target].char||blockedPairs.has(pairId(source,target))||eligibleFlexibleAmount(states[target],priority)<=0)continue;
        const nonConsuming=label==='半方合'&&NON_CONSUMING_HALF_DIRECTION_PAIRS.has(PAIR_KEY(states[source].char,states[target].char));
        demands.push({source,target,element,amount:distance(source,target),priority,label,equalSourceTier:true,consumeSource:nonConsuming?false:undefined,dualEarth:element==='fire'&&['未','戌'].includes(states[target].char)});
      }
    }
    return demands;
  }
  const directionDemands=collectHalf(FORMATIONS.direction,7,'半方合'),meetingDemands=collectHalf(FORMATIONS.meeting,7,'半会',true);
  const appliedHalf=applyTransformationDemands(states,[...directionDemands,...meetingDemands],budgets,7,'半方合・半会');
  for(const demand of appliedHalf){const nonConsuming=demand.consumeSource===false;notes.push(`${demand.label}(${states[demand.source].char}→${states[demand.target].char})`);addStateRelation(states[demand.source],{type:'influence',direction:'out',label:demand.label,partner:demand.target,element:demand.element,amount:demand.actual,dualEarth:demand.dualEarth,nonConsuming});addStateRelation(states[demand.target],{type:'influence',direction:'in',label:demand.label,partner:demand.source,element:demand.element,amount:demand.actual,dualEarth:demand.dualEarth,nonConsuming})}

  const soilTargetOrder=index=>[3,1,0,2,4,5][index]??index;
  const soilDemands=[];
  for(const [a,b] of pairs){
    if(blockedPairs.has(pairId(a,b)))continue;const first=states[a],second=states[b],key=PAIR_KEY(first.char,second.char),byChar=char=>first.char===char?first:second;
    if((['巳','午'].includes(first.char)&&['丑','辰'].includes(second.char))||(['巳','午'].includes(second.char)&&['丑','辰'].includes(first.char))){
      const source=['巳','午'].includes(first.char)?a:b,target=source===a?b:a;soilDemands.push({source,target,element:'earth',amount:1,sourceOverlay:'earth',targetOrder:soilTargetOrder(target)});
    }else if((first.char==='未'&&['丑','辰','戌'].includes(second.char))||(second.char==='未'&&['丑','辰','戌'].includes(first.char))){
      const source=first.char==='未'?a:b,target=source===a?b:a;if(states[source].role==='major')soilDemands.push({source,target,element:'earth',amount:1,targetOrder:soilTargetOrder(target)});
    }
    else if(key==='巳戌'){const source=first.char==='巳'?a:b,target=first.char==='戌'?a:b;soilDemands.push({source,target,element:'earth',amount:1,targetOrder:soilTargetOrder(target)});}
  }
  const appliedSoil=applyTransformationDemands(states,soilDemands,budgets,9,'土化');
  for(const demand of appliedSoil){notes.push(`土化(${states[demand.source].char}→${states[demand.target].char})`);addStateRelation(states[demand.source],{type:'influence',direction:'out',label:'土化',partner:demand.target,element:'earth',amount:demand.actual});addStateRelation(states[demand.target],{type:'influence',direction:'in',label:'土化',partner:demand.source,element:'earth',amount:demand.actual})}
  states.forEach((state,index)=>state.remainingTransformCapacity=budgets[index]);
  return notes;
}
function applyFireEarthRoot(states,hasEarthStem){
  if(!hasEarthStem)return;for(const state of states){const transformedToFire=state.transformations.some(item=>item.includes(':fire'));if(!['巳','午'].includes(state.char)&&!transformedToFire)continue;const scores=branchStateScores(state),amount=Math.max(0,scores.fire-scores.earth);if(amount<=0)continue;state.overlays.earth=(state.overlays.earth||0)+amount;state.transformations.push(`火土同根:earth${amount}`);if(!state.relations.some(relation=>relation.type==='root'))addStateRelation(state,{type:'root',label:'火土同根',element:'earth',amount:scores.fire})}
}
const STEM_COMBINATIONS={
  己甲:{target:'earth',low:['metal','water','wood'],dayForbidden:['wood','water']},
  丙辛:{target:'water',low:['wood','fire','earth'],dayForbidden:['earth','fire']},
  戊癸:{target:'fire',low:['earth','metal','water'],dayForbidden:['water','metal']},
  乙庚:{target:'metal',low:['water','wood','fire'],dayForbidden:['fire','wood']},
  丁壬:{target:'wood',low:['fire','earth','metal'],dayForbidden:['metal','earth']},
};
const BRANCH_RELATION_ELEMENTS={丑子:'water',亥寅:'wood',卯戌:'fire',辰酉:'metal',巳申:'metal',午未:'fire'};
const HIDDEN_STEM_GROUPS={子:[['壬','癸']],丑:[['癸'],['辛'],['己']],寅:[['戊'],['丙'],['甲']],卯:[['甲','乙']],辰:[['乙'],['癸'],['戊']],巳:[['戊'],['庚'],['丙']],午:[['丙','丁'],['己']],未:[['丁'],['乙'],['己']],申:[['壬'],['庚']],酉:[['庚','辛']],戌:[['辛'],['丁'],['戊']],亥:[['甲'],['壬']]};
function resolveStemTransformations(values,states,options={}){
  const original=values.map(value=>value?ELEMENT_BY_CHAR[value[0]]:null),elements=[...original],branchTotals=sumStateScores(states),candidates=[],stamps=values.map(()=>[]),stampElements=values.map(()=>({}));
  const pairs=options.adjacentPairs||adjacentPairs(values);
  for(const [index,next] of pairs){if(!values[index]||!values[next])continue;const rule=STEM_COMBINATIONS[PAIR_KEY(values[index][0],values[next][0])];if(rule)candidates.push({index,next,rule})}
  const tier=index=>index<4?0:index===4?1:2,balancedPairs=[],pairedReserved=new Set(),byCombination=new Map();
  for(const pair of candidates){const key=PAIR_KEY(values[pair.index][0],values[pair.next][0]);if(!byCombination.has(key))byCombination.set(key,[]);byCombination.get(key).push(pair)}
  for(const group of byCombination.values()){
    const sides=new Map();for(const pair of group)for(const index of [pair.index,pair.next]){const stem=values[index][0];if(!sides.has(stem))sides.set(stem,new Set());sides.get(stem).add(index)}
    const sideValues=[...sides.values()];if(sideValues.length!==2||sideValues[0].size<2||sideValues[0].size!==sideValues[1].size)continue;
    const sorted=[...group].sort((a,b)=>{const ar=[Math.max(tier(a.index),tier(a.next)),tier(a.index)+tier(a.next),Math.abs(a.index-a.next)===1?0:1,Math.min(a.index,a.next)],br=[Math.max(tier(b.index),tier(b.next)),tier(b.index)+tier(b.next),Math.abs(b.index-b.next)===1?0:1,Math.min(b.index,b.next)];for(let i=0;i<ar.length;i++)if(ar[i]!==br[i])return ar[i]-br[i];return 0}),matched=[],used=new Set();
    for(const pair of sorted)if(!used.has(pair.index)&&!used.has(pair.next)){matched.push(pair);used.add(pair.index);used.add(pair.next)}
    if(matched.length===sideValues[0].size){balancedPairs.push(...matched);for(const index of used)pairedReserved.add(index)}
  }
  const reserved=new Set(pairedReserved),togoGroups=[];
  while(true){
    const choices=[];
    for(let center=0;center<values.length;center++){
      if(reserved.has(center)||!values[center])continue;
      const neighbors=candidates.map(pair=>pair.index===center?{index:pair.next,rule:pair.rule}:pair.next===center?{index:pair.index,rule:pair.rule}:null).filter(Boolean).filter(item=>!reserved.has(item.index));
      const byStem=new Map();for(const item of neighbors){const stem=values[item.index][0];if(!byStem.has(stem))byStem.set(stem,[]);byStem.get(stem).push(item)}
      for(const group of byStem.values())if(group.length>=2){const sorted=[...group].sort((a,b)=>tier(a.index)-tier(b.index)||a.index-b.index),selected=sorted.slice(0,2),neighborTiers=selected.map(item=>tier(item.index)).sort((a,b)=>a-b);choices.push({center,neighbors:selected,rule:selected[0].rule,score:[tier(center),neighborTiers[1],neighborTiers[0],center]})}
    }
    if(!choices.length)break;choices.sort((a,b)=>{for(let index=0;index<a.score.length;index++)if(a.score[index]!==b.score[index])return a.score[index]-b.score[index];return 0});
    const chosen=choices[0],indices=[chosen.neighbors[0].index,chosen.center,chosen.neighbors[1].index];indices.forEach(index=>reserved.add(index));togoGroups.push({...chosen,indices});
  }
  for(const group of togoGroups)for(const index of group.indices){stamps[index].push('妬合');stampElements[index]['妬合']=group.rule.target}
  const remainingCandidates=[...balancedPairs,...candidates.filter(pair=>!reserved.has(pair.index)&&!reserved.has(pair.next))],counts=new Map();
  for(const pair of remainingCandidates){counts.set(pair.index,(counts.get(pair.index)||0)+1);counts.set(pair.next,(counts.get(pair.next)||0)+1);stamps[pair.index].push('干合');stamps[pair.next].push('干合');stampElements[pair.index]['干合']=pair.rule.target;stampElements[pair.next]['干合']=pair.rule.target}
  const notes=[];
  for(const group of togoGroups)notes.push(`妬合(${group.indices.map(index=>values[index][0]).join('・')})`);
  for(const pair of remainingCandidates){const {index,next,rule}=pair;if(counts.get(index)>1||counts.get(next)>1)continue;
    const forced=options.forceTransformKeys?.has(PAIR_KEY(values[index][0],values[next][0]));
    if(!forced&&(branchTotals[rule.target]<4||rule.low.some(element=>branchTotals[element]>3)))continue;
    if(!forced&&(index===1||next===1)&&original.some((element,i)=>i!==index&&i!==next&&rule.dayForbidden.includes(element)))continue;
    elements[index]=elements[next]=rule.target;notes.push(`干合(${values[index][0]}・${values[next][0]})→${rule.target}`);
  }
  const scores=EMPTY_SCORES();for(const element of elements)if(element)scores[element]++;
  return{elements,scores,notes,stamps:stamps.map(items=>[...new Set(items)]),stampElements};
}
function applyNearbyStemStamps(values,stemResolution){const dayStem=values[1]?.[0],dayIndex=STEMS.indexOf(dayStem);if(dayIndex%2!==1)return;const neighbors=values.length>4?[0,2,...values.map((_,index)=>index).filter(index=>index>=4)]:[0,2];for(const neighbor of neighbors){const neighborStem=values[neighbor]?.[0],neighborIndex=STEMS.indexOf(neighborStem);if(neighborIndex>=0&&neighborIndex%2===0&&ELEMENT_BY_CHAR[neighborStem]===ELEMENT_BY_CHAR[dayStem]){if(!stemResolution.stamps[1].includes('近貼'))stemResolution.stamps[1].push('近貼');if(!stemResolution.stamps[neighbor].includes('近貼'))stemResolution.stamps[neighbor].push('近貼')}}}
function resolveNatalFiveElements(p){
  const values=[p.hour,p.day,p.month,p.year],states=values.map((value,index)=>makeBranchState(value?.[1],index===2?'major':'minor',index));
  const stemScores=EMPTY_SCORES(),stemElements=[];for(const value of values)if(value){const element=ELEMENT_BY_CHAR[value[0]];stemScores[element]++;stemElements.push(element)}
  const notes=applyNatalBranchTransformations(states,stemScores,p.month?.[1],stemElements),stemResolution=resolveStemTransformations(values,states);notes.push(...stemResolution.notes);applyFireEarthRoot(states,stemResolution.elements.includes('earth'));
  applyNearbyStemStamps(values,stemResolution);
  return{states,stemScores:stemResolution.scores,stemElements:stemResolution.elements,stemStamps:stemResolution.stamps,stemStampElements:stemResolution.stampElements,scores:sumStateScores(states,stemResolution.scores),notes};
}
function sixModeAdjacentPairs(values){
  const pairs=adjacentPairs(values.slice(0,4));
  for(let index=4;index<values.length;index++)for(let other=0;other<values.length;other++)if(index!==other&&!pairs.some(([a,b])=>(a===index&&b===other)||(a===other&&b===index)))pairs.push([Math.min(index,other),Math.max(index,other)]);
  return pairs;
}
function sixModeRelationFactor(a,b){return a>=4||b>=4?1:relationFactor(a,b)}
function resolveSixPillarFiveElements(p,luckValue,annualValue){
  const values=[p.hour,p.day,p.month,p.year,luckValue,annualValue],states=values.map((value,index)=>makeBranchState(value?.[1],[2,4].includes(index)?'major':'minor',index));
  const stemScores=EMPTY_SCORES(),stemElements=[];for(const value of values)if(value){const element=ELEMENT_BY_CHAR[value[0]];stemScores[element]++;stemElements.push(element)}
  const pairs=sixModeAdjacentPairs(values),notes=applyNatalBranchTransformations(states,stemScores,p.month?.[1],stemElements,{adjacentPairs:pairs,relationFactor:sixModeRelationFactor}),stemResolution=resolveStemTransformations(values,states,{adjacentPairs:pairs});notes.push(...stemResolution.notes);applyFireEarthRoot(states,stemResolution.elements.includes('earth'));applyNearbyStemStamps(values,stemResolution);
  return{values,states,stemScores:stemResolution.scores,stemElements:stemResolution.elements,stemStamps:stemResolution.stamps,stemStampElements:stemResolution.stampElements,scores:sumStateScores(states,stemResolution.scores),notes};
}
function cloneBranchState(state,index=state.index){return{...state,index,fixed:{...state.fixed},flex:state.flex.map(part=>({...part})),overlays:{...state.overlays},transformations:[...state.transformations],stamps:[...state.stamps],relations:state.relations.map(relation=>({...relation}))}}
function resolveDownstreamBranch(contextStates,contextValues,value,role,monthBranch){
  const states=contextStates.map((state,index)=>{const clone=cloneBranchState(state,index);clone.flex.forEach(part=>part.priority=0);return clone});
  const targetIndex=states.length,target=makeBranchState(value[1],role,targetIndex);states.push(target);
  const values=[...contextValues,value],stemScores=EMPTY_SCORES(),stemElements=[];
  for(const item of values)if(item){const element=ELEMENT_BY_CHAR[item[0]];stemScores[element]++;stemElements.push(element)}
  const pseudoStemElements=(role==='minor'?[...contextValues.slice(0,4),value]:values).filter(Boolean).map(item=>ELEMENT_BY_CHAR[item[0]]);
  const pairs=Array.from({length:targetIndex},(_,index)=>[index,targetIndex]);
  applyNatalBranchTransformations(states,stemScores,monthBranch,stemElements,{adjacentPairs:pairs,relationFactor:(a,b)=>a===targetIndex||b===targetIndex?1:relationFactor(a,b),pseudoConditionStateLimit:targetIndex+(role==='major'?1:0),pseudoStemElements});
  applyFireEarthRoot(states,stemElements.includes('earth'));
  return cloneBranchState(states[targetIndex],targetIndex);
}
function resolveDownstreamPillar(contextStates,contextValues,value,role,monthBranch){
  const branchState=resolveDownstreamBranch(contextStates,contextValues,value,role,monthBranch),values=[...contextValues,value],targetIndex=values.length-1;
  const states=contextStates.map((state,index)=>cloneBranchState(state,index));states.push(cloneBranchState(branchState,targetIndex));
  const pairs=sixModeAdjacentPairs(values),stemResolution=resolveStemTransformations(values,states,{adjacentPairs:pairs});
  applyNearbyStemStamps(values,stemResolution);applyFireEarthRoot([branchState],stemResolution.elements.includes('earth'));
  return{value,state:branchState,stemElement:stemResolution.elements[targetIndex],stemStamps:stemResolution.stamps[targetIndex],stemStampElements:stemResolution.stampElements[targetIndex],notes:stemResolution.notes};
}
function downstreamPillarColumn(resolution){return elementColumnsModel([resolution.value],{branchProfiles:[resolution.state],stemElements:[resolution.stemElement],stemStamps:[resolution.stemStamps],stemStampElements:[resolution.stemStampElements],connectHorizontal:false})[0]}
function elementColumnsModel(values,options={}){
  const ownEarthStem=values.some(value=>value&&ELEMENT_BY_CHAR[value[0]]==='earth');
  const hasEarthStem=options.hasEarthStem??ownEarthStem,connectHorizontal=options.connectHorizontal??true,horizontalBreaks=options.horizontalBreaks||new Set();
  const model=values.map((value,col)=>({value,cells:(value||['？','？']).map((char,row)=>{
    const profile=row===1?options.branchProfiles?.[col]:null,profileScores=profile?branchStateScores(profile):null;
    const positive=profileScores?FIVE_ELEMENTS.filter(element=>profileScores[element]>0):[],fireEarthRoot=profile?profileScores.fire>0&&profileScores.earth>0:row===1&&ELEMENT_BY_CHAR[char]==='fire'&&hasEarthStem;
    const dragonMetal=profile&&char==='辰'?profile.transformations.reduce((sum,item)=>{const match=item.match(/^支合:.*metal([\d.]+)/);return sum+(match?Number(match[1]):0)},0):0;
    const specialHiddenStems=dragonMetal>0?[{text:'金',element:'metal',amount:dragonMetal}]:[];
    const dominant=profile?positive.sort((a,b)=>profileScores[b]-profileScores[a]||FIVE_ELEMENTS.indexOf(a)-FIVE_ELEMENTS.indexOf(b))[0]:null;
    const element=profile?(fireEarthRoot?'fire':dominant||null):(row===0&&options.stemElements?.[col])||ELEMENT_BY_CHAR[char]||null;
    const nativeElement=ELEMENT_BY_CHAR[char]||null,stemIndex=STEMS.indexOf(char),transformedChar=row===0&&stemIndex>=0&&element&&element!==nativeElement?STEMS_BY_ELEMENT[element][stemIndex%2]:null;
    const groupElement=fireEarthRoot?'earth':element,innerElement=profile?positive.find(candidate=>candidate!==groupElement)||null:null;
    const extraElement=fireEarthRoot
      ?positive.find(candidate=>candidate!==groupElement&&candidate!=='fire')||null
      :positive.find(candidate=>candidate!==groupElement&&candidate!==innerElement)||null;
    const stamps=row===0?(options.stemStamps?.[col]||[]):(profile?.stamps||[]),stampElements=row===0?(options.stemStampElements?.[col]||{}):Object.fromEntries((profile?.relations||[]).filter(relation=>relation.element).map(relation=>[relation.label,relation.element]));
    return{char,element,transformedChar,elementScores:profileScores,specialHiddenStems,stamps,stampElements,inactive:Boolean(profile&&char!=='？'&&!positive.length),groupElement,innerElement,extraElement,fireEarthRoot,row,col,connections:[],grouped:false,groupId:null,fireGroupId:null,rectMember:false,rectStart:false,rectWidth:1,rectHeight:1};
  })}));
  const grid=[model.map(column=>column.cells[0]),model.map(column=>column.cells[1])];
  const seen=new Set();let groupCounter=0;
  for(let row=0;row<2;row++)for(let col=0;col<model.length;col++){
    const start=grid[row][col],key=`${row}:${col}`;
    if(!start.groupElement||seen.has(key))continue;
    const component=[],queue=[start];seen.add(key);
    while(queue.length){
      const cell=queue.shift();component.push(cell);
      for(const [dr,dc,name,opposite] of [[-1,0,'up','down'],[1,0,'down','up'],[0,-1,'left','right'],[0,1,'right','left']]){
        const nr=cell.row+dr,nc=cell.col+dc;
        if(dc&&(!connectHorizontal||horizontalBreaks.has(Math.min(cell.col,nc))))continue;
        if(nr<0||nr>1||nc<0||nc>=model.length)continue;
        const next=grid[nr][nc];
        if(next.groupElement!==cell.groupElement)continue;
        if(!cell.connections.includes(name))cell.connections.push(name);
        if(!next.connections.includes(opposite))next.connections.push(opposite);
        const nextKey=`${nr}:${nc}`;
        if(!seen.has(nextKey)){seen.add(nextKey);queue.push(next)}
      }
    }
    if(component.length<2)continue;
    const groupId=`${start.groupElement}-${groupCounter++}`;
    component.forEach(cell=>{cell.grouped=true;cell.groupId=groupId});
    const rows=component.map(cell=>cell.row),cols=component.map(cell=>cell.col);
    const minRow=Math.min(...rows),maxRow=Math.max(...rows),minCol=Math.min(...cols),maxCol=Math.max(...cols);
    const width=maxCol-minCol+1,height=maxRow-minRow+1;
    if(component.length===width*height){
      component.forEach(cell=>cell.rectMember=true);
      const topLeft=grid[minRow][minCol];
      topLeft.rectStart=true;topLeft.rectWidth=width;topLeft.rectHeight=height;
    }
  }
  const fireSeen=new Set();let fireGroupCounter=0;
  for(let row=0;row<2;row++)for(let col=0;col<model.length;col++){
    const start=grid[row][col],key=`${row}:${col}`;
    if(!start.fireEarthRoot||fireSeen.has(key))continue;
    const component=[],queue=[start];fireSeen.add(key);
    while(queue.length){
      const cell=queue.shift();component.push(cell);
      for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const nr=cell.row+dr,nc=cell.col+dc;if(dc&&(!connectHorizontal||horizontalBreaks.has(Math.min(cell.col,nc))))continue;
        if(nr<0||nr>1||nc<0||nc>=model.length)continue;const next=grid[nr][nc],nextKey=`${nr}:${nc}`;
        if(!next.fireEarthRoot||fireSeen.has(nextKey))continue;fireSeen.add(nextKey);queue.push(next);
      }
    }
    if(component.length>1){const fireGroupId=`fire-inner-${fireGroupCounter++}`;component.forEach(cell=>cell.fireGroupId=fireGroupId)}
  }
  return model;
}
function pillarModelFromResolution(values,labels,resolution,options={}){
  const model=elementColumnsModel(values,{branchProfiles:resolution.states,stemElements:resolution.stemElements,stemStamps:resolution.stemStamps,stemStampElements:resolution.stemStampElements,horizontalBreaks:options.horizontalBreaks}).map((column,index)=>({...column,label:labels[index]}));
  for(const column of model)for(const cell of column.cells)cell.bridgeStamps=[];
  for(let col=0;col<model.length-1;col++)for(const row of [0,1]){
    const left=model[col].cells[row],right=model[col+1].cells[row],pairLabels=row===0?['妬合','干合']:['支合','冲'];
    for(const label of pairLabels)if(left.stamps.includes(label)&&right.stamps.includes(label)){
      const combination=['干合','妬合'].includes(label)?STEM_COMBINATIONS[PAIR_KEY(left.char,right.char)]:null,branchElement=label==='支合'?BRANCH_RELATION_ELEMENTS[PAIR_KEY(left.char,right.char)]:null,clash=label==='冲'&&['午子','丑未','寅申','卯酉','戌辰','亥巳'].includes(PAIR_KEY(left.char,right.char));
      if((['干合','妬合'].includes(label)&&!combination)||(label==='支合'&&!branchElement)||(label==='冲'&&!clash))continue;
      left.stamps=left.stamps.filter(item=>item!==label);right.stamps=right.stamps.filter(item=>item!==label);
      const element=combination?.target||branchElement||left.stampElements?.[label]||right.stampElements?.[label]||(left.groupElement===right.groupElement?left.groupElement:left.element||right.element||null);
      left.bridgeStamps.push({label,element});
    }
  }
  return model;
}
function originalPillarModel(p){const values=[p.hour,p.day,p.month,p.year];return pillarModelFromResolution(values,['時柱','日柱','月柱','年柱'],resolveNatalFiveElements(p))}
function sixPillarModel(p,luckValue,annualValue,resolution=resolveSixPillarFiveElements(p,luckValue,annualValue)){return pillarModelFromResolution([p.hour,p.day,p.month,p.year,luckValue,annualValue],['時柱','日柱','月柱','年柱','大運','年運'],resolution,{horizontalBreaks:new Set([3])})}
function relationStampsMarkup(cell){const position=cell.row===0?'stem-stamps':'branch-stamps',own=cell.stamps?.length?`<span class="relation-stamps ${position}">${cell.stamps.map(label=>`<i class="relation-stamp stamp-${label==='冲'?'clash':cell.stampElements?.[label]||cell.element||cell.groupElement||'neutral'}">${label}</i>`).join('')}</span>`:'',bridges=cell.bridgeStamps?.length?`<span class="relation-stamps bridge-stamps ${position}">${cell.bridgeStamps.map(stamp=>`<i class="relation-stamp stamp-${stamp.label==='冲'?'clash':stamp.element||'neutral'}">${stamp.label}</i>`).join('')}</span>`:'';return own+bridges}
function originalCellClasses(cell){const classes=['kanji'];if(cell.element)classes.push(`element-${cell.element}`);if(cell.inactive)classes.push('element-inactive');if(cell.groupElement)classes.push(`group-${cell.groupElement}`);if(cell.innerElement)classes.push('has-inner-element',`inner-${cell.innerElement}`);if(cell.extraElement)classes.push('has-extra-element',`extra-${cell.extraElement}`);if(cell.fireEarthRoot)classes.push('fire-earth-root');if(cell.fireGroupId)classes.push('fire-inner-grouped');if(cell.grouped)classes.push('element-grouped');if(cell.rectMember)classes.push('group-rect-member');if(cell.rectStart)classes.push('group-rect-start',`group-w-${cell.rectWidth}`,`group-h-${cell.rectHeight}`);if(!cell.rectMember)for(const direction of cell.connections)classes.push(`connect-${direction}`);return classes.join(' ')}
function originalCellAttributes(cell){const position=` data-row="${cell.row}" data-col="${cell.col}"`,primary=cell.groupId?` data-group-id="${cell.groupId}" data-group-element="${cell.groupElement}"`:'' ,fire=cell.fireGroupId?` data-fire-group-id="${cell.fireGroupId}"`:'';return primary||fire?`${primary}${fire}${position}`:''}
function hiddenStemModel(cell){
  const groups=HIDDEN_STEM_GROUPS[cell?.char]||[],scores=cell?.elementScores||EMPTY_SCORES(),specials=cell?.specialHiddenStems||[],specialElements=new Set(specials.map(item=>item.element)),entries=groups.map((chars,index)=>({chars:[...chars],text:chars.join(''),index,nativeElement:ELEMENT_BY_CHAR[chars.at(-1)],selectedElement:null,amount:0})),active=FIVE_ELEMENTS.filter(element=>(scores[element]||0)>1e-9&&!specialElements.has(element)),used=new Set();
  for(const element of active){for(let index=entries.length-1;index>=0;index--)if(!used.has(index)&&entries[index].nativeElement===element){entries[index].selectedElement=element;entries[index].amount=scores[element];used.add(index);break}}
  for(const element of active)if(!entries.some(entry=>entry.selectedElement===element)){const entry=entries.find(item=>!used.has(item.index));if(entry){entry.selectedElement=element;entry.amount=scores[element];used.add(entry.index)}}
  for(const special of specials)entries.push({chars:[special.text],text:special.text,index:entries.length,nativeElement:null,selectedElement:special.element,amount:special.amount,special:true});
  return entries;
}
function hiddenStemMarkup(cell){const entries=hiddenStemModel(cell);if(!entries.length)return'';return`<div class="hidden-stems" aria-label="${cell.char}の蔵干"><span class="hidden-stems-list">${entries.map(entry=>`<span class="hidden-stem ${entry.chars.length>1?'hidden-stem-combined':''} ${entry.selectedElement?`is-selected hidden-${entry.selectedElement}`:''}"><b>${entry.text}</b>${entry.selectedElement?`<i>${Math.round(entry.amount*100)/100}</i>`:''}</span>`).join('')}</span></div>`}
function outlinePathForRects(rects){
  if(!rects.length)return'';
  const xs=[...new Set(rects.flatMap(r=>[r.left,r.right]))].sort((a,b)=>a-b);
  const ys=[...new Set(rects.flatMap(r=>[r.top,r.bottom]))].sort((a,b)=>a-b);
  const inside=(x,y)=>rects.some(r=>x>r.left&&x<r.right&&y>r.top&&y<r.bottom);
  const occupied=Array.from({length:ys.length-1},(_,row)=>Array.from({length:xs.length-1},(_,col)=>inside((xs[col]+xs[col+1])/2,(ys[row]+ys[row+1])/2)));
  const edges=[];
  for(let row=0;row<occupied.length;row++)for(let col=0;col<occupied[row].length;col++)if(occupied[row][col]){
    const left=xs[col],right=xs[col+1],top=ys[row],bottom=ys[row+1];
    if(row===0||!occupied[row-1][col])edges.push([[left,top],[right,top]]);
    if(col===occupied[row].length-1||!occupied[row][col+1])edges.push([[right,top],[right,bottom]]);
    if(row===occupied.length-1||!occupied[row+1][col])edges.push([[right,bottom],[left,bottom]]);
    if(col===0||!occupied[row][col-1])edges.push([[left,bottom],[left,top]]);
  }
  const key=point=>point.map(n=>Math.round(n*100)/100).join(',');
  const outgoing=new Map();edges.forEach((edge,index)=>{const start=key(edge[0]);if(!outgoing.has(start))outgoing.set(start,[]);outgoing.get(start).push(index)});
  const unused=new Set(edges.map((_,index)=>index)),paths=[];
  while(unused.size){
    const first=unused.values().next().value,start=edges[first][0],points=[start];let edgeIndex=first;
    while(unused.has(edgeIndex)){
      unused.delete(edgeIndex);const end=edges[edgeIndex][1];points.push(end);
      if(key(end)===key(start))break;
      edgeIndex=(outgoing.get(key(end))||[]).find(index=>unused.has(index));
      if(edgeIndex===undefined)break;
    }
    const corners=points.slice(0,-1).filter((point,index,array)=>{
      const previous=array[mod(index-1,array.length)],next=array[(index+1)%array.length];
      return !((previous[0]===point[0]&&point[0]===next[0])||(previous[1]===point[1]&&point[1]===next[1]));
    });
    const rounded=corners.map((point,index)=>{
      const previous=corners[mod(index-1,corners.length)],next=corners[(index+1)%corners.length];
      const beforeDistance=Math.hypot(previous[0]-point[0],previous[1]-point[1]);
      const afterDistance=Math.hypot(next[0]-point[0],next[1]-point[1]);
      const radius=Math.min(16,beforeDistance/2,afterDistance/2);
      const before=[point[0]+(previous[0]-point[0])*radius/beforeDistance,point[1]+(previous[1]-point[1])*radius/beforeDistance];
      const after=[point[0]+(next[0]-point[0])*radius/afterDistance,point[1]+(next[1]-point[1])*radius/afterDistance];
      return{point,before,after};
    });
    const format=point=>point.map(n=>Math.round(n*100)/100).join(' ');
    paths.push(`M ${format(rounded[0].before)} ${rounded.map(corner=>`Q ${format(corner.point)} ${format(corner.after)} L ${format(rounded[(rounded.indexOf(corner)+1)%rounded.length].before)}`).join(' ')} Z`);
  }
  return paths.join(' ');
}
function connectedOutlineRects(rects){
  const cells=rects.map(rect=>({...rect})),positions=new Map(cells.map(rect=>[`${rect.row}:${rect.col}`,rect])),result=[...cells];
  for(const rect of cells){
    const right=positions.get(`${rect.row}:${rect.col+1}`);
    if(right)result.push({left:rect.right,right:right.left,top:Math.max(rect.top,right.top),bottom:Math.min(rect.bottom,right.bottom)});
    const down=positions.get(`${rect.row+1}:${rect.col}`);
    if(down)result.push({left:Math.max(rect.left,down.left),right:Math.min(rect.right,down.right),top:rect.bottom,bottom:down.top});
    const diagonal=positions.get(`${rect.row+1}:${rect.col+1}`);
    if(right&&down&&diagonal)result.push({left:rect.right,right:right.left,top:rect.bottom,bottom:down.top});
  }
  return result.filter(rect=>rect.right>rect.left&&rect.bottom>rect.top);
}
function drawElementGroupOutlines(target='#pillars'){
  const container=typeof target==='string'?document.querySelector(target):target;if(!container)return;
  container.querySelector('.element-group-overlay')?.remove();
  const cells=[...container.querySelectorAll('.kanji[data-group-id]')];if(!cells.length)return;
  const base=container.getBoundingClientRect(),groups=new Map();
  for(const cell of cells){const id=cell.dataset.groupId;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(cell)}
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.classList.add('element-group-overlay');svg.setAttribute('viewBox',`0 0 ${base.width} ${base.height}`);svg.setAttribute('aria-hidden','true');
  for(const groupCells of groups.values()){
    const rects=connectedOutlineRects(groupCells.map(cell=>{
      const r=cell.getBoundingClientRect(),row=Number(cell.dataset.row),col=Number(cell.dataset.col);
      return{left:r.left-base.left,right:r.right-base.left,top:r.top-base.top,bottom:r.bottom-base.top,row,col};
    }));
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',outlinePathForRects(rects));path.setAttribute('class',`element-group-outline group-${groupCells[0].dataset.groupElement}`);svg.append(path);
  }
  const fireGroups=new Map();for(const cell of container.querySelectorAll('.kanji[data-fire-group-id]')){const id=cell.dataset.fireGroupId;if(!fireGroups.has(id))fireGroups.set(id,[]);fireGroups.get(id).push(cell)}
  for(const groupCells of fireGroups.values()){
    const inset=8,rects=connectedOutlineRects(groupCells.map(cell=>{const r=cell.getBoundingClientRect();return{left:r.left-base.left+inset,right:r.right-base.left-inset,top:r.top-base.top+inset,bottom:r.bottom-base.top-inset,row:Number(cell.dataset.row),col:Number(cell.dataset.col)}}));
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',outlinePathForRects(rects));path.setAttribute('class','element-group-outline group-fire fire-inner-outline');svg.append(path);
  }
  container.append(svg);
}
function redrawAllElementOutlines(){for(const selector of ['#pillars','#luckGrid','#annualGrid','#sixPillars'])drawElementGroupOutlines(selector)}
function containsEarthStem(values){return values.some(value=>value&&ELEMENT_BY_CHAR[value[0]]==='earth')}
function bodyStrengthAnalysis(scores,states,dayMaster,majorIndices=[2]){
  const cycle=['wood','fire','earth','metal','water'],dayIndex=cycle.indexOf(dayMaster),resource=cycle[mod(dayIndex-1,cycle.length)];
  const inji=Math.round(((scores[resource]||0)+(scores[dayMaster]||0))*100)/100,total=Math.round(cycle.reduce((sum,element)=>sum+(scores[element]||0),0)*100)/100,leakWealthOfficer=Math.round((total-inji)*100)/100;
  const rootBranches={wood:new Set(['寅','卯']),fire:new Set(['巳','午']),earth:new Set(['巳','午','未']),metal:new Set(['申','酉']),water:new Set(['亥','子'])}[dayMaster]||new Set();
  const isRooted=state=>Boolean(state?.char&&branchStateScores(state)[dayMaster]>1e-9),rooted=states.some(isRooted),majorRooted=majorIndices.some(index=>rootBranches.has(states[index]?.char)&&isRooted(states[index]));
  const status=!rooted?'身弱':majorRooted&&inji>=leakWealthOfficer*1.2?'身旺':'身中';
  return{inji,leakWealthOfficer,status,rooted,majorRooted,resource};
}
function natalElementScores(p){
  const resolution=resolveNatalFiveElements(p),{scores,notes}=resolution;
  const cycle=['wood','fire','earth','metal','water'],dayMaster=ELEMENT_BY_CHAR[p.day?.[0]]||'wood',start=cycle.indexOf(dayMaster);
  return{scores,notes,details:conditionDetails(resolution.states,['時支','日支','月支','年支']),strength:bodyStrengthAnalysis(scores,resolution.states,dayMaster,[2]),dayMaster,order:[...cycle.slice(start),...cycle.slice(0,start)]};
}
function sixElementScores(p,luckValue,annualValue,resolution=resolveSixPillarFiveElements(p,luckValue,annualValue)){const cycle=['wood','fire','earth','metal','water'],dayMaster=ELEMENT_BY_CHAR[p.day?.[0]]||'wood',start=cycle.indexOf(dayMaster);return{scores:resolution.scores,notes:resolution.notes,details:conditionDetails(resolution.states,['時支','日支','月支','年支','大運支','年運支']),strength:bodyStrengthAnalysis(resolution.scores,resolution.states,dayMaster,[2,4]),dayMaster,order:[...cycle.slice(start),...cycle.slice(0,start)]}}
function formatElementAmount(element,amount){const labels={wood:'木',fire:'火',earth:'土',metal:'金',water:'水'},value=Math.round(amount*100)/100;return`${labels[element]}${value}`}
function conditionDetails(states,roles){return states.map((state,index)=>{const phrases=[];for(const relation of state.relations){const partner=relation.partner===undefined?'':roles[relation.partner];if(relation.type==='formation')phrases.push(relation.label);else if(relation.type==='pair')phrases.push(`${partner}と${relation.label}`);else if(relation.type==='root')phrases.push(`火土同根で${formatElementAmount('earth',relation.amount)}`);else if(relation.type==='influence'&&relation.direction==='out')phrases.push(`${partner}へ${relation.label}`);else if(relation.type==='influence'){const amount=relation.dualEarth?`火土${Math.round(relation.amount*100)/100}`:formatElementAmount(relation.element,relation.amount);phrases.push(`${partner}からの${relation.label}で${amount}`)}}return{role:roles[index]||`第${index+1}支`,phrases:[...new Set(phrases)]}})}
function elementCircleDiameters(scores){
  return Object.fromEntries(Object.entries(scores).map(([element,score])=>[element,score===0?0:Math.min(160,33+score*16)]));
}
function renderElementCircle(target,data,ariaPrefix='五行得点',options={}){
  if(typeof target==='string')target=document.querySelector(target);if(!target)return;
  const {scores,details,dayMaster,order,notes=[],strength}=data,labels={wood:'木',fire:'火',earth:'土',metal:'金',water:'水'},colors={wood:'#7ed957',fire:'#f42e2e',earth:'#ffae5c',metal:'#898888',water:'#38b6ff'};
  const diameters=elementCircleDiameters(scores);
  const cx=200,cy=190,orbit=112;
  const nodes=order.map((element,index)=>{const score=scores[element],angle=(-90+index*72)*Math.PI/180,x=cx+orbit*Math.cos(angle),y=cy+orbit*Math.sin(angle);if(score===0)return'';const radius=diameters[element]/2,fontSize=Math.max(14,Math.min(32,radius*.72));return`<g class="five-element-node"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}" fill="${colors[element]}"/><text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" class="element-name" font-size="${fontSize.toFixed(2)}">${labels[element]}</text></g>`}).join('');
  const scoreList=['wood','fire','earth','metal','water'].map(element=>`<span><i style="--score-color:${colors[element]}"></i>${labels[element]} ${scores[element]}点</span>`).join('');
  const strengthMarkup=strength?`<div class="body-strength"><span>印自 <b>${strength.inji}点</b></span><span>漏財官 <b>${strength.leakWealthOfficer}点</b></span><strong class="strength-${strength.status==='身旺'?'strong':strength.status==='身弱'?'weak':'middle'}">${strength.status}</strong></div>`:'';
  const conditionList=details.map(item=>`<li><strong>${item.role}</strong><span>${item.phrases.length?item.phrases.join('、'):'成立条件なし'}</span></li>`).join('');
  const basisMarkup=`<p class="five-elements-basis-label">五行変化の根拠</p><ul class="five-elements-transformations">${conditionList}</ul>${notes.length?`<p class="five-elements-calculation-log">成立関係：${notes.join(' ／ ')}</p>`:''}`;
  const basisTarget=typeof options.basisTarget==='string'?document.querySelector(options.basisTarget):options.basisTarget;
  if(basisTarget)basisTarget.innerHTML=basisMarkup;
  target.innerHTML=`<svg viewBox="0 0 400 360" role="img" aria-label="${ariaPrefix}。日主は${labels[dayMaster]}。${scoreList.replace(/<[^>]+>/g,' ')}"><circle class="five-elements-orbit" cx="${cx}" cy="${cy}" r="${orbit}"/>${nodes}</svg><button class="five-elements-score-toggle" type="button" aria-expanded="false">点数を表示</button><div class="five-elements-details" hidden><div class="five-elements-scores">${scoreList}</div>${strengthMarkup}${basisTarget?'':basisMarkup}</div>`;
  const button=target.querySelector('.five-elements-score-toggle'),detailsPanel=target.querySelector('.five-elements-details');
  button.onclick=()=>{detailsPanel.hidden=!detailsPanel.hidden;button.setAttribute('aria-expanded',String(!detailsPanel.hidden));button.textContent=detailsPanel.hidden?'点数を表示':'点数を非表示'};
}
function renderFiveElementsCircle(p){renderElementCircle('#fiveElementsChart',natalElementScores(p),'原命式の五行得点',{basisTarget:'#natalTransformationBasis'})}
function extraElementMarkup(cell){return cell.extraElement?`<span class="extra-element-outline extra-${cell.extraElement}" aria-hidden="true"></span>`:''}
function transformedStemMarkup(cell){return cell.transformedChar?`<span class="transformed-stem stamp-${cell.element}" aria-label="${cell.char}から${cell.transformedChar}へ変化">${cell.transformedChar}</span>`:''}
function cycleCellMarkup(cell){return`<span class="${originalCellClasses(cell)}"${originalCellAttributes(cell)}>${cell.char}${transformedStemMarkup(cell)}${extraElementMarkup(cell)}${relationStampsMarkup(cell)}</span>`}
function pillarMarkup(model){return model.map(({label,value,cells})=>`<article class="pillar ${value?'':'unknown-pillar'}"><div class="pillar-label">${label}</div><div class="kanji-box">${cells.map(cell=>`<div class="${originalCellClasses(cell)}"${originalCellAttributes(cell)}>${cell.char}${transformedStemMarkup(cell)}${extraElementMarkup(cell)}${relationStampsMarkup(cell)}</div>`).join('')}</div>${hiddenStemMarkup(cells[1])}</article>`).join('')}
function utcDate(y,m,d,h=0,min=0){const date=new Date(0);date.setUTCFullYear(y,m-1,d);date.setUTCHours(h,min,0,0);return date}
function dateKey(y,m,d){return y*10000+m*100+d}
function validCalendarDate(y,m,d){const date=utcDate(y,m,d);return date.getUTCFullYear()===y&&date.getUTCMonth()+1===m&&date.getUTCDate()===d}
function westernDateFromCalendar(system,year,month,day){
  const era=JAPANESE_ERAS[system],eraYear=Math.trunc(Number(year)),m=Math.trunc(Number(month)),d=Math.trunc(Number(day));
  const y=era?era.start[0]+eraYear-1:eraYear;
  if((era&&eraYear<1)||y<1||y>9999||!validCalendarDate(y,m,d))throw Error('正しい生年月日を入力してください');
  if(era&&(dateKey(y,m,d)<dateKey(...era.start)||dateKey(y,m,d)>dateKey(...era.end)))throw Error(`${era.label}${eraYear}年には存在しない日付です`);
  return{y,m,d};
}
function eraDateFromWestern(system,y,m,d){const era=JAPANESE_ERAS[system];if(!era||dateKey(y,m,d)<dateKey(...era.start)||dateKey(y,m,d)>dateKey(...era.end))return null;return{year:y-era.start[0]+1,month:m,day:d}}
function setSelectRange(select,start,end,value){select.innerHTML='';for(let n=start;n<=end;n++)select.add(new Option(String(n),String(n)));select.value=String(value)}
function readWesternDateControl(){const ds=document.querySelector('#birthDate').value;if(!ds)return null;const [y,m,d]=ds.split('-').map(Number);return validCalendarDate(y,m,d)?{y,m,d}:null}
function updateCalendarInputs(){
  const system=document.querySelector('#calendarSystem').value,dateInput=document.querySelector('#birthDate'),eraInput=document.querySelector('#eraDateInput'),previous=eraInput.dataset.system||'western',help=document.querySelector('#birthDateHelp');
  if(system==='western'){
    if(previous!=='western'){try{const converted=westernDateFromCalendar(previous,document.querySelector('#eraYear').value,document.querySelector('#eraMonth').value,document.querySelector('#eraDay').value);dateInput.value=`${String(converted.y).padStart(4,'0')}-${String(converted.m).padStart(2,'0')}-${String(converted.d).padStart(2,'0')}`}catch{}}
    dateInput.hidden=false;dateInput.disabled=false;dateInput.required=true;eraInput.hidden=true;help.textContent='例：845年は「0845/08/01」';eraInput.dataset.system='western';return;
  }
  const era=JAPANESE_ERAS[system],western=previous==='western'?readWesternDateControl():null,converted=western&&eraDateFromWestern(system,western.y,western.m,western.d),initial=converted||{year:1,month:era.start[1],day:era.start[2]},maxYear=Math.min(99,era.end[0]-era.start[0]+1);
  setSelectRange(document.querySelector('#eraYear'),1,maxYear,initial.year);setSelectRange(document.querySelector('#eraMonth'),1,12,initial.month);setSelectRange(document.querySelector('#eraDay'),1,31,initial.day);
  dateInput.hidden=true;dateInput.disabled=true;dateInput.required=false;eraInput.hidden=false;help.textContent=`${era.label}の年・月・日を選択してください`;eraInput.dataset.system=system;
}
function init(){const tz=document.querySelector('#timezoneLongitude');TZ.forEach(([v,t])=>tz.add(new Option(t,v)));tz.value=-135;const lo=document.querySelector('#localOffset');CITIES.forEach(([v,n])=>lo.add(new Option(`${n} ${v>0?'＋':v<0?'－':'±'}${Math.abs(v)}分`,v)));lo.add(new Option('➡ 数値入力','custom'));lo.value=25;lo.onchange=()=>document.querySelector('#customOffset').hidden=lo.value!=='custom';document.querySelector('#calendarSystem').onchange=updateCalendarInputs;updateCalendarInputs();document.querySelector('#unknownTime').onchange=e=>{document.querySelector('#birthTime').disabled=e.target.checked};document.querySelector('#baziForm').onsubmit=submit;document.querySelector('#editButton').onclick=document.querySelector('#backButton').onclick=showForm;document.querySelector('#hiddenStemsToggle').onclick=document.querySelector('#sixHiddenStemsToggle').onclick=toggleHiddenStems;document.querySelector('#pdfDownloadButton').onclick=printPdfReport;window.addEventListener('resize',()=>requestAnimationFrame(redrawAllElementOutlines));window.addEventListener('beforeprint',()=>redrawPdfOutlines());window.addEventListener('afterprint',()=>{document.body.classList.remove('printing-pdf-report');if(prePrintTitle)document.title=prePrintTitle})}
function jdUTC(date){return date.getTime()/86400000+2440587.5}
function solarLongitude(date){const T=(jdUTC(date)-2451545)/36525;const L0=mod(280.46646+36000.76983*T+.0003032*T*T,360);const M=(357.52911+35999.05029*T-.0001537*T*T)*Math.PI/180;const C=(1.914602-.004817*T-.000014*T*T)*Math.sin(M)+(.019993-.000101*T)*Math.sin(2*M)+.000289*Math.sin(3*M);const omega=(125.04-1934.136*T)*Math.PI/180;return mod(L0+C-.00569-.00478*Math.sin(omega),360)}
function equationOfTime(date){return EQUATION_OF_TIME_TABLE[date.getUTCMonth()]?.[date.getUTCDate()-1]??0}
function japanSummerTimeCorrection(y,m,d,h,min,standardEast=135){
  const period=JAPAN_SUMMER_TIME_PERIODS[y];if(!period||standardEast!==135)return 0;
  const value=utcDate(y,m,d,h,min).getTime(),start=utcDate(y,...period[0]).getTime(),end=utcDate(y,...period[1]).getTime();return value>=start&&value<end?-60:0;
}
function correctedBirthTime(y,m,d,h,min,localOffset,standardEast=135){
  const calendarInstant=utcDate(y,m,d,h,min),summerTimeCorrection=japanSummerTimeCorrection(y,m,d,h,min,standardEast),equationOffset=equationOfTime(calendarInstant),apparentOffset=summerTimeCorrection+localOffset+equationOffset;
  return{calendarInstant,instant:new Date(calendarInstant.getTime()+(summerTimeCorrection-standardEast/15*60)*60000),apparent:new Date(calendarInstant.getTime()+apparentOffset*60000),apparentOffset,localOffset,equationOffset,summerTimeCorrection};
}
function monthSegment(date,hemisphere){let lon=solarLongitude(date);if(hemisphere==='south')lon=mod(lon+180,360);return Math.floor(mod(lon-315,360)/30)}
function findSectionBoundary(date,direction,hemisphere){const step=6*3600000;const original=date.getTime();const segment=monthSegment(date,hemisphere);let near=original,far=original;for(let i=0;i<170;i++){far+=direction*step;if(monthSegment(new Date(far),hemisphere)!==segment)break;near=far}let low=Math.min(near,far),high=Math.max(near,far);for(let i=0;i<42;i++){const mid=(low+high)/2;const same=monthSegment(new Date(mid),hemisphere)===segment;if(direction>0){if(same)low=mid;else high=mid}else{if(same)high=mid;else low=mid}}return new Date((low+high)/2)}
function daysAfterSectionEntry(x){
  const historical=usesHistoricalCalendarBasis(x),basis=historical?(x.calendarInstant||x.instant):x.instant,boundary=findSectionBoundary(basis,-1,x.hemisphere),localBoundary=historical?boundary:new Date(boundary.getTime()+(x.standardEast||0)/15*3600000),birthDay=utcDate(x.y,x.m,x.d).getTime(),sectionDay=utcDate(localBoundary.getUTCFullYear(),localBoundary.getUTCMonth()+1,localBoundary.getUTCDate()).getTime();
  return Math.max(1,Math.min(21,Math.floor((birthDay-sectionDay)/86400000)+1));
}
function monthlyHiddenStemForBranch(branch,days){return(MONTHLY_HIDDEN_STEM_RULES[branch]||[]).find(([limit])=>days<=limit)?.[1]||''}
function tenGod(dayStem,targetStem){
  if(!dayStem||!targetStem)return'';const dayElement=FIVE_ELEMENTS.indexOf(ELEMENT_BY_CHAR[dayStem]),targetElement=FIVE_ELEMENTS.indexOf(ELEMENT_BY_CHAR[targetStem]),samePolarity=STEMS.indexOf(dayStem)%2===STEMS.indexOf(targetStem)%2,relation=mod(targetElement-dayElement,5);
  return[[samePolarity?'比肩':'劫財'],[samePolarity?'食神':'傷官'],[samePolarity?'偏財':'正財'],[samePolarity?'偏官':'正官'],[samePolarity?'偏印':'印綬']][relation][0];
}
function twelveFortune(dayStem,branch){const birth=BRANCHES.indexOf(TWELVE_FORTUNE_BIRTH_BRANCH[dayStem]),target=BRANCHES.indexOf(branch);if(birth<0||target<0)return'';const yang=STEMS.indexOf(dayStem)%2===0,offset=yang?mod(target-birth,12):mod(birth-target,12);return TWELVE_FORTUNE_STAGES[offset]}
function voidBranches(dayPillar){if(!dayPillar)return[];const start=mod(BRANCHES.indexOf(dayPillar[1])-STEMS.indexOf(dayPillar[0]),12);return[BRANCHES[mod(start-2,12)],BRANCHES[mod(start-1,12)]]}
function standardChartContext(x,p){
  const sectionDays=daysAfterSectionEntry(x),dayStem=p.day[0],pillars=[{label:'時柱',value:p.hour},{label:'日柱',value:p.day},{label:'月柱',value:p.month},{label:'年柱',value:p.year}];
  return{sectionDays,voidBranches:voidBranches(p.day),pillars:pillars.map((pillar,index)=>{const value=pillar.value,stem=value?.[0]||'',branch=value?.[1]||'',hidden=branch?monthlyHiddenStemForBranch(branch,sectionDays):'';return{...pillar,stem,branch,hidden,fortune:branch?twelveFortune(dayStem,branch):'',stemGod:index===1?'':tenGod(dayStem,stem),hiddenGod:tenGod(dayStem,hidden)}})};
}
function usesHistoricalCalendarBasis(x){return x.y<1582||(x.y===1582&&(x.m<10||(x.m===10&&x.d<15)))}
function addMonthsToBirth(x,totalMonths){const total=x.y*12+(x.m-1)+totalMonths;return{year:Math.floor(total/12),month:mod(total,12)+1}}
function getLuckCycles(x,p){const yearStem=STEMS.indexOf(p.year[0]);const yangYear=yearStem%2===0;const direction=(x.sex==='男性')===yangYear?1:-1;const historical=usesHistoricalCalendarBasis(x);const boundary=findSectionBoundary(historical?(x.calendarInstant||x.instant):x.instant,direction,x.hemisphere);const localBoundary=historical?boundary:new Date(boundary.getTime()+(x.standardEast||0)/15*3600000);const birthDay=utcDate(x.y,x.m,x.d).getTime();const sectionDay=utcDate(localBoundary.getUTCFullYear(),localBoundary.getUTCMonth()+1,localBoundary.getUTCDate()).getTime();const days=Math.abs(sectionDay-birthDay)/86400000;const startMonths=Math.max(1,days*4);const monthStem=STEMS.indexOf(p.month[0]),monthBranch=BRANCHES.indexOf(p.month[1]);const now=new Date();const nowYM=now.getFullYear()*12+now.getMonth();const cycles=Array.from({length:10},(_,i)=>{const ageMonths=startMonths+i*120;const start=addMonthsToBirth(x,ageMonths);const next=addMonthsToBirth(x,ageMonths+120);const startYM=start.year*12+start.month-1,nextYM=next.year*12+next.month-1;return{ageYears:Math.floor(ageMonths/12),ageMonths:ageMonths%12,start,stem:STEMS[mod(monthStem+direction*(i+1),10)],branch:BRANCHES[mod(monthBranch+direction*(i+1),12)],current:nowYM>=startYM&&nowYM<nextYM}});return{direction,startMonths,cycles}}
function annualPillarForYear(year){const index=mod(year-1984,60);return[STEMS[index%10],BRANCHES[index%12]]}
function selectedLuckForYear(x,p,year){const luck=getLuckCycles(x,p),cycle=[...luck.cycles].reverse().find(item=>item.start.year<=year);return cycle?{...cycle,value:[cycle.stem,cycle.branch],pre:false}:{stem:p.month[0],branch:p.month[1],value:[p.month[0],p.month[1]],pre:true,start:{year:x.y,month:x.m}}}
function annualRelationLuckForYear(luck,year){return[...luck.cycles].reverse().find(cycle=>cycle.start.year<year||(cycle.start.year===year&&cycle.start.month===1))||null}
function sixYearOptions(x,p){return Array.from({length:Math.min(120,9999-x.y)+1},(_,age)=>{const year=x.y+age,luck=selectedLuckForYear(x,p,year),luckLabel=luck.pre?'立運前':luck.value.join(''),annualValue=annualPillarForYear(year);return{year,age,luck,annualValue,label:`${year}年／${age}歳／${luckLabel}／${annualValue.join('')}`}})}
function buildSixPillarContext(x,p,year){const selectedYear=Math.max(1,Math.min(9999,Math.trunc(Number(year)||new Date().getFullYear()))),luck=selectedLuckForYear(x,p,selectedYear),annualValue=annualPillarForYear(selectedYear),luckValue=luck.pre?null:luck.value,resolution=resolveSixPillarFiveElements(p,luckValue,annualValue),fullModel=sixPillarModel(p,luckValue,annualValue,resolution),fullBalance=sixElementScores(p,luckValue,annualValue,resolution),model=luck.pre?fullModel.filter((_,index)=>index!==4):fullModel,balance=luck.pre?{...fullBalance,details:fullBalance.details.filter(item=>item.role!=='大運支')}:fullBalance;return{year:selectedYear,luck,annualValue,resolution,model,balance}}
function parseInput(){const system=document.querySelector('#calendarSystem').value,date=system==='western'?readWesternDateControl():westernDateFromCalendar(system,document.querySelector('#eraYear').value,document.querySelector('#eraMonth').value,document.querySelector('#eraDay').value);if(!date)throw Error('生年月日を入力してください');const {y,m,d}=date;if(y<1||y>9999)throw Error('西暦1年から9999年までで入力してください');const unknown=document.querySelector('#unknownTime').checked;const ts=document.querySelector('#birthTime').value||'12:00';const [h,min]=ts.split(':').map(Number);const raw=document.querySelector('#localOffset').value;const local=raw==='custom'?Number(document.querySelector('#customOffset').value||0):Number(raw);const tzWest=Number(document.querySelector('#timezoneLongitude').value);const standardEast=-tzWest,time=correctedBirthTime(y,m,d,h,min,local,standardEast);return{y,m,d,h,min,unknown,...time,standardEast,sex:document.querySelector('input[name=sex]:checked').value,name:document.querySelector('#name').value.trim(),hemisphere:document.querySelector('#hemisphere').value}}
function getPillars(x){const solarBasis=usesHistoricalCalendarBasis(x)?(x.calendarInstant||x.instant):x.instant;let lon=solarLongitude(solarBasis);if(x.hemisphere==='south')lon=mod(lon+180,360);const beforeRisshun=x.m===1||(x.m===2&&lon<315);const solarYear=beforeRisshun?x.y-1:x.y;const yearIndex=mod(solarYear-1984,60);const yearStem=yearIndex%10,yearBranch=yearIndex%12;const monthNo=mod(Math.floor(mod(lon-315,360)/30),12);const monthBranch=mod(2+monthNo,12);const monthStem=mod((yearStem%5)*2+2+monthNo,10);const daySerial=Math.floor(utcDate(x.apparent.getUTCFullYear(),x.apparent.getUTCMonth()+1,x.apparent.getUTCDate()).getTime()/86400000);const epoch=Math.floor(utcDate(2001,1,1).getTime()/86400000);const dayIndex=mod(daySerial-epoch,60),dayStem=dayIndex%10,dayBranch=dayIndex%12;let hour=null;if(!x.unknown){const mins=x.apparent.getUTCHours()*60+x.apparent.getUTCMinutes();const hb=mod(Math.floor((mins+60)/120),12);hour=[STEMS[mod(dayStem*2+hb,10)],BRANCHES[hb]]}return{hour,day:[STEMS[dayStem],BRANCHES[dayBranch]],month:[STEMS[monthStem],BRANCHES[monthBranch]],year:[STEMS[yearStem],BRANCHES[yearBranch]]}}
function submit(e){e.preventDefault();try{const x=parseInput(),p=getPillars(x);render(x,p)}catch(err){alert(err.message)}}
function render(x,p){activeReading={x,p};document.querySelector('#formView').hidden=true;document.querySelector('#resultView').hidden=false;document.querySelector('#resultName').textContent=`${x.name||'お名前未入力'} さん`;document.querySelector('#resultMeta').textContent=`${x.y}.${x.m}.${x.d}${x.unknown?'　出生時刻不明':`　${String(x.h).padStart(2,'0')}:${String(x.min).padStart(2,'0')}`}　${x.sex}`;document.querySelector('#pillars').innerHTML=pillarMarkup(originalPillarModel(p));const correction=`地方時差 ${signedMinutes(x.localOffset)}・均時差 ${signedMinutes(x.equationOffset)}${x.summerTimeCorrection?`・サマータイム ${signedMinutes(x.summerTimeCorrection)}`:''}`;document.querySelector('#solarTime').textContent=x.unknown?'時刻不明のため、時柱は表示していません':`視太陽時　${x.apparent.getUTCFullYear()}年${x.apparent.getUTCMonth()+1}月${x.apparent.getUTCDate()}日 ${String(x.apparent.getUTCHours()).padStart(2,'0')}:${String(x.apparent.getUTCMinutes()).padStart(2,'0')}（${correction}）`;renderFiveElementsCircle(p);renderLuck(x,p);renderAnnual(x,p);renderSixMode(x,p);renderPdfMode(x,p);requestAnimationFrame(redrawAllElementOutlines);document.fonts?.ready.then(redrawAllElementOutlines);scrollTo({top:0,behavior:'smooth'})}
function signedMinutes(value){return`${value>=0?'＋':'－'}${Math.abs(value)}分`}
function renderLuck(x,p){const luck=getLuckCycles(x,p),values=luck.cycles.map(c=>[c.stem,c.branch]),natalValues=[p.hour,p.day,p.month,p.year],natal=resolveNatalFiveElements(p),resolutions=values.map(value=>resolveDownstreamPillar(natal.states,natalValues,value,'major',p.month[1])),models=resolutions.map(downstreamPillarColumn);const sy=Math.floor(luck.startMonths/12),sm=luck.startMonths%12;document.querySelector('#luckSummary').textContent=`${luck.direction>0?'順行運':'逆行運'}　｜　立運 ${sy}歳${sm?`${sm}か月`:''}`;document.querySelector('#luckGrid').innerHTML=luck.cycles.map((c,index)=>`<article class="luck-card ${c.current?'is-current':''}">${c.current?'<span class="current-badge">現在</span>':''}<div class="luck-age">${c.ageYears}歳${c.ageMonths?`${c.ageMonths}か月`:''}〜</div><div class="luck-date">${c.start.year}.${String(c.start.month).padStart(2,'0')}</div><div class="luck-kanji cycle-kanji">${models[index].cells.map(cycleCellMarkup).join('')}</div></article>`).join('')}
function renderAnnual(x,p){const currentYear=new Date().getFullYear();const years=Array.from({length:11},(_,i)=>currentYear-5+i),luck=getLuckCycles(x,p),natalValues=[p.hour,p.day,p.month,p.year],natal=resolveNatalFiveElements(p),values=years.map(annualPillarForYear),resolutions=values.map((value,index)=>{const active=annualRelationLuckForYear(luck,years[index]),luckValue=active?[active.stem,active.branch]:null,luckResolution=luckValue?resolveDownstreamPillar(natal.states,natalValues,luckValue,'major',p.month[1]):null,contextStates=luckResolution?[...natal.states,luckResolution.state]:natal.states,contextValues=luckValue?[...natalValues,luckValue]:natalValues;return resolveDownstreamPillar(contextStates,contextValues,value,'minor',p.month[1])}),models=resolutions.map(downstreamPillarColumn),luckChanges=new Map(luck.cycles.map(c=>[c.start.year,c]));document.querySelector('#annualGrid').innerHTML=years.map((year,column)=>{const current=year===currentYear,change=luckChanges.get(year),marks=`${current?'<span class="annual-badge">今年</span>':''}${change?`<span class="annual-luck-badge">大運 ${change.stem}${change.branch}</span>`:''}`;return`<article class="annual-card ${current?'is-current':''} ${(current||change)?'has-mark':''}">${marks?`<div class="annual-marks">${marks}</div>`:''}<div class="annual-year">${year}</div><div class="annual-kanji cycle-kanji">${models[column].cells.map(cycleCellMarkup).join('')}</div></article>`}).join('')}
function renderSixMode(x,p,year){const input=document.querySelector('#sixYearInput');if(!input)return;const options=sixYearOptions(x,p),lastYear=options[options.length-1].year,selected=year??Math.min(lastYear,Math.max(x.y,new Date().getFullYear())),context=buildSixPillarContext(x,p,selected),age=context.year-x.y,pre=context.luck.pre;input.innerHTML=options.map(option=>`<option value="${option.year}">${option.label}</option>`).join('');input.value=String(context.year);document.querySelector('#sixModeSummary').textContent=`${context.year}年（${age}歳）年運 ${context.annualValue.join('')}${pre?'　｜　立運前':`　｜　大運 ${context.luck.value.join('')}`}`;document.querySelector('#sixModeDescription').textContent=pre?'原命式＋年運の十文字（立運前）':'原命式＋大運＋年運の十二文字';document.querySelector('#sixElementsTitle').textContent=pre?'十文字の五行サークル':'十二文字の五行サークル';document.querySelector('#sixElementsDescription').textContent=pre?'原命式・年運を合わせた五行バランス':'原命式・大運・年運を合わせた五行バランス';document.querySelector('#sixPillars').innerHTML=pillarMarkup(context.model);renderElementCircle('#sixElementsChart',context.balance,`${pre?'十':'十二'}文字の五行得点`,{basisTarget:'#sixTransformationBasis'});input.onchange=()=>{renderSixMode(x,p,input.value);renderPdfMode(x,p,input.value)};requestAnimationFrame(()=>drawElementGroupOutlines('#sixPillars'))}
function pdfFortuneCycleContext(x,p,year){
  const selectedYear=Math.trunc(Number(year)),luck=getLuckCycles(x,p),natalValues=[p.hour,p.day,p.month,p.year],natal=resolveNatalFiveElements(p);
  const luckValues=luck.cycles.map(c=>[c.stem,c.branch]);
  const luckResolutions=luckValues.map(value=>resolveDownstreamPillar(natal.states,natalValues,value,'major',p.month[1]));
  const luckModels=luckResolutions.map(downstreamPillarColumn);
  const years=Array.from({length:11},(_,i)=>selectedYear-5+i),annualValues=years.map(annualPillarForYear);
  const annualResolutions=annualValues.map((value,index)=>{const active=annualRelationLuckForYear(luck,years[index]),luckValue=active?[active.stem,active.branch]:null,luckResolution=luckValue?resolveDownstreamPillar(natal.states,natalValues,luckValue,'major',p.month[1]):null;return resolveDownstreamPillar(luckResolution?[...natal.states,luckResolution.state]:natal.states,luckValue?[...natalValues,luckValue]:natalValues,value,'minor',p.month[1])});
  return{selectedYear,luck,luckModels,years,annualModels:annualResolutions.map(downstreamPillarColumn),luckChanges:new Map(luck.cycles.map(c=>[c.start.year,c]))};
}
function pdfCycleKanjiMarkup(model){return model.cells.map(cycleCellMarkup).join('')}
function pdfLuckMarkup(data){return data.luck.cycles.map((cycle,index)=>{const selected=cycle.start.year<=data.selectedYear&&(index===data.luck.cycles.length-1||data.luck.cycles[index+1].start.year>data.selectedYear);return`<article class="pdf-cycle-card ${selected?'is-selected':''}">${selected?'<span class="pdf-cycle-badge">鑑定年</span>':''}<div class="pdf-cycle-age">${cycle.ageYears}歳${cycle.ageMonths?`${cycle.ageMonths}か月`:''}〜</div><div class="pdf-cycle-date">${cycle.start.year}.${String(cycle.start.month).padStart(2,'0')}</div><div class="pdf-cycle-kanji">${pdfCycleKanjiMarkup(data.luckModels[index])}</div></article>`}).join('')}
function pdfAnnualMarkup(data){return data.years.map((year,index)=>{const selected=year===data.selectedYear,change=data.luckChanges.get(year);return`<article class="pdf-cycle-card ${selected?'is-selected':''} ${(selected||change)?'has-badge':''}">${selected?'<span class="pdf-cycle-badge">鑑定年</span>':change?`<span class="pdf-cycle-badge luck-change">大運 ${change.stem}${change.branch}</span>`:''}<div class="pdf-cycle-year">${year}</div><div class="pdf-cycle-kanji">${pdfCycleKanjiMarkup(data.annualModels[index])}</div></article>`}).join('')}
function standardValueMarkup(value,kind='stem'){if(!value)return'<span class="standard-empty">—</span>';const element=ELEMENT_BY_CHAR[value]||'';return`<span class="standard-value element-${element}" data-kind="${kind}">${value}</span>`}
function standardChartMarkup(chart){
  const row=(label,key,kind='stem')=>`<tr><th scope="row">${label}</th>${chart.pillars.map(pillar=>`<td>${standardValueMarkup(pillar[key],kind)}</td>`).join('')}</tr>`;
  return`<table class="standard-chart-table"><thead><tr><th></th>${chart.pillars.map(pillar=>`<th scope="col">${pillar.label}</th>`).join('')}</tr></thead><tbody>${row('天干','stem')}${row('地支','branch','branch')}${row('蔵干','hidden')}${row('十二運','fortune','fortune')}${row('天干通変星','stemGod','god')}${row('蔵干通変星','hiddenGod','god')}</tbody></table>`;
}
function pdfReportContext(x,p,year){const six=buildSixPillarContext(x,p,year);return{year:six.year,age:six.year-x.y,pre:six.luck.pre,annualValue:six.annualValue,luck:six.luck,natalModel:originalPillarModel(p),natalBalance:natalElementScores(p),sixModel:six.model,sixBalance:six.balance,fortune:pdfFortuneCycleContext(x,p,six.year),standard:standardChartContext(x,p)}}
function redrawPdfOutlines(){for(const selector of ['#pdfOriginalPillars','#pdfSixPillars'])drawElementGroupOutlines(selector)}
function preparePdfElementDetails(target,studentMode){const details=document.querySelector(`${target} .five-elements-details`);if(!details)return;details.hidden=!studentMode;for(const item of details.querySelectorAll('.five-elements-transformations li'))item.hidden=studentMode&&item.textContent.includes('成立条件なし')}
function renderPdfMode(x,p,year){const input=document.querySelector('#pdfYearInput'),audienceInput=document.querySelector('#pdfAudienceInput');if(!input)return;const options=sixYearOptions(x,p),fallback=document.querySelector('#sixYearInput')?.value||Math.min(options.at(-1).year,Math.max(x.y,new Date().getFullYear())),context=pdfReportContext(x,p,year??fallback),studentMode=audienceInput?.value==='student',reports=document.querySelectorAll('.pdf-report');input.innerHTML=options.map(option=>`<option value="${option.year}">${option.label}</option>`).join('');input.value=String(context.year);for(const report of reports)report.classList.toggle('pdf-training',studentMode);document.querySelector('#pdfReportType').textContent='講座生添削用';const reportName=`${x.name||'お名前未入力'} 様`,reportMeta=`${x.y}年${x.m}月${x.d}日生　${x.sex}`;for(const prefix of ['pdfStandard','pdfReport','pdfFortune']){document.querySelector(`#${prefix}Name`).textContent=reportName;document.querySelector(`#${prefix}Meta`).textContent=reportMeta}document.querySelector('#pdfStandardChart').innerHTML=standardChartMarkup(context.standard);document.querySelector('#pdfSectionDays').textContent=`節入り後 ${context.standard.sectionDays>=21?'21日以降':`${context.standard.sectionDays}日目`} ／ 月律分野蔵干表`;document.querySelector('#pdfVoidBranches').textContent=context.standard.voidBranches.join('・');document.querySelector('#pdfOriginalPillars').innerHTML=pillarMarkup(context.natalModel);document.querySelector('#pdfSixPillars').innerHTML=pillarMarkup(context.sixModel);document.querySelector('#pdfSixTitle').textContent=context.pre?'指定年の十文字':'指定年の十二文字';document.querySelector('#pdfSixElementsTitle').textContent=context.pre?'十文字の五行バランス':'十二文字の五行バランス';document.querySelector('#pdfSixSummary').textContent=`${context.year}年（${context.age}歳） 年運 ${context.annualValue.join('')}${context.pre?' ／ 立運前':` ／ 大運 ${context.luck.value.join('')}`}`;const footer=`鑑定年 ${context.year}年${studentMode?' ／ 講座生添削用':''}`;document.querySelector('#pdfStandardFooter').textContent=footer;document.querySelector('#pdfReportFooter').textContent=footer;document.querySelector('#pdfFortuneFooter').textContent=footer;const sy=Math.floor(context.fortune.luck.startMonths/12),sm=context.fortune.luck.startMonths%12;document.querySelector('#pdfLuckSummary').textContent=`${context.fortune.luck.direction>0?'順行運':'逆行運'} ／ 立運 ${sy}歳${sm?`${sm}か月`:''}`;document.querySelector('#pdfAnnualSummary').textContent=`${context.year}年を中心に前後5年`;document.querySelector('#pdfLuckGrid').innerHTML=pdfLuckMarkup(context.fortune);document.querySelector('#pdfAnnualGrid').innerHTML=pdfAnnualMarkup(context.fortune);renderElementCircle('#pdfOriginalElements',context.natalBalance,'原命式の五行得点');renderElementCircle('#pdfSixElements',context.sixBalance,`${context.pre?'十':'十二'}文字の五行得点`);preparePdfElementDetails('#pdfOriginalElements',studentMode);preparePdfElementDetails('#pdfSixElements',studentMode);input.onchange=()=>{renderPdfMode(x,p,input.value);const sixInput=document.querySelector('#sixYearInput');if(sixInput){sixInput.value=input.value;renderSixMode(x,p,input.value)}};if(audienceInput)audienceInput.onchange=()=>renderPdfMode(x,p,input.value);requestAnimationFrame(redrawPdfOutlines)}
function printPdfReport(){if(!activeReading)return;const {x,p}=activeReading,studentMode=document.querySelector('#pdfAudienceInput')?.value==='student';renderPdfMode(x,p,document.querySelector('#pdfYearInput').value);document.body.classList.add('printing-pdf-report');prePrintTitle=document.title;document.title=`${x.name||'鑑定書'}_${document.querySelector('#pdfYearInput').value}年_四柱推命鑑定書${studentMode?'_講座生添削用':''}`;requestAnimationFrame(()=>{redrawPdfOutlines();window.print()})}
function toggleHiddenStems(){const hidden=document.body.classList.toggle('hide-hidden-stems');for(const button of document.querySelectorAll('.hidden-stems-toggle')){button.textContent=hidden?'蔵干・根拠を表示':'蔵干・根拠を非表示';button.setAttribute('aria-pressed',String(!hidden))}requestAnimationFrame(redrawAllElementOutlines)}
function showForm(){document.querySelector('#resultView').hidden=true;document.querySelector('#formView').hidden=false;scrollTo({top:0,behavior:'smooth'})}
init();
