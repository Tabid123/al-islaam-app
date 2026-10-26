/**
 * AMTEL SOAP bundle purchasing client.
 * Server-only: configure credentials in the deployment secret store.
 * Never use this module from browser/Android code.
 *
 * A network timeout or malformed response is UNKNOWN, not a confirmed failure:
 * do not retry a possibly charged transaction without reconciling with AMTEL.
 */
const ENDPOINT = "https://topup.amtelevc.com:3000/payment/services/SYNCAPIRequestMgrService";
const API_NS = "http://cps.huawei.com/synccpsinterface/api_requestmgr";
const REQ_NS = "http://cps.huawei.com/synccpsinterface/request";
const COM_NS = "http://cps.huawei.com/synccpsinterface/common";
const xmlEscape = (v: string) => v.replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
})[c]!);

export type AmtelBundlePurchase = {
  receiver: string;
  offeringId: string;
  amount: number;
  conversationId: string; // stable per order/attempt, reused for reconciliation
};
export type AmtelSoapResult = {
  state: "success" | "rejected" | "unknown";
  resultCode?: string;
  resultDescription?: string;
  transactionId?: string;
  conversationId: string;
};
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing AMTEL secret: ${name}`);
  return value;
}
function tagValue(xml: string, tag: string): string | undefined {
  // SOAP result prefixes may differ. Read only known simple text fields.
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([^<]*)<\\/(?:[\\w-]+:)?${tag}>`, "i");
  return xml.match(re)?.[1]?.trim();
}
export async function purchaseAmtelBundle(input: AmtelBundlePurchase): Promise<AmtelSoapResult> {
  if (!/^25271\\d{7}$/.test(input.receiver)) throw new Error("Invalid AMTEL receiver MSISDN");
  if (!/^\\d{5,8}$/.test(input.offeringId)) throw new Error("Invalid AMTEL offering ID");
  if (!(Number.isFinite(input.amount) && input.amount > 0)) throw new Error("Invalid bundle amount");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.conversationId)) throw new Error("Invalid conversation ID");

  const initiator = required("AMTEL_INITIATOR");
  const party = required("AMTEL_RECEIVER_PARTY");
  const shortCode = process.env.AMTEL_SHORT_CODE || initiator;
  const thirdParty = required("AMTEL_THIRD_PARTY_ID");
  const password = required("AMTEL_API_PASSWORD");
  const securityCredential = required("AMTEL_SECURITY_CREDENTIAL");
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const E = xmlEscape;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="${API_NS}" xmlns:req="${REQ_NS}" xmlns:com="${COM_NS}">
<soapenv:Header/><soapenv:Body><api:Request>
<req:Header><req:Version>1.0</req:Version><req:CommandID>InitTrans_EVCBuyBundle</req:CommandID>
<req:OriginatorConversationID>${E(input.conversationId)}</req:OriginatorConversationID>
<req:Caller><req:CallerType>2</req:CallerType><req:ThirdPartyID>${E(thirdParty)}</req:ThirdPartyID>
<req:Password>${E(password)}</req:Password></req:Caller>
<req:KeyOwner>1</req:KeyOwner><req:Timestamp>${timestamp}</req:Timestamp></req:Header>
<req:Body><req:Identity><req:Initiator><req:IdentifierType>12</req:IdentifierType>
<req:Identifier>${E(initiator)}</req:Identifier>
<req:SecurityCredential>${E(securityCredential)}</req:SecurityCredential>
<req:ShortCode>${E(shortCode)}</req:ShortCode></req:Initiator>
<req:ReceiverParty><req:IdentifierType>4</req:IdentifierType>
<req:Identifier>${E(party)}</req:Identifier></req:ReceiverParty></req:Identity>
<req:TransactionRequest><req:Parameters>
<req:Parameter><com:Key>RechargedMSISDN</com:Key><com:Value>${E(input.receiver)}</com:Value></req:Parameter>
<req:Amount>${input.amount.toFixed(2)}</req:Amount><req:Currency>USD</req:Currency>
</req:Parameters></req:TransactionRequest>
<req:ReferenceData><req:ReferenceItem><com:Key>OfferingId</com:Key>
<com:Value>${E(input.offeringId)}</com:Value></req:ReferenceItem></req:ReferenceData>
<req:Remark>${E(input.conversationId)}</req:Remark>
</req:Body></api:Request></soapenv:Body></soapenv:Envelope>`;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 20000);
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8" },
      body: xml, signal: abort.signal
    });
    const body = await response.text();
    const resultCode = tagValue(body, "ResultCode");
    const resultDescription = tagValue(body, "ResultDesc");
    const transactionId = tagValue(body, "TransactionID");
    // Never echo SOAP responses: they can include private account information.
    if (!response.ok || !resultCode || /<(?:\\w+:)?Fault\\b/i.test(body)) {
      return { state: "unknown", resultCode, resultDescription, transactionId, conversationId: input.conversationId };
    }
    return {
      state: resultCode === "0" ? "success" : "rejected",
      resultCode, resultDescription, transactionId, conversationId: input.conversationId
    };
  } catch {
    return { state: "unknown", conversationId: input.conversationId };
  } finally { clearTimeout(timer); }
}
