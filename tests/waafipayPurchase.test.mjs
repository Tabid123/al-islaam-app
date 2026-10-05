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
  vm.runInNewContext(js, { exports, require: name => dependencies[name], console, localStorage: dependencies.localStorage, crypto: globalThis.crypto, Request, Response, AbortSignal, Deno: { env: { get: () => 'test' } }, fetch: dependencies.fetch, setTimeout: dependencies.setTimeout || setTimeout, Date });
  return exports;
}
const packageId='11111111-1111-4111-8111-111111111111';
const providerId='22222222-2222-4222-8222-222222222222';
const paymentId='33333333-3333-4333-8333-333333333333';
const clientRef='44444444-4444-4444-8444-444444444444';
const scanId='55555555-5555-4555-8555-555555555555';
function harness(reply, options = {}) {
  const txs = []; const orders = []; const queue = []; let calls = 0; let charged = null; let handler; let resolved = 0; let finalized = 0; let readiness = 0;
  const pkg = { id: packageId, provider_id: providerId, category_id: null, package_name: 'Test', data_amount: '1GB', selling_price: 1.25, cost_price: 1, is_active: true, is_discovery_root: options.discovery || false, phone_prefix: '68', ussd_code: '*829#', somlink_bundle_id: options.somlink ? (options.bundleId ?? 20071) : null };
  const admin = { rpc: async (name,args) => {
      if(name==='enqueue_somlink_delivery') {
        const existing=queue.find(q=>q.order_id===args.p_order_id);
        if(!existing) {const o=orders.find(o=>o.id===args.p_order_id);queue.push({id:crypto.randomUUID(),order_id:o.id,
          receiver_phone:o.receiver_phone,provider_name:'Somlink',status:'pending',scheduled_at:o.scheduled_for});}
        return {data:args.p_order_id,error:null};
      }
      if(name==='waafipay_resolve_discovery_offer') {
        resolved++;
        if(options.resolveFailure) return {data:{success:false,error:options.resolveFailure}};
        assert.equal(args.p_discovery_id,scanId);assert.equal(args.p_index,'3');
        return {data:{success:true,offer:{discovery_id:scanId,index:'3',root_package_id:packageId,
          provider_id:providerId,label:'Internet 1 Saac',carrier_label:'$0.1=Internet 1 Saac',selling_price:0.11,cost_price:0.10}}};
      }
      if(name==='waafipay_finalize_discovery_purchase') {
        finalized++;
        if(options.finalizeFailsOnce && finalized===1) return {data:null,error:new Error('temporary DB failure')};
        const tx=txs.find(t=>t.id===args.p_transaction_id);
        assert.equal(tx.status,'approved');
        if(!tx.order_id){const order={id:crypto.randomUUID(),customer_phone:tx.raw_response.request_context.customer_phone,delivery_status:'pending'};
          orders.push(order);queue.push({id:crypto.randomUUID(),order_id:order.id,status:'pending'});tx.order_id=order.id;}
        return {data:{order_id:tx.order_id,delivery_queued:true}};
      }
      return {data:name==='is_phone_blocked'?false:{api_key:'test-only-key',merchant_uid:'test-only-merchant',api_user_id:'test-only-user',is_active:true,environment:'sandbox'}};
    },
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
          table==='data_packages_config'?[pkg]:table==='payment_providers_config'?[{id:paymentId,provider_name:options.paymentName || 'EVC PLUS',payment_mode:options.paymentMode || 'waafipay_api',is_active:true}]:
          table==='providers_config'?[{id:providerId,provider_name:options.somlink?'Somlink':'Somnet',is_active:true}]:
          table==='delivery_instructions' && !options.somlink?[{provider_id:providerId,package_id:null,category_id:null,code_template:'*829*{receiver_phone}*{cost_price}#',sim_password:''}]:[];
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
    './errors.ts': compile('supabase/functions/waafipay-purchase/errors.ts', {}),
    fetch: async (_url,init) => {
      if(_url.endsWith('/somlink-status')) {readiness++;return Response.json({configured:options.somlinkReady!==false});}
      calls++; charged=JSON.parse(init.body); if(reply instanceof Error)throw reply; return Response.json(typeof reply === 'function' ? await reply() : reply);},
  });
  return { backend, txs, orders, queue, get readiness(){return readiness;}, get calls(){return calls;}, get resolved(){return resolved;}, get finalized(){return finalized;}, get charged(){return charged;},
    async pay(overrides={}) {
      const response=await handler(new Request('https://example.test', {method:'POST',headers:{Authorization:'Bearer test', 'Content-Type':'application/json'}, body:JSON.stringify({client_reference:clientRef,payer_phone:'+252611111111',receiver_phone:'681111111',package_id:packageId,payment_provider_id:paymentId,...overrides})}));
      return {status:response.status,body:await response.json()};
    },
  };
}
const approved={responseCode:'2001',responseMsg:'RCS_SUCCESS',params:{state:'APPROVED',transactionId:'123456',txAmount:'1.25'}};

