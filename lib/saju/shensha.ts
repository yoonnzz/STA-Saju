// shensha.ts — 神煞计算引擎(数据驱动) v3
// ---------------------------------------------------------------------------
// 设计:算法层中立,本引擎读 shensha.json 的起法表 + 某流派的 shensha_policy,
//       在四柱上计算命中并套权重。新增/改神煞只改 shensha.json,不动本文件。
//
// 用法:
//   const defs   = JSON.parse(fs.readFileSync('shensha.json','utf-8'));
//   const lin    = JSON.parse(fs.readFileSync('lineages.json','utf-8'));
//   const hits   = computeShensha(chart, defs, lin.lineages['ziping'].shensha_policy);
//
// chart 需提供(对齐 run-chart.ts 的 bazi 字段):
//   siZhu: { year:{gan,zhi}, month:{gan,zhi}, day:{gan,zhi}, hour:{gan,zhi} }
//   gender: 'male' | 'female'
// ---------------------------------------------------------------------------

import lunar from "lunar-javascript";
import definitions from "./shensha-rules.json";
import type { SajuChart } from "./chart";

const { LunarUtil } = lunar as unknown as {
  LunarUtil: { NAYIN: Record<string, string> };
};

type Pillar = 'year' | 'month' | 'day' | 'hour';
interface GZ { gan: string; zhi: string; }
interface Chart { siZhu: Record<Pillar, GZ>; gender: 'male' | 'female'; }

export interface ShenshaRule {
  id: string; name: string; tier: string; polarity: string; category: string;
  method: string; base: string; needs_review: boolean; note?: string;
  source?: string; verse?: string;
  table?: any; table_yin_optional?: any; rule?: string; classical?: any;
  // v3 扩展字段
  tables?: Record<string, any>;          // dayGan_multi:多版本表
  table_core?: string[];                 // fixed_pillars:口诀本版子集
  hour_note?: boolean;                   // fixed_pillars:时柱再见加注
  exclude_base?: boolean;                // yueZhi_to:月支自身不计
  day_night?: any;                       // 天乙:昼夜贵分层
  day_gan_bonus?: boolean;               // 月德:日上见标注
  also_year_gan?: boolean;               // dayGan:年干兼查(天乙/太极/国印,base 声明『或年干』)
  ciguan_ganlu_variant?: Record<string, string>; // 学堂词馆:干禄词馆变体
}
interface ShenshaConfig { config: { sanhe_groups: Record<string, string[]>; sanhe_seed: string[]; lu_table: Record<string,string>; }; shensha: ShenshaRule[]; }
interface Policy { default_weight: number; whitelist: Record<string, number | string>; blacklist: string[]; }

export interface Hit {
  id: string; name: string; tier: string; polarity: string;
  weight: number; pillars: string[]; via?: string; needs_review: boolean; note?: string;
  classical_check?: string; // 古法(三命通会)交叉校验提示
}

const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const PILLAR_CN: Record<Pillar,string> = { year:'年', month:'月', day:'日', hour:'时' };
const YANG_GAN = new Set(['甲','丙','戊','庚','壬']);
const SEASON: Record<string,string> = { 寅:'春',卯:'春',辰:'春',巳:'夏',午:'夏',未:'夏',申:'秋',酉:'秋',戌:'秋',亥:'冬',子:'冬',丑:'冬' };
const DAY_HOURS = new Set(['卯','辰','巳','午','未','申']); // 昼贵当值时段(卯~申),余为夜

function nayinElem(gan: string, zhi: string): string {
  try {
    const value = (LunarUtil.NAYIN as Record<string, string>)[gan + zhi] || "";
    return [..."金木水火土"].find((item) => value.endsWith(item)) || "";
  } catch { return ''; }
}

