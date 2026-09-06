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

  function buildOverlay(){
    var el = document.createElement('div');
    el.id = 'staff-auth-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#1B1613;' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-family:"PingFang SC","Microsoft YaHei",sans-serif;';
    el.innerHTML =
      '<div style="width:100%;max-width:320px;padding:24px;box-sizing:border-box;">' +
        '<h2 style="margin:0 0 20px;font-size:18px;text-align:center;color:#F3ECE1;">员工登录</h2>' +
        '<input id="staff-auth-user" autocomplete="off" placeholder="用户名" ' +
          'style="width:100%;box-sizing:border-box;padding:12px;margin-bottom:10px;border-radius:8px;' +
          'border:1px solid #3D332B;background:#2A2119;color:#F3ECE1;font-size:15px;">' +
        '<input id="staff-auth-pass" type="password" autocomplete="off" placeholder="密码" ' +
          'style="width:100%;box-sizing:border-box;padding:12px;margin-bottom:10px;border-radius:8px;' +
          'border:1px solid #3D332B;background:#2A2119;color:#F3ECE1;font-size:15px;">' +
        '<div id="staff-auth-error" style="color:#E3421F;font-size:13px;min-height:18px;margin-bottom:8px;"></div>' +
        '<button id="staff-auth-submit" ' +
          'style="width:100%;padding:12px;border-radius:8px;border:none;background:#E3421F;' +
          'color:#fff;font-weight:700;font-size:15px;">登录</button>' +
      '</div>';
    return el;
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

  function mount(){
    if (overlay) return;
    overlay = buildOverlay();
    document.body.appendChild(overlay);
    document.getElementById('staff-auth-submit').addEventListener('click', submit);
    ['staff-auth-user', 'staff-auth-pass'].forEach(function(id){
      document.getElementById(id).addEventListener('keydown', function(ev){
        if (ev.key === 'Enter') submit();
      });
    });
    document.getElementById('staff-auth-user').focus();
  }

  function unmount(){
    if (overlay){ overlay.remove(); overlay = null; }
  }

  // 默认先锁住（挂上登录框），确认真的登录过才解锁——避免 Firebase 校验会话
  // 这一小段异步空档里，页面内容先被看到
  function init(){
    mount();
    firebase.auth().onAuthStateChanged(function(user){
      if (user) unmount();
    });
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
