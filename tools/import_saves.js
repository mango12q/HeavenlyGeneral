// 天朝小将 2.8 · 99 存档一键导入（浏览器控制台执行）
// 用法：启动 8090 静态服务器后，打开 http://127.0.0.1:8090/game.html
//      再在控制台（F12）粘贴本脚本并回车。
// 说明：把 tools/generate_saves.py 生成的 saves_99.json 按账号分槽写入 localStorage。

(async () => {
  try {
    const resp = await fetch('saves_99.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const saves = await resp.json();
    Object.keys(saves).forEach(k => {
      localStorage.setItem(k, JSON.stringify(saves[k]));
    });
    console.log('[导入成功] 已写入 ' + Object.keys(saves).length + ' 个存档');
    console.log('账号1 =', saves['tianchaoxiaojiang_save_v3_1'].heroList.map(h => h.name).join('、'));
    console.log('账号99 =', saves['tianchaoxiaojiang_save_v3_99'].heroList.map(h => h.name).join('、'));
    console.log('刷新页面后登录账号 1~99 即可使用对应队伍。');
  } catch (e) {
    console.error('[导入失败]', e.message, '（请确认已启动 8090 服务器，且本页面为 http://127.0.0.1:8090/game.html）');
  }
})();