// ---- 小工具 ----------------------------------------------------------------
function ganList(c: Chart): {gan:string; p:Pillar}[] {
  return (['year','month','day','hour'] as Pillar[]).map(p => ({ gan: c.siZhu[p].gan, p }));
}
function zhiList(c: Chart, exclude: Pillar[] = []): {zhi:string; p:Pillar}[] {
  return (['year','month','day','hour'] as Pillar[])
    .filter(p => !exclude.includes(p))
    .map(p => ({ zhi: c.siZhu[p].zhi, p }));
}
function sanheOf(zhi: string, groups: Record<string,string[]>): string | null {
  for (const k of Object.keys(groups)) if (groups[k].includes(zhi)) return k;
  return null;
}
function pillarsWithZhi(c: Chart, target: string | string[], exclude: Pillar[] = []): string[] {
  const ts = Array.isArray(target) ? target : [target];
  return zhiList(c, exclude).filter(x => ts.includes(x.zhi)).map(x => PILLAR_CN[x.p]);
}
function pillarsWithGan(c: Chart, target: string | string[]): string[] {
  const ts = Array.isArray(target) ? target : [target];
  return ganList(c).filter(x => ts.includes(x.gan)).map(x => PILLAR_CN[x.p]);
}

// 60甲子序号 → 旬首,用于空亡
function xunKongZhi(gan: string, zhi: string): string[] {
  const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const gi = GAN.indexOf(gan), zi = ZHI.indexOf(zhi);
  // 该柱在60甲子的序号
  let idx = -1;
  for (let n = 0; n < 60; n++) if (n % 10 === gi && n % 12 === zi) { idx = n; break; }
  const xunHead = idx - (idx % 10);          // 旬首序号(甲X)
  const headZhiIdx = xunHead % 12;           // 旬首地支
  const a = ZHI[(headZhiIdx + 10) % 12];     // 旬尾后两位 = 空亡
  const b = ZHI[(headZhiIdx + 11) % 12];
  return [a, b];
}

