export function paymentFailure(response: any, status: string) {
  const code = String(response?.responseCode || '');
  const state = String(response?.params?.state || '').toUpperCase();
  const text = String(response?.responseMsg || '').toLowerCase().replace(/_/g, ' ');
  const result = (error: string, error_type: string, title: string, message: string) => ({
    error, error_type, title, message, response_code: code, safe_to_retry: true,
  });
  // A lost response or a pending state cannot prove that no money was taken.
  if (status === 'unknown' || status === 'processing') return {
    ...result('payment_status_unknown', 'general', 'Xaaladda lacag-bixinta lama xaqiijin',
      'Lacag-bixinta wali lama xaqiijin. Ha bixin mar kale; la xiriir adeegga macaamiisha.'), safe_to_retry: false,
  };
  // 5206 is a general payment failure. Use its actual reason, not the code alone.
  if (/insufficient|not enough|no enough|haraag.*(?:kuguma|kuma|aan ku).*fil/.test(text))
    return result('insufficient_balance', 'insufficient_balance', 'Haraaga kuma filna', 'Haraaga xisaabtaada kuma filna lacag-bixintan. Lacag ku shubo, kadib isku day mar kale.');
  if (/wrong pin|incorrect pin|invalid pin|pin.*(?:khalad|sax ma)/.test(text))
    return result('wrong_pin', 'wrong_pin', 'PIN-ka waa khalad', 'PIN-ka aad gelisay waa khalad. Hubi PIN-kaaga, kadib isku day mar kale.');
  if (code === '5310' || code === '5306' || /user rejected|user cancel|customer reject|customer cancel/.test(text) || state === 'CANCELLED')
    return result('user_cancelled', 'user_cancelled', 'Waad diidday lacag-bixinta', 'Codsiga lacag-bixinta waa la diiday ama la xiray. Haddii aad rabto xirmada, isku day mar kale.');
  if (code === '5309' || /timeout|time out|expired|timed out/.test(text))
    return result('payment_timeout', 'timeout', 'Waqtigu wuu dhammaaday', 'Waqtigii xaqiijinta lacag-bixinta wuu dhammaaday. Isku day mar kale, oo codsiga waqtigiisa ku xaqiiji.');
  if (code === '5010' || code === '5301' || /not authorized|invalid.*credential|invalid api key/.test(text))
    return result('waafipay_not_authorized', 'general', 'Adeegga lacag-bixinta lama heli karo', 'WaafiPay ma oggola API-ga dukaankan. La xiriir adeegga macaamiisha ama dooro hab kale oo lacag-bixin ah.');
  if (/invalid.*(?:account|phone|number)|account.*not (?:found|exist)|lambar.*khalad/.test(text))
    return result('invalid_payer_account', 'general', 'Lambarka lacag-bixinta hubi', 'WaafiPay ma aqbalin lambarka lacag-bixinta. Hubi lambarka iyo akoonka lacagta.');
  if (/limit|xadka/.test(text))
    return result('payment_limit_exceeded', 'general', 'Xadka lacag-bixinta', 'Lacag-bixintu waxay dhaaftay xadka akoonka. Hubi xadka akoonkaaga ama dooro hab kale.');
  if (/blocked|suspended|locked/.test(text))
    return result('payer_account_blocked', 'general', 'Akoonka lacag-bixinta waa xanniban yahay', 'Akoonka lacag-bixinta lama isticmaali karo hadda. La xiriir shirkadda lacagta.');
  return result('payment_declined', 'general', 'Lacag-bixinta ma dhammaan',
    'WaafiPay ma dhammaystirin lacag-bixinta.' + (code ? ' Koodhka jawaabta: ' + code + '.' : '') + ' Hubi akoonkaaga ama la xiriir adeegga macaamiisha.');
}
