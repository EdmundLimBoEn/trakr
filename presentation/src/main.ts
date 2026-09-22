import { slides } from './slides';
const $ = <T extends HTMLElement = HTMLElement>(selector:string) => {const el=document.querySelector<T>(selector); if(!el) throw new Error(`Missing ${selector}`); return el;};
$('#deck').innerHTML=slides.map((s,i)=>`<section class="slide ${s.layout || 'technical-slide'}" id="slide-${i+1}" aria-label="${s.section}" ${i?'hidden':''}>${s.html}</section>`).join('');
document.querySelectorAll('.technical-diagram').forEach(el=>{const wrapper=document.createElement('div');wrapper.className='diagram-scroll';wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label','Diagram; scroll horizontally on small screens');el.before(wrapper);wrapper.append(el);});
const access=$('.access-table');const accessWrapper=document.createElement('div');accessWrapper.className='access-scroll';accessWrapper.tabIndex=0;accessWrapper.setAttribute('role','region');accessWrapper.setAttribute('aria-label','Access matrix; scroll horizontally on small screens');access.before(accessWrapper);accessWrapper.append(access);
let index=0; let flowTimers: ReturnType<typeof setTimeout>[]=[]; let timerInterval: ReturnType<typeof setInterval>|undefined; let remaining=180; let deadline=0;
const picker=$<HTMLDialogElement>('#slide-picker'); const speaker=$<HTMLDialogElement>('#speaker');
type Note={title:string;timing:string;script:string;source:string}; let notes:Note[]=[];
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
fetch('/notes.json').then(r=>{if(!r.ok)throw new Error('Notes unavailable');return r.json()}).then((n:Note[])=>{notes=n;updateNotes()}).catch(()=>{$('#speaker-content').textContent='Speaker notes could not load. Please refresh to retry.'});
function updateNotes(){const n=notes[index];if(n)$('#speaker-content').innerHTML=`<p class="mono accent">${escape(n.timing)}</p><h3>${escape(slides[index].title)}</h3><p>${escape(n.script)}</p><p class="note-source">${escape(n.source)}</p>`;}
function stopFlow(){flowTimers.forEach(clearTimeout);flowTimers=[];}
const traceSteps = ['trace-scan', 'trace-stage', 'trace-network', 'trace-commit', 'trace-receipt'];
function setFlow(step:number){
  traceSteps.forEach((id,i)=>$('#'+id).classList.toggle('traced',i<=step));
  $('#trace-status').textContent = ['Scan resolves to enrolled equipment','Staging and condition complete','Connection available','Submitting batch for rule validation','Commit accepted → receipt shown'][step] || 'READY / trace the accepted path';
}
function go(next:number){index=Math.max(0,Math.min(slides.length-1,next));stopFlow();document.querySelectorAll<HTMLElement>('.slide').forEach((el,i)=>{el.hidden=i!==index;el.classList.toggle('active',i===index);el.inert=i!==index;});if(index===2)setFlow(-1);$('#counter').textContent=`${String(index+1).padStart(2,'0')} / ${slides.length}`;$('#section-name').textContent=(slides[index].appendix?'Q&A · ':'')+slides[index].section;$<HTMLButtonElement>('#previous').disabled=index===0;$<HTMLButtonElement>('#next').disabled=index===slides.length-1;$('#progress-fill').style.width=`${(index+1)/slides.length*100}%`;history.replaceState(null,'',`#${index+1}`);document.title=`Trakr · ${slides[index].title}`;window.scrollTo({top:0,behavior:'instant'});updateNotes();}
$('#next').onclick=()=>go(index+1);$('#previous').onclick=()=>go(index-1);
$('#play-flow').onclick=()=>{stopFlow();setFlow(0);traceSteps.slice(1).forEach((_,i)=>flowTimers.push(setTimeout(()=>setFlow(i+1),(i+1)*450)));};
$('#overview').onclick=()=>picker.showModal();$('#notes').onclick=()=>speaker.showModal();
$('#slide-list').innerHTML=slides.map((s,i)=>`<button data-goto="${i}"><span class="mono">${String(i+1).padStart(2,'0')}</span><span>${escape(s.title)}</span>${s.appendix?'<small>Q&A</small>':''}</button>`).join('');
$('#slide-list').onclick=e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('[data-goto]');if(b){go(Number(b.dataset.goto));picker.close();}};
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog')?.close());
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('#announcement').textContent='Fullscreen is unavailable in this browser. Use the browser presentation controls.';}}
$('#fullscreen').onclick=fullscreen;
document.addEventListener('fullscreenchange',()=>$('#fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen'));
function renderTimer(){$('#timer').textContent=`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;}
function pauseTimer(){clearInterval(timerInterval);timerInterval=undefined;$('#timer-toggle').textContent=remaining===0?'Restart timer':'Resume timer';}
$('#timer-toggle').onclick=()=>{if(timerInterval){remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));pauseTimer();renderTimer();return;}if(remaining===0)remaining=180;deadline=Date.now()+remaining*1000;$('#timer-toggle').textContent='Pause timer';timerInterval=setInterval(()=>{remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));renderTimer();if(remaining===0){pauseTimer();$('#announcement').textContent='Three-minute demo complete.';}},250);};
$('#timer-reset').onclick=()=>{pauseTimer();remaining=180;renderTimer();$('#timer-toggle').textContent='Start timer';};
document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||picker.open||speaker.open)return;const target=e.target as HTMLElement;if(target.closest('input,textarea,select,[contenteditable],.diagram-scroll,.access-scroll'))return;if(target.closest('button,a')&&(e.key===' '||e.key==='Enter'))return;if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();go(index+1);}else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();go(index-1);}else if(e.key==='Home')go(0);else if(e.key==='End')go(slides.length-1);else if(e.key.toLowerCase()==='f')void fullscreen();else if(e.key.toLowerCase()==='n')speaker.showModal();else if(e.key.toLowerCase()==='o')picker.showModal();});
let touchX=0,touchY=0;$('#deck').addEventListener('touchstart',e=>{touchX=e.changedTouches[0].clientX;touchY=e.changedTouches[0].clientY;},{passive:true});$('#deck').addEventListener('touchend',e=>{if((e.target as HTMLElement).closest('button,input,.diagram-scroll,.access-scroll'))return;const dx=e.changedTouches[0].clientX-touchX,dy=e.changedTouches[0].clientY-touchY;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.5)go(index+(dx<0?1:-1));},{passive:true});
function fromHash(){const n=Number(location.hash.slice(1));go(Number.isInteger(n)&&n>=1?n-1:0);}window.addEventListener('hashchange',fromHash);fromHash();

function updateWrites(){
  const items=$<HTMLInputElement>('#item-count');
  const issues=$<HTMLInputElement>('#issue-count');
  const n=Number(items.value);
  issues.max=String(n);
  const k=Math.min(Number(issues.value),n);
  issues.value=String(k);
  $('#items-value').textContent=String(n);
  $('#issues-value').textContent=String(k);
  $('#write-total').textContent=String(1+n+k);
  $('#write-breakdown').textContent=`1 batch + ${n} claim${n===1?'':'s'} + ${k} issue${k===1?'':'s'}`;
}
$('#item-count').addEventListener('input',updateWrites);
$('#issue-count').addEventListener('input',updateWrites);
updateWrites();
