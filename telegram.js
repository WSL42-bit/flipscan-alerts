var API = function () { return 'https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN; };

async function call(method, body) {
  try {
    var res = await fetch(API() + '/' + method, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if (!data.ok) console.error('Telegram ' + method + ' fout:', data.description);
    return data;
  } catch (e) {
    console.error('Telegram ' + method + ' exception:', e.message);
    return { ok: false };
  }
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

var PLATFORM_LABEL = { marktplaats: '🟠 Marktplaats', vinted: '🟢 Vinted', ebay: '🔵 eBay' };

async function sendListing(chatId, item, query) {
  var price = item.price != null ? '€' + item.price.toFixed(2).replace('.', ',') : (item.priceLabel || 'Prijs onbekend');
  var caption = '<b>' + esc(item.title) + '</b>\n' +
    '💶 ' + price + '\n' +
    PLATFORM_LABEL[item.platform] + (item.location ? ' · ' + esc(item.location) : '') + '\n' +
    '🔎 ' + esc(query);
  var markup = { inline_keyboard: [[{ text: 'Bekijk advertentie', url: item.url }]] };
  if (item.image) {
    var r = await call('sendPhoto', { chat_id: chatId, photo: item.image, caption: caption, parse_mode: 'HTML', reply_markup: markup });
    if (r.ok) return r;
    // Rate-limited or ambiguous photo delivery must not immediately retry as text.
    if (!r.error_code || r.error_code === 429 || r.error_code >= 500) return r;
  }
  return call('sendMessage', { chat_id: chatId, text: caption, parse_mode: 'HTML', reply_markup: markup, disable_web_page_preview: true });
}

function sendMessage(chatId, text, extra) {
  var body = { chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (extra) Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
  return call('sendMessage', body);
}

module.exports = { call: call, sendListing: sendListing, sendMessage: sendMessage, esc: esc };
