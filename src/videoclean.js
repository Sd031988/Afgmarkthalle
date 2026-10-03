/* Entfernt Standortangaben aus MP4/MOV-Videos, bevor sie hochgeladen werden.
   Die Datei wird nicht neu kodiert: Standort-Boxen (©xyz, loci) werden in "free"
   umbenannt und ihr Inhalt genullt; Koordinaten-Texte (ISO 6709, z. B. von iPhones)
   innerhalb des moov-Bereichs werden mit Nullen überschrieben. Größe und Aufbau der
   Datei bleiben gleich, das Video bleibt abspielbar. */
window.MH_cleanVideo = function (buffer) {
  var d = new Uint8Array(buffer.slice(0));
  var dv = new DataView(d.buffer);
  var changed = 0;
  var CONTAINERS = { moov: 1, trak: 1, udta: 1, meta: 1, mdia: 1, minf: 1 };

  function type(o) { return String.fromCharCode(d[o + 4], d[o + 5], d[o + 6], d[o + 7]); }
  function boxSize(o, end) {
    var s = dv.getUint32(o), h = 8;
    if (s === 1) { s = dv.getUint32(o + 8) * 4294967296 + dv.getUint32(o + 12); h = 16; }
    else if (s === 0) s = end - o;
    return { size: s, hdr: h };
  }
  function neutralize(o, size, hdr) {
    d[o + 4] = 102; d[o + 5] = 114; d[o + 6] = 101; d[o + 7] = 101; // "free"
    for (var i = o + hdr; i < o + size; i++) d[i] = 0;
    changed++;
  }
  function walk(off, end, depth) {
    while (off + 8 <= end) {
      var b = boxSize(off, end), t = type(off);
      if (b.size < 8 || off + b.size > end) return;
      if (t === "©xyz" || t === "loci") neutralize(off, b.size, b.hdr);
      else if (CONTAINERS[t] && depth < 8) {
        var inner = off + b.hdr;
        if (t === "meta" && dv.getUint32(inner) === 0) inner += 4; // ISO "meta" ist eine FullBox
        walk(inner, off + b.size, depth + 1);
      }
      off += b.size;
    }
  }

  var off = 0, moov = null;
  while (off + 8 <= d.length) {
    var b = boxSize(off, d.length);
    if (b.size < 8) break;
    if (type(off) === "moov") moov = { o: off, s: b.size, h: b.hdr };
    off += b.size;
  }
  if (!moov) return { data: d, changed: 0, ok: false };
  walk(moov.o + moov.h, moov.o + moov.s, 0);

  // Koordinaten-Texte wie "+34.5553+069.2075/" im moov-Bereich überschreiben
  var s = "";
  for (var i = moov.o; i < moov.o + moov.s; i++) s += String.fromCharCode(d[i]);
  var re = /[+-]\d{2}(?:\.\d+)?[+-]\d{3}(?:\.\d+)?(?:[+-]\d+(?:\.\d+)?)?(?:CRS[^/]*)?\//g, m;
  while ((m = re.exec(s))) {
    for (var k = 0; k < m[0].length; k++) {
      var c = m[0].charCodeAt(k);
      if (c >= 48 && c <= 57) d[moov.o + m.index + k] = 48;
    }
    changed++;
  }
  return { data: d, changed: changed, ok: true };
};
