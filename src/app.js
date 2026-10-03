(function () {
  "use strict";

  var SUPABASE_URL = "https://vtumfsioubfpxyzqzham.supabase.co";
  var SUPABASE_KEY = "sb_publishable_zqw79LAhyzGTryYC7Cdrxw_QiOhgzAi";
  var SITE_URL = location.origin + location.pathname;
  var LOCAL_KEY = "markthalle-local-v2";
  var STR = window.MH_STRINGS;

  var CATS = [
    { id: "handicraft", h: 330 }, { id: "clothing", h: 280 }, { id: "carpets", h: 14 }, { id: "jewelry", h: 45 },
    { id: "food", h: 85 }, { id: "dryfruit", h: 30 }, { id: "beauty", h: 310 }, { id: "home", h: 140 },
    { id: "electronics", h: 205 }, { id: "books", h: 255 }, { id: "other", h: 190 }
  ];
  var PROVINCES = [
    ["Badakhshan", "بدخشان"], ["Badghis", "بادغیس"], ["Baghlan", "بغلان"], ["Balkh", "بلخ"], ["Bamyan", "بامیان"], ["Daykundi", "دایکندی"],
    ["Farah", "فراه"], ["Faryab", "فاریاب"], ["Ghazni", "غزنی"], ["Ghor", "غور"], ["Helmand", "هلمند"], ["Herat", "هرات"],
    ["Jowzjan", "جوزجان"], ["Kabul", "کابل"], ["Kandahar", "قندهار"], ["Kapisa", "کاپیسا"], ["Khost", "خوست"], ["Kunar", "کنر"],
    ["Kunduz", "کندز"], ["Laghman", "لغمان"], ["Logar", "لوگر"], ["Nangarhar", "ننگرهار"], ["Nimruz", "نیمروز"], ["Nuristan", "نورستان"],
    ["Paktia", "پکتیا"], ["Paktika", "پکتیکا"], ["Panjshir", "پنجشیر"], ["Parwan", "پروان"], ["Samangan", "سمنگان"], ["Sar-e Pol", "سرپل"],
    ["Takhar", "تخار"], ["Uruzgan", "ارزگان"], ["Wardak", "میدان وردک"], ["Zabul", "زابل"]
  ];
  var COUNTRY_CODES = ["AF", "IR", "PK", "TJ", "UZ", "TM", "TR", "AE", "SA", "QA", "IN", "DE", "AT", "NL", "SE", "DK", "FR", "BE", "IT", "ES", "GB", "NO", "CH", "US", "CA", "AU"];
  var EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
  var ZONES = ["inland", "eu", "welt"];
  var CONDS = ["new", "like_new", "good", "acceptable", "defect"];
  var UNITS = ["piece", "pack", "box", "dozen", "kg", "liter", "meter"];
  var CURRENCIES = ["AFN", "USD", "EUR"];
  var PAYS = ["cash", "mobile", "hawala"];
  var MIN = 60000;
  var LANGS = [["fa", "دری"], ["ps", "پښتو"], ["en", "English"]];

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Language ---------- */
  var local = loadLocal();
  var lang = local.lang;
  function defaultLang() {
    var n = (navigator.language || "").toLowerCase();
    if (n.indexOf("ps") === 0) return "ps";
    return "fa";
  }
  function t(key, vars) {
    var s = (STR[lang] && STR[lang][key]) || STR.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }
  function locale() { return lang === "en" ? "en-GB" : lang + "-AF"; }
  var nf, dn;
  function setupIntl() {
    try { nf = new Intl.NumberFormat(locale()); } catch (e) { nf = new Intl.NumberFormat("en"); }
    try { dn = new Intl.DisplayNames([locale()], { type: "region" }); } catch (e) { dn = null; }
  }
  function applyLang() {
    document.documentElement.lang = lang === "fa" ? "fa-AF" : lang === "ps" ? "ps-AF" : "en";
    document.documentElement.dir = lang === "en" ? "ltr" : "rtl";
    setupIntl();
    document.title = t("site_name");
    document.querySelectorAll("[data-t]").forEach(function (el) { el.textContent = t(el.getAttribute("data-t")); });
    document.querySelectorAll("[data-tp]").forEach(function (el) { el.setAttribute("placeholder", t(el.getAttribute("data-tp"))); });
    document.querySelectorAll("[data-ta]").forEach(function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-ta"))); });
  }

  if (!window.supabase || !window.supabase.createClient) {
    applyLang();
    $("main").innerHTML = '<div class="empty"><b>' + t("load_fail_title") + "</b>" + t("load_fail_body") + "</div>";
    return;
  }
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  /* ---------- State ---------- */
  var uid = null, me = null, userEmail = "";
  var listings = [], watchSet = {}, convs = [], purchases = [], sales = [];
  var loaded = false, loadError = "";
  var ui = { q: "", cat: "", type: "all", seller: "all", origin: "all", deliverOnly: true, sort: "new", view: "browse", tab: "listings" };

  function loadLocal() {
    var d = { cart: [], shipTo: "AF", lang: "" };
    try { var r = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null"); if (r) { d.cart = Array.isArray(r.cart) ? r.cart : []; d.shipTo = r.shipTo || "AF"; d.lang = r.lang || ""; } } catch (e) {}
    if (["fa", "ps", "en"].indexOf(d.lang) < 0) d.lang = defaultLang();
    return d;
  }
  function saveLocal() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(local)); } catch (e) {} }

  /* ---------- Helpers ---------- */
  function money(v, cur) {
    try { return new Intl.NumberFormat(locale(), { style: "currency", currency: cur || "AFN", maximumFractionDigits: cur === "AFN" ? 0 : 2 }).format(v); }
    catch (e) { return num(v) + " " + (cur || ""); }
  }
  function num(v) { return nf.format(v); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function catOf(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return CATS[CATS.length - 1]; }
  function cname(code) { if (!code) return ""; try { return (dn && dn.of(code)) || code; } catch (e) { return code; } }
  function provName(p) { for (var i = 0; i < PROVINCES.length; i++) if (PROVINCES[i][0] === p) return lang === "en" ? PROVINCES[i][0] : PROVINCES[i][1]; return p; }
  function sep() { return lang === "en" ? ", " : "، "; }
  function place(l) { return (l.country === "AF" ? provName(l.loc) : l.loc) + sep() + cname(l.country); }
  function byId(id) { for (var i = 0; i < listings.length; i++) if (listings[i].id === id) return listings[i]; return null; }
  function parseNum(v) {
    var s = String(v == null ? "" : v).trim()
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/٫/g, ".").replace(/٬/g, "").replace(",", ".");
    return s === "" ? NaN : Number(s);
  }
  function round2(v) { return Math.round(v * 100) / 100; }
  function fmtDate(ts) { try { return new Date(ts).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return new Date(ts).toLocaleString(); } }
  function fmtDay(ts) { try { return new Date(ts).toLocaleDateString(locale()); } catch (e) { return new Date(ts).toLocaleDateString(); } }
  function mask(n) { n = String(n || "?"); return n.length <= 2 ? n[0] + "***" : n[0] + "***" + n[n.length - 1]; }
  function errMsg(e) {
    var m = (e && (e.message || e.error_description)) || String(e || "");
    var mh = /MH:([a-z_]+)(?:\|([^|]*))?(?:\|([^|]*))?/.exec(m);
    if (mh) {
      var c = mh[1], a = mh[2], b = mh[3];
      if (c === "min_bid") return t("err_min_bid", { amount: money(Number(a), b) });
      return t("err_" + c, { title: a || "", n: b ? num(Number(b)) : "" });
    }
    if (/Invalid login credentials/i.test(m)) return t("err_credentials");
    if (/Email not confirmed/i.test(m)) return t("err_email_unconfirmed");
    if (/already registered/i.test(m)) return t("err_registered");
    if (/rate limit|too many/i.test(m)) return t("err_rate_limit");
    if (/Password should be at least/i.test(m)) return t("err_password_short");
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return t("err_network");
    if (/permission denied|JWT|not authenticated/i.test(m)) return t("err_login");
    if (/payload too large|exceeded the maximum/i.test(m)) return t("err_image_size");
    return m || t("err_unknown");
  }
  var HEART_PATH = '<path d="M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.8 1.3-1.7 2.9-2.8 4.9-2.8 3.5 0 5.4 3.5 4.3 6.7-1.7 4.7-9.2 9.3-9.2 9.3z"/>';
  var HEART = '<svg viewBox="0 0 24 24" aria-hidden="true">' + HEART_PATH + "</svg>";

  /* ---------- Data ---------- */
  function mapListing(r) {
    var bids = (r.bids || []).map(function (b) {
      return { id: b.id, whoId: b.bidder_id, who: b.bidder ? b.bidder.display_name : "?", amount: Number(b.amount), t: Date.parse(b.created_at), buyNow: b.is_buy_now };
    }).sort(function (a, b) { return a.amount - b.amount || a.t - b.t; });
    return {
      id: r.id, sellerId: r.seller_id, seller: r.seller ? r.seller.display_name : "?", sellerType: r.seller_type,
      type: r.type, title: r.title, cat: r.cat, cond: r.cond, desc: r.descr, country: r.country, loc: r.loc, cur: r.currency, pays: r.pay_methods || ["cash"],
      price: r.price == null ? null : Number(r.price), stock: r.stock, unit: r.unit,
      tiers: (r.tiers || null) && r.tiers.map(function (x) { return { min: Number(x.min), price: Number(x.price) }; }),
      start: r.start_price == null ? null : Number(r.start_price), buyNow: r.buy_now == null ? 0 : Number(r.buy_now),
      endsAt: r.ends_at ? Date.parse(r.ends_at) : null, ship: r.ship || {}, pickup: r.pickup, img: r.img_url, sold: r.sold,
      createdAt: Date.parse(r.created_at), bids: bids
    };
  }
  function loadListings() {
    return sb.from("listings")
      .select("*, seller:profiles!listings_seller_id_fkey(display_name), bids(id,bidder_id,amount,is_buy_now,created_at,bidder:profiles(display_name))")
      .order("created_at", { ascending: false }).limit(500)
      .then(function (res) {
        if (res.error) throw res.error;
        listings = res.data.map(mapListing); loaded = true; loadError = "";
      });
  }
  function loadMine() {
    if (!uid) { me = null; watchSet = {}; convs = []; purchases = []; sales = []; return Promise.resolve(); }
    return Promise.all([
      sb.rpc("my_profile"),
      sb.from("watch").select("listing_id"),
      sb.from("conversations").select("*, buyer:profiles!conversations_buyer_id_fkey(display_name), seller:profiles!conversations_seller_id_fkey(display_name)").order("last_at", { ascending: false }),
      sb.from("orders").select("*, order_items(*), seller:profiles!orders_seller_id_fkey(display_name)").eq("buyer_id", uid).order("created_at", { ascending: false }),
      sb.from("orders").select("*, order_items(*), buyer:profiles!orders_buyer_id_fkey(display_name)").eq("seller_id", uid).order("created_at", { ascending: false })
    ]).then(function (r) {
      for (var i = 0; i < r.length; i++) if (r[i].error) throw r[i].error;
      me = r[0].data;
      watchSet = {}; r[1].data.forEach(function (w) { watchSet[w.listing_id] = true; });
      convs = r[2].data; purchases = r[3].data; sales = r[4].data;
    });
  }
  function refresh() {
    return Promise.resolve()
      .then(function () { return Promise.all([loadListings(), loadMine()]); })
      .catch(function (e) { loadError = errMsg(e); })
      .then(render);
  }
  function isUnread(c) {
    var mine = c.buyer_id === uid ? c.buyer_read_at : c.seller_read_at;
    return Date.parse(c.last_at) > Date.parse(mine) + 500;
  }
  function unreadCount() { return convs.filter(isUnread).length; }

  /* ---------- Rules ---------- */
  function zoneOf(from, to) { if (from === to) return "inland"; if (EU.indexOf(from) > -1 && EU.indexOf(to) > -1) return "eu"; return "welt"; }
  function shipFor(l, to) {
    var zn = zoneOf(l.country, to), s = l.ship[zn];
    if (s && typeof s === "object") return { zone: zn, cost: Number(s.c), days: s.d, pickup: false };
    if (zn === "inland" && l.pickup) return { zone: zn, cost: 0, days: null, pickup: true };
    return null;
  }
  function customs(l, to) { return zoneOf(l.country, to) === "welt"; }
  function shipShort(l, to) {
    var s = shipFor(l, to);
    if (!s) return t("no_delivery_to", { country: cname(to) });
    if (s.pickup) return t("pickup_only");
    return (s.cost === 0 ? t("free_shipping") : t("shipping_x", { amount: money(s.cost, l.cur) })) + (s.days ? " · " + t("days_x", { d: s.days }) : "");
  }
  function isMine(l) { return !!uid && l.sellerId === uid; }
  function sellerName(l) { return isMine(l) ? t("you") : l.seller; }
  function topBid(l) { return l.bids.length ? l.bids[l.bids.length - 1] : null; }
  function ended(l) { return l.type === "auction" && Date.now() >= l.endsAt; }
  function step(v, cur) { return cur === "AFN" ? (v < 1000 ? 10 : v < 10000 ? 50 : 100) : (v < 50 ? 1 : v < 500 ? 5 : 10); }
  function minNext(l) { var tb = topBid(l); return tb ? tb.amount + step(tb.amount, l.cur) : l.start; }
  function iWon(l) { var tb = topBid(l); return ended(l) && tb && tb.whoId === uid; }
  function buyNowOpen(l) { return l.type === "auction" && l.buyNow > 0 && !l.bids.length && !ended(l) && !l.sold; }
  function moq(l) { return l.type === "wholesale" ? l.tiers[0].min : 1; }
  function unitPrice(l, qty) {
    if (l.type === "auction") { var tb = topBid(l); return tb ? tb.amount : l.start; }
    if (l.type === "fixed") return l.price;
    var p = l.tiers[0].price;
    l.tiers.forEach(function (x) { if (qty >= x.min) p = x.price; });
    return p;
  }
  function fromPrice(l) { return l.type === "wholesale" ? l.tiers[l.tiers.length - 1].price : unitPrice(l, 1); }
  function inStock(l) { return l.type === "auction" ? !l.sold : l.stock >= moq(l); }
  function canBuy(l) {
    if (isMine(l) || !inStock(l)) return false;
    if (l.type === "auction") return iWon(l);
    return true;
  }
  function canEdit(l) { return isMine(l) && (l.type !== "auction" || (!l.sold && !l.bids.length && !ended(l))); }
  function canDelete(l) { return isMine(l) && !l.bids.length; }
  function unitName(u) { return u ? t("unit_" + u) : t("unit_piece"); }

  function needLogin(msgKey) {
    if (uid) return false;
    openAuth("login", t(msgKey || "login_needed"));
    return true;
  }

  /* ---------- Small views ---------- */
  function left(ms) {
    if (ms <= 0) return t("ended");
    var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    if (d > 0) return t("left_dh", { d: num(d), h: num(h) });
    if (h > 0) return t("left_hm", { h: num(h), m: num(m) });
    return t("left_ms", { m: num(m), s: num(sec) });
  }
  function leftSpan(l) {
    var ms = l.endsAt - Date.now();
    return '<span class="left ' + (ms <= 0 ? "over" : ms < 10 * MIN ? "soon" : "") + '" data-end="' + l.endsAt + '">' + left(ms) + "</span>";
  }
  function imgInner(l, withLabel) {
    var c = catOf(l.cat);
    if (l.img) return '<img src="' + esc(l.img) + '" alt="" loading="lazy" decoding="async">';
    return '<div class="ph" style="--h:' + c.h + '"><div>' + (withLabel ? "<small>" + esc(t("cat_" + c.id)) + "</small>" : "") + "</div></div>";
  }
  function thumb(l, cls) { return '<div class="thumb ' + (cls || "") + '">' + imgInner(l, true) + "</div>"; }
  function typeTag(l) { return '<span class="tag ' + (l.type === "auction" ? "auc" : l.type === "fixed" ? "fix" : "whs") + '">' + t("type_" + l.type) + "</span>"; }
  function tags(l) {
    var s = "";
    if (!inStock(l)) s += '<span class="tag sold">' + t(l.type === "auction" ? "sold" : "sold_out") + "</span>";
    return s + typeTag(l);
  }
  function whoBadge(l) {
    return '<span class="who' + (l.sellerType === "gewerbe" ? " pro" : "") + '">' + t(l.sellerType === "gewerbe" ? "seller_pro" : "seller_private") + "</span>";
  }
  function countryOpts(sel) { return COUNTRY_CODES.map(function (c) { return '<option value="' + c + '"' + (c === sel ? " selected" : "") + ">" + esc(cname(c)) + "</option>"; }).join(""); }
  function provOpts(sel) { return PROVINCES.map(function (p) { return '<option value="' + esc(p[0]) + '"' + (p[0] === sel ? " selected" : "") + ">" + esc(lang === "en" ? p[0] : p[1]) + "</option>"; }).join(""); }
  function payList(arr) { return arr.map(function (p) { return t("pay_" + p); }).join(sep()); }

  /* ---------- Header ---------- */
  function renderHeader() {
    var opts = '<option value="">' + esc(t("all_categories")) + "</option>";
    var chips = '<button class="chip" type="button" data-cat="" aria-pressed="' + (ui.cat === "") + '">' + esc(t("all")) + "</button>";
    CATS.forEach(function (c) {
      opts += '<option value="' + c.id + '">' + esc(t("cat_" + c.id)) + "</option>";
      chips += '<button class="chip" type="button" data-cat="' + c.id + '" aria-pressed="' + (ui.cat === c.id) + '">' + esc(t("cat_" + c.id)) + "</button>";
    });
    $("catSel").innerHTML = opts; $("catSel").value = ui.cat;
    $("cats").innerHTML = chips;
    $("shipTo").innerHTML = countryOpts(local.shipTo);
    $("langSel").innerHTML = LANGS.map(function (l) { return '<option value="' + l[0] + '"' + (l[0] === lang ? " selected" : "") + ">" + l[1] + "</option>"; }).join("");
  }
  $("cats").addEventListener("click", function (e) {
    var b = e.target.closest("[data-cat]"); if (!b) return;
    ui.cat = b.getAttribute("data-cat"); ui.view = "browse"; renderHeader(); render();
  });
  $("catSel").addEventListener("change", function () { ui.cat = this.value; ui.view = "browse"; renderHeader(); render(); });
  $("shipTo").addEventListener("change", function () { local.shipTo = this.value; saveLocal(); render(); toast(t("ship_to_set", { country: cname(local.shipTo) })); });
  $("langSel").addEventListener("change", function () { lang = this.value; local.lang = lang; saveLocal(); if (!$("sheet").hidden) closeSheet(); applyLang(); renderHeader(); render(); });
  $("q").addEventListener("input", function () { ui.q = this.value; ui.view = "browse"; render(); });
  $("searchForm").addEventListener("submit", function (e) { e.preventDefault(); ui.view = "browse"; render(); });
  $("logo").addEventListener("click", function () {
    ui.q = ""; ui.cat = ""; ui.type = "all"; ui.seller = "all"; ui.origin = "all"; ui.deliverOnly = true; ui.sort = "new"; ui.view = "browse";
    $("q").value = ""; renderHeader(); render();
  });
  $("accBtn").addEventListener("click", function () { if (needLogin()) return; ui.view = "account"; render(); });
  $("cartBtn").addEventListener("click", function () { openCart(); });
  $("sellBtn").addEventListener("click", function () { if (needLogin("login_to_sell")) return; openSell(); });
  $("safetyBtn").addEventListener("click", function () { openSafety(); });

  /* ---------- Browse ---------- */
  function filtered() {
    var q = ui.q.trim().toLowerCase(), hidden = 0;
    var list = listings.filter(function (l) {
      if (ui.cat && l.cat !== ui.cat) return false;
      if (ui.type !== "all" && l.type !== ui.type) return false;
      if (ui.seller !== "all" && l.sellerType !== ui.seller) return false;
      if (ui.origin === "inland" && l.country !== local.shipTo) return false;
      if (ui.origin === "abroad" && l.country === local.shipTo) return false;
      if (q && (l.title + " " + l.desc + " " + l.loc + " " + provName(l.loc) + " " + l.seller + " " + cname(l.country)).toLowerCase().indexOf(q) === -1) return false;
      if (ui.deliverOnly && !shipFor(l, local.shipTo) && !isMine(l)) { hidden++; return false; }
      return true;
    });
    var now = Date.now();
    function rank(l) { return !inStock(l) || ended(l) ? 1 : 0; }
    list.sort(function (a, b) {
      var r = rank(a) - rank(b); if (r) return r;
      if (ui.sort === "asc" && a.cur === b.cur) return fromPrice(a) - fromPrice(b);
      if (ui.sort === "desc" && a.cur === b.cur) return fromPrice(b) - fromPrice(a);
      if (ui.sort === "ending") {
        var ea = a.type === "auction" ? a.endsAt - now : Infinity, eb = b.type === "auction" ? b.endsAt - now : Infinity;
        return ea - eb;
      }
      if ((ui.sort === "asc" || ui.sort === "desc") && a.cur !== b.cur) return a.cur < b.cur ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
    return { list: list, hidden: hidden };
  }
  function cardHTML(l) {
    var priceHTML, note;
    if (l.type === "auction") {
      priceHTML = money(unitPrice(l, 1), l.cur);
      note = l.bids.length ? t("n_bids", { n: num(l.bids.length) }) : t("start_price");
      if (buyNowOpen(l)) note += " · " + t("buy_now_x", { amount: money(l.buyNow, l.cur) });
    } else if (l.type === "fixed") {
      priceHTML = money(l.price, l.cur);
      note = l.stock > 5 ? t("n_in_stock", { n: num(l.stock) }) : l.stock > 0 ? t("only_n_left", { n: num(l.stock) }) : t("sold_out");
    } else {
      priceHTML = "<small>" + t("from") + " </small>" + money(fromPrice(l), l.cur) + "<small> / " + esc(unitName(l.unit)) + "</small>";
      note = t("moq_x", { n: num(moq(l)), unit: unitName(l.unit) });
    }
    var s = shipFor(l, local.shipTo), w = !!watchSet[l.id];
    return '<article class="card' + (s || isMine(l) ? "" : " nodeliver") + '"><div class="thumb">' + imgInner(l, true) + '<div class="tags">' + tags(l) + "</div>" +
      (isMine(l) ? "" : '<button class="watch" type="button" data-watch="' + l.id + '" aria-pressed="' + w + '" aria-label="' + esc(t(w ? "unwatch" : "watch")) + '">' + HEART + "</button>") + "</div>" +
      '<div class="card-b"><h3 dir="auto"><button type="button" data-open="' + l.id + '">' + esc(l.title) + "</button></h3>" +
      '<div class="row"><span class="price">' + priceHTML + "</span>" + (l.type === "auction" ? leftSpan(l) : "") + "</div>" +
      '<div class="note">' + note + "</div>" +
      '<div class="shipnote' + (s ? "" : " no") + '">' + esc(shipShort(l, local.shipTo)) + (s && customs(l, local.shipTo) ? " · " + t("customs_short") : "") + "</div>" +
      '<div class="meta">' + whoBadge(l) + "<span>" + esc(place(l)) + "</span></div></div></article>";
  }
  function selHTML(id, label, cur, opts) {
    return '<select class="sel" id="' + id + '" aria-label="' + esc(label) + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (cur === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>";
  }
  function renderBrowse() {
    if (!loaded) {
      $("main").innerHTML = loadError
        ? '<div class="empty"><b>' + t("load_listings_fail") + "</b>" + esc(loadError) + '<div style="margin-top:12px"><button class="btn" type="button" id="retry">' + t("retry") + "</button></div></div>"
        : '<div class="empty"><b>' + t("loading") + "</b></div>";
      if ($("retry")) $("retry").addEventListener("click", refresh);
      return;
    }
    var f = filtered(), list = f.list;
    var title = ui.q.trim() ? t("results_for", { q: esc(ui.q.trim()) }) : ui.cat ? esc(t("cat_" + ui.cat)) : t("all_listings");
    var h = "";
    if (!uid && !ui.q && !ui.cat) {
      h += '<section class="hero"><div><h2>' + t("hero_title") + "</h2><p>" + t("hero_body") + '</p></div><div class="hero-acts"><button class="btn primary" type="button" id="heroSell">' + t("hero_cta_sell") + "</button></div></section>";
    }
    h += '<div class="bar"><div><h1>' + title + '</h1><div class="sub">' + t("n_listings", { n: num(list.length) }) + " · " + t("delivery_to_x", { country: esc(cname(local.shipTo)) }) + "</div></div>" +
      '<div class="controls">' +
      selHTML("fType", t("listing_type"), ui.type, [["all", t("all_types")], ["auction", t("type_auction")], ["fixed", t("type_fixed")], ["wholesale", t("type_wholesale")]]) +
      selHTML("fSeller", t("seller"), ui.seller, [["all", t("private_and_pro")], ["privat", t("only_private")], ["gewerbe", t("only_pro")]]) +
      selHTML("fOrigin", t("origin"), ui.origin, [["all", t("home_and_abroad")], ["inland", t("only_from_x", { country: cname(local.shipTo) })], ["abroad", t("only_abroad")]]) +
      selHTML("sort", t("sort"), ui.sort, [["new", t("sort_new")], ["ending", t("sort_ending")], ["asc", t("sort_asc")], ["desc", t("sort_desc")]]) +
      '<label class="check"><input type="checkbox" id="fDeliver"' + (ui.deliverOnly ? " checked" : "") + "> " + t("only_deliverable") + "</label></div></div>";
    if (loadError) h += '<div class="hiddeninfo" style="color:var(--warn)">' + t("refresh_failed") + " " + esc(loadError) + "</div>";
    if (f.hidden) h += '<div class="hiddeninfo">' + t("n_hidden", { n: num(f.hidden), country: esc(cname(local.shipTo)) }) + ' <button class="linkbtn" type="button" id="showAll">' + t("show_anyway") + "</button></div>";
    if (!listings.length) {
      h += '<div class="empty"><b>' + t("empty_title") + "</b>" + t("empty_body") + '<div style="margin-top:14px"><button class="btn primary" type="button" id="emptySell">' + t("empty_cta") + "</button></div></div>";
    } else if (!list.length) {
      h += '<div class="empty"><b>' + t("nothing_found") + "</b>" + t("nothing_found_body") + "</div>";
    } else h += '<div class="grid">' + list.map(cardHTML).join("") + "</div>";
    $("main").innerHTML = h;
    $("fType").addEventListener("change", function () { ui.type = this.value; render(); });
    $("fSeller").addEventListener("change", function () { ui.seller = this.value; render(); });
    $("fOrigin").addEventListener("change", function () { ui.origin = this.value; render(); });
    $("sort").addEventListener("change", function () { ui.sort = this.value; render(); });
    $("fDeliver").addEventListener("change", function () { ui.deliverOnly = this.checked; render(); });
    if ($("showAll")) $("showAll").addEventListener("click", function () { ui.deliverOnly = false; render(); });
    if ($("emptySell")) $("emptySell").addEventListener("click", function () { $("sellBtn").click(); });
    if ($("heroSell")) $("heroSell").addEventListener("click", function () { if (needLogin("login_to_sell")) return; openSell(); });
  }

  function toggleWatch(id) {
    if (needLogin("login_to_watch")) return Promise.resolve();
    var on = !!watchSet[id];
    var p = on ? sb.from("watch").delete().eq("user_id", uid).eq("listing_id", id) : sb.from("watch").insert({ listing_id: id });
    return p.then(function (res) {
      if (res.error) throw res.error;
      if (on) delete watchSet[id]; else watchSet[id] = true;
      toast(t(on ? "unwatched" : "watched"));
      render();
    }).catch(function (e) { toast(errMsg(e)); });
  }

  $("main").addEventListener("click", function (e) {
    var wb = e.target.closest("[data-watch]"); if (wb) { toggleWatch(wb.getAttribute("data-watch")); return; }
    var ed = e.target.closest("[data-edit]"); if (ed) { openSell(ed.getAttribute("data-edit")); return; }
    var o = e.target.closest("[data-open]"); if (o) { openDetail(o.getAttribute("data-open")); return; }
    var tab = e.target.closest("[data-tab]"); if (tab) { ui.tab = tab.getAttribute("data-tab"); render(); return; }
    var add = e.target.closest("[data-add]"); if (add) { addToCart(add.getAttribute("data-add"), 1); return; }
    var cv = e.target.closest("[data-conv]"); if (cv) { openConversation(cv.getAttribute("data-conv")); return; }
    var oc = e.target.closest("[data-order-chat]");
    if (oc) {
      oc.disabled = true;
      sb.rpc("order_conversation", { p_order: oc.getAttribute("data-order-chat") }).then(function (r) {
        if (r.error) throw r.error; oc.disabled = false; return loadMine().then(function () { openConversation(r.data); });
      }).catch(function (err) { oc.disabled = false; toast(errMsg(err)); });
      return;
    }
    var st = e.target.closest("[data-status]");
    if (st) {
      st.disabled = true;
      sb.rpc("set_item_status", { p_item: Number(st.getAttribute("data-item")), p_status: st.getAttribute("data-status") })
        .then(function (r) { if (r.error) throw r.error; toast(t("status_saved")); return refresh(); })
        .catch(function (err) { st.disabled = false; toast(errMsg(err)); });
      return;
    }
    if (e.target.id === "logoutBtn") {
      sb.auth.signOut().then(function () { ui.view = "browse"; local.cart = []; saveLocal(); toast(t("logged_out")); });
      return;
    }
    var del = e.target.closest("[data-del]");
    if (del) {
      if (del.getAttribute("data-confirm") !== "1") { del.setAttribute("data-confirm", "1"); del.textContent = t("confirm_delete"); return; }
      del.disabled = true;
      var lid = del.getAttribute("data-del");
      sb.from("listings").delete().eq("id", lid).select("id").then(function (r) {
        if (r.error) throw r.error;
        if (!r.data.length) throw new Error(t("err_delete"));
        local.cart = local.cart.filter(function (x) { return x.id !== lid; }); saveLocal();
        toast(t("deleted")); return refresh();
      }).catch(function (err) { del.disabled = false; toast(errMsg(err)); });
    }
  });

  /* ---------- Account ---------- */
  function liRow(l, status, acts) {
    return '<div class="li"><div class="thumb">' + imgInner(l, false) + '</div><div class="li-b"><h4 dir="auto"><button type="button" data-open="' + l.id + '">' + esc(l.title) + "</button></h4>" +
      '<div class="note">' + status + '</div></div><div class="li-acts">' + acts + "</div></div>";
  }
  function tabBtn(id, label) { return '<button type="button" role="tab" data-tab="' + id + '" aria-selected="' + (ui.tab === id) + '">' + label + "</button>"; }
  function orderAddr(o) { return esc(o.name) + sep() + (o.address ? esc(o.address) + sep() : "") + esc(o.country === "AF" ? provName(o.city) : o.city) + sep() + esc(cname(o.country)); }
  function itemsLine(o) {
    return (o.order_items || []).map(function (i) { return (i.qty > 1 ? num(i.qty) + " × " : "") + esc(i.title) + " (" + t("status_" + i.status) + ")"; }).join(" · ");
  }
  function renderAccount() {
    if (!uid || !me) { $("main").innerHTML = '<div class="empty"><b>' + t("loading") + "</b></div>"; return; }
    var mine = listings.filter(isMine);
    var bidOn = listings.filter(function (l) { return l.bids.some(function (b) { return b.whoId === uid; }); });
    var wl = Object.keys(watchSet).map(byId).filter(Boolean);
    var openSales = sales.filter(function (o) { return (o.order_items || []).some(function (i) { return i.status === "offen"; }); }).length;
    var unread = unreadCount();
    var h = '<div class="bar"><div><h1>' + t("my_area") + '</h1><div class="sub">' + esc(me.display_name) + " · " + t(me.seller_type === "gewerbe" ? "account_pro" : "account_private") + ' · <span dir="ltr">' + esc(userEmail) + "</span></div></div>" +
      '<div class="controls"><button class="btn" type="button" id="logoutBtn">' + t("logout") + "</button></div></div>" +
      '<div class="tabs" role="tablist">' +
      tabBtn("listings", t("tab_listings", { n: num(mine.length) })) +
      tabBtn("messages", t("tab_messages") + (unread ? ' <span class="count">' + num(unread) + "</span>" : "")) +
      tabBtn("sales", t("tab_sales") + (openSales ? ' <span class="count">' + num(openSales) + "</span>" : "")) +
      tabBtn("orders", t("tab_orders", { n: num(purchases.length) })) + tabBtn("bids", t("tab_bids", { n: num(bidOn.length) })) +
      tabBtn("watch", t("tab_watch", { n: num(wl.length) })) + tabBtn("profile", t("tab_profile")) + "</div>";

    if (ui.tab === "listings") {
      if (!mine.length) h += '<div class="empty"><b>' + t("no_listings_title") + "</b>" + t("no_listings_body") + "</div>";
      else h += '<div class="list">' + mine.map(function (l) {
        var st = t("type_" + l.type) + " · ";
        if (l.type === "auction") {
          if (l.sold) st += '<span class="status ok">' + t("sold_for", { amount: money(unitPrice(l, 1), l.cur) }) + "</span>";
          else if (ended(l)) st += l.bids.length ? '<span class="status ok">' + t("auction_won_by", { amount: money(unitPrice(l, 1), l.cur), who: esc(topBid(l).who) }) + "</span>" : '<span class="status">' + t("ended_no_bids") + "</span>";
          else st += money(unitPrice(l, 1), l.cur) + " · " + t("n_bids", { n: num(l.bids.length) }) + " · " + leftSpan(l);
        } else if (l.type === "fixed") st += money(l.price, l.cur) + " · " + (l.stock > 0 ? t("n_in_stock", { n: num(l.stock) }) : '<span class="status warn">' + t("sold_out") + "</span>");
        else st += t("from") + " " + money(fromPrice(l), l.cur) + " / " + esc(unitName(l.unit)) + " · " + t("n_in_stock", { n: num(l.stock) });
        var acts = (canEdit(l) ? '<button class="btn sm" type="button" data-edit="' + l.id + '">' + t("edit") + "</button>" : "") +
          (canDelete(l) ? '<button class="btn sm danger" type="button" data-del="' + l.id + '">' + t("delete") + "</button>" : "");
        return liRow(l, st, acts);
      }).join("") + "</div>";
    } else if (ui.tab === "messages") {
      if (!convs.length) h += '<div class="empty"><b>' + t("no_messages_title") + "</b>" + t("no_messages_body") + "</div>";
      else h += '<div class="list">' + convs.map(function (c) {
        var other = c.buyer_id === uid ? (c.seller ? c.seller.display_name : "?") : (c.buyer ? c.buyer.display_name : "?");
        return '<div class="li plain"><div class="li-b"><h4 dir="auto"><button type="button" data-conv="' + c.id + '">' + esc(c.title) + "</button></h4>" +
          '<div class="note">' + t(c.buyer_id === uid ? "conv_with_seller" : "conv_with_buyer", { name: esc(other) }) + " · " + fmtDate(c.last_at) + "</div></div>" +
          '<div class="li-acts">' + (isUnread(c) ? '<span class="tag auc">' + t("new_badge") + "</span>" : "") + '<button class="btn sm" type="button" data-conv="' + c.id + '">' + t("open") + "</button></div></div>";
      }).join("") + "</div>";
    } else if (ui.tab === "sales") {
      if (!sales.length) h += '<div class="empty"><b>' + t("no_sales_title") + "</b>" + t("no_sales_body") + "</div>";
      else h += '<p class="note" style="margin:0 0 10px">' + t("sales_hint") + '</p><div class="list">' + sales.map(function (o) {
        var items = (o.order_items || []).map(function (it) {
          var btn = it.status === "offen" ? '<button class="btn sm" type="button" data-status="' + (it.pickup ? "abgeholt" : "versendet") + '" data-item="' + it.id + '">' + t(it.pickup ? "mark_picked_up" : "mark_shipped") + "</button>" : "";
          return '<div class="row itemrow"><span class="note">' + num(it.qty) + " × " + esc(it.title) + " · " + money(it.unit_price, o.currency) + (it.pickup ? " · " + t("pickup") : " · " + t("shipping_x", { amount: money(it.ship_cost, o.currency) })) + '</span><span class="row" style="gap:6px"><span class="tag ' + (it.status === "offen" ? "auc" : "fix") + '">' + t("status_" + it.status) + "</span>" + btn + "</span></div>";
        }).join("");
        return '<div class="li plain"><div class="li-b"><h4>' + t("order_no", { no: '<span dir="ltr">' + esc(o.no) + "</span>" }) + " · " + money(o.total, o.currency) + "</h4>" +
          '<div class="note">' + fmtDate(o.created_at) + " · " + t("buyer_x", { name: esc(o.buyer ? o.buyer.display_name : "") }) + " · " + t("payment_x", { method: t("pay_" + o.pay_method) }) + "</div>" +
          '<div class="note">' + t("deliver_to") + " " + orderAddr(o) + (o.phone ? " · " + t("phone") + ': <b dir="ltr" style="user-select:all">' + esc(o.phone) + "</b>" : "") + "</div>" + items + "</div>" +
          '<div class="li-acts"><button class="btn sm b2b" type="button" data-order-chat="' + o.id + '">' + t("message_buyer") + "</button></div></div>";
      }).join("") + "</div>";
    } else if (ui.tab === "orders") {
      if (!purchases.length) h += '<div class="empty"><b>' + t("no_orders_title") + "</b>" + t("no_orders_body") + "</div>";
      else h += '<div class="list">' + purchases.map(function (o) {
        return '<div class="li plain"><div class="li-b"><h4>' + t("order_no", { no: '<span dir="ltr">' + esc(o.no) + "</span>" }) + "</h4>" +
          '<div class="note">' + fmtDate(o.created_at) + " · " + t("seller_x", { name: esc(o.seller ? o.seller.display_name : "") }) + " · " + t("payment_x", { method: t("pay_" + o.pay_method) }) + "</div>" +
          '<div class="note">' + itemsLine(o) + "</div></div>" +
          '<div class="li-acts"><span class="price">' + money(o.total, o.currency) + '</span><button class="btn sm b2b" type="button" data-order-chat="' + o.id + '">' + t("message_seller") + "</button></div></div>";
      }).join("") + "</div>";
    } else if (ui.tab === "bids") {
      if (!bidOn.length) h += '<div class="empty"><b>' + t("no_bids_title") + "</b>" + t("no_bids_body") + "</div>";
      else h += '<div class="list">' + bidOn.map(function (l) {
        var mineMax = Math.max.apply(null, l.bids.filter(function (b) { return b.whoId === uid; }).map(function (b) { return b.amount; }));
        var top = topBid(l), st, act = "";
        if (ended(l)) {
          if (top.whoId === uid) {
            st = '<span class="status ok">' + t("won_for", { amount: money(top.amount, l.cur) }) + "</span>";
            if (l.sold) act = '<span class="note">' + t("bought") + "</span>";
            else if (inCart(l.id)) act = '<span class="note">' + t("in_cart") + "</span>";
            else act = '<button class="btn sm primary" type="button" data-add="' + l.id + '">' + t("add_to_cart") + "</button>";
          } else st = '<span class="status warn">' + t("not_won") + "</span> · " + money(top.amount, l.cur);
        } else {
          st = (top.whoId === uid ? '<span class="status ok">' + t("you_lead") + "</span>" : '<span class="status warn">' + t("outbid") + "</span>") + " · " + t("your_bid_x", { amount: money(mineMax, l.cur) }) + " · " + leftSpan(l);
        }
        return liRow(l, st, act);
      }).join("") + "</div>";
    } else if (ui.tab === "watch") {
      if (!wl.length) h += '<div class="empty"><b>' + t("no_watch_title") + "</b>" + t("no_watch_body") + "</div>";
      else h += '<div class="list">' + wl.map(function (l) {
        var st = t("type_" + l.type) + " · ";
        if (!inStock(l)) st += '<span class="status">' + t(l.type === "auction" ? "sold" : "sold_out") + "</span>";
        else if (l.type === "auction" && ended(l)) st += '<span class="status">' + t("auction_ended") + "</span>";
        else if (l.type === "auction") st += money(unitPrice(l, 1), l.cur) + " · " + leftSpan(l);
        else if (l.type === "fixed") st += money(l.price, l.cur);
        else st += t("from") + " " + money(fromPrice(l), l.cur) + " / " + esc(unitName(l.unit));
        return liRow(l, st, '<button class="btn sm" type="button" data-watch="' + l.id + '">' + t("remove") + "</button>");
      }).join("") + "</div>";
    } else {
      h += '<form class="profile" id="profForm" novalidate>' +
        '<div class="field"><span class="flabel">' + t("i_sell_as") + '</span><div class="seg" role="group" id="pType">' +
        '<button type="button" data-pt="privat" aria-pressed="' + (me.seller_type === "privat") + '">' + t("seller_private") + '</button><button type="button" data-pt="gewerbe" aria-pressed="' + (me.seller_type === "gewerbe") + '">' + t("seller_pro") + "</button></div>" +
        '<span class="hint">' + t("seller_type_hint") + "</span></div>" +
        '<div class="field"><label for="pName">' + t("shop_name") + '</label><input class="inp" id="pName" maxlength="40" dir="auto" value="' + esc(me.display_name) + '"><span class="hint">' + t("shop_name_hint") + "</span></div>" +
        '<div class="two"><div class="field"><label for="pCountry">' + t("country") + '</label><select class="inp" id="pCountry">' + countryOpts(me.country) + "</select></div>" +
        '<div class="field" id="pLocWrap"></div></div>' +
        '<div class="box"><div class="note">' + t("profile_privacy") + "</div></div>" +
        '<div class="err" id="pErr" hidden></div><div><button class="btn primary" type="submit" id="pSave">' + t("save_profile") + "</button></div></form>";
    }
    $("main").innerHTML = h;
    if (ui.tab === "profile") {
      var ptype = me.seller_type;
      var drawLoc = function () {
        var c = $("pCountry").value, cur = $("pLoc") ? $("pLoc").value : me.loc;
        var isProv = PROVINCES.some(function (p) { return p[0] === cur; });
        $("pLocWrap").innerHTML = c === "AF"
          ? '<label for="pLoc">' + t("province") + '</label><select class="inp" id="pLoc"><option value="">—</option>' + provOpts(cur) + "</select>"
          : '<label for="pLoc">' + t("city") + '</label><input class="inp" id="pLoc" maxlength="80" dir="auto" value="' + esc(isProv ? "" : cur) + '">';
      };
      drawLoc();
      $("pCountry").addEventListener("change", drawLoc);
      $("pType").addEventListener("click", function (e) {
        var x = e.target.closest("[data-pt]"); if (!x) return;
        ptype = x.getAttribute("data-pt");
        $("pType").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b === x)); });
      });
      $("profForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var name = $("pName").value.trim();
        if (name.length < 2) { $("pErr").textContent = t("err_name_short"); $("pErr").hidden = false; return; }
        $("pSave").disabled = true;
        sb.from("profiles").update({ seller_type: ptype, display_name: name, country: $("pCountry").value, loc: $("pLoc").value.trim() }).eq("id", uid)
          .then(function (r) { if (r.error) throw r.error; toast(t("profile_saved")); return refresh(); })
          .catch(function (err) { $("pSave").disabled = false; $("pErr").textContent = errMsg(err); $("pErr").hidden = false; });
      });
    }
  }

  function render() {
    $("cartCount").textContent = num(local.cart.length);
    $("accLbl").textContent = uid ? t("my_area") : t("login");
    $("accDot").hidden = !(uid && unreadCount());
    if (ui.view === "account" && uid) renderAccount(); else { ui.view = "browse"; renderBrowse(); }
  }

  /* ---------- Sheet ---------- */
  var sheetMode = null, sheetId = null, lastFocus = null;
  function openSheet(title, body, foot, mode, id) {
    if ($("sheet").hidden) lastFocus = document.activeElement;
    sheetMode = mode; sheetId = id || null;
    $("sheetTitle").textContent = title;
    $("sheetBody").innerHTML = body;
    $("sheetBody").scrollTop = 0;
    if (foot) { $("sheetFoot").innerHTML = foot; $("sheetFoot").hidden = false; } else { $("sheetFoot").innerHTML = ""; $("sheetFoot").hidden = true; }
    $("scrim").hidden = false; $("sheet").hidden = false;
    $("sheetClose").focus();
  }
  function closeSheet() {
    $("scrim").hidden = true; $("sheet").hidden = true; sheetMode = null; sheetId = null;
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  }
  $("sheetClose").addEventListener("click", closeSheet);
  $("scrim").addEventListener("click", closeSheet);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("sheet").hidden) closeSheet(); });
  function busy(btn, on, label) { if (!btn) return; btn.disabled = on; if (label) btn.textContent = label; }

  /* ---------- Safety guide ---------- */
  function openSafety() {
    function ul(keys) { return '<ul class="tips">' + keys.map(function (k) { return "<li>" + t(k) + "</li>"; }).join("") + "</ul>"; }
    var tips = ["safety_1", "safety_2", "safety_3", "safety_4", "safety_5", "safety_6"].map(function (k) { return "<li>" + t(k) + "</li>"; }).join("");
    openSheet(t("privacy_title"),
      '<p style="margin:0">' + t("privacy_intro") + "</p>" +
      '<div><div class="lbl">' + t("privacy_public_h") + "</div>" + ul(["privacy_public_1", "privacy_public_2", "privacy_public_3"]) + "</div>" +
      '<div><div class="lbl">' + t("privacy_hidden_h") + "</div>" + ul(["privacy_hidden_1", "privacy_hidden_2", "privacy_hidden_3", "privacy_hidden_4"]) + "</div>" +
      '<div><div class="lbl">' + t("safety_title") + '</div><ol class="tips">' + tips + "</ol></div>" +
      '<div class="box"><div class="note">' + t("privacy_limits") + "</div></div>" +
      '<p class="note" style="margin:0">' + t("privacy_inclusion") + "</p>", "", "safety");
  }

  /* ---------- Auth ---------- */
  function openAuth(mode, note) {
    var b = "";
    if (note) b += '<div class="box"><div class="note">' + esc(note) + "</div></div>";
    if (mode === "login" || mode === "signup") {
      b += '<div class="seg" role="group" style="align-self:flex-start"><button type="button" data-am="login" aria-pressed="' + (mode === "login") + '">' + t("login") + '</button><button type="button" data-am="signup" aria-pressed="' + (mode === "signup") + '">' + t("register") + "</button></div>" +
        '<form id="authForm" novalidate style="display:flex;flex-direction:column;gap:14px">' +
        (mode === "signup" ? '<div class="field"><label for="aName">' + t("shop_name") + '</label><input class="inp" id="aName" maxlength="40" dir="auto" autocomplete="nickname"><span class="hint">' + t("signup_name_hint") + "</span></div>" : "") +
        '<div class="field"><label for="aEmail">' + t("email") + '</label><input class="inp" id="aEmail" type="email" dir="ltr" autocomplete="email"></div>' +
        '<div class="field"><label for="aPass">' + t("password") + '</label><input class="inp" id="aPass" type="password" dir="ltr" autocomplete="' + (mode === "signup" ? "new-password" : "current-password") + '">' + (mode === "signup" ? '<span class="hint">' + t("password_hint") + "</span>" : "") + "</div>" +
        '<div class="err" id="aErr" hidden></div><button class="btn primary" type="submit" id="aSubmit">' + t(mode === "signup" ? "create_account" : "login") + "</button>" +
        (mode === "login" ? '<button class="linkbtn" type="button" id="aForgot" style="align-self:flex-start">' + t("forgot_password") + "</button>" : '<p class="note" style="margin:0">' + t("signup_confirm_hint") + "</p>") +
        "</form>";
    } else if (mode === "reset") {
      b += '<form id="authForm" novalidate style="display:flex;flex-direction:column;gap:14px"><p class="note" style="margin:0">' + t("reset_intro") + "</p>" +
        '<div class="field"><label for="aEmail">' + t("email") + '</label><input class="inp" id="aEmail" type="email" dir="ltr" autocomplete="email"></div>' +
        '<div class="err" id="aErr" hidden></div><button class="btn primary" type="submit" id="aSubmit">' + t("send_link") + "</button>" +
        '<button class="linkbtn" type="button" data-am="login" style="align-self:flex-start">' + t("back_to_login") + "</button></form>";
    } else if (mode === "newpass") {
      b += '<form id="authForm" novalidate style="display:flex;flex-direction:column;gap:14px"><p class="note" style="margin:0">' + t("newpass_intro") + "</p>" +
        '<div class="field"><label for="aPass">' + t("new_password") + '</label><input class="inp" id="aPass" type="password" dir="ltr" autocomplete="new-password"><span class="hint">' + t("password_hint") + "</span></div>" +
        '<div class="err" id="aErr" hidden></div><button class="btn primary" type="submit" id="aSubmit">' + t("save_password") + "</button></form>";
    }
    openSheet(t(mode === "signup" ? "register" : mode === "reset" ? "reset_title" : mode === "newpass" ? "new_password" : "login"), b, "", "auth");
    $("sheetBody").querySelectorAll("[data-am]").forEach(function (x) { x.addEventListener("click", function () { openAuth(x.getAttribute("data-am")); }); });
    if ($("aForgot")) $("aForgot").addEventListener("click", function () { openAuth("reset"); });
    var first = $("aName") || $("aEmail") || $("aPass"); if (first) first.focus();
    $("authForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("aErr"), btn = $("aSubmit");
      function fail(m) { err.textContent = m; err.hidden = false; busy(btn, false); }
      var email = $("aEmail") ? $("aEmail").value.trim() : "", pass = $("aPass") ? $("aPass").value : "";
      if ($("aEmail") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(t("err_email_invalid"));
      if ((mode === "signup" || mode === "newpass") && pass.length < 8) return fail(t("err_password_short"));
      if (mode === "login" && !pass) return fail(t("err_password_missing"));
      var name = $("aName") ? $("aName").value.trim() : "";
      if (mode === "signup" && name.length < 2) return fail(t("err_name_short"));
      busy(btn, true);
      var p;
      if (mode === "login") p = sb.auth.signInWithPassword({ email: email, password: pass }).then(function (r) {
        if (r.error) throw r.error; closeSheet(); toast(t("logged_in"));
      });
      else if (mode === "signup") p = sb.auth.signUp({ email: email, password: pass, options: { data: { display_name: name }, emailRedirectTo: SITE_URL } }).then(function (r) {
        if (r.error) throw r.error;
        if (r.data && r.data.session) { closeSheet(); toast(t("account_created")); return; }
        openSheet(t("almost_done"), '<div class="box"><div class="status ok">' + t("confirm_email_title") + "</div><div>" + t("confirm_email_body", { email: '<b dir="ltr">' + esc(email) + "</b>" }) + '</div><div class="note">' + t("confirm_email_spam") + "</div></div>", "", "auth");
      });
      else if (mode === "reset") p = sb.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL }).then(function (r) {
        if (r.error) throw r.error;
        openSheet(t("email_sent"), '<div class="box"><div>' + t("reset_sent", { email: '<b dir="ltr">' + esc(email) + "</b>" }) + '</div><div class="note">' + t("confirm_email_spam") + "</div></div>", "", "auth");
      });
      else p = sb.auth.updateUser({ password: pass }).then(function (r) {
        if (r.error) throw r.error; closeSheet(); toast(t("password_saved"));
      });
      p.catch(function (e2) { fail(errMsg(e2)); });
    });
  }

  /* ---------- Conversations ---------- */
  var convTimer = null;
  function openConversation(cid) {
    var c = convs.filter(function (x) { return x.id === cid; })[0];
    var title = c ? c.title : t("tab_messages");
    var other = c ? (c.buyer_id === uid ? (c.seller ? c.seller.display_name : "?") : (c.buyer ? c.buyer.display_name : "?")) : "";
    openSheet(title, '<div class="note">' + (c ? t(c.buyer_id === uid ? "conv_with_seller" : "conv_with_buyer", { name: esc(other) }) : "") + (c && c.listing_id ? ' · <button class="linkbtn" type="button" id="convListing">' + t("view_listing") + "</button>" : "") + "</div>" +
      '<div class="box"><div class="note">' + t("chat_safety") + "</div></div>" +
      '<div class="chat" id="chat"><div class="note">' + t("loading") + "</div></div>",
      '<form id="msgForm" class="msgform" novalidate><label class="sr" for="msgBody">' + t("message") + '</label><textarea class="inp" id="msgBody" rows="2" maxlength="2000" dir="auto" placeholder="' + esc(t("write_message")) + '"></textarea><button class="btn primary" type="submit" id="msgSend">' + t("send") + "</button></form>", "conv", cid);
    if ($("convListing")) $("convListing").addEventListener("click", function () { openDetail(c.listing_id); });
    $("msgForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var body = $("msgBody").value.trim(); if (!body) return;
      busy($("msgSend"), true);
      sb.from("messages").insert({ conversation_id: cid, body: body }).then(function (r) {
        if (r.error) throw r.error; $("msgBody").value = ""; busy($("msgSend"), false); return loadMessages(cid);
      }).catch(function (err) { busy($("msgSend"), false); toast(errMsg(err)); });
    });
    loadMessages(cid).then(function () { return sb.rpc("mark_read", { p_conv: cid }); }).then(function () { return loadMine(); }).then(render).catch(function () {});
    clearInterval(convTimer);
    convTimer = setInterval(function () { if (sheetMode === "conv" && sheetId === cid) { if (document.visibilityState === "visible") loadMessages(cid); } else clearInterval(convTimer); }, 10000);
  }
  function loadMessages(cid) {
    return sb.from("messages").select("*").eq("conversation_id", cid).order("created_at", { ascending: true }).limit(500).then(function (r) {
      if (r.error) throw r.error;
      if (sheetMode !== "conv" || sheetId !== cid) return;
      var box = $("chat"), atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
      box.innerHTML = r.data.length ? r.data.map(function (m) {
        return '<div class="msg' + (m.sender_id === uid ? " mine" : "") + '"><div dir="auto">' + esc(m.body) + '</div><span class="note">' + fmtDate(m.created_at) + "</span></div>";
      }).join("") : '<div class="note">' + t("no_messages_yet") + "</div>";
      if (atBottom || box.dataset.init !== "1") { box.scrollTop = box.scrollHeight; box.dataset.init = "1"; }
    }).catch(function (e) { if ($("chat")) $("chat").innerHTML = '<div class="err">' + esc(errMsg(e)) + "</div>"; });
  }
  function contactSeller(l, prefill) {
    if (needLogin("login_to_message")) return;
    sb.rpc("start_conversation", { p_listing: l.id }).then(function (r) {
      if (r.error) throw r.error;
      return loadMine().then(function () { openConversation(r.data); if (prefill && $("msgBody")) $("msgBody").value = prefill; });
    }).catch(function (e) { toast(errMsg(e)); });
  }

  /* ---------- Detail ---------- */
  function shipBlock(l) {
    var to = local.shipTo, s = shipFor(l, to);
    var h = '<div class="box' + (s ? "" : " warnbox") + '"><div class="lbl">' + t("delivery_to_x", { country: esc(cname(to)) }) + "</div>";
    if (!s) h += '<div class="status warn">' + t("no_delivery_to", { country: esc(cname(to)) }) + "</div>";
    else if (s.pickup) h += "<div>" + t("pickup_in", { place: esc(place(l)) }) + "</div>";
    else h += '<div><span class="mono" style="font-weight:600">' + (s.cost === 0 ? t("free") : money(s.cost, l.cur)) + "</span>" + (s.days ? " · " + t("approx_days", { d: esc(s.days) }) : "") + "</div>";
    if (s && customs(l, to)) h += '<div class="note">' + t("customs_long") + "</div>";
    var offered = ZONES.filter(function (zn) { return l.ship[zn]; }).map(function (zn) {
      var z = l.ship[zn];
      return "<li>" + (zn === "inland" ? t("zone_inland", { country: esc(cname(l.country)) }) : t("zone_" + zn)) + ": " + (Number(z.c) === 0 ? t("free") : money(z.c, l.cur)) + (z.d ? sep() + t("days_x", { d: esc(z.d) }) : "") + "</li>";
    });
    if (l.pickup) offered.push("<li>" + t("pickup_in", { place: esc(place(l)) }) + "</li>");
    h += '<div><div class="lbl" style="margin-top:4px">' + t("all_delivery_options") + '</div><ul class="zones">' + offered.join("") + "</ul></div></div>";
    return h;
  }
  function inCart(id) { return local.cart.some(function (x) { return x.id === id; }); }
  function cartQty(id) { var x = local.cart.filter(function (c) { return c.id === id; })[0]; return x ? x.qty : 0; }

  function openDetail(id) {
    var l = byId(id); if (!l) { toast(t("listing_gone")); return; }
    var own = isMine(l), s = shipFor(l, local.shipTo);
    var b = thumb(l, "d-thumb") +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' + tags(l) + whoBadge(l) + "</div>" +
      '<h3 class="d-title" dir="auto">' + esc(l.title) + "</h3>";
    var foot = "";

    if (l.type === "auction") {
      var isEnded = ended(l), top = topBid(l);
      b += '<div class="box auction"><div class="row"><div><div class="lbl">' + t(top ? (isEnded ? "winning_bid" : "current_bid") : "start_price") + '</div><div class="big">' + money(unitPrice(l, 1), l.cur) + "</div></div>" +
        '<div style="text-align:end"><div class="lbl">' + t(isEnded ? "status" : "ends_in") + "</div>" + leftSpan(l) + "</div></div>";
      if (isEnded) {
        if (!top) b += '<div class="status">' + t("ended_no_bids") + "</div>";
        else if (top.whoId === uid) b += '<div class="status ok">' + t(l.sold ? "you_won_bought" : "you_won") + "</div>";
        else b += '<div class="note">' + t("won_by", { who: esc(own ? top.who : mask(top.who)) }) + "</div>";
      } else if (own) {
        b += '<div class="note">' + t("own_auction") + "</div>";
      } else if (!s) {
        b += '<div class="note">' + t("bid_needs_delivery") + "</div>";
      } else {
        var mn = minNext(l);
        b += '<form id="bidForm" novalidate><div class="field"><label for="bidAmount">' + t("your_bid", { cur: l.cur }) + "</label>" +
          '<div class="bidline"><input class="inp mono" id="bidAmount" type="text" inputmode="decimal" dir="ltr" value="' + mn + '">' +
          '<button class="btn bid" type="submit" id="bidBtn">' + t("place_bid") + "</button></div>" +
          '<div class="hint">' + t("min_bid_hint", { amount: money(mn, l.cur) }) + '</div><div class="err" id="bidErr" hidden></div></div></form>';
        if (top && top.whoId === uid) b += '<div class="status ok">' + t("you_lead") + "</div>";
      }
      if (buyNowOpen(l)) {
        b += '<div class="buynow"><div><div class="lbl">' + t("buy_now") + '</div><div class="mono" style="font-weight:600;font-size:18px">' + money(l.buyNow, l.cur) + '</div>' +
          '<div class="note">' + t("buy_now_hint") + "</div></div>" +
          (!own && s ? '<button class="btn primary" type="button" id="buyNowBtn">' + t("buy_now") + "</button>" : "") + "</div>";
      }
      b += "</div>";
      b += '<div><div class="lbl" style="margin-bottom:4px">' + t("bid_history") + "</div>" + (l.bids.length ? '<ul class="hist">' + l.bids.slice().reverse().map(function (x) {
        var who = x.whoId === uid ? t("you") : own ? x.who : mask(x.who);
        return '<li><span class="' + (x.whoId === uid ? "me" : "") + '">' + esc(who) + (x.buyNow ? " (" + t("buy_now") + ")" : "") + '</span><span class="note">' + fmtDate(x.t) + '</span><span class="mono">' + money(x.amount, l.cur) + "</span></li>";
      }).join("") + "</ul>" : '<div class="note">' + t("no_bids_yet") + "</div>") + "</div>";
      if (isEnded && top && top.whoId === uid && !l.sold) foot = inCart(l.id) ? '<button class="btn" type="button" disabled>' + t("in_cart") + "</button>" : '<button class="btn primary" type="button" id="addBtn">' + t("add_to_cart") + "</button>";
    } else {
      var isW = l.type === "wholesale", mq = moq(l), un = unitName(l.unit);
      b += '<div class="box' + (isW ? " whs" : "") + '">';
      if (isW) {
        b += '<div class="lbl">' + t("tier_prices_per", { unit: esc(un) }) + '</div><div style="overflow-x:auto"><table class="tiers"><thead><tr><th>' + t("quantity") + '</th><th class="num">' + t("price_per", { unit: esc(un) }) + "</th></tr></thead><tbody>" +
          l.tiers.map(function (x, i) {
            var next = l.tiers[i + 1];
            return '<tr data-tier="' + i + '"><td>' + (next ? num(x.min) + " – " + num(next.min - 1) : t("from") + " " + num(x.min)) + " " + esc(un) + '</td><td class="num">' + money(x.price, l.cur) + "</td></tr>";
          }).join("") + "</tbody></table></div>" +
          '<div class="note">' + t("moq_x", { n: num(mq), unit: esc(un) }) + " · " + t("n_available", { n: num(l.stock), unit: esc(un) }) + "</div>";
      } else {
        b += '<div class="lbl">' + t("type_fixed") + '</div><div class="big">' + money(l.price, l.cur) + '</div><div class="note">' + (l.stock > 0 ? t("n_available", { n: num(l.stock), unit: esc(un) }) : t("sold_out")) + "</div>";
      }
      var buyable = !own && inStock(l) && s;
      if (buyable) {
        var startQ = inCart(l.id) ? cartQty(l.id) : mq;
        b += '<div class="field"><label for="dQty">' + t("quantity") + (isW ? " (" + esc(un) + ")" : "") + '</label><div class="bidline">' +
          '<input class="inp mono" id="dQty" type="text" inputmode="numeric" dir="ltr" value="' + startQ + '"' + (l.stock === 1 ? " readonly" : "") + "></div>" +
          '<div class="calc" id="dCalc"></div><div class="err" id="qtyErr" hidden></div></div>';
        foot = '<button class="btn primary" type="button" id="addBtn">' + t(inCart(l.id) ? "update_cart" : "add_to_cart") + "</button>";
      } else if (!own && !inStock(l)) foot = '<button class="btn" type="button" disabled>' + t("sold_out") + "</button>";
      else if (!own && !s) foot = '<button class="btn" type="button" disabled>' + t("no_delivery_to", { country: esc(cname(local.shipTo)) }) + "</button>";
      b += "</div>";
      if (isW && !own) {
        b += '<div class="box"><div class="lbl">' + t("custom_offer") + '</div><div class="note">' + t("custom_offer_hint") + "</div>" +
          '<div class="two"><div class="field"><label for="rQty">' + t("quantity") + " (" + esc(un) + ')</label><input class="inp mono" id="rQty" type="text" inputmode="numeric" dir="ltr" value="' + mq + '"></div>' +
          '<div class="field"><label for="rTarget">' + t("target_price", { unit: esc(un), cur: l.cur }) + '</label><input class="inp mono" id="rTarget" type="text" inputmode="decimal" dir="ltr" placeholder="—"></div></div>' +
          '<div><button class="btn b2b" type="button" id="rfqBtn">' + t("request_offer") + "</button></div></div>";
      }
    }

    b += '<div class="box"><div class="lbl">' + t("payment_methods") + "</div><div>" + esc(payList(l.pays)) + '</div><div class="note">' + t("payment_hint") + "</div></div>";
    b += shipBlock(l);
    b += '<dl class="facts"><dt>' + t("seller") + "</dt><dd>" + esc(sellerName(l)) + "</dd>" +
      "<dt>" + t("location") + "</dt><dd>" + esc(place(l)) + "</dd><dt>" + t("condition") + "</dt><dd>" + esc(t("cond_" + l.cond)) + "</dd>" +
      "<dt>" + t("category") + "</dt><dd>" + esc(t("cat_" + catOf(l.cat).id)) + "</dd><dt>" + t("listed_on") + "</dt><dd>" + fmtDay(l.createdAt) + "</dd></dl>" +
      '<div><div class="lbl" style="margin-bottom:4px">' + t("description") + '</div><p class="desc" dir="auto">' + esc(l.desc || t("no_description")) + "</p></div>";

    var w = !!watchSet[l.id];
    var pre = (!own ? '<button class="btn" type="button" id="detailMsg">' + t("message_seller") + "</button>" : "") +
      (!own ? '<button class="btn" type="button" id="detailWatch" aria-pressed="' + w + '"><svg class="heart" viewBox="0 0 24 24" aria-hidden="true">' + HEART_PATH + "</svg>" + t(w ? "watched_short" : "watch_short") + "</button>" : "") +
      (canEdit(l) ? '<button class="btn" type="button" id="detailEdit">' + t("edit") + "</button>" : "");
    openSheet(t("type_" + l.type), b, pre + foot, "detail", id);

    var f = $("bidForm"); if (f) f.addEventListener("submit", function (e) { e.preventDefault(); placeBid(id); });
    if ($("buyNowBtn")) $("buyNowBtn").addEventListener("click", function () { buyNow(id); });
    if ($("detailWatch")) $("detailWatch").addEventListener("click", function () { toggleWatch(id).then(function () { if (sheetId === id) openDetail(id); }); });
    if ($("detailMsg")) $("detailMsg").addEventListener("click", function () { contactSeller(l); });
    if ($("detailEdit")) $("detailEdit").addEventListener("click", function () { openSell(id); });
    if ($("dQty")) { $("dQty").addEventListener("input", function () { updateCalc(l); }); updateCalc(l); }
    if ($("addBtn")) $("addBtn").addEventListener("click", function () {
      if (l.type === "auction") { addToCart(id, 1); openDetail(id); return; }
      var q = readQty(l); if (q == null) return;
      if (addToCart(id, q)) openDetail(id);
    });
    if ($("rfqBtn")) $("rfqBtn").addEventListener("click", function () {
      var q = parseNum($("rQty").value), tp = parseNum($("rTarget").value);
      var text = t("rfq_text", { qty: isFinite(q) ? num(q) : "?", unit: unitName(l.unit) }) + (isFinite(tp) && tp > 0 ? " " + t("rfq_text_price", { price: money(tp, l.cur) }) : "");
      contactSeller(l, text);
    });
  }
  function qtyProblem(l, q) {
    var mq = moq(l);
    if (!isFinite(q) || q !== Math.floor(q)) return t("err_whole_number");
    if (q < mq) return t("err_moq_short", { n: num(mq), unit: unitName(l.unit) });
    if (q > l.stock) return t("err_stock_short", { n: num(l.stock), unit: unitName(l.unit) });
    return null;
  }
  function updateCalc(l) {
    var q = parseNum($("dQty").value), p = qtyProblem(l, q), s = shipFor(l, local.shipTo);
    $("dQty").classList.toggle("bad", !!p);
    if (p) { $("dCalc").innerHTML = ""; $("qtyErr").textContent = p; $("qtyErr").hidden = false; }
    else {
      $("qtyErr").hidden = true;
      var u = unitPrice(l, q), sub = round2(u * q);
      $("dCalc").innerHTML = "<span>" + num(q) + " × " + money(u, l.cur) + '</span><span class="mono">' + money(sub, l.cur) + "</span>" +
        "<span>" + t("shipping") + '</span><span class="mono">' + money(s ? s.cost : 0, l.cur) + '</span><span class="tot">' + t("total") + '</span><span class="tot mono">' + money(round2(sub + (s ? s.cost : 0)), l.cur) + "</span>";
    }
    if (l.type === "wholesale") {
      var idx = 0; l.tiers.forEach(function (x, i) { if (q >= x.min) idx = i; });
      document.querySelectorAll("[data-tier]").forEach(function (tr) { tr.classList.toggle("on", !p && +tr.getAttribute("data-tier") === idx); });
    }
  }
  function readQty(l) {
    var q = parseNum($("dQty").value), p = qtyProblem(l, q);
    if (p) { $("qtyErr").textContent = p; $("qtyErr").hidden = false; $("dQty").focus(); return null; }
    return q;
  }
  function placeBid(id) {
    if (needLogin("login_to_bid")) return;
    var l = byId(id), inp = $("bidAmount"), err = $("bidErr"), btn = $("bidBtn");
    var v = parseNum(inp.value), mn = minNext(l);
    function fail(m) { err.textContent = m; err.hidden = false; inp.classList.add("bad"); inp.focus(); busy(btn, false); }
    if (!isFinite(v)) return fail(t("err_amount"));
    v = round2(v);
    if (v < mn) return fail(t("err_min_bid", { amount: money(mn, l.cur) }));
    busy(btn, true);
    sb.rpc("place_bid", { p_listing: id, p_amount: v }).then(function (r) {
      if (r.error) throw r.error;
      toast(t("bid_placed", { amount: money(v, l.cur) }));
      return refresh().then(function () { openDetail(id); });
    }).catch(function (e) { fail(errMsg(e)); refresh(); });
  }
  function buyNow(id) {
    if (needLogin("login_to_buy")) return;
    var btn = $("buyNowBtn"); busy(btn, true);
    sb.rpc("buy_now", { p_listing: id }).then(function (r) {
      if (r.error) throw r.error;
      if (!inCart(id)) local.cart.push({ id: id, qty: 1 }); saveLocal();
      toast(t("buy_now_done"));
      return refresh().then(openCart);
    }).catch(function (e) { busy(btn, false); toast(errMsg(e)); refresh().then(function () { openDetail(id); }); });
  }

  /* ---------- Cart & checkout ---------- */
  function addToCart(id, qty) {
    if (needLogin("login_to_buy")) return false;
    var l = byId(id);
    if (!l || !canBuy(l)) { toast(t("err_cannot_buy")); return false; }
    if (!shipFor(l, local.shipTo)) { toast(t("no_delivery_to", { country: cname(local.shipTo) })); return false; }
    var line = local.cart.filter(function (x) { return x.id === id; })[0];
    if (line) { line.qty = qty; toast(t("cart_updated")); }
    else { local.cart.push({ id: id, qty: qty }); toast(t("added_to_cart")); }
    saveLocal(); render();
    return true;
  }
  function cartLines() {
    return local.cart.map(function (x) {
      var l = byId(x.id), r = { id: x.id, qty: x.qty, l: l, problem: null, ship: null, unit: 0, sub: 0 };
      if (!l) { r.problem = t("not_available"); return r; }
      if (!canBuy(l)) r.problem = t(isMine(l) ? "err_own_item" : "err_cannot_buy");
      else if (!(r.ship = shipFor(l, local.shipTo))) r.problem = t("no_delivery_to", { country: cname(local.shipTo) });
      else if (l.type !== "auction") r.problem = qtyProblem(l, x.qty);
      r.unit = unitPrice(l, x.qty); r.sub = round2(r.unit * x.qty);
      return r;
    });
  }
  function groups(lines) {
    var g = {}, order = [];
    lines.forEach(function (r) {
      var k = r.l ? r.l.sellerId + "|" + r.l.cur : "gone";
      if (!g[k]) { g[k] = { key: k, lines: [], seller: r.l ? sellerName(r.l) : "", cur: r.l ? r.l.cur : "AFN" }; order.push(k); }
      g[k].lines.push(r);
    });
    return order.map(function (k) { return g[k]; });
  }
  function totals(lines) {
    var sub = 0, ship = 0;
    lines.forEach(function (r) { if (!r.problem) { sub += r.sub; ship += r.ship.cost; } });
    return { sub: round2(sub), ship: round2(ship), total: round2(sub + ship) };
  }
  function commonPays(lines) {
    return PAYS.filter(function (p) { return lines.every(function (r) { return r.l && r.l.pays.indexOf(p) > -1; }); });
  }
  function openCart() {
    var lines = cartLines();
    if (!lines.length) { openSheet(t("cart"), '<div class="empty"><b>' + t("cart_empty_title") + "</b>" + t("cart_empty_body") + "</div>", "", "cart"); return; }
    var gs = groups(lines);
    var b = '<div class="note">' + t("delivery_to_x", { country: "<b>" + esc(cname(local.shipTo)) + "</b>" }) + ". " + t("cart_hint") + "</div>";
    gs.forEach(function (g, gi) {
      var tt = totals(g.lines), bad = g.lines.some(function (r) { return r.problem; });
      b += '<div class="box"><div class="lbl">' + (g.key === "gone" ? t("not_available") : t("order_from", { name: esc(g.seller) })) + "</div>";
      b += g.lines.map(function (r) {
        var l = r.l;
        if (!l) return '<div class="ci"><div class="thumb"></div><div class="ci-t"><span class="bad">' + esc(r.problem) + '</span></div><div><button class="btn ghost danger sm" type="button" data-rm="' + esc(r.id) + '">' + t("remove") + "</button></div></div>";
        var info = (r.qty > 1 || l.type === "wholesale" ? num(r.qty) + " " + esc(unitName(l.unit)) + " × " + money(r.unit, l.cur) : "");
        var shipInfo = r.ship ? (r.ship.pickup ? t("pickup") : t("shipping_x", { amount: money(r.ship.cost, l.cur) })) + (customs(l, local.shipTo) ? " · " + t("customs_short") : "") : "";
        return '<div class="ci">' + thumb(l) + '<div class="ci-t"><button class="linkbtn plainlink" type="button" dir="auto" data-cart-open="' + l.id + '">' + esc(l.title) + "</button>" + (info ? "<span>" + info + "</span>" : "") +
          (shipInfo ? "<span>" + shipInfo + "</span>" : "") + (r.problem ? '<span class="bad">' + esc(r.problem) + "</span>" : "") + "</div>" +
          '<div style="text-align:end"><div class="mono">' + money(r.sub, l.cur) + '</div><button class="btn ghost danger sm" type="button" data-rm="' + l.id + '" style="padding:2px 0">' + t("remove") + "</button></div></div>";
      }).join("");
      if (g.key !== "gone") {
        b += '<div class="sum"><span>' + t("subtotal") + '</span><span class="mono">' + money(tt.sub, g.cur) + "</span><span>" + t("shipping") + '</span><span class="mono">' + money(tt.ship, g.cur) + '</span><span class="tot">' + t("total") + '</span><span class="tot mono">' + money(tt.total, g.cur) + "</span></div>";
        b += bad ? '<div class="status warn">' + t("fix_cart") + "</div>" : '<div><button class="btn primary" type="button" data-checkout="' + gi + '">' + t("checkout_this") + "</button></div>";
      }
      b += "</div>";
    });
    openSheet(t("cart"), b, "", "cart");
    $("sheetBody").querySelectorAll("[data-rm]").forEach(function (x) {
      x.addEventListener("click", function () { var id = x.getAttribute("data-rm"); local.cart = local.cart.filter(function (c) { return c.id !== id; }); saveLocal(); render(); openCart(); });
    });
    $("sheetBody").querySelectorAll("[data-cart-open]").forEach(function (x) { x.addEventListener("click", function () { openDetail(x.getAttribute("data-cart-open")); }); });
    $("sheetBody").querySelectorAll("[data-checkout]").forEach(function (x) {
      x.addEventListener("click", function () { if (needLogin("login_to_buy")) return; openCheckout(gs[+x.getAttribute("data-checkout")]); });
    });
  }
  function fld(id, label, ac, val, hint, ltr) { return '<div class="field"><label for="' + id + '">' + label + '</label><input class="inp" id="' + id + '" type="text" autocomplete="' + ac + '"' + (ltr ? ' dir="ltr"' : ' dir="auto"') + ' value="' + esc(val || "") + '">' + (hint ? '<span class="hint">' + hint + "</span>" : "") + "</div>"; }
  function openCheckout(g) {
    var lines = g.lines;
    if (lines.some(function (r) { return r.problem; })) { openCart(); return; }
    var tt = totals(lines), pays = commonPays(lines), anyCustoms = lines.some(function (r) { return customs(r.l, local.shipTo); });
    var isAF = local.shipTo === "AF";
    var b = '<div class="box"><div class="lbl">' + t("how_payment_works") + '</div><div class="note">' + t("how_payment_body") + "</div></div>" +
      '<form id="coForm" novalidate style="display:flex;flex-direction:column;gap:14px">' +
      fld("coName", t("name_for_delivery"), "name", me ? me.display_name : "", t("name_for_delivery_hint")) +
      (isAF ? '<div class="field"><label for="coCity">' + t("province") + '</label><select class="inp" id="coCity"><option value="">—</option>' + provOpts(me && me.country === "AF" ? me.loc : "") + "</select></div>" : fld("coCity", t("city"), "address-level2", "")) +
      '<div class="field"><label for="coAddr">' + t("address_desc") + '</label><textarea class="inp" id="coAddr" rows="2" maxlength="300" dir="auto"></textarea><span class="hint">' + t("address_desc_hint") + "</span></div>" +
      fld("coPhone", t("phone_optional"), "tel", "", t("phone_hint"), true) +
      '<div class="field"><span class="flabel">' + t("payment_method") + "</span>" + (pays.length ? pays.map(function (p, i) { return '<label class="check"><input type="radio" name="coPay" value="' + p + '"' + (i === 0 ? " checked" : "") + "> " + t("pay_" + p) + "</label>"; }).join("") : '<div class="status warn">' + t("no_common_pay") + "</div>") + "</div>" +
      '<div class="field"><span class="flabel">' + t("country") + "</span><div>" + esc(cname(local.shipTo)) + "</div></div>" +
      '<div class="err" id="coErr" hidden></div></form>' +
      (anyCustoms ? '<div class="box warnbox"><div class="note">' + t("customs_long") + "</div></div>" : "") +
      '<div class="sum"><span>' + t("subtotal") + '</span><span class="mono">' + money(tt.sub, g.cur) + "</span><span>" + t("shipping") + '</span><span class="mono">' + money(tt.ship, g.cur) + '</span><span class="tot">' + t("total") + '</span><span class="tot mono">' + money(tt.total, g.cur) + "</span></div>";
    openSheet(t("checkout"), b, '<button class="btn" type="button" id="backCart">' + t("back") + '</button><button class="btn primary" type="button" id="placeOrder"' + (pays.length ? "" : " disabled") + ">" + t("place_order") + "</button>", "checkout");
    $("backCart").addEventListener("click", openCart);
    $("placeOrder").addEventListener("click", function () { placeOrder(g); });
    $("coForm").addEventListener("submit", function (e) { e.preventDefault(); placeOrder(g); });
  }
  function placeOrder(g) {
    var bad = [];
    ["coName", "coCity"].forEach(function (id) { var el = $(id), ok = el.value.trim().length > 0; el.classList.toggle("bad", !ok); if (!ok) bad.push(el); });
    if (bad.length) { $("coErr").textContent = t("err_need_name_city"); $("coErr").hidden = false; bad[0].focus(); return; }
    var payEl = document.querySelector('input[name="coPay"]:checked'); if (!payEl) return;
    var fresh = cartLines().filter(function (r) { return g.lines.some(function (x) { return x.id === r.id; }); });
    if (fresh.some(function (r) { return r.problem; })) { openCart(); return; }
    var btn = $("placeOrder"); busy(btn, true, t("sending"));
    sb.rpc("place_order", {
      p_items: fresh.map(function (r) { return { id: r.id, qty: r.qty }; }), p_ship_to: local.shipTo,
      p_name: $("coName").value.trim(), p_address: $("coAddr").value.trim(), p_city: $("coCity").value.trim(),
      p_phone: $("coPhone").value.trim(), p_pay_method: payEl.value
    }).then(function (r) {
      if (r.error) throw r.error;
      var no = r.data;
      local.cart = local.cart.filter(function (c) { return !fresh.some(function (x) { return x.id === c.id; }); }); saveLocal();
      return refresh().then(function () {
        var o = purchases.filter(function (x) { return x.no === no; })[0];
        openSheet(t("order_sent"), '<div class="box"><div class="lbl">' + t("order_number") + '</div><div class="big" dir="ltr">' + esc(no) + '</div><div class="status ok">' + t("order_sent_body") + "</div>" +
          '<div class="note">' + t("order_next") + "</div></div>",
          (o ? '<button class="btn b2b" type="button" id="orderChat">' + t("message_seller") + "</button>" : "") + '<button class="btn primary" type="button" id="toOrders">' + t("to_my_orders") + "</button>", "done");
        $("toOrders").addEventListener("click", function () { ui.view = "account"; ui.tab = "orders"; render(); closeSheet(); });
        if ($("orderChat")) $("orderChat").addEventListener("click", function () {
          sb.rpc("order_conversation", { p_order: o.id }).then(function (rr) { if (rr.error) throw rr.error; return loadMine().then(function () { openConversation(rr.data); }); }).catch(function (e) { toast(errMsg(e)); });
        });
      });
    }).catch(function (e) { busy(btn, false, t("place_order")); $("coErr").textContent = errMsg(e); $("coErr").hidden = false; refresh(); });
  }

  /* ---------- Sell ---------- */
  var draftFile = null;
  function openSell(editId) {
    if (!me) { toast(t("profile_loading")); return; }
    var ed = editId ? byId(editId) : null;
    if (ed && !canEdit(ed)) { toast(t("err_auction_locked")); return; }
    draftFile = null;
    var sellerType = ed ? ed.sellerType : me.seller_type;
    var country = ed ? ed.country : me.country;
    var type = ed ? ed.type : "fixed";
    var isEU = EU.indexOf(country) > -1, isAF = country === "AF";
    var catOpts = CATS.map(function (c) { return '<option value="' + c.id + '">' + esc(t("cat_" + c.id)) + "</option>"; }).join("");
    var condOpts = CONDS.map(function (c) { return '<option value="' + c + '"' + (c === "new" ? " selected" : "") + ">" + esc(t("cond_" + c)) + "</option>"; }).join("");
    var unitOpts = UNITS.map(function (u) { return '<option value="' + u + '">' + esc(t("unit_" + u)) + "</option>"; }).join("");
    var curSel = ed ? ed.cur : (isAF ? "AFN" : "USD");
    var curOpts = CURRENCIES.map(function (c) { return '<option value="' + c + '"' + (c === curSel ? " selected" : "") + ">" + esc(t("cur_" + c)) + " (" + c + ")</option>"; }).join("");
    var pays = ed ? ed.pays : (isAF ? ["cash", "mobile"] : ["hawala"]);

    var typeField = ed
      ? '<div class="field"><span class="flabel">' + t("listing_type") + '</span><div class="note">' + t("type_" + type) + (type === "auction" ? " · " + t("ends_at", { date: fmtDate(ed.endsAt) }) : "") + ". " + t("type_locked") + "</div></div>"
      : '<div class="field"><span class="flabel">' + t("listing_type") + '</span><div class="seg" role="group" id="sType">' +
        '<button type="button" data-st="fixed" aria-pressed="true">' + t("type_fixed") + '</button><button type="button" data-st="auction" aria-pressed="false">' + t("type_auction") + "</button>" +
        '<button type="button" data-st="wholesale" aria-pressed="false"' + (sellerType === "gewerbe" ? "" : " disabled") + ">" + t("type_wholesale") + "</button></div>" +
        (sellerType === "gewerbe" ? "" : '<span class="hint">' + t("wholesale_needs_pro") + "</span>") + "</div>";

    function zoneRow(zn) {
      var cur = ed ? ed.ship[zn] : null;
      var on = ed ? !!cur : zn === "inland";
      var label = zn === "inland" ? t("zone_inland", { country: cname(country) }) : t("zone_" + zn);
      return '<div class="zrow"><label class="check"><input type="checkbox" id="sZ_' + zn + '"' + (on ? " checked" : "") + "> " + esc(label) + "</label>" +
        '<input class="inp mono" id="sC_' + zn + '" type="text" inputmode="decimal" dir="ltr" aria-label="' + esc(t("ship_cost_for", { zone: label })) + '" placeholder="' + esc(t("cost")) + '" value="' + (cur ? cur.c : "") + '">' +
        '<input class="inp" id="sD_' + zn + '" maxlength="20" aria-label="' + esc(t("ship_days_for", { zone: label })) + '" placeholder="' + esc(t("days_placeholder")) + '" value="' + esc(cur ? cur.d : "") + '"></div>';
    }

    var b = '<div class="box"><div class="note">' + t("sell_safety_short") + ' <button class="linkbtn" type="button" id="sSafety">' + t("privacy_title") + "</button></div></div>" +
      '<form id="sellForm" novalidate style="display:flex;flex-direction:column;gap:16px">' +
      '<div class="note">' + t("selling_as", { kind: t(sellerType === "gewerbe" ? "seller_pro" : "seller_private"), country: esc(cname(country)) }) + "</div>" +
      '<div class="field"><label for="sTitle">' + t("title") + '</label><input class="inp" id="sTitle" maxlength="90" dir="auto"><span class="hint">' + t("title_hint") + "</span></div>" +
      '<div class="two"><div class="field"><label for="sCat">' + t("category") + '</label><select class="inp" id="sCat">' + catOpts + '</select></div>' +
      '<div class="field"><label for="sCond">' + t("condition") + '</label><select class="inp" id="sCond">' + condOpts + "</select></div></div>" +
      typeField +
      '<div class="field"><label for="sCur">' + t("currency") + '</label><select class="inp" id="sCur"' + (ed ? " disabled" : "") + ">" + curOpts + "</select></div>" +
      '<div id="secAuction" class="two"><div class="field"><label for="sStart">' + t("start_price") + '</label><input class="inp mono" id="sStart" type="text" inputmode="decimal" dir="ltr"></div>' +
      '<div class="field"><label for="sBuy">' + t("buy_now_price") + '</label><input class="inp mono" id="sBuy" type="text" inputmode="decimal" dir="ltr" placeholder="—"><span class="hint">' + t("buy_now_hint") + "</span></div>" +
      (ed ? "" : '<div class="field"><label for="sDur">' + t("duration") + '</label><select class="inp" id="sDur">' + [1, 3, 5, 7, 10].map(function (d) { return '<option value="' + d * 1440 + '"' + (d === 7 ? " selected" : "") + ">" + t("n_days", { n: num(d) }) + "</option>"; }).join("") + "</select></div>") + "</div>" +
      '<div id="secFixed" class="two"><div class="field"><label for="sPrice">' + t("price_each") + '</label><input class="inp mono" id="sPrice" type="text" inputmode="decimal" dir="ltr"></div>' +
      '<div class="field"><label for="sStockF">' + t("stock_count") + '</label><input class="inp mono" id="sStockF" type="text" inputmode="numeric" dir="ltr" value="1"></div></div>' +
      '<fieldset id="secWhs"><legend>' + t("type_wholesale") + "</legend>" +
      '<div class="two"><div class="field"><label for="sUnit">' + t("unit") + '</label><select class="inp" id="sUnit">' + unitOpts + '</select></div>' +
      '<div class="field"><label for="sStockW">' + t("stock_qty") + '</label><input class="inp mono" id="sStockW" type="text" inputmode="numeric" dir="ltr"></div></div>' +
      '<div class="flabel">' + t("tier_prices") + '</div><span class="hint" style="margin-top:-6px">' + t("tier_hint") + "</span>" +
      [1, 2, 3].map(function (i) {
        return '<div class="trow"><div class="field"><label for="sTm' + i + '">' + (i === 1 ? t("min_qty") : t("tier_from", { n: num(i) })) + '</label><input class="inp mono" id="sTm' + i + '" type="text" inputmode="numeric" dir="ltr"' + (i > 1 ? ' placeholder="—"' : "") + "></div>" +
          '<div class="field"><label for="sTp' + i + '">' + t("price_per_unit") + '</label><input class="inp mono" id="sTp' + i + '" type="text" inputmode="decimal" dir="ltr"' + (i > 1 ? ' placeholder="—"' : "") + "></div></div>";
      }).join("") + "</fieldset>" +
      '<fieldset><legend>' + t("payment_methods") + '</legend><span class="hint">' + t("payment_methods_hint") + "</span>" +
      PAYS.map(function (p) { return '<label class="check"><input type="checkbox" id="sPay_' + p + '"' + (pays.indexOf(p) > -1 ? " checked" : "") + "> " + t("pay_" + p) + "</label>"; }).join("") + "</fieldset>" +
      '<fieldset><legend>' + t("delivery") + '</legend><span class="hint">' + t("delivery_hint") + "</span>" +
      zoneRow("inland") + (isEU ? zoneRow("eu") : "") + zoneRow("welt") +
      '<label class="check"><input type="checkbox" id="sPickup"' + (ed ? (ed.pickup ? " checked" : "") : " checked") + "> " + t("pickup_possible") + "</label></fieldset>" +
      (isAF ? '<div class="field"><label for="sLoc">' + t("province") + '</label><select class="inp" id="sLoc"><option value="">—</option>' + provOpts(ed ? ed.loc : me.loc) + '</select><span class="hint">' + t("province_hint") + "</span></div>"
        : '<div class="field"><label for="sLoc">' + t("city") + '</label><input class="inp" id="sLoc" maxlength="80" dir="auto"><span class="hint">' + t("province_hint") + "</span></div>") +
      '<div class="field"><label for="sDesc">' + t("description") + '</label><textarea class="inp" id="sDesc" rows="4" maxlength="4000" dir="auto"></textarea><span class="hint">' + t("desc_hint") + "</span></div>" +
      '<div class="field"><span class="flabel">' + t("photo") + '</span><div class="drop"><div class="prev" id="sPrev"></div><div style="min-width:0"><input id="sImg" type="file" accept="image/*"><div class="hint">' + t("photo_hint") + "</div></div></div></div>" +
      '<div class="err" id="sErr" hidden></div></form>';

    openSheet(t(ed ? "edit_listing" : "new_listing"), b, '<button class="btn" type="button" id="sCancel">' + t("cancel") + '</button><button class="btn primary" type="button" id="sSubmit">' + t(ed ? "save_changes" : "publish") + "</button>", "sell");
    $("sSafety").addEventListener("click", function () { openSafety(); });

    function applyType() {
      $("secAuction").hidden = type !== "auction";
      $("secFixed").hidden = type !== "fixed";
      $("secWhs").hidden = type !== "wholesale";
    }
    if (!isAF) $("sLoc").value = ed ? ed.loc : (PROVINCES.some(function (p) { return p[0] === me.loc; }) ? "" : me.loc);
    if (ed) {
      $("sTitle").value = ed.title; $("sCat").value = catOf(ed.cat).id; $("sCond").value = CONDS.indexOf(ed.cond) > -1 ? ed.cond : "good"; $("sDesc").value = ed.desc || "";
      if (type === "auction") { $("sStart").value = ed.start; if (ed.buyNow) $("sBuy").value = ed.buyNow; }
      if (type === "fixed") { $("sPrice").value = ed.price; $("sStockF").value = ed.stock; }
      if (type === "wholesale") {
        $("sUnit").value = ed.unit; $("sStockW").value = ed.stock;
        ed.tiers.forEach(function (x, i) { $("sTm" + (i + 1)).value = x.min; $("sTp" + (i + 1)).value = x.price; });
      }
      if (ed.img) $("sPrev").innerHTML = '<img src="' + esc(ed.img) + '" alt="">';
    } else {
      $("sType").addEventListener("click", function (e) {
        var x = e.target.closest("[data-st]"); if (!x || x.disabled) return;
        type = x.getAttribute("data-st");
        $("sType").querySelectorAll("button").forEach(function (bb) { bb.setAttribute("aria-pressed", String(bb === x)); });
        applyType();
      });
    }
    applyType();
    $("sImg").addEventListener("change", function () {
      var f = this.files && this.files[0]; if (!f) return;
      shrink(f, function (blob, url) {
        if (!blob) { toast(t("err_image_read")); return; }
        draftFile = blob; $("sPrev").innerHTML = '<img src="' + url + '" alt="">';
      });
    });
    $("sCancel").addEventListener("click", function () { if (ed) openDetail(ed.id); else closeSheet(); });
    $("sSubmit").addEventListener("click", function () { submitSell(type, ed, country); });
    $("sTitle").focus();
  }
  function shrink(file, cb) {
    var r = new FileReader();
    r.onerror = function () { cb(null); };
    r.onload = function () {
      var img = new Image();
      img.onerror = function () { cb(null); };
      img.onload = function () {
        var max = 800, w = img.width, h = img.height, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        try { var url = c.toDataURL("image/jpeg", 0.7); c.toBlob(function (blob) { cb(blob, url); }, "image/jpeg", 0.7); } catch (e) { cb(null); }
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  }
  function uploadImage(blob) {
    var path = uid + "/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + ".jpg";
    return sb.storage.from("listing-images").upload(path, blob, { contentType: "image/jpeg" }).then(function (r) {
      if (r.error) throw r.error;
      return sb.storage.from("listing-images").getPublicUrl(path).data.publicUrl;
    });
  }
  function submitSell(type, ed, country) {
    var errs = [];
    function mark(id, bad, msg) { var el = $(id); if (el) el.classList.toggle("bad", !!bad); if (bad) errs.push(msg); }
    function isInt(v) { return isFinite(v) && v === Math.floor(v); }
    document.querySelectorAll("#sellForm .bad").forEach(function (el) { el.classList.remove("bad"); });

    var title = $("sTitle").value.trim(), loc = $("sLoc").value.trim();
    mark("sTitle", title.length < 3, t("v_title"));

    var data = {};
    if (type === "auction") {
      var st = parseNum($("sStart").value), buyRaw = String($("sBuy").value).trim(), buy = buyRaw ? parseNum(buyRaw) : 0;
      mark("sStart", !(isFinite(st) && st >= 1), t("v_start"));
      mark("sBuy", buyRaw && !(isFinite(buy) && isFinite(st) && buy > st), t("v_buynow"));
      data = { start_price: round2(st), buy_now: buyRaw ? round2(buy) : null };
    } else if (type === "fixed") {
      var pr = parseNum($("sPrice").value), sk = parseNum($("sStockF").value);
      mark("sPrice", !(isFinite(pr) && pr > 0), t("v_price"));
      mark("sStockF", !(isInt(sk) && sk >= (ed ? 0 : 1)), t("v_stock"));
      data = { price: round2(pr), stock: sk };
    } else {
      var tiers = [], tierBad = false;
      [1, 2, 3].forEach(function (i) {
        var mRaw = String($("sTm" + i).value).trim(), pRaw = String($("sTp" + i).value).trim();
        if (i > 1 && !mRaw && !pRaw) return;
        var m = parseNum(mRaw), p = parseNum(pRaw), prev = tiers[tiers.length - 1];
        var ok = mRaw && pRaw && isInt(m) && m >= 1 && isFinite(p) && p > 0 && (!prev || (m > prev.min && p < prev.price));
        if (!ok) { tierBad = true; $("sTm" + i).classList.add("bad"); $("sTp" + i).classList.add("bad"); }
        else tiers.push({ min: m, price: round2(p) });
      });
      if (tierBad || !tiers.length) errs.push(t("v_tiers"));
      var sw = parseNum($("sStockW").value);
      mark("sStockW", !(isInt(sw) && tiers.length && sw >= tiers[0].min), t("v_stock_moq"));
      data = { tiers: tiers, stock: sw, unit: $("sUnit").value };
    }

    var pays = PAYS.filter(function (p) { return $("sPay_" + p).checked; });
    if (!pays.length) errs.push(t("v_pay"));

    var ship = { inland: null, eu: null, welt: null }, anyZone = false;
    ZONES.forEach(function (zn) {
      var box = $("sZ_" + zn); if (!box || !box.checked) return;
      var cst = parseNum($("sC_" + zn).value || "0");
      if (!(isFinite(cst) && cst >= 0)) { mark("sC_" + zn, true, t("v_ship_cost")); return; }
      ship[zn] = { c: round2(cst), d: $("sD_" + zn).value.trim().slice(0, 20) }; anyZone = true;
    });
    var pickup = $("sPickup").checked;
    if (!anyZone && !pickup) errs.push(t("v_delivery"));
    mark("sLoc", !loc, t(country === "AF" ? "v_province" : "v_city"));

    if (errs.length) { $("sErr").textContent = t("please_check") + " " + errs.join(sep()); $("sErr").hidden = false; $("sErr").scrollIntoView({ block: "nearest" }); return; }

    var row = { title: title, cat: $("sCat").value, cond: $("sCond").value, loc: loc, descr: $("sDesc").value.trim(), ship: ship, pickup: pickup, pay_methods: pays };
    Object.keys(data).forEach(function (k) { row[k] = data[k]; });
    if (!ed) {
      row.type = type; row.country = country; row.currency = $("sCur").value;
      if (type === "auction") row.ends_at = new Date(Date.now() + parseInt($("sDur").value, 10) * MIN).toISOString();
    }
    var btn = $("sSubmit"); busy(btn, true, t(draftFile ? "uploading_photo" : "saving"));
    var p = draftFile ? uploadImage(draftFile) : Promise.resolve(null);
    p.then(function (url) {
      if (url) row.img_url = url;
      busy(btn, true, t("saving"));
      return ed ? sb.from("listings").update(row).eq("id", ed.id).select("id").single() : sb.from("listings").insert(row).select("id").single();
    }).then(function (r) {
      if (r.error) throw r.error;
      var id = r.data.id;
      if (!ed) { ui.view = "browse"; ui.sort = "new"; }
      toast(t(ed ? "changes_saved" : "listing_published"));
      return refresh().then(function () { openDetail(id); });
    }).catch(function (e) {
      busy(btn, false, t(ed ? "save_changes" : "publish"));
      $("sErr").textContent = errMsg(e); $("sErr").hidden = false; $("sErr").scrollIntoView({ block: "nearest" });
    });
  }

  /* ---------- Misc ---------- */
  var toastT;
  function toast(m) { var el = $("toast"); el.textContent = m; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 4000); }

  var endedSeen = {};
  setInterval(function () {
    var now = Date.now(), changed = false;
    document.querySelectorAll("[data-end]").forEach(function (el) {
      var ms = +el.getAttribute("data-end") - now;
      el.textContent = left(ms);
      el.className = "left " + (ms <= 0 ? "over" : ms < 10 * MIN ? "soon" : "");
    });
    listings.forEach(function (l) { if (ended(l) && !endedSeen[l.id]) { endedSeen[l.id] = 1; changed = true; } });
    if (changed && loaded) {
      render();
      if (sheetMode === "detail" && sheetId) { var y = $("sheetBody").scrollTop; openDetail(sheetId); $("sheetBody").scrollTop = y; }
    }
  }, 1000);
  setInterval(function () { if ($("sheet").hidden && document.visibilityState === "visible") refresh(); }, 60000);

  sb.auth.onAuthStateChange(function (event, session) {
    var newUid = session && session.user ? session.user.id : null;
    userEmail = session && session.user ? session.user.email : "";
    if (event === "PASSWORD_RECOVERY") { uid = newUid; setTimeout(function () { openAuth("newpass"); }, 0); }
    if (newUid !== uid || event === "SIGNED_IN" || event === "USER_UPDATED") {
      uid = newUid;
      setTimeout(function () { refresh(); }, 0);
    }
  });

  applyLang();
  renderHeader();
  sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    uid = s ? s.user.id : null; userEmail = s ? s.user.email : "";
    return refresh();
  }).then(function () {
    listings.forEach(function (l) { if (ended(l)) endedSeen[l.id] = 1; });
    if (/type=signup|type=recovery|access_token/.test(location.hash)) {
      try { history.replaceState(null, "", location.pathname); } catch (e) {}
      if (uid) toast(t("email_confirmed"));
    }
    if (/error_description=/.test(location.hash)) { toast(t("link_invalid")); try { history.replaceState(null, "", location.pathname); } catch (e) {} }
  });
})();
