(function (global) {
  function n(v) { return Number.isFinite(v) ? v : 0; }

  function token(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function parseColor(v) {
    v = String(v || "").trim();
    const rgb = v.match(/rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i);
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    let hex = v.replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      const n = parseInt(hex, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return null;
  }

  function isLight() {
    return document.documentElement.getAttribute("data-theme") === "light";
  }

  function inkRgba(a) {
    const p = parseColor(token("--ink", "#ddd6c8"));
    if (!p) return "rgba(221,214,200," + a + ")";
    return "rgba(" + p[0] + "," + p[1] + "," + p[2] + "," + a + ")";
  }

  function gold() { return token("--gold", "#c4a56a"); }
  function voidFill() { return token("--void", "#15130f"); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function axisTime(ts) {
    if (!Number.isFinite(Number(ts))) return "";
    return new Date(Number(ts)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function axisNumber(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return "—";
    if (Math.abs(v) >= 100) return String(Math.round(v));
    return String(Math.round(v * 10) / 10);
  }

  function spark(values, opt) {
    opt = opt || {};
    const w = opt.w || 240;
    const h = opt.h || 40;
    const raw = values || [];
    const pts = raw.map(function (v) { return typeof v === "object" && v ? n(v.v) : n(v); });
    if (!pts.length) return "";
    const usable = pts.filter(function (v) { return v >= 0 && Number.isFinite(v); });
    const dataMin = Math.min.apply(null, usable.length ? usable : [0]);
    const dataMax = Math.max.apply(null, usable.length ? usable : [0]);
    function niceMax(m) {
      if (m <= 50) return 50;
      if (m <= 100) return 100;
      if (m <= 200) return 200;
      if (m <= 500) return 500;
      return Math.ceil(m / 100) * 100;
    }
    let min = 0;
    let max = niceMax(dataMax);
    if (opt.adaptiveY && usable.length) {
      const rawSpan = Math.max(0, dataMax - dataMin);
      const yPad = rawSpan > 0 ? Math.max(3, rawSpan * 0.16) : Math.max(3, Math.abs(dataMax) * 0.08);
      min = Math.max(0, dataMin - yPad);
      max = Math.max(min + 6, dataMax + yPad);
    }
    const span = Math.max(1, max - min);
    const showY = opt.showYAxis === true;
    const showX = opt.showXAxis === true;
    const padL = showY ? 48 : 2;
    const padR = 6;
    const padT = 7;
    const padB = showX ? 24 : 7;
    const plotW = Math.max(1, w - padL - padR);
    const plotH = Math.max(1, h - padT - padB);
    const plotBottom = padT + plotH;
    const step = pts.length === 1 ? 0 : plotW / (pts.length - 1);
    const coords = pts.map(function (v, i) {
      const x = padL + i * step;
      const y = plotBottom - ((v < 0 ? min : v) - min) / span * plotH;
      return [x, y];
    });
    let d = "";
    let drawing = false;
    let first = null;
    let last = null;
    coords.forEach(function (p, i) {
      if (pts[i] < 0) { drawing = false; return; }
      d += (drawing ? " L " : "M ") + p[0].toFixed(2) + " " + p[1].toFixed(2);
      if (!first) first = p;
      last = p;
      drawing = true;
    });
    if (!first) first = coords[0];
    if (!last) last = coords[coords.length - 1];
    const color = opt.color || token("--ink", "#ddd6c8");
    const hitW = Math.max(6, step || plotW);
    const hits = coords.map(function (p, i) {
      const tip = (opt.tips && opt.tips[i]) || (pts[i] < 0 ? "无数据" : pts[i] + " ms");
      return '<rect class="chart-hit" data-tip="' + esc(tip) + '" x="' + (p[0] - hitW / 2).toFixed(2) + '" y="' + padT + '" width="' + hitW.toFixed(2) + '" height="' + plotH.toFixed(2) + '" fill="transparent"/>';
    }).join("");
    let grid = "";
    [0, 0.5, 1].forEach(function (t) {
      const y = plotBottom - t * plotH;
      grid += '<line class="spark-grid" x1="' + padL + '" y1="' + y.toFixed(2) + '" x2="' + (w - padR) + '" y2="' + y.toFixed(2) + '" stroke="' + inkRgba(t === 0 ? 0.16 : 0.08) + '" stroke-width="0.6"/>';
    });
    let axes = '';
    if (showY) {
      [0, 0.5, 1].forEach(function (t) {
        const y = plotBottom - t * plotH;
        const val = min + t * span;
        axes += '<text class="axis-label" x="' + (padL - 7) + '" y="' + (y + 3).toFixed(2) + '" text-anchor="end">' + esc(axisNumber(val)) + '</text>';
      });
      axes += '<text class="axis-unit" x="4" y="11">' + esc(opt.yUnit || '') + '</text>';
    }
    if (showX) {
      const labels = Array.isArray(opt.xLabels) && opt.xLabels.length >= 3 ? opt.xLabels : ['', '', ''];
      const xs = [padL, padL + plotW / 2, w - padR];
      labels.slice(0, 3).forEach(function (label, i) {
        axes += '<text class="axis-label axis-x" x="' + xs[i].toFixed(2) + '" y="' + (h - 5) + '" text-anchor="' + (i === 0 ? 'start' : i === 2 ? 'end' : 'middle') + '">' + esc(label) + '</text>';
      });
      axes += '<line class="axis-line" x1="' + padL + '" y1="' + plotBottom.toFixed(2) + '" x2="' + (w - padR) + '" y2="' + plotBottom.toFixed(2) + '"/>';
    }
    const fillOpacity = opt.fillOpacity == null ? 0.08 : Math.max(0, Math.min(0.35, Number(opt.fillOpacity) || 0));
    const segments = [];
    let segment = [];
    coords.forEach(function (p, i) {
      if (pts[i] < 0 || !Number.isFinite(pts[i])) { if (segment.length) segments.push(segment); segment = []; return; }
      segment.push(p);
    });
    if (segment.length) segments.push(segment);
    const area = segments.map(function (seg) {
      if (!seg.length) return '';
      let sd = '';
      seg.forEach(function (p, i) { sd += (i ? ' L ' : 'M ') + p[0].toFixed(2) + ' ' + p[1].toFixed(2); });
      const a = seg[0], b = seg[seg.length - 1];
      return '<path class="spark-fill" d="' + sd + ' L ' + b[0].toFixed(2) + ' ' + plotBottom.toFixed(2) + ' L ' + a[0].toFixed(2) + ' ' + plotBottom.toFixed(2) + ' Z" fill="' + color + '" fill-opacity="' + fillOpacity + '" stroke="none"/>';
    }).join('');
    const packed = coords.map(function (p, i) { return p[0].toFixed(2) + "," + p[1].toFixed(2) + "," + pts[i]; }).join(";");
    return (
      '<svg class="spark' + (showY || showX ? ' has-axes' : '') + '" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" data-pts="' + packed + '">' +
        grid + area +
        '<path class="spark-line" d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.25" vector-effect="non-scaling-stroke"/>' +
        '<circle cx="' + last[0].toFixed(2) + '" cy="' + last[1].toFixed(2) + '" r="1.7" fill="' + color + '"/>' +
        axes +
        '<g class="scope-cur" hidden>' +
          '<line class="scope-v" x1="0" y1="' + padT + '" x2="0" y2="' + plotBottom.toFixed(2) + '" stroke="' + color + '" stroke-width="0.8" opacity="0.55"/>' +
          '<circle class="scope-dot" cx="0" cy="0" r="2.4" fill="none" stroke="' + color + '" stroke-width="1"/>' +
        "</g>" + hits +
      "</svg>"
    );
  }

  function bars(items, opt) {
    opt = opt || {};
    const w = opt.w || 240;
    const h = opt.h || 56;
    const list = items || [];
    const vals = list.map(function (it) { return typeof it === "number" ? it : n(it.total); });
    const max = Math.max.apply(null, vals.concat([1]));
    const gap = 6;
    const bw = (w - gap * (vals.length + 1)) / Math.max(vals.length, 1);
    const color = opt.color || inkRgba(isLight() ? 0.58 : 0.4);
    const last = gold();
    const rects = vals.map(function (v, i) {
      const bh = Math.max(2, (v / max) * (h - 8));
      const x = gap + i * (bw + gap);
      const y = h - bh;
      const fill = i === vals.length - 1 ? last : color;
      const tip = (opt.tips && opt.tips[i]) || (list[i] && list[i].tip) || String(v);
      return '<rect class="chart-hit" data-tip="' + esc(tip) + '" x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + Math.max(2, bw).toFixed(2) + '" height="' + bh.toFixed(2) + '" fill="' + fill + '"/>';
    }).join("");
    return '<svg class="bars" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">' + rects + "</svg>";
  }

  function wave(opt) {
    opt = opt || {};
    const w = opt.w || 420;
    const h = opt.h || 72;
    const mid = h / 2;
    let d = "M 0 " + mid;
    const cycles = 2.15;
    for (let x = 0; x <= w; x += 2) {
      const t = x / w;
      const env = t > 0.58 && t < 0.86 ? Math.sin((t - 0.58) / 0.28 * Math.PI) : 0;
      const y = mid - Math.sin(t * Math.PI * 2 * cycles) * 18 * env;
      d += " L " + x + " " + y.toFixed(2);
    }
    return (
      '<svg class="wave" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">' +
        '<path d="' + d + '" fill="none" stroke="' + inkRgba(0.4) + '" stroke-width="1.1"/>' +
      "</svg>"
    );
  }

  function stacked(items, opt) {
    opt = opt || {};
    const w = opt.w || 320;
    const h = opt.h || 80;
    const list = items || [];
    const downs = list.map(function (it) { return n(it.downlink || it.total); });
    const ups = list.map(function (it) { return n(it.uplink); });
    const max = Math.max.apply(null, downs.map(function (d, i) { return d + ups[i]; }).concat([1]));
    const gap = 7;
    const bw = (w - gap * (downs.length + 1)) / Math.max(downs.length, 1);
    return '<svg class="bars" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">' + downs.map(function (d, i) {
      const up = ups[i];
      const bhD = Math.max(1, (d / max) * (h - 8));
      const bhU = Math.max(1, (up / max) * (h - 8));
      const x = gap + i * (bw + gap);
      const tip = (opt.tips && opt.tips[i]) || "";
      return '<rect class="chart-hit" data-tip="' + esc(tip) + '" x="' + x.toFixed(2) + '" y="' + (h - bhD).toFixed(2) + '" width="' + Math.max(2, bw).toFixed(2) + '" height="' + bhD.toFixed(2) + '" fill="' + inkRgba(0.4) + '"/>' +
        '<rect class="chart-hit" data-tip="' + esc(tip) + '" x="' + x.toFixed(2) + '" y="' + (h - bhD - bhU).toFixed(2) + '" width="' + Math.max(2, bw).toFixed(2) + '" height="' + bhU.toFixed(2) + '" fill="' + gold() + '"/>';
    }).join("") + "</svg>";
  }

  function ruler(today, daysInMonth, opt) {
    opt = opt || {};
    const heights = opt.heights || [];
    const selected = opt.selected || today;
    const half = opt.halfDay;
    const w = 1000;
    const h = 48;
    const maxH = Math.max.apply(null, heights.concat([1]));
    let ticks = "";
    let labels = "";
    for (let d = 1; d <= daysInMonth; d += 1) {
      const x = ((d - 1) / Math.max(1, daysInMonth - 1)) * (w - 8) + 4;
      const future = d > today;
      const amp = heights[d - 1] != null ? 8 + (heights[d - 1] / maxH) * 18 : 8;
      const y2 = 26;
      const y1 = y2 - (future ? 6 : amp);
      const color = d === selected ? gold() : (future ? inkRgba(0.12) : inkRgba(0.28));
      ticks += '<line x1="' + x.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + y2 + '" stroke="' + color + '" stroke-width="' + (d === selected ? 1.6 : 1) + '"/>';
      const major = d === 1 || d === 5 || d === 10 || d === 15 || d === 20 || d === 30 || d === daysInMonth;
      if (major) {
        labels += '<text x="' + x.toFixed(1) + '" y="44" text-anchor="middle" fill="' + inkRgba(0.28) + '" font-size="11" font-family="IBM Plex Mono, monospace">' + String(d).padStart(2, "0") + "</text>";
      }
    }
    const cx = ((selected - 1) / Math.max(1, daysInMonth - 1)) * (w - 8) + 4;
    const mark =
      '<line x1="' + cx.toFixed(1) + '" y1="2" x2="' + cx.toFixed(1) + '" y2="26" stroke="' + gold() + '" stroke-width="1.2"/>' +
      '<circle cx="' + cx.toFixed(1) + '" cy="30" r="7" fill="' + voidFill() + '" stroke="' + gold() + '"/>' +
      '<text x="' + cx.toFixed(1) + '" y="33.5" text-anchor="middle" fill="' + token("--ink", "#ddd6c8") + '" font-size="8" font-family="IBM Plex Mono, monospace">' + selected + "</text>";
    let extra = "";
    if (half && half !== selected) {
      const hx = ((half - 1) / Math.max(1, daysInMonth - 1)) * (w - 8) + 4;
      extra = '<circle cx="' + hx.toFixed(1) + '" cy="30" r="3" fill="none" stroke="' + inkRgba(0.4) + '"/>';
    }
    return '<svg class="ruler-svg" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">' + ticks + labels + extra + mark + "</svg>";
  }

  function multiSpark(seriesList, opt) {
    opt = opt || {};
    const w = opt.w || 960;
    const h = opt.h || 220;
    const series = (seriesList || []).filter(function (s) { return s && Array.isArray(s.points) && s.points.length; });
    if (!series.length) return '';
    const all = [];
    series.forEach(function (s) {
      s.points.forEach(function (p) {
        const v = p && p.value != null ? Number(p.value) : NaN;
        if (Number.isFinite(v) && v >= 0) all.push(v);
      });
    });
    const dataMin = Math.min.apply(null, all.length ? all : [0]);
    const dataMax = Math.max.apply(null, all.length ? all : [50]);
    const rawSpan = Math.max(0, dataMax - dataMin);
    const yPad = rawSpan > 0 ? Math.max(4, rawSpan * 0.14) : Math.max(4, Math.abs(dataMax) * 0.08);
    const min = Math.max(0, dataMin - yPad);
    const max = Math.max(min + 8, dataMax + yPad);
    const span = Math.max(1, max - min);
    const times = [];
    series.forEach(function (s) {
      s.points.forEach(function (p) {
        const t = p && p.t != null ? Number(p.t) : NaN;
        if (Number.isFinite(t)) times.push(t);
      });
    });
    const minT = times.length ? Math.min.apply(null, times) : null;
    const maxT = times.length ? Math.max.apply(null, times) : null;
    const showY = opt.showYAxis === true;
    const showX = opt.showXAxis === true;
    const padL = showY ? 48 : 4;
    const padR = 6;
    const padT = 8;
    const padB = showX ? 24 : 8;
    const plotW = Math.max(1, w - padL - padR);
    const plotH = Math.max(1, h - padT - padB);
    const plotBottom = padT + plotH;
    function seriesColor(item, i) {
      const label = String(item && (item.label || item.key) || '');
      if (/电信|telecom/i.test(label)) return '#e2ad45';
      if (/移动|mobile/i.test(label)) return '#58a6ff';
      if (/联通|unicom/i.test(label)) return '#e06c75';
      return ['#e2ad45', '#58a6ff', '#e06c75', '#65c18c'][i % 4];
    }
    const colors = series.map(seriesColor);
    const dashes = ['', '', '', '6 3'];
    let grid = '';
    [0, 0.5, 1].forEach(function (t) {
      const y = plotBottom - t * plotH;
      grid += '<line x1="' + padL + '" y1="' + y.toFixed(2) + '" x2="' + (w - padR) + '" y2="' + y.toFixed(2) + '" stroke="' + inkRgba(t === 0 ? 0.16 : 0.08) + '" stroke-width="0.6"/>';
    });
    let axes = '';
    if (showY) {
      [0, 0.5, 1].forEach(function (t) {
        const y = plotBottom - t * plotH;
        axes += '<text class="axis-label" x="' + (padL - 7) + '" y="' + (y + 3).toFixed(2) + '" text-anchor="end">' + esc(axisNumber(min + t * span)) + '</text>';
      });
      axes += '<text class="axis-unit" x="4" y="11">' + esc(opt.yUnit || '') + '</text>';
    }
    if (showX) {
      let labels = Array.isArray(opt.xLabels) && opt.xLabels.length >= 3 ? opt.xLabels.slice(0, 3) : null;
      if (!labels && minT != null && maxT != null) labels = [axisTime(minT), axisTime(minT + (maxT - minT) / 2), axisTime(maxT)];
      labels = labels || ['', '', ''];
      const xs = [padL, padL + plotW / 2, w - padR];
      labels.forEach(function (label, i) {
        axes += '<text class="axis-label axis-x" x="' + xs[i].toFixed(2) + '" y="' + (h - 5) + '" text-anchor="' + (i === 0 ? 'start' : i === 2 ? 'end' : 'middle') + '">' + esc(label) + '</text>';
      });
      axes += '<line class="axis-line" x1="' + padL + '" y1="' + plotBottom.toFixed(2) + '" x2="' + (w - padR) + '" y2="' + plotBottom.toFixed(2) + '"/>';
    }
    let paths = '';
    let hits = '';
    series.forEach(function (s, si) {
      const pts = s.points || [];
      const step = pts.length <= 1 ? 0 : plotW / (pts.length - 1);
      let d = '';
      let drawing = false;
      let seg = [];
      const segments = [];
      pts.forEach(function (p, i) {
        const v = p && p.value != null ? Number(p.value) : NaN;
        if (!Number.isFinite(v) || v < 0) { drawing = false; if (seg.length) segments.push(seg); seg = []; return; }
        const pt = p && p.t != null ? Number(p.t) : NaN;
        const x = Number.isFinite(pt) && minT != null && maxT != null && maxT > minT
          ? padL + ((pt - minT) / (maxT - minT)) * plotW
          : padL + i * step;
        const y = plotBottom - ((v - min) / span) * plotH;
        d += (drawing ? ' L ' : 'M ') + x.toFixed(2) + ' ' + y.toFixed(2);
        drawing = true;
        seg.push([x, y]);
        const tm = p && p.t ? axisTime(p.t) : String(i + 1);
        hits += '<circle class="chart-hit" data-tip="' + esc(String(s.label || s.key || '') + ' · ' + tm + ' · ' + v + ' ms') + '" cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="5" fill="transparent"/>';
      });
      if (seg.length) segments.push(seg);
      if (d) {
        const color = colors[si % colors.length];
        segments.forEach(function (part) {
          if (!part.length) return;
          let ad = '';
          part.forEach(function (pt, i) { ad += (i ? ' L ' : 'M ') + pt[0].toFixed(2) + ' ' + pt[1].toFixed(2); });
          const a = part[0], b = part[part.length - 1];
          paths += '<path d="' + ad + ' L ' + b[0].toFixed(2) + ' ' + plotBottom.toFixed(2) + ' L ' + a[0].toFixed(2) + ' ' + plotBottom.toFixed(2) + ' Z" fill="' + color + '" fill-opacity="0.075" stroke="none"/>';
        });
        paths += '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.8"' + (dashes[si % dashes.length] ? ' stroke-dasharray="' + dashes[si % dashes.length] + '"' : '') + ' vector-effect="non-scaling-stroke"/>';
      }
    });
    const legend = '<div class="multi-legend">' + series.map(function (s, i) {
      return '<span><i style="border-top-color:' + colors[i % colors.length] + ';' + (dashes[i % dashes.length] ? 'border-top-style:dashed;' : '') + '"></i>' + esc(s.label || s.key || '') + '</span>';
    }).join('') + '</div>';
    return '<div class="multi-chart"><svg class="multi-spark' + (showY || showX ? ' has-axes' : '') + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + grid + paths + axes + hits + '</svg>' + legend + '</div>';
  }

  global.ProbeCharts = { spark: spark, multiSpark: multiSpark, bars: bars, stacked: stacked, wave: wave, ruler: ruler };
})(window);
