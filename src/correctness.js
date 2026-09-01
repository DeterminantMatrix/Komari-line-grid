(function (global) {
  'use strict';

  if (!global.ProbeAPI || !global.LiteAdapt) return;

  // v0.6.2 correctness layer. Keep the current UI intact while correcting
  // four data-ownership / query-window issues before the broader native-data
  // refactor planned for v0.7.x.

  function shanghaiDayOfMonth(nowValue) {
    const date = nowValue instanceof Date ? nowValue : new Date(nowValue == null ? Date.now() : nowValue);
    const shifted = new Date(date.getTime() + 8 * 3600000);
    return shifted.getUTCDate();
  }

  // 1) The all-node 1h Ping overview must not use common:getRecords' global
  // maxCount downsampling. That sampler groups by task ID, so a large fleet can
  // lose per-node samples before the browser computes node statistics.
  // Keep the same Lite-native RPC contract for this correctness-only release,
  // but request the complete one-hour window. The next data-layer refactor will
  // move this summary to public:getPingMetricStats / public:queryMetrics.
  global.ProbeAPI.fetchPingOverview = function () {
    return global.ProbeAPI.rpc('common:getRecords', {
      type: 'ping',
      uuid: '',
      hours: 1,
      task_id: -1,
      maxCount: -1,
    }, 18000).then(function (raw) {
      global.LiteAdapt.mergePingHistory(global.__lineGridLastPayload || null, raw);
      return global.__lineGridLastPayload || null;
    }).catch(function () {
      const payload = global.__lineGridLastPayload;
      if (payload) payload._ping_history_status = 'unavailable';
      return payload || null;
    });
  };

  // ProbeAPI keeps its canonical payload private. Capture the object identity
  // at the two public merge boundaries so the overview override above can keep
  // using the same object without creating a parallel state tree.
  const originalMergeLatest = global.LiteAdapt.mergeLatest;
  global.LiteAdapt.mergeLatest = function (payload, raw) {
    if (payload) global.__lineGridLastPayload = payload;
    return originalMergeLatest.apply(this, arguments);
  };

  const originalSnapshot = global.LiteAdapt.snapshot;
  global.LiteAdapt.snapshot = function () {
    const payload = originalSnapshot.apply(this, arguments);
    if (payload) global.__lineGridLastPayload = payload;
    return payload;
  };

  // 2) Historical Ping data owns history/statistics, but it must not replace a
  // newer live current_ms value. Preserve live current/is_loss whenever the
  // latest live report timestamp is newer than the newest history bucket.
  const originalMergePingHistory = global.LiteAdapt.mergePingHistory;
  global.LiteAdapt.mergePingHistory = function (payload, raw) {
    const liveByServer = Object.create(null);
    if (payload && Array.isArray(payload.servers)) {
      payload.servers.forEach(function (server) {
        const ping = Object.create(null);
        (server.ping || []).forEach(function (item) {
          ping[String(item.key)] = {
            current_ms: item.current_ms,
            is_loss: item.is_loss,
          };
        });
        liveByServer[String(server.uuid)] = {
          at: Number(server.last_seen_at) || 0,
          ping: ping,
        };
      });
    }

    const result = originalMergePingHistory.apply(this, arguments);
    if (!payload || !Array.isArray(payload.servers)) return result;

    payload.servers.forEach(function (server) {
      const live = liveByServer[String(server.uuid)];
      if (!live || !live.at) return;
      (server.ping || []).forEach(function (item) {
        const prior = live.ping[String(item.key)];
        if (!prior) return;
        const buckets = Array.isArray(item.buckets) ? item.buckets : [];
        const historyAt = buckets.length ? Number(buckets[buckets.length - 1].t) || 0 : 0;
        if (live.at <= historyAt) return;
        item.current_ms = prior.current_ms;
        item.is_loss = prior.is_loss;
      });
    });
    return result;
  };

  // 3) The month pulse is a natural-month chart. The previous default traffic
  // query was clamped to seven days, so dates earlier in the month became fake
  // zeros. Ask the existing Metric Store query for at least the elapsed days in
  // the current Shanghai calendar month. The 7-day widgets continue to slice
  // the same returned daily series.
  const originalFetchTrafficHistory = global.ProbeAPI.fetchTrafficHistory;
  global.ProbeAPI.fetchTrafficHistory = function (hours) {
    if (hours != null && Number(hours) > 0) return originalFetchTrafficHistory.apply(this, arguments);
    const elapsedHours = shanghaiDayOfMonth() * 24;
    return originalFetchTrafficHistory.call(this, elapsedHours);
  };

  // 4) common:getMe also treats API keys / agents as logged in. UI visibility
  // needs the guest-aware browser-user semantics of Lite's public:getMe.
  global.ProbeAPI.fetchAccess = function () {
    return global.ProbeAPI.rpc('public:getMe', {}, 5000).then(function (me) {
      const loggedIn = !!(me && me.logged_in);
      return { known: true, logged_in: loggedIn, is_admin: loggedIn };
    }).catch(function () {
      return { known: true, logged_in: false, is_admin: false };
    });
  };
})(window);
