import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function compile(path, dependencies) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { exports, require: name => dependencies[name], console, crypto: globalThis.crypto, Request, Response, AbortSignal, Deno: { env: { get: () => 'test' } }, fetch: dependencies.fetch, setTimeout, Date });
  return exports;
}
const packageId='11111111-1111-4111-8111-111111111111';
const providerId='22222222-2222-4222-8222-222222222222';
const paymentId='33333333-3333-4333-8333-333333333333';
const clientRef='44444444-4444-4444-8444-444444444444';
function harness(reply, options = {}) {
  const txs = []; const orders = []; const queue = []; let calls = 0; let charged = null; let handler;
  const pkg = { id: packageId, provider_id: providerId, category_id: null, package_name: 'Test', data_amount: '1GB', selling_price: 1.25, cost_price: 1, is_active: true, is_discovery_root: options.discovery || false, phone_prefix: '68', ussd_code: '*829#' };
  const admin = { rpc: async name => ({ data: name === 'is_phone_blocked' ? false : { api_key: 'test-only-key', merchant_uid: 'test-only-merchant', api_user_id: 'test-only-user', is_active: true, environment: 'sandbox' } }),
    from(table) {
      let action='select', values, filters=[], selected=false, head=false;
      const q = {
        select(_fields, opts) { selected=true; head=opts?.head; return q; },
        eq(k,v) { filters.push(row => row[k]===v); return q; }, is(k,v) { filters.push(row => (row[k] ?? null)===v); return q; },
        in(k,v) { filters.push(row=>v.includes(row[k])); return q; }, gte() { return q; }, order() { return q; }, limit() { return q; },
        insert(v) { action='insert'; values=v; return q; }, update(v) { action='update'; values=v; return q; },
        async single() { return run(true); }, async maybeSingle() { return run(true); }, then(ok,err) { return Promise.resolve(run(false)).then(ok,err); },
      };
      function run(single) {
        let rows = table==='waafipay_transactions'?txs:table==='orders'?orders:table==='delivery_queue'?queue:
          table==='data_packages_config'?[pkg]:table==='payment_providers_config'?[{id:paymentId,provider_name:'WaafiPay',is_active:true}]:
          table==='providers_config'?[{id:providerId,provider_name:'Somnet',is_active:true}]:
          table==='delivery_instructions'?[{provider_id:providerId,package_id:null,category_id:null,code_template:'*829*{receiver_phone}*{cost_price}#',sim_password:''}]:[];
        if(action==='insert') {
          const record={id:crypto.randomUUID(),...values};
          if(table==='waafipay_transactions' && txs.some(t=>t.client_reference===record.client_reference)) return {data:null,error:{code:'23505'}};
          rows.push(record); return {data:single?record:[record],error:null};
        }
        rows=rows.filter(row=>filters.every(f=>f(row)));
        if(action==='update') rows.forEach(row=>Object.assign(row,values));
        return {data:head?null:single?(rows[0]||null):rows.map(row=>({...row})),count:rows.length,error:null};
      }
      return q;
    },
  };
  const helpers = compile('supabase/functions/waafipay-purchase/delivery.ts', {});
  const backend = compile('supabase/functions/waafipay-purchase/index.ts', {
    'https://deno.land/std@0.168.0/http/server.ts': {serve: h=>{handler=h;}},
    'https://esm.sh/@supabase/supabase-js@2.57.4': {createClient:()=>admin},
    './delivery.ts': helpers,
    fetch: async (_url,init) => {calls++; charged=JSON.parse(init.body); if(reply instanceof Error)throw reply; return Response.json(reply);},
  });
  return { backend, txs, orders, queue, get calls(){return calls;}, get charged(){return charged;},
    async pay(overrides={}) {
      const response=await handler(new Request('https://example.test', {method:'POST',headers:{Authorization:'Bearer test', 'Content-Type':'application/json'}, body:JSON.stringify({client_reference:clientRef,payer_phone:'+252611111111',receiver_phone:'681111111',package_id:packageId,payment_provider_id:paymentId,...overrides})}));
      return {status:response.status,body:await response.json()};
    },
  };
}
const approved={responseCode:'2001',responseMsg:'RCS_SUCCESS',params:{state:'APPROVED',transactionId:'123456',txAmount:'1.25'}};