// ---- 各 method 分派 --------------------------------------------------------
function evalDef(c: Chart, d: ShenshaRule, cfg: ShenshaConfig['config']): { pillars: string[]; via?: string } | null {
  switch (d.method) {

    case 'dayGan': {
      // 以日干为主;base 声明『(或年干)』者(also_year_gan=true)年干兼查——union 命中,via 标注来源【用户定,对齐 _meta 并查政策】
      const seeds: [string, string][] = [['日干', c.siZhu.day.gan]];
      if (d.also_year_gan && c.siZhu.year.gan !== c.siZhu.day.gan) seeds.push(['年干', c.siZhu.year.gan]);
      const parts: string[] = [];
      const hitP: string[] = [];
      for (const [seat, g] of seeds) {
        const tgt = d.table?.[g];
        if (!tgt) continue;
        const p = pillarsWithZhi(c, tgt);
        if (!p.length) continue;
        let part = `${seat}${g}(@${p.join('')})`;
        // 天乙贵人:昼夜贵分层标注,只挂在日干种子上(当值贵以日干论;不改命中判定)
        if (seat === '日干' && d.day_night) {
          const isDay = DAY_HOURS.has(c.siZhu.hour.zhi);
          const yangT = d.day_night['阳贵(昼贵)'] || {};
          const yinT  = d.day_night['阴贵(夜贵)'] || {};
          const duty  = isDay ? yangT[g] : yinT[g];
          const hitZhis = [...new Set(zhiList(c).filter(x => ([] as string[]).concat(tgt).includes(x.zhi)).map(x => x.zhi))];
          const tags = hitZhis.map(z =>
            z === yangT[g] ? `${z}(阳贵)` : z === yinT[g] ? `${z}(阴贵)` : z);
          part += `·${isDay ? '昼' : '夜'}生当值${duty}${hitZhis.includes(duty) ? '(命中✓)' : '(未见)'}·${tags.join('/')}`;
        }
        parts.push(part);
        hitP.push(...p);
      }
      return hitP.length ? { pillars: [...new Set(hitP)], via: parts.join('/') } : null;
    }

    case 'sanhe': {
      // 以年支/日支为种子(config.sanhe_seed),查三合局对应目标支
      const seeds = cfg.sanhe_seed.map(s => s === '年' ? 'year' : 'day') as Pillar[];
      for (const seedP of seeds) {
        const grp = sanheOf(c.siZhu[seedP].zhi, cfg.sanhe_groups);
        if (!grp) continue;
        const tgt = d.table?.[grp];
        if (!tgt) continue;
        const p = pillarsWithZhi(c, tgt);
        if (p.length) return { pillars: p, via: `${PILLAR_CN[seedP]}支${c.siZhu[seedP].zhi}→${grp}` };
      }
      return null;
    }

    case 'yueZhi_to': {
      // 月支 → 目标(可能是干或支),自动判断落处;exclude_base=月支自身不计(血刃防亥月见亥自命中)
      const tgt = d.table?.[c.siZhu.month.zhi];
      if (!tgt) return null;
      const asZhi = pillarsWithZhi(c, tgt, d.exclude_base ? ['month'] : []);
      const asGan = pillarsWithGan(c, tgt);
      const p = [...asGan, ...asZhi];
      return p.length ? { pillars: p, via: `月支${c.siZhu.month.zhi}` } : null;
    }

    case 'yueZhi_sanhe_to_gan': {
      const grp = sanheOf(c.siZhu.month.zhi, cfg.sanhe_groups);
      if (!grp) return null;
      const tgt = d.table?.[grp];
      if (!tgt) return null;
      const p = pillarsWithGan(c, tgt);
      if (!p.length) return null;
      let via = `月令${grp}`;
      // 月德:《三命通会》要日上见——标注足格/力减,不改命中判定
      if (d.day_gan_bonus) {
        via += ([] as string[]).concat(tgt).includes(c.siZhu.day.gan) ? '·日干见(足格)' : '·非日干见(力减)';
      }
      return { pillars: p, via };
    }

    case 'yueZhi_sanhe_dexiu': {
      // 德秀复合:德、秀须同时出现方成
      const grp = sanheOf(c.siZhu.month.zhi, cfg.sanhe_groups);
      if (!grp) return null;
      const t = d.table?.[grp];
      if (!t) return null;
      const dePil = pillarsWithGan(c, t['德']);
      const xiuPil = pillarsWithGan(c, t['秀']);
      if (dePil.length && xiuPil.length)
        return { pillars: [...new Set([...dePil, ...xiuPil])], via: `月令${grp}·德+秀俱见` };
      return null; // 只见其一不算德秀贵人
    }

    case 'xunkong': {
      // 以日柱旬空,落在年/月/时支
      const [a, b] = xunKongZhi(c.siZhu.day.gan, c.siZhu.day.zhi);
      const p = pillarsWithZhi(c, [a, b], ['day']);
      return p.length ? { pillars: p, via: `日柱旬空(${a}${b})` } : null;
    }

    case 'fixed_pillars': {
      // 默认看日柱;table_core=口诀本版/扩展版标注;hour_note=时柱再见加注(孤鸾/阴差阳错)
      const dayGZ = c.siZhu.day.gan + c.siZhu.day.zhi;
      const hourGZ = c.siZhu.hour.gan + c.siZhu.hour.zhi;
      const list: string[] = d.table || [];
      if (!list.includes(dayGZ)) return null;
      let via = dayGZ;
      if (d.table_core) via += d.table_core.includes(dayGZ) ? '(口诀本版)' : '(扩展版)';
      if (d.hour_note && list.includes(hourGZ)) via += `·时柱${hourGZ}再见(应加重)`;
      return { pillars: ['日'], via };
    }

    case 'guchen_guasu': {
      const seedZhi = c.siZhu.year.zhi; // 主以年支,可改日支
      for (const grp of Object.keys(d.table || {})) {
        if (grp.includes(seedZhi)) {
          const gu = pillarsWithZhi(c, d.table[grp]['孤']);
          const gua = pillarsWithZhi(c, d.table[grp]['寡']);
          if (gu.length || gua.length) {
            const parts: string[] = [];
            if (gu.length) parts.push('孤辰@' + gu.join(''));
            if (gua.length) parts.push('寡宿@' + gua.join(''));
            return { pillars: [...new Set([...gu, ...gua])], via: `年支${seedZhi}·${parts.join('/')}` };
          }
        }
      }
      return null;
    }

    case 'sanqi': {
      // 严格『顺布连珠』(三命通会卷三论三奇:须顺布连珠方真,倒乱不作奇)。
      // 连续三柱(年→月→日 或 月→日→时)须恰为该奇的顺序(table 数组即顺序),逆/乱不算。
      const g = ganList(c).map(x => x.gan);
      const triples = [[g[0],g[1],g[2]], [g[1],g[2],g[3]]];
      for (const setName of Object.keys(d.table || {})) {
        const seq: string[] = d.table[setName];
        for (let i = 0; i < triples.length; i++) {
          const t = triples[i];
          if (t.length === 3 && seq.length === 3 && t[0] === seq[0] && t[1] === seq[1] && t[2] === seq[2]) {
            return { pillars: [i === 0 ? '年月日' : '月日时'], via: `${setName}·顺布` };
          }
        }
      }
      return null;
    }

    case 'gender_chong': {
      // 元辰:阳男阴女→冲前一位;阴男阳女→冲后一位。以年支为本,年干定阴阳。
      // TODO(cowork): 校验『午未半之』等细则、是否兼用日支。
      const baseZhi = c.siZhu.year.zhi;
      const yangYear = YANG_GAN.has(c.siZhu.year.gan);
      const isMale = c.gender === 'male';
      const yangManYinWoman = (isMale && yangYear) || (!isMale && !yangYear);
      const chongIdx = (ZHI.indexOf(baseZhi) + 6) % 12;
      const targetIdx = yangManYinWoman ? (chongIdx + 1) % 12 : (chongIdx + 11) % 12;
      const target = ZHI[targetIdx];
      const p = pillarsWithZhi(c, target, ['year']);
      return p.length ? { pillars: p, via: `${isMale?'男':'女'}·${yangYear?'阳':'阴'}年→${target}` } : null;
    }

    // ================= v3 新增查法 =================

    case 'nayin_xuetang': {
      // 学堂词馆:年柱纳音五行→长生位=学堂/临官位=词馆;所临支之纳音与年命同者为『正』
      const yElem = nayinElem(c.siZhu.year.gan, c.siZhu.year.zhi);
      const t = d.table?.[yElem];
      if (!t) return null;
      const parts: string[] = [];
      const hitP: string[] = [];
      for (const kind of ['学堂', '词馆'] as const) {
        const tz = t[kind];
        for (const x of (['year', 'month', 'day', 'hour'] as Pillar[])) {
          if (c.siZhu[x].zhi !== tz) continue;
          const same = nayinElem(c.siZhu[x].gan, c.siZhu[x].zhi) === yElem;
          parts.push(`${kind}${tz}@${PILLAR_CN[x]}(${same ? '正' : '偏'})`);
          hitP.push(PILLAR_CN[x]);
        }
      }
      // 变体:干禄词馆(甲干见庚寅之类;日干为主、年干为兼),命中另注
      const v = d.ciguan_ganlu_variant;
      if (v) {
        for (const [seat, g] of [['日干', c.siZhu.day.gan], ['年干', c.siZhu.year.gan]] as const) {
          const gz = v[g];
          if (!gz) continue;
          const at = (['year', 'month', 'day', 'hour'] as Pillar[]).filter(x => c.siZhu[x].gan + c.siZhu[x].zhi === gz);
          if (at.length) {
            parts.push(`干禄词馆亦合(${seat}${g}→${gz}@${at.map(x => PILLAR_CN[x]).join('')})`);
            at.forEach(x => hitP.push(PILLAR_CN[x]));
          }
        }
      }
      return hitP.length ? { pillars: [...new Set(hitP)], via: `年命纳音${yElem}·${parts.join('/')}` } : null;
    }

    case 'yearZhi_to': {
      // 红鸾/天喜:年支→目标支
      const tgt = d.table?.[c.siZhu.year.zhi];
      if (!tgt) return null;
      const p = pillarsWithZhi(c, tgt);
      return p.length ? { pillars: p, via: `年支${c.siZhu.year.zhi}→${tgt}` } : null;
    }

    case 'tongzi': {
      // 童子煞:季节法/纳音法任一命中即写(用户定),只查日支/时支,via 标注所用口诀
      const seat = (z: string) => (['day', 'hour'] as Pillar[]).filter(x => c.siZhu[x].zhi === z).map(x => PILLAR_CN[x]);
      const season = SEASON[c.siZhu.month.zhi];
      const parts: string[] = [];
      const hitP: string[] = [];
      for (const z of (d.table?.season?.[season] || []) as string[]) {
        const at = seat(z);
        if (at.length) { parts.push(`季节法(${season}生·${z}@${at.join('')})`); hitP.push(...at); }
      }
      const yElem = nayinElem(c.siZhu.year.gan, c.siZhu.year.zhi);
      for (const z of (d.table?.nayin?.[yElem] || []) as string[]) {
        const at = seat(z);
        if (at.length) { parts.push(`纳音法(${yElem}命·${z}@${at.join('')})`); hitP.push(...at); }
      }
      return hitP.length ? { pillars: [...new Set(hitP)], via: parts.join('/') } : null;
    }

    case 'season_day': {
      // 四废:月支定季节,查日柱干支
      const season = SEASON[c.siZhu.month.zhi];
      const list: string[] = d.table?.[season] || [];
      const dayGZ = c.siZhu.day.gan + c.siZhu.day.zhi;
      return list.includes(dayGZ) ? { pillars: ['日'], via: `${season}生·${dayGZ}` } : null;
    }

    case 'tianluo_diwang': {
      // 天罗地网:古法(年纳音限定,日支为主兼余支)/现用法(辰巳、戌亥互见),任一命中即写
      const parts: string[] = [];
      const hitP: string[] = [];
      const yElem = nayinElem(c.siZhu.year.gan, c.siZhu.year.zhi);
      const gf = d.table?.gufa?.[yElem];
      if (gf) {
        const at = zhiList(c, ['year']).filter(x => (gf['支'] as string[]).includes(x.zhi));
        if (at.length) {
          const dayHit = at.some(x => x.p === 'day');
          parts.push(`古法(${yElem}命·${gf['名']}@${at.map(x => PILLAR_CN[x.p]).join('')}${dayHit ? '·日支为主' : '·非日支力轻'})`);
          hitP.push(...at.map(x => PILLAR_CN[x.p]));
        }
      }
      const zs = zhiList(c);
      for (const [name, pair] of Object.entries(d.table?.hujian || {}) as [string, string[]][]) {
        const a = zs.filter(x => x.zhi === pair[0]), b = zs.filter(x => x.zhi === pair[1]);
        if (a.length && b.length) {
          parts.push(`互见法(${name}·${pair[0]}${pair[1]}并见)`);
          hitP.push(...[...a, ...b].map(x => PILLAR_CN[x.p]));
        }
      }
      return hitP.length ? { pillars: [...new Set(hitP)], via: parts.join('/') } : null;
    }

    case 'yueZhi_prev': {
      // 天医:月支前一位(寅月见丑)
      const tgt = ZHI[(ZHI.indexOf(c.siZhu.month.zhi) + 11) % 12];
      const p = pillarsWithZhi(c, tgt);
      return p.length ? { pillars: p, via: `月支${c.siZhu.month.zhi}→前一位${tgt}` } : null;
    }

    case 'dayGan_multi': {
      // 多版本查法(流霞/天厨):任一版本命中即写并标注版本(用户定)
      const g = c.siZhu.day.gan;
      const parts: string[] = [];
      const hitP: string[] = [];
      for (const [ver, tab] of Object.entries(d.tables || {}) as [string, Record<string, string[]>][]) {
        const tgt = tab[g];
        if (!tgt) continue;
        const p = pillarsWithZhi(c, tgt);
        if (p.length) { parts.push(`${ver}:${([] as string[]).concat(tgt).join('')}@${p.join('')}`); hitP.push(...p); }
      }
      return hitP.length ? { pillars: [...new Set(hitP)], via: `日干${g}·${parts.join('/')}` } : null;
    }

    default:
      return null; // 未知 method:cowork 在 shensha.json 增 method 时,同步在此加 case
  }
}

