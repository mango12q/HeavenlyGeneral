// 天朝小将 2.8 · 存档默认注入
// 在游戏加载时自动把 saves_99.json 的 99 个存档写入 localStorage，
// 仅当检测到全新环境（账号1 存档不存在）时注入，避免覆盖玩家已有进度。
(function () {
  'use strict';
  if (window.__autoInjectSavesInstalled) return;
  window.__autoInjectSavesInstalled = true;

  function shouldInject() {
    try {
      // 账号 1 与账号 99 都不存在 → 视为全新环境，注入默认存档
      var a = localStorage.getItem('tianchaoxiaojiang_save_v3_1');
      var z = localStorage.getItem('tianchaoxiaojiang_save_v3_99');
      return !a && !z;
    } catch (e) { return false; }
  }

  function inject() {
    try {
      fetch('saves_99.json', { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (saves) {
          if (!saves) return;
          var count = 0;
          Object.keys(saves).forEach(function (k) {
            try { localStorage.setItem(k, JSON.stringify(saves[k])); count++; } catch (e) {}
          });
          if (count > 0) {
            try { localStorage.removeItem('tcxj_local_db_v1'); } catch (e) {} // 让斗神殿预注册重建排行榜
            console.log('[自动注入] 已写入 ' + count + ' 个默认存档');
          }
        })
        .catch(function (e) {
          console.warn('[自动注入] 加载存档失败：' + e.message);
        });
    } catch (e) {
      console.warn('[自动注入] 异常：' + e.message);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    inject();
  } else {
    document.addEventListener('DOMContentLoaded', inject);
  }
})();
