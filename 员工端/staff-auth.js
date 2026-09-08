// 员工端登录门槛——真正接入 Firebase Authentication（邮箱+密码），不再是前端一个
// if 判断。Firestore 规则（见 firebase/firestore.rules）同步要求员工专属的写操作
// 必须 request.auth != null，所以这道登录挡的是"数据库本身"，不只是网页。
// 页面上只显示"用户名"，这里自动拼上固定后缀凑成 Firebase 要求的邮箱格式——
// 员工不需要知道背后其实是邮箱登录。
// 依赖：本文件之前必须已加载 firebase-app-compat.js / firebase-auth-compat.js，
// 并且已经 firebase.initializeApp(...)（见各页面 <head> 里的共用初始化片段）。
(function(){
  var EMAIL_SUFFIX = '@sjxddxt.local';

  function toEmail(username){
    username = username.toLowerCase();
    return username.indexOf('@') === -1 ? username + EMAIL_SUFFIX : username;
  }

  var overlay = null;

  // 页面之间跳转，每个页面都会重新跑一遍这套登录检查，遮罩会跟着重新挂载一次——
  // 之前遮罩背景写死是深色（#1B1613），但各页面自己的主题不统一：员工端大部分
  // 页面是浅色底（--paper），但接单看板/员工加菜/操作日志这几个是特意做成深色底
  // 的。写死深色在浅色页面上就是一闪一块黑；如果反过来写死浅色，深色页面又会
  // 反过来闪一下白。所以这里改成运行时读当前页面自己 :root 里定义的主题变量——
  // 不管页面用的是哪一套命名（浅色页面是 --paper/--ink/--hairline，深色页面是
  // --bg/--text/--line），挑第一个存在的，取不到才退回浅色默认值
  function themeColors(){
    var cs = getComputedStyle(document.documentElement);
    function pick(a, b){
      var v = (cs.getPropertyValue(a) || '').trim();
      if (v) return v;
      v = (cs.getPropertyValue(b) || '').trim();
      return v;
    }
    return {
      bg: pick('--paper', '--bg') || '#FDFCF9',
      fg: pick('--ink', '--text') || '#1C1712',
      line: pick('--hairline', '--line') || '#E6E0D6'
    };
  }

  // 先挂一个遮罩挡住页面内容，此时还不知道到底有没有登录过，不能先把表单
  // 画出来——真登录过的人会在 onAuthStateChanged 回调里看到一闪而过的表单，
  // 体验上像是"又要登一次"。真正的表单要等确认没登录了才由 showForm() 填进去。
  // 遮罩里先放一个转圈的 loading，不然纯色屏一下，员工会以为系统卡住了
  function buildBlocker(){
    var theme = themeColors();
    var el = document.createElement('div');
    el.id = 'staff-auth-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:' + theme.bg + ';' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-family:"PingFang SC","Microsoft YaHei",sans-serif;' +
      'opacity:1;transition:opacity .15s ease;';
    el.innerHTML =
      '<svg width="30" height="30" viewBox="0 0 20 20" fill="none">' +
        '<circle cx="10" cy="10" r="8" stroke="' + theme.line + '" stroke-width="2"/>' +
        '<path d="M10 2a8 8 0 0 1 8 8" stroke="' + theme.fg + '" stroke-width="2" stroke-linecap="round">' +
          '<animateTransform attributeName="transform" type="rotate" from="0 10 10" to="360 10 10" dur="0.7s" repeatCount="indefinite"/>' +
        '</path>' +
      '</svg>';
    return el;
  }

  function showForm(){
    if (!overlay) return;
    var theme = themeColors();
    overlay.innerHTML =
      '<div style="width:100%;max-width:320px;padding:24px;box-sizing:border-box;">' +
        '<h2 style="margin:0 0 20px;font-size:18px;text-align:center;color:' + theme.fg + ';">员工登录</h2>' +
        '<input id="staff-auth-user" autocomplete="off" placeholder="用户名" ' +
          'style="width:100%;box-sizing:border-box;padding:12px;margin-bottom:10px;border-radius:8px;' +
          'border:1px solid ' + theme.line + ';background:' + theme.bg + ';color:' + theme.fg + ';font-size:15px;">' +
        '<input id="staff-auth-pass" type="password" autocomplete="off" placeholder="密码" ' +
          'style="width:100%;box-sizing:border-box;padding:12px;margin-bottom:10px;border-radius:8px;' +
          'border:1px solid ' + theme.line + ';background:' + theme.bg + ';color:' + theme.fg + ';font-size:15px;">' +
        '<div id="staff-auth-error" style="color:#E3421F;font-size:13px;min-height:18px;margin-bottom:8px;"></div>' +
        '<button id="staff-auth-submit" ' +
          'style="width:100%;padding:12px;border-radius:8px;border:none;background:#E3421F;' +
          'color:#fff;font-weight:700;font-size:15px;">登录</button>' +
      '</div>';
    document.getElementById('staff-auth-submit').addEventListener('click', submit);
    ['staff-auth-user', 'staff-auth-pass'].forEach(function(id){
      document.getElementById(id).addEventListener('keydown', function(ev){
        if (ev.key === 'Enter') submit();
      });
    });
    document.getElementById('staff-auth-user').focus();
  }

  function submit(){
    var userInput = document.getElementById('staff-auth-user');
    var passInput = document.getElementById('staff-auth-pass');
    var errEl = document.getElementById('staff-auth-error');
    var btn = document.getElementById('staff-auth-submit');
    var u = userInput.value.trim();
    var p = passInput.value;
    if (!u || !p){
      errEl.textContent = '请输入用户名和密码';
      return;
    }
    btn.disabled = true;
    btn.textContent = '登录中…';
    firebase.auth().signInWithEmailAndPassword(toEmail(u), p).catch(function(err){
      errEl.textContent = err.code === 'auth/too-many-requests'
        ? '尝试次数过多，请稍后再试'
        : '用户名或密码错误';
      passInput.value = '';
      btn.disabled = false;
      btn.textContent = '登录';
    });
  }

  function mountBlocker(){
    if (overlay) return;
    overlay = buildBlocker();
    document.body.appendChild(overlay);
  }

  function unmount(){
    if (!overlay) return;
    var el = overlay;
    overlay = null;
    el.style.opacity = '0';
    setTimeout(function(){ el.remove(); }, 150);
  }

  // 默认先挂空遮罩挡住页面内容，直到 Firebase 确认登录状态才决定：已登录就直接
  // 撤掉遮罩，没登录才把表单画出来——避免已登录的人看到表单一闪而过
  function init(){
    mountBlocker();
    firebase.auth().onAuthStateChanged(function(user){
      if (user) unmount();
      else showForm();
    });
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