// ---- 古法交叉校验(文昌/福星) ------------------------------------------------
// 通行版为命中主表;另算《三命通会》古法,古法无命中则提示"古法无"。
// 文献未列全/字句残损者列入 unverified_keys,据铁律不臆测,只标"未校验"。
function evalClassical(c: Chart, cl: any): string | null {
  if (!cl || !cl.method) return null;
  const label = cl.label || '古法';
  if (cl.method === 'dayGan') {
    const key = c.siZhu.day.gan;
    if ((cl.unverified_keys || []).includes(key)) return `古法【${label}】:${key}日干起例文献字句残损,未校验`;
    const tgt = cl.table?.[key];
    if (!tgt) return `古法【${label}】:本盘无`;
    const p = pillarsWithZhi(c, tgt);
    return p.length ? `古法【${label}】:亦合 @${p.join('')}` : `古法【${label}】:本盘无(古法在${([] as string[]).concat(tgt).join('')})`;
  }
  if (cl.method === 'yearGan_ganzhi') {
    const key = c.siZhu.year.gan;
    if ((cl.unverified_keys || []).includes(key)) return `古法【${label}】:${key}年干「余倒推」原文未列,未校验`;
    const tgt: string[] = cl.table?.[key];
    if (!tgt) return `古法【${label}】:本盘无`;
    const present = (['year','month','day','hour'] as Pillar[])
      .filter(p => tgt.includes(c.siZhu[p].gan + c.siZhu[p].zhi)).map(p => PILLAR_CN[p]);
    return present.length ? `古法【${label}】:亦合 @${present.join('')}` : `古法【${label}】:本盘无(古法需${tgt.join('/')})`;
  }
  return null;
}

