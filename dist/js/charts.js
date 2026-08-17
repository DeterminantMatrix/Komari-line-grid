(function (global) {
  'use strict';

  function finite(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function css(name, fallback) {
    var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function escapeAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function rgba(hex, alpha) {
    var raw = String(hex || '#d5d0c4').replace('#', '');
    if (raw.length === 3) raw = raw.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(raw, 16);
    if (!Number.isFinite(n)) return 'rgba(213,208,196,' + alpha + ')';
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function spark(values, options) {
    options = options || {};
    var width = options.w || 480;
    var height = options.h || 80;
    var points = (values || []).map(function (value) {
      if (value && typeof value === 'object') {
        var candidate = value.value != null ? value.value : value.v;
        return finite(candidate);
      }
      return finite(value);
    });
    if (!points.length) return '<div class="chart-empty">暂无历史数据</div>';

    var good = points.filter(function (value) { return value != null && value >= 0; });
    if (!good.length) return '<div class="chart-empty">暂无历史数据</div>';
    var dataMax = Math.max.apply(null, good);
    var max = dataMax <= 50 ? 50 : dataMax <= 100 ? 100 : dataMax <= 200 ? 200 : dataMax <= 500 ? 500 : Math.ceil(dataMax / 100) * 100;
    var padX = 3;
    var padY = 6;
    var step = points.length === 1 ? 0 : (width - padX * 2) / (points.length - 1);
    var coords = points.map(function (value, index) {
      var x = padX + index * step;
      var normalized = value == null || value < 0 ? 0 : value;
      var y = height - padY - normalized / Math.max(1, max) * (height - padY * 2);
      return [x, y];
    });
    var d = coords.map(function (point, index) {
      return (index ? 'L' : 'M') + point[0].toFixed(2) + ' ' + point[1].toFixed(2);
    }).join(' ');
    var color = options.color || css('--ink', '#d5d0c4');
    var hitWidth = Math.max(6, step || width);
    var hits = coords.map(function (point, index) {
      var value = points[index];
      var tip = options.tips && options.tips[index] || (value == null || value < 0 ? '无数据' : value + ' ms');
      return '<rect class="chart-hit" data-tip="' + escapeAttr(tip) + '" x="' + (point[0] - hitWidth / 2).toFixed(2) + '" y="0" width="' + hitWidth.toFixed(2) + '" height="' + height + '" fill="transparent"/>';
    }).join('');
    return '<svg class="spark" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none"><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.25" vector-effect="non-scaling-stroke"/>' + hits + '</svg>';
  }

  function multiSpark(series, options) {
    options = options || {};
    var width = options.w || 480;
    var height = options.h || 80;
    var rows = (series || []).map(function (item, rowIndex) {
      var values = (item.values || []).map(function (value) {
        if (value && typeof value === 'object') {
          var candidate = value.value != null ? value.value : value.v;
          return finite(candidate);
        }
        return finite(value);
      });
      return {
        label: item.label || ('Series ' + (rowIndex + 1)),
        values: values,
        color: item.color || null,
        dash: item.dash || '',
        tips: item.tips || []
      };
    }).filter(function (item) { return item.values.length; });
    if (!rows.length) return '<div class="chart-empty">暂无历史数据</div>';
    var good = [];
    rows.forEach(function (row) {
      row.values.forEach(function (value) { if (value != null && value >= 0) good.push(value); });
    });
    if (!good.length) return '<div class="chart-empty">暂无历史数据</div>';
    var dataMax = Math.max.apply(null, good);
    var max = dataMax <= 50 ? 50 : dataMax <= 100 ? 100 : dataMax <= 200 ? 200 : dataMax <= 500 ? 500 : Math.ceil(dataMax / 100) * 100;
    var padX = 3;
    var padY = 6;
    var defaults = [css('--ink', '#d5d0c4'), css('--gold', '#c4a56a'), css('--live', '#8fa676'), rgba(css('--ink', '#d5d0c4'), 0.55), css('--down', '#b06d52')];
    var paths = '';
    rows.forEach(function (row, rowIndex) {
      var step = row.values.length === 1 ? 0 : (width - padX * 2) / (row.values.length - 1);
      var d = '';
      var started = false;
      row.values.forEach(function (value, index) {
        if (value == null || value < 0) { started = false; return; }
        var x = padX + index * step;
        var y = height - padY - value / Math.max(1, max) * (height - padY * 2);
        d += (started ? ' L ' : ' M ') + x.toFixed(2) + ' ' + y.toFixed(2);
        started = true;
      });
      if (d) paths += '<path d="' + d.trim() + '" fill="none" stroke="' + (row.color || defaults[rowIndex % defaults.length]) + '" stroke-width="1.25"' + (row.dash ? ' stroke-dasharray="' + escapeAttr(row.dash) + '"' : '') + ' vector-effect="non-scaling-stroke"/>';
    });
    var maxLen = Math.max.apply(null, rows.map(function (row) { return row.values.length; }));
    var hits = '';
    if (maxLen > 0) {
      var hitStep = maxLen === 1 ? width : (width - padX * 2) / (maxLen - 1);
      var hitWidth = Math.max(8, hitStep || width);
      for (var hitIndex = 0; hitIndex < maxLen; hitIndex += 1) {
        var tips = [];
        rows.forEach(function (row) {
          var scaledIndex = row.values.length <= 1 || maxLen <= 1 ? 0 : Math.round(hitIndex * (row.values.length - 1) / (maxLen - 1));
          var value = row.values[scaledIndex];
          if (value == null) return;
          tips.push(row.label + ' ' + (value < 0 ? '无数据' : Math.round(value) + ' ms'));
        });
        var x = padX + hitIndex * hitStep;
        hits += '<rect class="chart-hit" data-tip="' + escapeAttr(tips.join(' · ')) + '" x="' + (x - hitWidth / 2).toFixed(2) + '" y="0" width="' + hitWidth.toFixed(2) + '" height="' + height + '" fill="transparent"/>';
      }
    }
    return '<svg class="spark multi-spark" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">' + paths + hits + '</svg>';
  }

  function bars(items, options) {
    options = options || {};
    var width = options.w || 480;
    var height = options.h || 120;
    var list = items || [];
    if (!list.length) return '<div class="chart-empty">暂无流量数据</div>';
    var values = list.map(function (item) {
      var value = typeof item === 'number' ? item : item && item.total;
      return finite(value) || 0;
    });
    var max = Math.max.apply(null, values.concat([1]));
    var gap = 6;
    var barWidth = (width - gap * (values.length + 1)) / Math.max(1, values.length);
    var neutral = rgba(css('--ink', '#d5d0c4'), 0.4);
    var gold = css('--gold', '#c4a56a');
    var rects = values.map(function (value, index) {
      var barHeight = Math.max(2, value / max * (height - 8));
      var x = gap + index * (barWidth + gap);
      var y = height - barHeight;
      var tip = options.tips && options.tips[index] || String(value);
      return '<rect class="chart-hit" data-tip="' + escapeAttr(tip) + '" x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + Math.max(2, barWidth).toFixed(2) + '" height="' + barHeight.toFixed(2) + '" fill="' + (index === values.length - 1 ? gold : neutral) + '"/>';
    }).join('');
    return '<svg class="bars" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">' + rects + '</svg>';
  }

  function stacked(items, options) {
    options = options || {};
    var width = options.w || 520;
    var height = options.h || 150;
    var list = items || [];
    if (!list.length) return '<div class="chart-empty">暂无流量数据</div>';
    var totals = list.map(function (item) {
      return (finite(item && (item.downlink != null ? item.downlink : item.down)) || 0) + (finite(item && (item.uplink != null ? item.uplink : item.up)) || 0);
    });
    var max = Math.max.apply(null, totals.concat([1]));
    var gap = 7;
    var barWidth = (width - gap * (list.length + 1)) / Math.max(1, list.length);
    var neutral = rgba(css('--ink', '#d5d0c4'), 0.4);
    var gold = css('--gold', '#c4a56a');
    return '<svg class="bars" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">' + list.map(function (item, index) {
      var down = finite(item && (item.downlink != null ? item.downlink : item.down)) || 0;
      var up = finite(item && (item.uplink != null ? item.uplink : item.up)) || 0;
      var downHeight = Math.max(1, down / max * (height - 8));
      var upHeight = Math.max(1, up / max * (height - 8));
      var x = gap + index * (barWidth + gap);
      var tip = options.tips && options.tips[index] || '';
      return '<rect class="chart-hit" data-tip="' + escapeAttr(tip) + '" x="' + x.toFixed(2) + '" y="' + (height - downHeight).toFixed(2) + '" width="' + Math.max(2, barWidth).toFixed(2) + '" height="' + downHeight.toFixed(2) + '" fill="' + neutral + '"/><rect class="chart-hit" data-tip="' + escapeAttr(tip) + '" x="' + x.toFixed(2) + '" y="' + (height - downHeight - upHeight).toFixed(2) + '" width="' + Math.max(2, barWidth).toFixed(2) + '" height="' + upHeight.toFixed(2) + '" fill="' + gold + '"/>';
    }).join('') + '</svg>';
  }

  function wave(options) {
    options = options || {};
    var width = options.w || 600;
    var height = options.h || 55;
    var mid = height / 2;
    var d = 'M 0 ' + mid;
    for (var x = 0; x <= width; x += 3) {
      var t = x / width;
      var envelope = t > 0.55 && t < 0.9 ? Math.sin((t - 0.55) / 0.35 * Math.PI) : 0;
      var y = mid - Math.sin(t * Math.PI * 4.4) * 16 * envelope;
      d += ' L ' + x + ' ' + y.toFixed(1);
    }
    return '<svg class="wave" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '" fill="none" stroke="' + rgba(css('--ink', '#d5d0c4'), 0.35) + '" stroke-width="1.1"/></svg>';
  }

  function ruler(today, daysInMonth, options) {
    options = options || {};
    var heights = options.heights || [];
    var selected = options.selected || today;
    var half = options.halfDay || 0;
    var width = 1000;
    var height = 48;
    var maxHeight = Math.max.apply(null, heights.concat([1]));
    var ticks = '';
    var labels = '';
    for (var day = 1; day <= daysInMonth; day += 1) {
      var x = ((day - 1) / Math.max(1, daysInMonth - 1)) * (width - 8) + 4;
      var future = day > today;
      var amplitude = heights[day - 1] != null ? 8 + (heights[day - 1] / maxHeight) * 18 : 8;
      var y2 = 26;
      var y1 = y2 - (future ? 6 : amplitude);
      var color = day === selected ? css('--gold', '#c4a56a') : rgba(css('--ink', '#d5d0c4'), future ? 0.12 : 0.28);
      ticks += '<line x1="' + x.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + y2 + '" stroke="' + color + '" stroke-width="' + (day === selected ? 1.6 : 1) + '"/>';
      if (day === 1 || day === 5 || day === 10 || day === 15 || day === 20 || day === 25 || day === daysInMonth) {
        labels += '<text x="' + x.toFixed(1) + '" y="44" text-anchor="middle" fill="' + rgba(css('--ink', '#d5d0c4'), 0.28) + '" font-size="11" font-family="IBM Plex Mono, monospace">' + String(day).padStart(2, '0') + '</text>';
      }
    }
    var selectedX = ((selected - 1) / Math.max(1, daysInMonth - 1)) * (width - 8) + 4;
    var marker = '<line x1="' + selectedX.toFixed(1) + '" y1="2" x2="' + selectedX.toFixed(1) + '" y2="26" stroke="' + css('--gold', '#c4a56a') + '" stroke-width="1.2"/><circle cx="' + selectedX.toFixed(1) + '" cy="30" r="7" fill="' + css('--void', '#0c0c0c') + '" stroke="' + css('--gold', '#c4a56a') + '"/><text x="' + selectedX.toFixed(1) + '" y="33.5" text-anchor="middle" fill="' + css('--ink', '#d5d0c4') + '" font-size="8" font-family="IBM Plex Mono, monospace">' + selected + '</text>';
    var extra = '';
    if (half && half !== selected) {
      var halfX = ((half - 1) / Math.max(1, daysInMonth - 1)) * (width - 8) + 4;
      extra = '<circle cx="' + halfX.toFixed(1) + '" cy="30" r="3" fill="none" stroke="' + rgba(css('--ink', '#d5d0c4'), 0.4) + '"/>';
    }
    return '<svg class="ruler-svg" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" aria-hidden="true">' + ticks + labels + extra + marker + '</svg>';
  }

  global.LineGridCharts = { spark: spark, multiSpark: multiSpark, bars: bars, stacked: stacked, wave: wave, ruler: ruler };
})(window);
