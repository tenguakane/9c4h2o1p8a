// Чистая логика проверки колоды (без Firebase), чтобы её можно было тестировать локально.
// Колода = JSON из tops/{uid}.deck: { packs, owned:{ключ:количество}, belli, ... }.
const L = {
  BELLI_MAX: 5_000_000,      // абсолютный потолок белли
  PACKS_MAX: 300,            // потолок непрочитанных наборов
  COUNT_MAX: 999,            // потолок копий одной карточки
  SELL_MAX: 96_000,          // дороже одной карточки (вариант) продать нельзя
  ACH_BELLI_MAX: 25_000,     // максимум белли за одно достижение (самая крупная награда)
  PIG_MAX: 200_000,          // потолок суммы в копилке
  DAILY_MAX: 1_000,          // ежедневная награда за вход
  QUIZ_SLACK: 1_100,         // опрос: потолок 1000 в день + запас
  CARDS_PER_PACK: 7,         // с запасом: в наборе до 5 карточек + бонусы
  CARD_SLACK: 30,            // подарки, магазин, достижения, переработка
  PACK_GAIN_SLACK: 60,       // прирост наборов за одну запись (таймер + достижения)
  START_BELLI_MAX: 5_000,    // с чем можно впервые появиться в облаке
  START_CARDS_MAX: 800,      // и сколько карточек (человек мог играть только локально)
};

function parse(s) {
  try { const d = typeof s === 'string' ? JSON.parse(s) : s; return d && typeof d === 'object' ? d : null; } catch (e) { return null; }
}
function total(o) { let n = 0; for (const k in (o || {})) { const v = +o[k]; if (v > 0) n += v; } return n; }

/**
 * prev, next — разобранные колоды (prev может быть null).
 * ctx: { marketIn: сумма белли с проданных на аукционе лотов с прошлой записи,
 *        tradeIn: сколько карточек пришло по принятым обменам с прошлой записи }
 * Возвращает { ok, reasons[] }.
 */
function check(prev, next, ctx) {
  ctx = ctx || {};
  const r = [];
  if (!next) return { ok: true, reasons: r };
  const belli = +next.belli || 0, packs = +next.packs || 0;
  if (!Number.isFinite(belli) || belli < 0 || belli > L.BELLI_MAX) r.push('belli вне допустимых пределов: ' + belli);
  if (!Number.isFinite(packs) || packs < 0 || packs > L.PACKS_MAX) r.push('packs вне допустимых пределов: ' + packs);
  for (const k in (next.owned || {})) {
    const v = next.owned[k];
    if (!Number.isInteger(v) || v < 0 || v > L.COUNT_MAX) { r.push('owned[' + k + '] = ' + v); break; }
  }
  const nCards = total(next.owned);
  if (!prev) {
    if (belli > L.START_BELLI_MAX) r.push('первая запись: белли ' + belli);
    if (nCards > L.START_CARDS_MAX) r.push('первая запись: карточек ' + nCards);
    return { ok: !r.length, reasons: r };
  }
  const pBelli = +prev.belli || 0, pPacks = +prev.packs || 0, pCards = total(prev.owned);
  const removed = Math.max(0, pCards - nCards);
  const opened = Math.max(0, pPacks - packs);
  const gainB = belli - pBelli;
  const newAch = Object.keys((next && next.achB) || {}).filter((k) => !((prev && prev.achB) || {})[k]).length;
  const newDaily = next.daily && (!prev.daily || next.daily.last !== prev.daily.last) ? 1 : 0;
  const newAchAny = Object.keys((next && next.ach) || {}).filter((k) => !((prev && prev.ach) || {})[k]).length;
  const now = ctx.now || Date.now();
  const pPig = prev.pig && +prev.pig.amt > 0 ? prev.pig : null, nPig = next.pig && +next.pig.amt > 0 ? next.pig : null;
  const pigRel = pPig && !nPig && now >= (+pPig.until || 0) - 120000 ? Math.ceil(pPig.amt * 1.05) + 5 : 0;
  const pigIn = !pPig && nPig ? +nPig.amt : 0;
  if (nPig && (nPig.amt > L.PIG_MAX || nPig.amt < 0)) r.push('копилка: сумма ' + nPig.amt);
  if (pPig && nPig && nPig.amt > pPig.amt) r.push('копилка: сумма выросла без внесения');
  const allowB = L.QUIZ_SLACK + removed * L.SELL_MAX + (ctx.marketIn || 0) + newAch * L.ACH_BELLI_MAX + newDaily * L.DAILY_MAX + pigRel;
  if (pigIn && gainB + pigIn > allowB) r.push('копилка: белли не списаны (' + pigIn + ')');
  if (gainB > allowB) r.push('белли +' + gainB + ' при допустимых ' + allowB + ' (продано карточек: ' + removed + ')');
  const gainC = nCards - pCards;
  const allowC = opened * L.CARDS_PER_PACK + (ctx.tradeIn || 0) + L.CARD_SLACK + (newAchAny + newDaily) * L.CARDS_PER_PACK;
  if (gainC > allowC) r.push('карточек +' + gainC + ' при допустимых ' + allowC + ' (открыто наборов: ' + opened + ')');
  if (packs - pPacks > L.PACK_GAIN_SLACK) r.push('наборов +' + (packs - pPacks));
  return { ok: !r.length, reasons: r };
}
module.exports = { L, parse, total, check };