// ---- 主 loop ---------------------------------------------------------------
export function computeShensha(chart: Chart, defs: ShenshaConfig, policy: Policy): Hit[] {
  const out: Hit[] = [];
  for (const d of defs.shensha) {
    // 1) 流派权重:白名单优先,否则取 default;0 或黑名单 → 跳过
    if (policy.blacklist?.includes(d.id)) continue;
    const raw = policy.whitelist?.[d.id];
    // MODERN 层强制门槛:必须被流派 policy 白名单显式列出才启用(不吃 default_weight)。
    // 目前仅『不限流派 open』白名单收录现代神煞;传统流派(子平/滴天髓/…)自动不出现。
    if (d.tier === 'MODERN' && typeof raw !== 'number') continue;
    const weight = typeof raw === 'number' ? raw : policy.default_weight;
    if (!weight || weight <= 0) continue;
    if (typeof raw === 'string') continue; // 段氏 stub 里写着 'TODO权重',未定版则跳过

    // 2) 计算命中
    const r = evalDef(chart, d, defs.config);
    if (!r) continue;

    const hit: Hit = {
      id: d.id, name: d.name, tier: d.tier, polarity: d.polarity,
      weight, pillars: r.pillars, via: r.via,
      needs_review: d.needs_review, note: d.note,
    };
    if (d.classical) {
      const cc = evalClassical(chart, d.classical);
      if (cc) hit.classical_check = cc;
    }
    out.push(hit);
  }
  // 3) 排序:权重降序 → tier(T1>T2>COMPOUND>T3>MODERN)
  const tierRank: Record<string, number> = { T1: 0, T2: 1, COMPOUND: 2, T3: 3, MODERN: 4 };
  out.sort((a, b) => (b.weight - a.weight) || ((tierRank[a.tier] ?? 9) - (tierRank[b.tier] ?? 9)));
  return out;
}