test('logged-in account owns a scheduled purchase funded by a different wallet', async()=>{
  const h=harness(approved);
  const when=new Date(Date.now()+3600000).toISOString();
  await h.pay({customer_phone:'+252 619 535 029',scheduled_for:when});
  assert.equal(h.orders[0].customer_phone,'619535029');
  assert.equal(h.orders[0].sender_phone,'611111111');
  assert.equal(h.orders[0].receiver_phone,'681111111');
  assert.equal(h.txs[0].raw_response.request_context.customer_phone,'619535029');
  assert.equal(h.txs[0].raw_response.request_context.scheduled_for,when);
  const status=await h.pay({action:'status',customer_phone:'0619535029'});
  assert.equal(status.body.order_id,h.orders[0].id);
  assert.equal(h.calls,1);assert.equal(h.queue.length,1);
});
test('a checkout reference cannot change app owner on purchase or status recovery', async()=>{
  const h=harness(approved);await h.pay({customer_phone:'619535029'});
  for(const action of ['purchase','status']) {
    const r=await h.pay({action,customer_phone:'619999999'});
    assert.equal(r.status,409);assert.equal(r.body.error,'reference_mismatch');
  }
  // Older clients can still recover their original attempt without the new field.
  assert.equal((await h.pay({action:'status'})).body.payment_approved,true);
  assert.equal(h.orders[0].customer_phone,'619535029');
  assert.equal(h.calls,1);assert.equal(h.orders.length,1);assert.equal(h.queue.length,1);
});
test('legacy clients retain payer ownership and invalid app phones never charge', async()=>{
  const h=harness(approved);await h.pay();
  assert.equal(h.orders[0].customer_phone,'611111111');
  for(const customer_phone of ['bad','', '1234']) {
    const invalid=harness(approved);const r=await invalid.pay({customer_phone});
    assert.equal(r.status,422);assert.equal(invalid.calls,0);assert.equal(invalid.orders.length,0);
  }
});

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
test('discovery roots without a verified selection are refused before any charge',async()=>{
  const h=harness(approved,{discovery:true});const r=await h.pay();
  assert.equal(r.status,422);assert.equal(h.calls,0);assert.equal(h.txs.length,0);
});
test('reference cannot be reused for a different receiver',async()=>{
  const h=harness(approved);await h.pay();const r=await h.pay({receiver_phone:'682222222'});
  assert.equal(r.status,409);assert.equal(h.calls,1);
});
test('status recovery never charges or creates a delivery, including missing and unknown references', async()=>{
  const h=harness(approved);
  assert.equal((await h.pay({action:'status'})).body.payment_status,'not_found');
  assert.equal(h.calls,0);assert.equal(h.txs.length,0);
  await h.pay();
  const status=await h.pay({action:'status'});
  assert.equal(status.body.payment_approved,true);assert.equal(status.body.delivery_queued,true);
  assert.equal(h.calls,1);assert.equal(h.orders.length,1);assert.equal(h.queue.length,1);
  assert.equal((await h.pay({action:'status',receiver_phone:'682222222'})).body.error,'reference_mismatch');
  const unknown=harness(new Error('lost provider response'));await unknown.pay();
  assert.equal((await unknown.pay({action:'status'})).body.payment_status,'unknown');
  assert.equal(unknown.calls,1);assert.equal(unknown.orders.length,0);
});
test('a pending purchase can be checked while the wallet PIN response is still outstanding',async()=>{
  let finish;const waiting=new Promise(resolve=>{finish=resolve;});
  const h=harness(()=>waiting);const purchase=h.pay();
  while(!h.calls) await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal((await h.pay({action:'status'})).body.payment_status,'processing');
  assert.equal(h.calls,1);assert.equal(h.orders.length,0);
  finish(approved);await purchase;
  assert.equal((await h.pay({action:'status'})).body.payment_approved,true);
  assert.equal(h.calls,1);
});
test('frontend recovers a lost approved response by reading status, without purchasing twice',async()=>{
  const bodies=[];
  const lib=compile('src/lib/waafiPay.ts', {'@/integrations/supabase/client':{supabase:{functions:{invoke:async(_name,{body})=>{
    bodies.push(body);
    if(!body.action) throw new Error('network lost after payment');
    return {data:{payment_approved:true,delivery_queued:true,order_id:'order',reference_id:'WP123'},error:null};
  }}}}});
  const input={client_reference:clientRef};const result=await lib.purchaseWithWaafiPay(input);
  assert.equal(result.payment_approved,true);assert.equal(bodies.length,2);
  assert.equal(bodies[1].action,'status');assert.equal(bodies[1].client_reference,clientRef);
});
test('status recovery preserves a definite rejection instead of showing an unknown payment',async()=>{
  const lib=compile('src/lib/waafiPay.ts', {'@/integrations/supabase/client':{supabase:{functions:{invoke:async(_name,{body})=>{
    if(!body.action) return {data:null,error:new Error('lost')};
    return {data:{error:'user_cancelled',title:'Waa la diiday',message:'Lacagta ma bixin.',safe_to_retry:true},error:null};
  }}}}});
  await assert.rejects(lib.purchaseWithWaafiPay({}),e=>e.code==='user_cancelled' && e.safeToRetry===true);
});
test('frontend waits for a processing attempt and never converts status polling into another debit',async()=>{
  let purchases=0;let statuses=0;
  const lib=compile('src/lib/waafiPay.ts', {setTimeout:resolve=>resolve(),
    '@/integrations/supabase/client':{supabase:{functions:{invoke:async(_name,{body})=>{
      if(!body.action) {purchases++;return {data:null,error:new Error('lost')};}
      statuses++;
      return {data:statuses<3 ? {payment_status:'processing',payment_approved:false} :
        {payment_approved:true,delivery_queued:true,reference_id:'WP123'},error:null};
    }}}}});
  assert.equal((await lib.purchaseWithWaafiPay({client_reference:clientRef})).payment_approved,true);
  assert.equal(purchases,1);assert.equal(statuses,3);
});
test('frontend resolves API before both dialer paths and hides its USSD confirmation',()=>{
  const page=fs.readFileSync('src/pages/PaymentProviders.tsx','utf8');
  assert.ok(page.indexOf("if (route === 'api')") < page.indexOf('OFFLINE MODE DETECTION'));
  const apiBranch=page.slice(page.indexOf("if (route === 'api')"),page.indexOf('OFFLINE MODE DETECTION'));
  assert.ok(apiBranch.includes('purchaseWithWaafiPay'));assert.ok(apiBranch.includes('return;'));assert.ok(!apiBranch.includes('tel:'));
  assert.ok(page.includes('{selectedIsApi ?'));
});


