import test from 'node:test';
import assert from 'node:assert/strict';
import {GAMMAS,PROFILES,field,waveFactor,polarization,simulate,toCSV} from '../model.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);

test('马吕斯定律：36个点，最大值与消光位置正确',()=>{
  const r=simulate({p0:1400,p2:900});
  assert.equal(r.malus.length,36);
  for(const [angle,value] of [[0,1400],[90,0],[180,1400],[270,0]])near(r.malus.find(p=>p.theta===angle).power,value);
  assert.ok(r.malus.every(p=>p.cos2>=0&&p.cos2<=1));
});

test('Jones模型：能量守恒、正交检偏功率和为1、45度圆偏振',()=>{
  for(const frame of ['lab','plate'])for(const gamma of GAMMAS){
    const E=field(gamma,90,frame);
    near([...E.x,...E.y].reduce((sum,v)=>sum+v*v,0),1);
    for(let beta=0;beta<360;beta+=15)near(waveFactor(gamma,beta,90,frame)+waveFactor(gamma,beta+90,90,frame),1);
    assert.equal(polarization(gamma,90,frame).type,gamma===45?'圆偏振光':gamma===0||gamma===90?'线偏振光':'椭圆偏振光');
    for(const beta of PROFILES.full.betas)near(waveFactor(45,beta,90,frame),.5);
  }
});

test('三种报告版式：点数和参考坐标正确',()=>{
  for(const [profile,anchorBeta,count] of [['full',0,84],['closed',90,91],['compact',90,28]]){
    const r=simulate({profile,anchorBeta,p2:731.25});
    assert.equal(r.wave.flatMap(row=>row.values).length,count);
    assert.equal(r.wave.find(row=>row.gamma===90).values.find(p=>p.beta===anchorBeta).power,731.25);
  }
  near(waveFactor(0,90,90,'plate'),0);
  near(waveFactor(0,180,90,'plate'),1);
  near(waveFactor(90,90,90,'plate'),1);
  near(waveFactor(90,180,90,'plate'),0);
});

test('噪声可重现、非负，两个输入参考点保留原始精度',()=>{
  const p={p0:1234.5678,p2:876.5432,digits:1,noisePct:20,seed:'competition'};
  const a=simulate(p),b=simulate(p),c=simulate({...p,seed:'other'});
  assert.deepEqual(a,b);
  assert.notDeepEqual(a.malus,c.malus);
  assert.equal(a.malus[0].power,p.p0);
  assert.equal(a.wave[6].values[0].power,p.p2);
  assert.ok([...a.malus,...a.wave.flatMap(row=>row.values)].every(p=>p.power>=0&&Number.isFinite(p.power)));
});

test('无效或消光参考格不能生成误导性的功率表',()=>{
  for(const p of [{p0:''},{p2:0},{p0:'Infinity'},{noisePct:21},{digits:1.5},{seed:''},{anchorGamma:7},{anchorBeta:90}])assert.throws(()=>simulate(p));
});

test('CSV包含全部120个功率值和仿真标记',()=>{
  const csv=toCSV(simulate({}));
  assert.equal(csv.split('\r\n').length,121);
  assert.equal(csv.split('SYNTHETIC / 仿真数据').length-1,120);
  assert.ok(csv.startsWith('\uFEFF'));
});