export const SHENSHA_CATALOG_VERSION = "1" as const;
export const SHENSHA_RULES = (definitions as ShenshaConfig).shensha;

export type ShenshaSourceStatus = "cross_checked" | "method_difference" | "partial";
export type ShenshaHit = {
  pillars: string[];
  via: string;
};
export type ShenshaMatch = {
  ruleId: string;
  name: string;
  group: string;
  polarity: "helper" | "caution" | "mixed";
  sourceStatus: ShenshaSourceStatus;
  sourceNote: string;
  hits: ShenshaHit[];
  timing: {
    currentDecade: ShenshaHit[];
    currentYear: ShenshaHit[];
    nextYear: ShenshaHit[];
  };
};
export type ShenshaResult = {
  catalogVersion: typeof SHENSHA_CATALOG_VERSION;
  checkedCount: number;
  matched: ShenshaMatch[];
};

const KO_NAMES: Record<string, string> = {
  tianyi_guiren: "천을귀인", wenchang_guiren: "문창귀인", taohua_xianchi: "도화·함지",
  yima: "역마", huagai: "화개", jiangxing: "장성", yangren: "양인", lushen: "녹신",
  kongwang: "공망", tiande_guiren: "천덕귀인", yuede_guiren: "월덕귀인",
  taiji_guiren: "태극귀인", jinyu: "금여", kuigang: "괴강", guoyin_guiren: "국인귀인",
  fuxing_guiren: "복성귀인", hongyan: "홍염", dexiu_guiren: "덕수", sanqi: "삼기귀인",
  jiesha: "겁살", wangshen: "망신", zaisha: "재살", guchen_guasu: "고진·과숙",
  yuanchen: "원진", xuetang_ciguan: "학당·사관", tianfu_guiren: "천복귀인",
  rigui: "일귀", ride: "일덕", fude_xiuqi: "복덕수기", tiandehe: "천덕합",
  yuedehe: "월덕합", hongluan: "홍란", tianxi: "천희", tongzisha: "동자살",
  guluansha: "고란살", yinchayangcuo: "음차양착", shiedabai: "십악대패", sifei: "사폐",
  tianluodiwang: "천라지망", tianyi_doctor: "천의", liuxia: "유하", xueren: "혈인",
  tianchu_guiren: "천주귀인",
};
const KO_PILLARS: Record<string, string> = { "年": "년", "月": "월", "日": "일", "时": "시", "年月日": "년·월·일", "月日时": "월·일·시" };