test('explicit mode overrides the display name in both directions', async()=>{
  const lib=compile('src/lib/waafiPay.ts', {'@/integrations/supabase/client':{}});
  assert.equal(lib.paymentRoute({provider_name:'EVC PLUS',payment_mode:'waafipay_api'},true),'api');
  assert.equal(lib.paymentRoute({provider_name:'WaafiPay',payment_mode:'ussd'},true),'ussd');
  const h=harness(approved,{paymentMode:'ussd',paymentName:'WaafiPay'});
  assert.equal((await h.pay()).body.error,'package_not_available');assert.equal(h.calls,0);
});
test('actual user rejection and Somali insufficient-balance responses stay distinct on retry', async()=>{
  for(const [reply,expected] of [
    [{responseCode:'5310',responseMsg:'RCS_USER_REJECTED'},'user_cancelled'],
    [{responseCode:'5206',responseMsg:'Payment Failed (Haraaga xisaabtaadu kuguma filna, haraagaagu waa: )'},'insufficient_balance'],
    [{responseCode:'5206',responseMsg:'Payment Failed (Invalid PIN)'},'wrong_pin'],
    [{responseCode:'5309',responseMsg:'RCS_HPP_USERACTION_TIMEOUT'},'payment_timeout'],
    [{responseCode:'5010',responseMsg:'You are not authorized to access the requested service'},'waafipay_not_authorized'],
    [{responseCode:'5206',responseMsg:'Payment Failed'},'payment_declined'],
  ]) {
    const h=harness(reply);const first=await h.pay();const retry=await h.pay();
    assert.equal(first.body.error,expected);assert.equal(retry.body.error,expected);
    assert.equal(first.body.safe_to_retry,true);assert.equal(h.calls,1);assert.equal(h.orders.length,0);
  }
});
test('pending and lost responses do not offer a fresh payment attempt', async()=>{
  const h=harness({responseCode:'2001',params:{state:'PENDING'}});
  const r=await h.pay();assert.equal(r.body.safe_to_retry,false);
  const lib=compile('src/lib/waafiPay.ts', {'@/integrations/supabase/client':{supabase:{functions:{invoke:async()=>({data:null,error:{context:{json:async()=>r.body}}})}}}});
  await assert.rejects(lib.purchaseWithWaafiPay({}),e=>e.safeToRetry===false && e.code==='payment_status_unknown');
});
test('API error details survive the client and override generic modal content', async()=>{
  const payload={error:'insufficient_balance',error_type:'insufficient_balance',title:'Haraaga kuma filna',message:'Ku shubo lacag.',safe_to_retry:true};
  const lib=compile('src/lib/waafiPay.ts', {'@/integrations/supabase/client':{supabase:{functions:{invoke:async()=>({data:null,error:{context:{json:async()=>payload}}})}}}});
  await assert.rejects(lib.purchaseWithWaafiPay({}),e=>e.errorType==='insufficient_balance' && e.title===payload.title && e.message===payload.message && e.safeToRetry);
  const modal=fs.readFileSync('src/components/PaymentErrorModal.tsx','utf8');
  assert.ok(modal.includes('errorMessage || content.message'));assert.ok(modal.includes('errorTitle || content.title'));assert.ok(modal.includes('{canRetry &&'));
});


