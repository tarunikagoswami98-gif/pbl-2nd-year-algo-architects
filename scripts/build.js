const { spawnSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname,'..');
const cpp=path.join(root,'cpp_engine');
const output=path.join(cpp,process.platform==='win32'?'metro_engine.exe':'metro_engine');
const args=['-std=c++11','-O2','-Wall','-Wextra',path.join(cpp,'MetroCore.cpp'),path.join(cpp,'route_cli.cpp'),'-o',output];
const result=spawnSync(process.env.CXX||'g++',args,{stdio:'inherit'});
if(result.error){console.error(result.error.message);process.exit(1)}
if(result.status!==0)process.exit(result.status||1);
const crowdOutput=path.join(cpp,process.platform==='win32'?'crowd_engine.exe':'crowd_engine');
const crowdArgs=['-std=c++11','-O2','-Wall','-Wextra',path.join(cpp,'passenger','CrowdManager.cpp'),path.join(cpp,'passenger','crowd_cli.cpp'),'-o',crowdOutput];
const crowdResult=spawnSync(process.env.CXX||'g++',crowdArgs,{stdio:'inherit'});
if(crowdResult.error){console.error(crowdResult.error.message);process.exit(1)}
process.exit(crowdResult.status||0);
