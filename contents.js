let contentsItems=[],pinnedSection=null,activeContentsId=null;

function contentsMarkup(items){
 const children=new Map();
 for(const {id,parentId} of items)if(parentId){
  if(!children.has(parentId))children.set(parentId,[]);
  children.get(parentId).push('toc-link-'+id);
 }
 return items.map(item=>{
  const controls=children.get(item.id);
  const folded=item.parentId?' id="toc-link-'+esc(item.id)+'" data-parent-id="'+esc(item.parentId)+'" hidden':'';
  return '<button type="button" data-section-id="'+esc(item.id)+'"'+(item.nested?' class="nested"':'')+folded+
   (controls?' aria-expanded="false" aria-controls="'+esc(controls.join(' '))+'"':'')+'>'+esc(item.title)+
   (controls?'<span class="toc-caret" aria-hidden="true"></span>':'')+'</button>';
 }).join('');
}

function updateContentsPosition(){
 if(!contentsItems.length)return;
 const top=90;// below the sticky top bar
 const shown=contentsItems.filter(item=>item.node.getClientRects().length);
 let active=contentsItems[0].id;
 for(const item of shown)if(item.node.getBoundingClientRect().top<=top)active=item.id;
 // Sections near the page end can never scroll up to the line; at the bottom, the last visible heading wins.
 if(window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-2){
  for(const item of shown)if(item.node.getBoundingClientRect().top<window.innerHeight)active=item.id;
 }
 if(pinnedSection&&contentsItems.some(item=>item.id===pinnedSection))active=pinnedSection;
 if(active===activeContentsId)return;
 activeContentsId=active;
 const expanded=contentsItems.find(item=>item.id===active)?.parentId||active;
 const nav=$('page-toc');let currentButton;
 for(const button of nav.querySelectorAll('button')){
  if(button.dataset.parentId)button.hidden=button.dataset.parentId!==expanded;
  if(button.hasAttribute('aria-expanded'))button.setAttribute('aria-expanded',String(button.dataset.sectionId===expanded));
  if(button.dataset.sectionId===active){button.setAttribute('aria-current','location');currentButton=button;}
  else button.removeAttribute('aria-current');
 }
 if(currentButton&&nav.clientHeight){
  const {top,bottom}=currentButton.getBoundingClientRect(),edge=nav.getBoundingClientRect();
  if(top<edge.top)nav.scrollTop+=top-edge.top-currentButton.offsetHeight;
  else if(bottom>edge.bottom)nav.scrollTop+=bottom-edge.bottom;
 }
}

function syncPageContents(){
 const main=$('detail');
 let headings=[...main.querySelectorAll('h3, h4, details > summary')].filter(node=>!node.closest('table, .navbox, .home-card'));
 if(!headings.length)headings=[...main.querySelectorAll('h2')].slice(0,1);
 if(headings.length===contentsItems.length&&headings.every((node,i)=>node===contentsItems[i].node&&node.textContent.trim()===contentsItems[i].title))return updateContentsPosition();
 document.body.classList.toggle('no-toc',headings.length<2);
 pinnedSection=activeContentsId=null;
 const ids=new Set([...main.querySelectorAll('[id]')].map(node=>node.id));let serial=0,parentId=null;
 contentsItems=headings.map(node=>{
  if(!node.id){do{node.id='page-section-'+(++serial);}while(ids.has(node.id));ids.add(node.id);}
  if(node.tagName==='H3')parentId=node.id;
  const subheading=node.tagName==='H4';
  return {id:node.id,title:node.textContent.trim(),node,nested:subheading||!!node.closest('.skillgrid'),parentId:subheading?parentId:null};
 });
 $('page-toc').innerHTML=contentsMarkup(contentsItems)||'<p class="muted">暂无目录</p>';
 updateContentsPosition();
}

$('page-toc').addEventListener('click',event=>{
 const button=event.target.closest('button[data-section-id]');
 if(!button)return;
 const target=$(button.dataset.sectionId);
 if(!target)return;
 for(let parent=target.parentElement;parent&&parent!==$('detail');parent=parent.parentElement){
  if(parent.tagName==='DETAILS')parent.open=true;
 }
 target.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 target.tabIndex=-1;
 target.focus({preventScroll:true});
 pinnedSection=target.id;updateContentsPosition();
});
// A clicked item stays highlighted through its smooth scroll; the user's own scrolling releases it.
for(const type of ['wheel','touchstart','keydown','mousedown'])window.addEventListener(type,event=>{if(!event.target.closest?.('#page-toc'))pinnedSection=null;},{passive:true});
window.addEventListener('scroll',updateContentsPosition,{passive:true});
const contentsObserver=new MutationObserver(syncPageContents);
contentsObserver.observe($('detail'),{childList:true,subtree:true});
syncPageContents();