const METHOD_DIFFERENCE = new Set(["tianyi_guiren", "wenchang_guiren", "taiji_guiren", "xuetang_ciguan"]);
const PARTIAL = new Set(["yima", "huagai", "jiangxing", "tongzisha", "tianluodiwang"]);

function statusFor(rule: ShenshaRule): ShenshaSourceStatus {
  if (METHOD_DIFFERENCE.has(rule.id)) return "method_difference";
  if (rule.needs_review || PARTIAL.has(rule.id)) return "partial";
  return "cross_checked";
}

function polarityFor(value: string): ShenshaMatch["polarity"] {
  if (value === "吉") return "helper";
  if (value === "凶") return "caution";
  return "mixed";
}

function koreanEvidence(value: string): string {
  const replacements: Array<[string, string]> = [
    ["日干", "일간 "], ["年干", "년간 "], ["日支", "일지 "], ["年支", "년지 "],
    ["月支", "월지 "], ["月令", "월지 기준 "], ["日柱", "일주 "], ["年命纳音", "년주 납음 "],
    ["夜生当值", "야간 출생 기준 "], ["昼生当值", "주간 출생 기준 "],
    ["命中✓", "해당"], ["未见", "없음"], ["阳贵", "양귀"], ["阴贵", "음귀"],
    ["非日干见(力减)", "일간 외 위치에서 발견"], ["日干见(足格)", "일간에서 발견"],
    ["德+秀俱见", "덕과 수가 함께 발견"], ["口诀本版", "기본 규칙"], ["扩展版", "확장 규칙"],
    ["季节法", "계절 기준"], ["纳音法", "납음 기준"], ["古法", "전통 규칙"],
    ["互见法", "함께 보는 규칙"], ["日支为主", "일지 중심"], ["非日支力轻", "일지 외 위치"],
    ["口诀版", "기본 규칙"], ["法诀版", "별도 규칙"], ["子平版(食神之禄)", "자평 기준"],
    ["男", "입력 조건"], ["女", "입력 조건"], ["阳年", "양년"], ["阴年", "음년"],
    ["春生", "봄 출생"], ["夏生", "여름 출생"], ["秋生", "가을 출생"], ["冬生", "겨울 출생"],
    ["木命", "목 납음"], ["火命", "화 납음"], ["土命", "토 납음"], ["金命", "금 납음"], ["水命", "수 납음"],
    ["@年", "@년주"], ["@月", "@월주"], ["@日", "@일주"], ["@时", "@시주"],
  ];
  return replacements.reduce((text, [from, to]) => text.split(from).join(to), value)
    .replaceAll("·", " · ")
    .replaceAll("→", "에서 ")
    .replace(/\s+/g, " ")
    .trim();
}

