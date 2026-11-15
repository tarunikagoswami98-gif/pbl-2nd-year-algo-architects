// Node handles JSON/persistence; ALL route search is performed by the no-STL C++ executable.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '../..');
const ENGINE = path.join(ROOT, 'cpp_engine', process.platform === 'win32' ? 'metro_engine.exe' : 'metro_engine');
const DATA_DIR = process.env.METRO_DATA_DIR || path.join(ROOT, 'data');
const stationsFile = path.join(DATA_DIR, 'stations.json');
const networkFile = path.join(DATA_DIR, 'network.json');
const simulationFile = path.join(DATA_DIR, 'simulation.json');
let chain = Promise.resolve();
const round = (x, digits=1) => Number(x.toFixed(digits));
const pct = x => round(x*100);
const status = r => r>=.90?'CRITICAL':r>=.75?'HIGH':r>=.50?'MODERATE':'LOW';
function serialized(task) { const p=chain.then(task);chain=p.catch(()=>{});return p; }
function load() {
  const stations=JSON.parse(fs.readFileSync(stationsFile,'utf8')).stations;
  const network=JSON.parse(fs.readFileSync(networkFile,'utf8'));
  const state=JSON.parse(fs.readFileSync(simulationFile,'utf8'));
  return {stations,network,state};
}
function save(state){ fs.writeFileSync(simulationFile,JSON.stringify(state,null,2)+'\n'); }
function edges(network){
  const list=[];
  for(const line of network.lines) for(let i=1;i<line.stations.length;i++) list.push({from:line.stations[i-1],to:line.stations[i],line:line.name,time:line.times[i-1],km:line.km[i-1]});
  return list;
}
function stationView(s,state,geometry=false){
  const load=state.current[s.id]||0, ratio=load/s.capacity;
  const v={id:s.id,name:s.name,capacity:s.capacity,load,loadPct:pct(ratio),status:status(ratio),interchange:false};
  if(geometry)Object.assign(v,{x:s.x,y:s.y,lines:[]});
  return v;
}
// Member 2 C++ crowd engine: manual insertion sort and linked FIFO passenger queue.
const CROWD_ENGINE = path.join(ROOT, 'cpp_engine', process.platform === 'win32' ? 'crowd_engine.exe' : 'crowd_engine');
const { spawnSync } = require('child_process');
function runCrowdEngine(input) {
  const result = spawnSync(CROWD_ENGINE, [], {input, encoding:'utf8', maxBuffer: 8*1024*1024});
  if(result.error) throw result.error;
  if(result.status !== 0) throw new Error('C++ crowd engine failed: '+(result.stderr||result.status));
  return result.stdout.trim();
}
function sortByCrowd(views) {
  if (!views.length) return [];
  const input = `RANK ${views.length}\n` + views.map(s=>s.loadPct).join('\n')+'\n';
  const indices=runCrowdEngine(input).split(/\s+/).map(Number);
  if(indices.length!==views.length || new Set(indices).size!==views.length || indices.some(i=>!Number.isInteger(i)||i<0||i>=views.length)) throw new Error('Invalid C++ crowd rank output');
  return indices.map(i=>views[i]);
}
function queueTrips(trips) {
  if(!trips.length)return [];
  const input=`QUEUE ${trips.length}\n`+trips.map(t=>t.join(' ')).join('\n')+'\n';
  const output=runCrowdEngine(input).split(/\r?\n/).map(line=>line.trim().split(/\s+/).map(Number));
  if(output.length!==trips.length || output.some(t=>t.length!==3||t.some(x=>!Number.isInteger(x))))throw new Error('Invalid C++ passenger queue output');
  return output;
}
function stateView(data){
  const {stations,state}=data, views=stations.map(s=>stationView(s,state));
  const ordered=sortByCrowd(views);
  return {state:{tick:state.tick,stations:views,summary:{peakLoadPct:ordered[0]?.loadPct||0,averageLoadPct:round(views.reduce((a,s)=>a+s.loadPct,0)/views.length),criticalStations:views.filter(s=>s.loadPct>=90).length,busiest:ordered.slice(0,5).map(s=>({name:s.name,loadPct:s.loadPct}))},alerts:ordered.filter(s=>s.loadPct>=75).map(s=>`${s.status}: ${s.name} (${s.loadPct}%)`)}};
}
function networkView(data){
  const all=edges(data.network);
  return {...stateView(data),stations:data.stations.map(s=>{
    const v=stationView(s,data.state,true);
    v.lines=data.network.lines.filter(l=>l.stations.includes(s.id)).map(l=>l.name);
    v.interchange=v.lines.length>1;return v;
  }),lines:data.network.lines.map(l=>({name:l.name,color:l.color,stations:l.stations})),edges:all};
}
function engineRoute(data,from,to,weight){
  return new Promise((resolve,reject)=>{
    const stations=data.stations, all=edges(data.network), idIndex=new Map(stations.map((s,i)=>[s.id,i]));
    const source=idIndex.get(from),dest=idIndex.get(to);
    if(source===undefined||dest===undefined)return reject(new Error('Unknown source or destination station'));
    const input=[`${stations.length} ${all.length} ${source} ${dest} ${weight}`,
      ...stations.map(s=>`${s.id} ${(data.state.current[s.id]||0)/s.capacity}`),
      ...all.map(e=>`${idIndex.get(e.from)} ${idIndex.get(e.to)} ${e.time} ${e.km}`)].join('\n')+'\n';
    const child=spawn(ENGINE,[],{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
    const timer=setTimeout(()=>child.kill(),10000);
    child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);
    child.on('error',reject);
    child.on('close',code=>{clearTimeout(timer);
      if(code!==0)return reject(new Error('C++ engine failed: '+stderr));
      if(stdout.trim()==='NO_ROUTE')return reject(new Error('No route available'));
      const lines=stdout.trim().split(/\r?\n/),meta=lines[0].trim().split(/\s+/).map(Number),indices=lines[1].trim().split(/\s+/).map(Number);
      if(indices.length!==meta[0]||indices.some(i=>!stations[i]))return reject(new Error('Invalid C++ engine result'));
      const stops=indices.map(i=>stationView(stations[i],data.state));
      const segmentLines=[];let transfers=0;
      for(let i=1;i<stops.length;i++){
        const e=all.find(e=>(e.from===stops[i-1].id&&e.to===stops[i].id)||(e.to===stops[i-1].id&&e.from===stops[i].id));
        segmentLines.push(e?.line||'Unknown');
        if(i>1&&segmentLines[i-1]!==segmentLines[i-2])transfers++;
      }
      const avg=stops.reduce((a,s)=>a+s.loadPct,0)/stops.length;
      resolve({found:true,stations:stops,segmentLines,travelTime:round(meta[1],2),distanceKm:round(meta[2],2),transfers,avgCrowdPct:round(avg),maxCrowdPct:Math.max(...stops.map(s=>s.loadPct)),crowdStatus:status(avg/100)});
    });
    child.stdin.end(input);
  });
}
async function recommend(data,from,to,passengers,commit){
  const fastest=await engineRoute(data,from,to,0), recommended=await engineRoute(data,from,to,2.5);
  const sameRoute=fastest.stations.map(s=>s.id).join(',')===recommended.stations.map(s=>s.id).join(',');
  const reduction=fastest.avgCrowdPct>0?round((fastest.avgCrowdPct-recommended.avgCrowdPct)/fastest.avgCrowdPct*100):0;
  if(commit){for(const s of recommended.stations)data.state.current[s.id]=(data.state.current[s.id]||0)+passengers;save(data.state);}
  return {source:data.stations.find(s=>s.id===from).name,destination:data.stations.find(s=>s.id===to).name,passengers,committed:commit,sameRoute,timeDifference:round(recommended.travelTime-fastest.travelTime,2),crowdReductionPct:reduction,recommended,fastest,warnings:[],...stateView(data)};
}
function tick(data){data.state.tick++;
  for(const s of data.stations)data.state.current[s.id]=Math.max(data.state.baseline[s.id]||0,Math.floor((data.state.current[s.id]||0)*.92));
  save(data.state);return stateView(data);
}
// Deterministic seeded comparative simulation, performed on independent in-memory states.
async function simulate(data,groups,seed){
  const ids=data.stations.map(s=>s.id);let rand=seed>>>0;
  function next(){rand=(Math.imul(rand,1664525)+1013904223)>>>0;return rand/4294967296;}
  const trips=[];
  for(let i=0;i<groups;i++){const a=Math.floor(next()*ids.length);let b=Math.floor(next()*(ids.length-1));if(b>=a)b++;trips.push([a,b,1+Math.floor(next()*6)]);}
  async function run(weight,mode){
    const local={...data,state:{...data.state,current:{...data.state.current}}};
    let passengers=0,exposed=0,travel=0,crowd=0,peak=0;const timeline=[];
    const batch=Math.max(1,Math.ceil(groups/20));
    const orderedTrips=queueTrips(trips);
    for(let i=0;i<orderedTrips.length;i++){
      const [fromIndex,toIndex,n]=orderedTrips[i];
      const from=ids[fromIndex],to=ids[toIndex];
      const r=await engineRoute(local,from,to,weight);
      passengers+=n;travel+=r.travelTime*n;crowd+=r.avgCrowdPct*n;
      for(const s of r.stations){if(s.loadPct>=90)exposed+=n;local.state.current[s.id]=(local.state.current[s.id]||0)+n;}
      if((i+1)%batch===0||i===trips.length-1){const current=stateView(local).state.summary.peakLoadPct;peak=Math.max(peak,current);timeline.push(current);}
    }
    return {mode,passengers,peakLoadPct:peak,exposedPassengers:exposed,avgTravelTime:round(travel/passengers,2),avgRouteCrowdPct:round(crowd/passengers),criticalStationsAtEnd:stateView(local).state.summary.criticalStations,timeline};
  }
  const fastest=await run(0,'fastest'),crowdAware=await run(2.5,'crowdAware');
  const reduction=(a,b)=>a?round((a-b)/a*100):0;
  return {groups,seed,fastest,crowdAware,improvement:{peakLoadReductionPct:reduction(fastest.peakLoadPct,crowdAware.peakLoadPct),exposureReductionPct:reduction(fastest.exposedPassengers,crowdAware.exposedPassengers),extraTravelMinutes:round(crowdAware.avgTravelTime-fastest.avgTravelTime,2)}};
}
module.exports={ENGINE,getNetwork:()=>serialized(()=>networkView(load())),getStations:()=>serialized(()=>stateView(load())),findRoute:(from,to,n,commit)=>serialized(()=>recommend(load(),from,to,n,commit)),advanceTime:()=>serialized(()=>tick(load())),reset:()=>serialized(()=>{const d=load();d.state.current={...d.state.baseline};d.state.tick=0;save(d.state);return stateView(d);}),simulate:(groups,seed)=>serialized(()=>simulate(load(),groups,seed))};