test('catalog rejects old rows without mode and disabled WaafiPay even in cache',()=>{
  const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  const catalog=compile('src/lib/paymentProviders.ts',{'@/integrations/supabase/client':{},localStorage:storage});
  values.set('offline_payment_providers',JSON.stringify([{id:'evc',provider_name:'EVC PLUS',is_active:true},{id:'waafi',provider_name:'WaafiPay',is_active:true}]));
  assert.deepEqual(Array.from(catalog.readCachedPaymentProviders()),[]);
  values.set(catalog.PAYMENT_CACHE_KEY,JSON.stringify([{id:'evc',provider_name:'EVC PLUS',is_active:true,payment_mode:'waafipay_api'},{id:'waafi',is_active:false,payment_mode:'waafipay_api'},{id:'legacy',is_active:true}]));
  const result=catalog.readCachedPaymentProviders();assert.equal(result.length,1);assert.equal(result[0].payment_mode,'waafipay_api');
});
test('a slow prefetch cannot put old USSD mode or disabled WaafiPay back into the catalog',async()=>{
  const pending=[];const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  const client={from:()=>({select:()=>({eq:()=>({order:()=>new Promise(resolve=>pending.push(resolve))})})})};
  const catalog=compile('src/lib/paymentProviders.ts',{'@/integrations/supabase/client':{supabase:client},localStorage:storage});
  const old=catalog.fetchActivePaymentProviders();const fresh=catalog.fetchActivePaymentProviders();
  pending[1]({data:[{id:'evc',provider_name:'EVC PLUS',is_active:true,payment_mode:'waafipay_api'},{id:'waafi',is_active:false,payment_mode:'waafipay_api'}],error:null});
  await fresh;
  pending[0]({data:[{id:'evc',is_active:true,payment_mode:'ussd'},{id:'waafi',is_active:true,payment_mode:'waafipay_api'}],error:null});
  const result=await old;assert.equal(result.length,1);assert.equal(result[0].payment_mode,'waafipay_api');
  assert.equal(catalog.readCachedPaymentProviders()[0].payment_mode,'waafipay_api');
});
test('all checkout catalog writers use mode-aware fetching and payment rechecks live configuration',()=>{
  for(const path of ['src/hooks/useOfflineCache.ts','src/pages/DataPackages.tsx','src/pages/PaymentProviders.tsx']) {
    const source=fs.readFileSync(path,'utf8');assert.ok(!source.includes("rpc('get_active_payment_providers')"));assert.ok(source.includes('fetchActivePaymentProviders'));
  }
  const page=fs.readFileSync('src/pages/PaymentProviders.tsx','utf8');
  const pay=page.slice(page.indexOf('const handlePaymentComplete'),page.indexOf('// Show full-screen loading immediately'));
  assert.ok(pay.indexOf('await fetchActivePaymentProviders()')<pay.indexOf('const route = paymentRoute'));
  assert.ok(pay.includes('!selectedPaymentProvider || isApiPayment(previousProvider) !== isApiPayment(selectedPaymentProvider)'));
});

