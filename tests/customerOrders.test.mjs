import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const {createClient}=require('@supabase/supabase-js');

function load(supabase, extras={}) {
  const exports={};
  const js=ts.transpileModule(fs.readFileSync('src/lib/customerOrders.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  vm.runInNewContext(js,{exports,require:()=>({supabase}),...extras});
  return exports;
}
test('history reads both account and payer phone formats with delivery status',async()=>{
  const requests=[];
  const supabase=createClient('https://example.supabase.co','test',{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:async(url)=>{
      requests.push(new URL(url));
      return Response.json([{id:'scheduled',customer_phone:'619535029',sender_phone:'617195659',delivery_status:'delivered'}]);
    }},
  });
  const lib=load(supabase);
  const rows=await lib.fetchCustomerOrders(['+252 619 535 029'],true);
  assert.equal(rows[0].delivery_status,'delivered');
  const params=requests[0].searchParams;
  assert.match(params.get('or'),/customer_phone\.in\.\(619535029,252619535029,\+252619535029,0619535029\)/);
  assert.match(params.get('or'),/sender_phone\.in\./);
  assert.doesNotMatch(params.get('or'),/receiver_phone/);
  assert.equal(params.get('scheduled_for'),'not.is.null');
  assert.match(params.get('select'),/delivery_status/);
  assert.equal(params.get('order'),'scheduled_for.asc');
  await lib.fetchCustomerOrders(['0619535029']);
  assert.equal(requests[1].searchParams.get('limit'),'200');
  assert.equal(requests[1].searchParams.get('order'),'created_at.desc');
  await lib.fetchCustomerOrders([]);await lib.fetchCustomerOrders(['invalid']);
  assert.equal(requests.length,2);
});
test('order updates and returning to the app refresh both views; cleanup removes listeners',()=>{
  const listeners=new Map();let eventConfig,callback,removed=false,refreshes=0;
  const channel={on(_type,config,cb){eventConfig=config;callback=cb;return channel;},subscribe(){return channel;}};
  const target={addEventListener:(event,cb)=>listeners.set(event,cb),removeEventListener:event=>listeners.delete(event)};
  const lib=load({channel:()=>channel,removeChannel:()=>{removed=true;}},{
    localStorage:{getItem:key=>key==='verifiedPhone'?'+252619535029':null},
    window:target,document:{...target,visibilityState:'visible'},
  });
  const cleanup=lib.watchCustomerOrders('test',()=>refreshes++);
  assert.equal(eventConfig.event,'*');
  callback({new:{customer_phone:'619535029',delivery_status:'delivered'},old:{}});
  callback({new:{customer_phone:'619999999',sender_phone:'619999998'},old:{}});
  assert.equal(refreshes,1);
  listeners.get('focus')();listeners.get('visibilitychange')();listeners.get('online')();
  assert.equal(refreshes,4);
  cleanup();assert.equal(removed,true);assert.equal(listeners.size,0);
});
