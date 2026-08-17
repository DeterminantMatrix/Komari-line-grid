const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(__dirname+'/../dist/js/komari-api.js','utf8');
const now=new Date();
function rpcResult(method){
  if(method==='common:getNodes') return {'u-1':{uuid:'u-1',name:'SG-01',cpu_name:'EPYC',arch:'x86_64',cpu_cores:2,os:'Debian',kernel_version:'6.1',region:'SG',mem_total:8e9,disk_total:80e9,price:5,billing_cycle:30,currency:'USD',traffic_limit:1e12,traffic_limit_type:'sum',expired_at:'2027-01-01'}};
  if(method==='common:getNodesLatestStatus') return {'u-1':{online:true,cpu:12,ram:2e9,ram_total:8e9,disk:20e9,disk_total:80e9,net_in:12345,net_out:6789,net_total_up:1,net_total_down:2,uptime:86400,ping:{'1':{name:'Shanghai',latest:35,avg:38,loss:0.5,min:30,max:45,tail:0.1}}}};
  if(method==='common:getPublicInfo') return {sitename:'Test Komari',description:'test'};
  if(method==='public:queryMetrics') return {series:[
    {metric_key:'traffic.up',entity_id:'u-1',points:[{time:now.toISOString(),value:100}]},
    {metric_key:'traffic.down',entity_id:'u-1',points:[{time:now.toISOString(),value:300}]}
  ]};
  if(method==='common:getRecords') return {records:[{task_id:1,time:now.toISOString(),value:35}],tasks:[],basic_info:[]};
  throw new Error('unexpected '+method);
}
const context={console,URLSearchParams,Date,Number,Math,Promise,setTimeout,clearTimeout,window:{},fetch:async (url,opt)=>{
  if(String(url).includes('metadata/nodes.json')) return {ok:true,json:async()=>({global:{show_globe:true},nodes:{'u-1':{region_country:'SG',provider_name:'Demo',traffic_reset_day:1}}})};
  const req=JSON.parse(opt.body);return {ok:true,json:async()=>({jsonrpc:'2.0',id:req.id,result:rpcResult(req.method)})};
}};
context.window.window=context.window;context.window.fetch=context.fetch;context.window.Date=Date;
vm.createContext(context);vm.runInContext(code,context);
context.window.KomariLineGridAPI.snapshot().then(s=>{
  assert.equal(s.title,'Test Komari');assert.equal(s.servers.length,1);const n=s.servers[0];
  assert.equal(n.uuid,'u-1');assert.equal(n.online,true);assert.equal(n.cpu_pct,12);assert.equal(n.provider_name,'Demo');assert.equal(n.ping[0].current_ms,35);assert.equal(n.traffic_used,400);assert.equal(n.traffic_used_up,100);assert.equal(n.traffic_used_down,300);
  return context.window.KomariLineGridAPI.getPingHistory('u-1',1,1);
}).then(h=>{assert.equal(h.records[0].value,35);console.log('api adapter ok')}).catch(e=>{console.error(e);process.exit(1)});