const discoveryInput={discovery_id:scanId,discovery_index:'3',expected_price:0.11,customer_phone:'619535029'};
const discoveryApproved={...approved,params:{...approved.params,txAmount:'0.11'}};
test('Maamuus charges the server catalog price and preserves its selected offer and account',async()=>{
  const h=harness(discoveryApproved,{discovery:true});
  const r=await h.pay({...discoveryInput,amount:0.01});
  assert.equal(r.body.payment_approved,true);assert.equal(r.body.delivery_queued,true);
  assert.equal(h.charged.serviceParams.transactionInfo.amount,'0.11');
  assert.equal(h.txs[0].raw_response.request_context.discovery.index,'3');
  assert.equal(h.txs[0].raw_response.request_context.discovery.cost_price,0.10);
  assert.equal(h.orders[0].customer_phone,'619535029');
  await h.pay(discoveryInput);await h.pay({...discoveryInput,action:'status'});
  assert.equal(h.calls,1);assert.equal(h.resolved,1);assert.equal(h.orders.length,1);assert.equal(h.queue.length,1);
});
test('expired, changed-price and unavailable offers never debit',async()=>{
  for(const resolveFailure of ['discovery_expired','discovery_price_changed','discovery_offer_unavailable']) {
    const h=harness(discoveryApproved,{discovery:true,resolveFailure});const r=await h.pay(discoveryInput);
    assert.equal(r.body.error,resolveFailure);assert.equal(h.calls,0);assert.equal(h.txs.length,0);
  }
});
test('a payment reference cannot switch to another Maamuus option or scan',async()=>{
  const h=harness(discoveryApproved,{discovery:true});await h.pay(discoveryInput);
  for(const change of [{discovery_index:'2'},{discovery_id:crypto.randomUUID()}]) {
    assert.equal((await h.pay({...discoveryInput,...change})).body.error,'reference_mismatch');
    assert.equal((await h.pay({...discoveryInput,...change,action:'status'})).body.error,'reference_mismatch');
  }
  assert.equal(h.calls,1);assert.equal(h.orders.length,1);
});
test('approved Maamuus fulfillment can resume after DB failure without resolving again or charging twice',async()=>{
  const h=harness(discoveryApproved,{discovery:true,finalizeFailsOnce:true});
  const first=await h.pay(discoveryInput);
  assert.equal(first.body.payment_approved,true);assert.equal(first.body.delivery_queued,false);
  assert.equal(h.orders.length,0);
  const status=await h.pay({...discoveryInput,action:'status'});
  assert.equal(status.body.payment_approved,true);assert.equal(status.body.delivery_queued,false);assert.equal(h.finalized,1);
  assert.equal((await h.pay(discoveryInput)).body.delivery_queued,true);
  assert.equal(h.calls,1);assert.equal(h.resolved,1);assert.equal(h.finalized,2);assert.equal(h.orders.length,1);
});
test('Maamuus decline and unknown responses never finalize delivery',async()=>{
  for(const reply of [{responseCode:'5310',params:{state:'DECLINED'}},new Error('timeout')]) {
    const h=harness(reply,{discovery:true});await h.pay(discoveryInput);
    assert.equal(h.finalized,0);assert.equal(h.orders.length,0);assert.equal(h.queue.length,0);
  }
});