test('API and offline routing never fall back to USSD',()=>{
  const lib=compile('src/lib/waafiPay.ts', {'@/integrations/supabase/client':{}});
  assert.equal(lib.paymentRoute({provider_name:' WaafiPay '},true),'api');
  assert.equal(lib.paymentRoute({provider_name:'WaafiPay'},false),'unavailable');
  assert.equal(lib.paymentRoute(undefined,true),'unavailable');
  assert.equal(lib.paymentRoute({provider_name:'EVC PLUS'},true),'ussd');
  assert.equal(lib.paymentRoute({provider_name:'JEEB'},false),'ussd');
});
test('approved purchase uses database price and queues receiver, never payer',async()=>{
  const h=harness(approved);const r=await h.pay({amount:0.01});
  assert.equal(r.body.payment_approved,true);assert.equal(r.body.delivery_queued,true);
  assert.equal(h.charged.serviceName,'API_PURCHASE');assert.equal(h.charged.serviceParams.transactionInfo.amount,'1.25');
  assert.equal(h.charged.serviceParams.payerInfo.accountNo,'252611111111');
  assert.equal(h.orders[0].receiver_phone,'681111111');assert.equal(h.queue[0].receiver_phone,'681111111');
  assert.equal(h.queue[0].status,'pending');
});
test('same reference can safely resume without charging or queuing twice',async()=>{
  const h=harness(approved);await h.pay();await h.pay();
  assert.equal(h.calls,1);assert.equal(h.orders.length,1);assert.equal(h.queue.length,1);
});
test('decline creates no order or delivery',async()=>{
  const h=harness({responseCode:'5310',params:{state:'DECLINED'}});const r=await h.pay();
  assert.equal(r.status,402);assert.equal(h.orders.length,0);assert.equal(h.queue.length,0);
});
test('unknown/timeout keeps reference blocked and never delivers',async()=>{
  for (const reply of [new Error('timeout'),{responseCode:'2001',params:{state:'PENDING'}},{...approved,params:{...approved.params,txAmount:'0.01'}}]) {
    const h=harness(reply);await h.pay();await h.pay();
    assert.equal(h.calls,1);assert.equal(h.txs[0].status,'unknown');assert.equal(h.orders.length,0);
  }
});
test('scheduled delivery is scheduled before insertion',async()=>{
  const h=harness(approved);const when=new Date(Date.now()+3600000).toISOString();await h.pay({scheduled_for:when});
  assert.equal(h.queue[0].status,'scheduled');assert.equal(h.queue[0].scheduled_at,when);
});
test('dynamic root packages are refused before any API charge',async()=>{
  const h=harness(approved,{discovery:true});const r=await h.pay();
  assert.equal(r.status,422);assert.equal(h.calls,0);assert.equal(h.txs.length,0);
});
test('reference cannot be reused for a different receiver',async()=>{
  const h=harness(approved);await h.pay();const r=await h.pay({receiver_phone:'682222222'});
  assert.equal(r.status,409);assert.equal(h.calls,1);
});
test('frontend resolves API before both dialer paths and hides its USSD confirmation',()=>{
  const page=fs.readFileSync('src/pages/PaymentProviders.tsx','utf8');
  assert.ok(page.indexOf("if (route === 'api')") < page.indexOf('OFFLINE MODE DETECTION'));
  const apiBranch=page.slice(page.indexOf("if (route === 'api')"),page.indexOf('OFFLINE MODE DETECTION'));
  assert.ok(apiBranch.includes('purchaseWithWaafiPay'));assert.ok(apiBranch.includes('return;'));assert.ok(!apiBranch.includes('tel:'));
  assert.ok(page.includes('{selectedIsApi ?'));
});
