export const VERSION = '1.0.0';
export const GAMMAS = [0, 15, 30, 45, 60, 75, 90];
export const PROFILES = {
  full: { label: '完整版 · 7×12', betas: Array.from({length:12}, (_,i)=>i*30), frame: 'lab', zero: 'parallel', source: 'S244、S255历届报告的两表版式' },
  closed: { label: '含360° · 7×13', betas: Array.from({length:13}, (_,i)=>i*30), frame: 'lab', zero: 'extinction', source: 'S047历届报告的完整一周版式' },
  compact: { label: '简表 · 7×4', betas: [90,180,270,360], frame: 'plate', zero: 'parallel', source: 'S263历届报告的简表及光轴参考约定' }
};
export const DEFAULTS = {
  p0: 1400, p2: 900, profile: 'full', anchorGamma: 90, anchorBeta: 0,
  background1: 0, background2: 0, retardance: 90, noisePct: 0,
  digits: 0, seed: 'polar-2026', unit: '相对读数'
};
const rad = d => d*Math.PI/180;
export const cos2 = d => Math.cos(rad(d))**2;
const clean = v => Math.abs(v)<1e-12 ? 0 : v;
export function field(gamma, delta=90, frame='lab') {
  const g=rad(gamma), c=Math.cos(g), s=Math.sin(g), cd=Math.cos(rad(delta)), sd=Math.sin(rad(delta));
  if(frame==='plate')return { x:[c,0], y:[-s*cd,-s*sd] };
  return { x:[c*c+s*s*cd,s*s*sd], y:[c*s*(1-cd),-c*s*sd] };
}
export function waveFactor(gamma,beta,delta=90,frame='lab',zero='parallel') {
  const E=field(gamma,delta,frame), a=rad(beta+(zero==='extinction'?90:0));
  const re=Math.cos(a)*E.x[0]+Math.sin(a)*E.y[0];
  const im=Math.cos(a)*E.x[1]+Math.sin(a)*E.y[1];
  return Math.max(0,Math.min(1,clean(re*re+im*im)));
}
export function polarization(gamma,delta=90,frame='lab') {
  const E=field(gamma,delta,frame), xx=E.x[0]**2+E.x[1]**2, yy=E.y[0]**2+E.y[1]**2;
  const s0=xx+yy, s1=xx-yy, s2=2*(E.x[0]*E.y[0]+E.x[1]*E.y[1]);
  const s3=2*(E.x[1]*E.y[0]-E.x[0]*E.y[1]);
  const chi=.5*Math.asin(Math.max(-1,Math.min(1,s3/s0))), ratio=Math.abs(Math.tan(chi));
  const orientation=.5*Math.atan2(s2,s1)*180/Math.PI;
  let type=ratio<1e-8?'线偏振光':ratio>1-1e-8?'圆偏振光':'椭圆偏振光';
  return {type,ratio,orientation,field:E};
}
export function validate(raw) {
  const p={...DEFAULTS,...raw};
  for(const k of ['p0','p2','anchorGamma','anchorBeta','background1','background2','retardance','noisePct','digits']) {
    if(raw[k]!==undefined && (raw[k]==='' || raw[k]===null))throw Error('请填写所有功率和数值参数。');
    p[k]=Number(p[k]);if(!Number.isFinite(p[k]))throw Error('数值必须是有限数字。');
  }
  if(!PROFILES[p.profile])throw Error('请选择有效的报告版式。');
  if(p.p0<=p.background1 || p.p2<=p.background2)throw Error('参考功率必须大于对应的背景/消光残余。');
  if(p.background1<0 || p.background2<0 || p.p0>1e9 || p.p2>1e9)throw Error('功率须在0到10⁹范围内，背景不能为负。');
  if(p.retardance<0 || p.retardance>360)throw Error('相位延迟应在0°到360°之间。');
  if(p.noisePct<0 || p.noisePct>20)throw Error('噪声比例应在0%到20%之间。');
  if(!Number.isInteger(p.digits)||p.digits<0||p.digits>6)throw Error('小数位数应为0到6的整数。');
  if(!GAMMAS.includes(p.anchorGamma))throw Error('参考功率的波片角度必须对应表中的一行。');
  if(!PROFILES[p.profile].betas.includes(p.anchorBeta))throw Error('参考功率的检偏角度必须对应表中的一列。');
  p.seed=String(p.seed).slice(0,80);p.unit=String(p.unit).slice(0,30);
  if(!p.seed.trim())throw Error('请填写随机种子，便于重现数据。');
  return p;
}
export function rng(seed) {
  let state=2166136261;
  for(const c of String(seed)){state^=c.charCodeAt(0);state=Math.imul(state,16777619);}
  return ()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
}
function gaussian(random) {
  const u=Math.max(Number.EPSILON,random()), v=random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
const round=(v,d)=>Number(v.toFixed(d));
export function fit(points) {
  const n=points.length, mx=points.reduce((s,p)=>s+p.x,0)/n, my=points.reduce((s,p)=>s+p.y,0)/n;
  const sxx=points.reduce((s,p)=>s+(p.x-mx)**2,0), sxy=points.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0);
  const slope=sxy/sxx, intercept=my-slope*mx;
  const sse=points.reduce((s,p)=>s+(p.y-slope*p.x-intercept)**2,0), sst=points.reduce((s,p)=>s+(p.y-my)**2,0);
  return {slope,intercept,r2:sst>0?1-sse/sst:null,rmse:Math.sqrt(sse/n)};
}
export function simulate(raw) {
  const p=validate(raw), profile=PROFILES[p.profile];
  const f0=waveFactor(p.anchorGamma,p.anchorBeta,p.retardance,profile.frame,profile.zero);
  if(f0<1e-8)throw Error('这个参考格在当前模型中为消光位置，不能用它确定整表尺度。请选择有光的格，例如完整版γ=90°、β=0°。');
  const scale1=p.p0-p.background1, scale2=(p.p2-p.background2)/f0;
  const rnd1=rng(p.seed+':malus'), rnd2=rng(p.seed+':wave');
  const sample=(ideal,scale,rnd)=>round(Math.max(0,ideal+(p.noisePct?gaussian(rnd)*scale*p.noisePct/100:0)),p.digits);
  const malus=Array.from({length:36},(_,i)=>{
    const theta=i*10, c=cos2(theta), ideal=p.background1+scale1*c, anchor=i===0;
    return {theta,cos2:clean(c),ideal,power:anchor?p.p0:sample(ideal,scale1,rnd1),origin:anchor?'用户参考点':'模型生成'};
  });
  const wave=GAMMAS.map(gamma=>{
    const state=polarization(gamma,p.retardance,profile.frame);
    const values=profile.betas.map(beta=>{
      const f=waveFactor(gamma,beta,p.retardance,profile.frame,profile.zero), ideal=p.background2+scale2*f;
      const anchor=gamma===p.anchorGamma&&beta===p.anchorBeta;
      return {gamma,beta,factor:f,ideal,power:anchor?p.p2:sample(ideal,scale2,rnd2),origin:anchor?'用户参考点':'模型生成'};
    });
    const minFactor=(1-Math.sqrt(Math.max(0,1-(2*state.ratio/(1+state.ratio**2))**2)))/2;
    const maxFactor=1-minFactor;
    let observation=state.type==='线偏振光'?'强弱交替；理想模型可消光':state.type==='圆偏振光'?'理想模型功率恒定，无消光':'强弱交替；理想模型不完全消光';
    if(p.background2>0&&state.type==='线偏振光')observation+='，读数含背景';
    return {gamma,state,observation,min:p.background2+scale2*minFactor,max:p.background2+scale2*maxFactor,values};
  });
  const regression=fit(malus.filter(x=>x.theta<=90).map(x=>({x:x.cos2,y:x.power})));
  return {
    version:VERSION, dataType:'SYNTHETIC / 仿真数据', purpose:'大学物理实验竞赛仿真环节',
    parameters:p, conventions:{source:profile.source,frame:profile.frame,zero:profile.zero,anchor:'输入参考点保持原值，不额外叠加噪声',noise:'加性高斯扰动，σ=各表信号尺度×噪声比例；负读数截为0，随后舍入'},
    scale1,scale2,malus,wave,regression
  };
}
const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';
export function toCSV(result, which='all') {
  const rows=[['数据类型','用途','模型版本','随机种子','版式','表格','波片γ(°)','检偏β(°)','马吕斯θ(°)','cos²θ','仿真功率','理想功率','功率单位','数据来源','偏振态']];
  const head=[result.dataType,result.purpose,result.version,result.parameters.seed,result.parameters.profile];
  if(which!=='wave')for(const r of result.malus)rows.push([...head,'表1', '', '', r.theta,r.cos2,r.power,r.ideal,result.parameters.unit,r.origin,'线偏振光']);
  if(which!=='malus')for(const row of result.wave)for(const r of row.values)rows.push([...head,'表2',r.gamma,r.beta,'','',r.power,r.ideal,result.parameters.unit,r.origin,row.state.type]);
  return '\uFEFF'+rows.map(row=>row.map(esc).join(',')).join('\r\n');
}
