import {DEFAULTS,GAMMAS,PROFILES,simulate,toCSV} from './model.js';
const $=id=>document.getElementById(id);
const H=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='polarization-two-tables-v1';
let current,dirty=false;

function syncChoices(reset=false) {
  const profile=PROFILES[$('profile').value], gamma=$('anchorGamma').value||'90', beta=$('anchorBeta').value;
  $('anchorGamma').innerHTML=GAMMAS.map(x=>`<option value="${x}">${x}°</option>`).join('');
  $('anchorGamma').value=gamma;
  $('anchorBeta').innerHTML=profile.betas.map(x=>`<option value="${x}">${x}°</option>`).join('');
  const suggested=$('profile').value==='full'?0:90;
  $('anchorBeta').value=String(!reset&&profile.betas.includes(Number(beta))&&beta!==''?beta:suggested);
  updateHint();
}
function updateHint() {
  const p=PROFILES[$('profile').value];
  $('anchor-description').textContent=`波片 γ=${$('anchorGamma').value}° 行，检偏器 β=${$('anchorBeta').value}° 列。`;
  $('convention').textContent=p.frame==='plate'?'简表：以波片光轴为检偏参考；角度对应所选简表。':p.zero==='extinction'?'含360°版：检偏器 β=0° 为消光方向。':'完整版：检偏器 β=0° 为原入射线偏振光的平行方向。';
}
function getInputs(){return Object.fromEntries(new FormData($('form')));}
function applyInputs(p) {
  const v={...DEFAULTS,...p};
  for(const [k,value] of Object.entries(v))if($(k)&&!['anchorBeta','anchorGamma'].includes(k))$(k).value=value;
  syncChoices(true);$('anchorGamma').value=String(v.anchorGamma);$('anchorBeta').value=String(v.anchorBeta);updateHint();
}
function power(r){return r.origin==='用户参考点'?String(r.power):r.power.toFixed(current.parameters.digits);}
function cell(r){return `<td class="${r.origin==='用户参考点'?'anchor':''}">${H(power(r))}${r.origin==='用户参考点'?' ◆':''}</td>`;}
function render(result) {
  current=result;
  const p=result.parameters;
  $('malus-table').innerHTML=[0,12,24].map(start=>`<table><caption>θ = ${start*10}°～${(start+11)*10}° · 仿真数据</caption><thead><tr><th>θ</th><th>cos²θ</th><th>P（${H(p.unit)}）</th></tr></thead><tbody>${result.malus.slice(start,start+12).map(r=>`<tr data-malus="${r.theta}"><td>${r.theta}°</td><td>${r.cos2.toFixed(3)}</td>${cell(r)}</tr>`).join('')}</tbody></table>`).join('');
  const betas=PROFILES[p.profile].betas;
  $('wave-desktop').innerHTML=`<table><thead><tr><th>波片 γ / 检偏 β</th>${betas.map(b=>`<th>${b}°</th>`).join('')}<th>模型偏振态</th></tr></thead><tbody>${result.wave.map(row=>`<tr data-wave="${row.gamma}"><th>${row.gamma}°</th>${row.values.map(cell).join('')}<td class="state">${row.state.type}</td></tr>`).join('')}</tbody></table>`;
  $('wave-mobile').innerHTML=result.wave.map(row=>`<article class="wave-card" data-gamma="${row.gamma}"><h3>波片 γ = ${row.gamma}°<span>${row.state.type}</span></h3><div class="values-grid">${row.values.map(r=>`<div class="pair ${r.origin==='用户参考点'?'anchor':''}" data-beta="${r.beta}"><span>β ${r.beta}°</span><strong>${H(power(r))}${r.origin==='用户参考点'?' ◆':''}</strong></div>`).join('')}</div></article>`).join('');
  $('wave-caption').textContent=`7 行 × ${betas.length} 列，共 ${7*betas.length} 个功率值（${p.unit}）。◆ 参考点：γ=${p.anchorGamma}°、β=${p.anchorBeta}°。`;
  $('count').textContent=`36 + ${7*betas.length} 个功率值`;
  $('results').classList.remove('stale');
  dirty=false;
}
function generate(message='已生成两张仿真表。参考点保持原值，其余为模型生成。') {
  try {
    const result=simulate(getInputs());render(result);$('error').hidden=true;$('status').textContent=message;
    try{localStorage.setItem(KEY,JSON.stringify(result.parameters));}catch{}
    return true;
  } catch(e){$('error').textContent=e.message;$('error').hidden=false;return false;}
}
function ensure(){return !dirty||generate();}
function tsv() {
  const rows=[['仿真数据 / 表1'],['θ(°)','cos²θ',`P(${current.parameters.unit})`,'来源']];
  for(const r of current.malus)rows.push([r.theta,r.cos2,r.power,r.origin]);
  rows.push([],['仿真数据 / 表2'],['波片γ(°)',...PROFILES[current.parameters.profile].betas.map(b=>`检偏β=${b}°`),'模型偏振态']);
  for(const r of current.wave)rows.push([r.gamma,...r.values.map(x=>x.power),r.state.type]);
  rows.push([],['仿真模型版本',current.version],['随机种子',current.parameters.seed],['噪声标准差(%)',current.parameters.noisePct],['参考格',`γ=${current.parameters.anchorGamma}° / β=${current.parameters.anchorBeta}°`]);
  return rows.map(row=>row.join('\t')).join('\n');
}
async function copy() {
  if(!ensure())return;
  const text=tsv();
  try{await navigator.clipboard.writeText(text);$('status').textContent='两张仿真表已复制，可粘贴到 Excel。';}
  catch{
    const area=document.createElement('textarea');area.value=text;area.setAttribute('aria-label','可复制的仿真数据');area.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px';document.body.append(area);area.select();
    const copied=document.execCommand('copy');area.remove();
    $('status').textContent=copied?'两张仿真表已复制。':'浏览器未允许复制，请使用“下载 CSV”。';
  }
}
function download(){if(!ensure())return;const blob=new Blob([toCSV(current)],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='光的偏振_两表_仿真数据.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);$('status').textContent='已导出 CSV，含“仿真数据”标记、理想值及生成值。';}
$('form').addEventListener('submit',e=>{e.preventDefault();generate();});
$('form').addEventListener('input',()=>{dirty=true;$('results').classList.add('stale');$('status').textContent='参数已修改，请点“生成两张表”。';updateHint();});
$('profile').addEventListener('change',()=>{syncChoices(true);dirty=true;});
$('demo').addEventListener('click',()=>{applyInputs(DEFAULTS);generate('演示数据已加载，可直接修改两个功率。');});
$('copy').addEventListener('click',copy);$('csv').addEventListener('click',download);
syncChoices(true);
try{const stored=localStorage.getItem(KEY);if(stored){applyInputs(JSON.parse(stored));if(!generate('已载入本设备上一次的参数。')){applyInputs(DEFAULTS);generate('已载入演示参数。');}}else generate('目前是演示参数，可直接改成自己的参考值。');}
catch{applyInputs(DEFAULTS);generate('目前是演示参数，可直接改成自己的参考值。');}