function chartFor(source: SajuChart, gender: "male" | "female"): Chart {
  const [year, month, day, hour] = source.pillars;
  return {
    gender,
    siZhu: {
      year: { gan: year.stem, zhi: year.branch },
      month: { gan: month.stem, zhi: month.branch },
      day: { gan: day.stem, zhi: day.branch },
      hour: { gan: hour.stem, zhi: hour.branch },
    },
  };
}

const POLICY: Policy = {
  default_weight: 1,
  whitelist: Object.fromEntries(SHENSHA_RULES.map((rule) => [rule.id, 1])),
  blacklist: [],
};

function splitGanZhi(value: string): GZ | null {
  if (!value || value === "대운 시작 전") return null;
  const [gan, zhi] = [...value];
  return gan && zhi ? { gan, zhi } : null;
}

function timingHits(base: Chart, ganZhi: string | undefined): Map<string, ShenshaHit[]> {
  const flow = ganZhi ? splitGanZhi(ganZhi) : null;
  if (!flow) return new Map();
  const withFlow: Chart = { ...base, siZhu: { ...base.siZhu, hour: flow } };
  const result = computeShensha(withFlow, definitions as ShenshaConfig, POLICY);
  const out = new Map<string, ShenshaHit[]>();
  for (const hit of result) {
    if (!hit.pillars.some((pillar) => pillar.includes("时"))) continue;
    out.set(hit.id, [{ pillars: ["시기"], via: koreanEvidence(hit.via || ganZhi || "시기 간지") }]);
  }
  return out;
}

export function calculateShensha(source: SajuChart, gender: "male" | "female"): ShenshaResult {
  const base = chartFor(source, gender);
  const natal = computeShensha(base, definitions as ShenshaConfig, POLICY);
  const currentDecade = source.fortune?.decades.find((item) => item.current)?.ganZhi;
  const currentYear = source.fortune?.years[0]?.ganZhi;
  const nextYear = source.fortune?.years[1]?.ganZhi;
  const decadeHits = timingHits(base, currentDecade);
  const currentHits = timingHits(base, currentYear);
  const nextHits = timingHits(base, nextYear);
  return {
    catalogVersion: SHENSHA_CATALOG_VERSION,
    checkedCount: SHENSHA_RULES.length,
    matched: natal.map((hit) => {
      const rule = SHENSHA_RULES.find((candidate) => candidate.id === hit.id)!;
      return {
        ruleId: hit.id,
        name: KO_NAMES[hit.id] || hit.name,
        group: hit.tier,
        polarity: polarityFor(hit.polarity),
        sourceStatus: statusFor(rule),
        sourceNote: rule.source || "공개 규칙표 비교",
        hits: [{ pillars: hit.pillars.map((pillar) => KO_PILLARS[pillar] || pillar), via: koreanEvidence(hit.via || "규칙표 적중") }],
        timing: {
          currentDecade: decadeHits.get(hit.id) || [],
          currentYear: currentHits.get(hit.id) || [],
          nextYear: nextHits.get(hit.id) || [],
        },
      };
    }),
  };
}
