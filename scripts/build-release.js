#!/usr/bin/env node
'use strict';
const fs=require('fs'), path=require('path');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'Lite-theme.json'),'utf8'));
const src=path.join(root,'src/index.html'), out=path.join(root,'dist/index.html');
const check=process.argv.includes('--check');
function esc(s){return s.replace(/<\/script/gi,'<\\/script');}
function build(){let h=fs.readFileSync(src,'utf8').replace(/__LINE_GRID_VERSION__/g,String(manifest.version||'')); h=h.replace(/<link\s+rel="stylesheet"\s+href="[^"]*"\s+data-inline-href="([^"]+)"\s*>/g,(_m,p)=>'<style>\n'+fs.readFileSync(path.join(root,p),'utf8')+'\n</style>'); h=h.replace(/<script\s+src="[^"]*"\s+data-inline-src="([^"]+)"\s*><\/script>/g,(_m,p)=>'<script>\n'+esc(fs.readFileSync(path.join(root,p),'utf8'))+'\n</script>'); if(/data-inline-(?:src|href)=|__LINE_GRID_VERSION__/.test(h)) throw new Error('unresolved build marker'); return h;}
const h=build(); fs.mkdirSync(path.dirname(out),{recursive:true}); if(check){if(!fs.existsSync(out)||fs.readFileSync(out,'utf8')!==h){console.error('dist/index.html is stale');process.exit(1);} console.log('release index is reproducible');} else {fs.writeFileSync(out,h);console.log(out);}
