(function(g){
  'use strict';
  var seq=1, endpoint='/api/rpc2', metaCache=null;
  function rpc(method,params){
    return fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:seq++,method:method,params:params||{}})})
      .then(function(r){if(!r.ok)throw new Error('RPC HTTP '+r.status);return r.json()})
      .then(function(x){if(x&&x.error)throw new Error(x.error.message||'RPC error');return x?x.result:null});
  }
  function safe(v,d){return v==null?d:v}
  function num(v){v=Number(v);return Number.isFinite(v)?v:0}
  function countryCode(region){
    var s=String(region||'').trim();
    var m=s.match(/\b([A-Z]{2})\b/);if(m)return m[1];
    var flags={"🇭🇰":"HK","🇯🇵":"JP","🇸🇬":"SG","🇺🇸":"US","🇩🇪":"DE","🇳🇱":"NL","🇬🇧":"GB","🇫🇷":"FR","🇰🇷":"KR","🇹🇼":"TW","🇦🇺":"AU","🇨🇦":"CA","🇨🇳":"CN"};
    for(var k in flags)if(s.indexOf(k)>=0)return flags[k];return '';
  }
  function currencySymbol(c){var x=String(c||'').toUpperCase();return ({CNY:'¥',RMB:'¥',USD:'$',EUR:'€',GBP:'£',JPY:'¥',HKD:'HK$',SGD:'S$'})[x]||x+' '}
  function periodStart(resetDay){
    var now=new Date(),d=Math.max(1,Math.min(28,Number(resetDay)||1)),y=now.getFullYear(),m=now.getMonth();
    if(now.getDate()<d){m--;if(m<0){m=11;y--}}
    return new Date(y,m,d,0,0,0,0);
  }
  function mergeMetadata(base,extra){var o={},k;for(k in base)o[k]=base[k];for(k in extra)o[k]=extra[k];return o}
  function loadMetadata(){
    if(metaCache)return Promise.resolve(metaCache);
    var inline=g.LINE_GRID_METADATA&&typeof g.LINE_GRID_METADATA==='object'?g.LINE_GRID_METADATA:{};
    return fetch('./metadata/nodes.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():{}}).catch(function(){return {}}).then(function(file){
      metaCache={global:mergeMetadata(file.global||{},inline.global||{}),nodes:mergeMetadata(file.nodes||{},inline.nodes||{})};return metaCache;
    });
  }
  function getPublicInfo(){return rpc('common:getPublicInfo').catch(function(){return {}})}
  function getNodes(){return rpc('common:getNodes').then(function(r){return r&&typeof r==='object'?r:{}})}
  function getLatest(uuids){return rpc('common:getNodesLatestStatus',uuids&&uuids.length?{uuids:uuids}:{}).then(function(r){return r&&typeof r==='object'?r:{}})}
  function mapPing(ping){
    var out=[];Object.keys(ping||{}).forEach(function(id){var p=ping[id]||{};out.push({key:String(id),label:p.name||('Task '+id),isp:'',current_ms:num(p.latest),loss_pct:num(p.loss),avg_ms:num(p.avg),min_ms:num(p.min),max_ms:num(p.max),tail:num(p.tail),buckets:[]})});return out;
  }
  function mapNode(n,live,ext){
    live=live||{};ext=ext||{};var cc=ext.region_country||countryCode(n.region);var price=num(n.price);var billing=num(n.billing_cycle);var cycle=billing?billing+'d':'';
    return {
      uuid:n.uuid,name:n.name||n.uuid,online:!!live.online,region:n.region||'',region_country:cc,region_name:ext.region_name||n.region||cc,region_city:ext.region_city||'',provider_name:ext.provider_name||'',provider_url:ext.provider_url||'',telecom_paid_peer:!!ext.telecom_paid_peer,
      download_speed:num(live.net_in),upload_speed:num(live.net_out),traffic_used:0,traffic_limit:num(n.traffic_limit),traffic_limit_type:n.traffic_limit_type||'sum',traffic_used_up:0,traffic_used_down:0,
      period_start:'',period_end:'',cpu_pct:num(live.cpu),loadavg:[num(live.load),num(live.load5),num(live.load15)].map(function(x){return x.toFixed(2)}).join(' '),mem_used:num(live.ram),mem_total:num(live.ram_total||n.mem_total),swap_used:num(live.swap),swap_total:num(live.swap_total||n.swap_total),disk_used:num(live.disk),disk_total:num(live.disk_total||n.disk_total),uptime:num(live.uptime),
      cpu_model:n.cpu_name||'',cpu_cores:num(n.cpu_cores),cpu_threads:num(ext.cpu_threads)||num(n.cpu_cores),os:n.os||'',kernel:n.kernel_version||'',arch:n.arch||'',virtualization:n.virtualization||'',gpu:n.gpu_name||'',version:n.version||'',group:n.group||'',tags:n.tags||'',ipv4:n.ipv4||'',ipv6:n.ipv6||'',
      ping:mapPing(live.ping),expires_at:n.expired_at||'',renewal_price:price,renewal_currency:n.currency||'',renewal_cycle_days:billing,renewal_cycle:cycle,renewal_price_cny:ext.renewal_price_cny,
      return_routes:Array.isArray(ext.return_routes)?ext.return_routes:[],traffic_reset_day:num(ext.traffic_reset_day)||1,daily_traffic:[],metadata:ext
    };
  }
  function normalizeInfo(info){return {title:info&& (info.sitename||info.site_name||info.name)||'Komari',description:info&&(info.description||'')||''}}
  function queryMetrics(params){return rpc('public:queryMetrics',params)}
  function trafficWindow(servers,days,startOverride){
    var ids=servers.map(function(s){return s.uuid}),end=new Date(),start=startOverride||new Date(Date.now()-days*86400000);
    return queryMetrics({metric_keys:['traffic.up','traffic.down'],entity_ids:ids,start:start.toISOString(),end:end.toISOString(),aggregation:'sum',max_points_by_metric:{'traffic.up':5000,'traffic.down':5000}}).then(function(res){
      var by={};ids.forEach(function(id){by[id]={up:0,down:0,days:{}}});(res&&res.series||[]).forEach(function(s){var id=s.entity_id;if(!by[id])return;var up=s.metric_key==='traffic.up';(s.points||[]).forEach(function(p){var v=num(p.value),day=String(p.time||'').slice(0,10);if(up)by[id].up+=v;else by[id].down+=v;if(day){var d=by[id].days[day]||(by[id].days[day]={date:day,up:0,down:0,total:0});if(up)d.up+=v;else d.down+=v;d.total=d.up+d.down}})});return by;
    });
  }
  function loadTraffic(servers){
    if(!servers.length)return Promise.resolve();var earliest=new Date();servers.forEach(function(s){var p=periodStart(s.traffic_reset_day);if(p<earliest)earliest=p});
    var now=new Date(),seven=new Date(Date.now()-7*86400000),monthStart=new Date(now.getFullYear(),now.getMonth(),1);var start=earliest;if(seven<start)start=seven;if(monthStart<start)start=monthStart;
    return trafficWindow(servers,35,start).then(function(by){servers.forEach(function(s){var b=by[s.uuid]||{up:0,down:0,days:{}};var p=periodStart(s.traffic_reset_day);var up=0,down=0;Object.keys(b.days).forEach(function(k){if(new Date(k+'T23:59:59')>=p){up+=b.days[k].up;down+=b.days[k].down}});s.traffic_used_up=up;s.traffic_used_down=down;s.traffic_used_total=up+down;s.traffic_used=s.traffic_limit_type==='up'?up:s.traffic_limit_type==='down'?down:s.traffic_limit_type==='max'?Math.max(up,down):s.traffic_limit_type==='min'?Math.min(up,down):up+down;s.period_start=p.toISOString().slice(0,10);var e=new Date(p);e.setMonth(e.getMonth()+1);s.period_end=e.toISOString().slice(0,10);var rows=Object.keys(b.days).sort().map(function(k){return b.days[k]});s.traffic_history=rows.map(function(x){return {date:x.date,uplink:x.up,downlink:x.down,total:x.total}});s.daily_traffic=s.traffic_history.slice(-7)})});
  }
  function getPingHistory(uuid,hours,taskId){
    var p={type:'ping',uuid:uuid,hours:hours||1,maxCount:1000};if(taskId)p.task_id=Number(taskId);return rpc('common:getRecords',p).then(function(r){r=r||{};return {records:r.records||[],tasks:r.tasks||[],basic_info:r.basic_info||[]}});
  }
  function getLoadHistory(uuid,hours,loadType){return rpc('common:getRecords',{type:'load',uuid:uuid,hours:hours||1,load_type:loadType||'all',maxCount:1000})}
  function snapshot(){
    return Promise.all([getNodes(),getLatest(),loadMetadata(),getPublicInfo()]).then(function(all){var nodes=all[0],latest=all[1],meta=all[2],info=normalizeInfo(all[3]);var arr=Object.keys(nodes).map(function(id){return mapNode(nodes[id],latest[id],meta.nodes[id]||{})});arr.sort(function(a,b){var aw=num(nodes[a.uuid]&&nodes[a.uuid].weight),bw=num(nodes[b.uuid]&&nodes[b.uuid].weight);return bw-aw||a.name.localeCompare(b.name)});return loadTraffic(arr).catch(function(){return null}).then(function(){return {enabled:true,title:meta.global.title||info.title,description:info.description,show_globe:meta.global.show_globe!==false,servers:arr,metadata:meta.global}})});
  }
  function applyLatest(state){var ids=(state.servers||[]).map(function(s){return s.uuid});return getLatest(ids).then(function(latest){state.servers.forEach(function(s){var l=latest[s.uuid]||{};s.online=!!l.online;s.download_speed=num(l.net_in);s.upload_speed=num(l.net_out);s.cpu_pct=num(l.cpu);s.loadavg=[num(l.load),num(l.load5),num(l.load15)].map(function(x){return x.toFixed(2)}).join(' ');s.mem_used=num(l.ram);s.mem_total=num(l.ram_total)||s.mem_total;s.disk_used=num(l.disk);s.disk_total=num(l.disk_total)||s.disk_total;s.uptime=num(l.uptime);s.ping=mapPing(l.ping)});return state})}
  g.KomariLineGridAPI={rpc:rpc,snapshot:snapshot,applyLatest:applyLatest,getPingHistory:getPingHistory,getLoadHistory:getLoadHistory,queryMetrics:queryMetrics,loadTraffic:loadTraffic,currencySymbol:currencySymbol,periodStart:periodStart};
})(window);
