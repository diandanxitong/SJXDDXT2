// 每天 23:50（英国/葡萄牙时间，自动处理夏令时）由 GitHub Actions 定时跑一次，
// 把"当天"的结账流水/员工操作日志/呼叫记录/单品点击打包存成一份 dailyReports
// 文档，长期保留——员工端"今日盘点"清流水、"员工操作日志"清日志，都不会影响
// 已经生成的快照。
//
// 用的是跟客户端/员工端页面完全一样的公开 Web API Key，走跟浏览器一样的
// Firestore 安全规则，不是什么后台管理员身份——这套系统本来就没有账号体系，
// 见 firebase/firestore.rules 开头的说明。
//
// 手动测试/补录某一天：
//   REPORT_DATE=2026-09-05 node scripts/daily-report.mjs
// 或者在 GitHub Actions 页面手动运行 workflow，填 date 这个 input。
// 手动指定日期时会跳过"必须是 23:45~23:59 英国时间"这个时间窗口检查。

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBaFx1ZYKzEKfQLKbnD9YE_X_EJnFXrxOE',
  authDomain: 'sjxddxt.firebaseapp.com',
  projectId: 'sjxddxt',
  storageBucket: 'sjxddxt.firebasestorage.app',
  messagingSenderId: '56738241418',
  appId: '1:56738241418:web:1ea87e2445e9d09e3d8673',
};

// 客户端/员工端页面里的 date 字段（dailyOrders/callEvents/dishClicks）本来就是
// 下单/操作那台手机用本机时区算出来的 "YYYY-MM-DD"，这里不用再转换，直接按
// 字符串相等筛选。只有 staffActionLogs 只存了 createdAt 时间戳、没有 date 字段，
// 需要用英国时区把时间戳换算成日期字符串再比较。
function londonDateStr(ms) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ms));
}

function londonHourMinute() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return { hour: get('hour'), minute: get('minute') };
}

const overrideDate = process.argv[2] || process.env.REPORT_DATE || '';
let targetDate;

if (overrideDate) {
  targetDate = overrideDate;
  console.log(`手动指定 date=${targetDate}，跳过时间窗口检查。`);
} else {
  const { hour, minute } = londonHourMinute();
  // 定时任务用两个 cron（覆盖冬令时/夏令时两种 UTC 偏移）双重触发，靠这里的
  // 时间窗口挑出真正落在英国 23:45~23:59 的那一次，另一次直接跳过不生成
  if (!(hour === '23' && Number(minute) >= 45)) {
    console.log(`现在英国时间 ${hour}:${minute}，不在 23:45~23:59 窗口内，跳过。`);
    process.exit(0);
  }
  targetDate = londonDateStr(Date.now());
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fetchAll(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

const [orders, actionLogs, calls, clicks] = await Promise.all([
  fetchAll('dailyOrders'),
  fetchAll('staffActionLogs'),
  fetchAll('callEvents'),
  fetchAll('dishClicks'),
]);

const dayOrders = orders.filter((r) => r.date === targetDate);
const dayActionLogs = actionLogs.filter((r) => londonDateStr(r.createdAt) === targetDate);
const dayCalls = calls.filter((r) => r.date === targetDate);
const dayClicks = clicks.filter((r) => r.date === targetDate);

console.log(
  `date=${targetDate} orders=${dayOrders.length} actionLogs=${dayActionLogs.length} `
  + `calls=${dayCalls.length} clicks=${dayClicks.length}`,
);

await setDoc(doc(db, 'dailyReports', targetDate), {
  date: targetDate,
  generatedAt: Date.now(),
  orders: dayOrders,
  actionLogs: dayActionLogs,
  calls: dayCalls,
  clicks: dayClicks,
});

console.log(`已写入 dailyReports/${targetDate}`);