test('Somlink checkout uses the API queue without any USSD instruction',async()=>{
  const h=harness(approved,{somlink:true});
  const r=await h.pay();
  assert.equal(r.body.payment_approved,true);assert.equal(r.body.delivery_queued,true);
  assert.equal(h.readiness,1);assert.equal(h.calls,1);
  assert.equal(h.queue[0].provider_name,'Somlink');assert.equal(h.queue[0].ussd_code,undefined);
  assert.equal(h.queue[0].receiver_phone,'681111111');
  await h.pay();await h.pay({action:'status'});
  assert.equal(h.calls,1);assert.equal(h.readiness,1);assert.equal(h.queue.length,1);
});
test('Somlink unavailable or missing bundle is rejected before charging',async()=>{
  for(const opts of [{somlinkReady:false},{bundleId:0},{bundleId:-1}]) {
    const h=harness(approved,{somlink:true,...opts});const r=await h.pay();
    assert.equal(r.status,409);assert.equal(r.body.safe_to_retry,true);
    assert.equal(h.calls,0);assert.equal(h.txs.length,0);assert.equal(h.queue.length,0);
  }
});
test('Somlink future orders preserve their due time in the API queue',async()=>{
  const when=new Date(Date.now()+3600000).toISOString();
  const h=harness(approved,{somlink:true});const r=await h.pay({scheduled_for:when});
  assert.equal(r.body.delivery_queued,true);assert.equal(h.queue[0].status,'pending');
  assert.equal(h.queue[0].scheduled_at,when);assert.equal(h.calls,1);
});
test('declined or uncertain Somlink payment cannot enqueue a delivery',async()=>{
  for(const reply of [{responseCode:'5310',params:{state:'DECLINED'}},new Error('lost response')]) {
    const h=harness(reply,{somlink:true});await h.pay();assert.equal(h.queue.length,0);assert.equal(h.orders.length,0);
  }
});
test('Somlink queue write interruption can recover without another debit',async()=>{
  const h=harness(approved,{somlink:true});await h.pay();h.queue.length=0;
  await h.pay();assert.equal(h.calls,1);assert.equal(h.orders.length,1);assert.equal(h.queue.length,1);
  h.queue[0].status='failed';await h.pay();assert.equal(h.queue[0].status,'failed');assert.equal(h.queue.length,1);
});
