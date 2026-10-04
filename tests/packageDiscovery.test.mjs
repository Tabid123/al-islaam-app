import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
function load(rpc) {
  const exports={};
  const source=ts.transpileModule(fs.readFileSync('src/lib/packageDiscovery.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  vm.runInNewContext(source,{exports,require:()=>({supabase:{rpc}})});
  return exports;
}
test('successful request moves through queue and priced results without creating a second scan',async()=>{
  const calls=[];
  const lib=load(async(name,args)=>{
    calls.push({name,args});
    return {error:null,data:name==='request_package_discovery'?{success:true,id:'scan',status:'pending'}:
      name==='get_discovery_queue_status'?{found:true,status:'done',claimed_at:'2026-10-04T12:15:54Z'}:
      {success:true,status:'done',session_seconds_left:0,packages:[{index:'1',selling_price:0.11,price_missing:false}]} };
  });
  const scan=await lib.requestPackageDiscovery('root','619535029');
  assert.equal((await lib.readDiscoveryQueue(scan.id)).status,'done');
  const result=await lib.readDiscoveredPackages(scan.id);
  assert.equal(result.packages[0].selling_price,0.11);assert.equal(result.session_seconds_left,0);
  assert.equal(calls.filter(c=>c.name==='request_package_discovery').length,1);
  assert.equal(calls[0].args.p_phone,'619535029');
});
test('RPC failures and rejected requests stay errors rather than entering empty-result polling',async()=>{
  const rejected=load(async()=>({data:{success:false,message:'Lambar sax ah geli'},error:null}));
  await assert.rejects(rejected.requestPackageDiscovery('root','bad'),/Lambar sax ah geli/);
  const broken=load(async()=>({data:null,error:new Error('network offline')}));
  await assert.rejects(broken.readDiscoveryQueue('scan'),/network offline/);
  await assert.rejects(broken.readDiscoveredPackages('scan'),/network offline/);
  await assert.rejects(broken.releaseDiscoverySession('scan'),/network offline/);
});
test('release uses the existing session RPC and leaves payment APIs untouched',async()=>{
  const calls=[];const lib=load(async(name,args)=>{calls.push({name,args});return {data:true,error:null};});
  await lib.releaseDiscoverySession('scan');
  assert.equal(calls.length,1);assert.equal(calls[0].name,'release_discovery_session');assert.equal(calls[0].args.p_id,'scan');
});
