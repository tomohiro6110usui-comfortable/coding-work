/** PoC用ユニバース */
const UNIVERSE = [
    { code: "7203", name: "トヨタ自動車", market: "TKY", earningsDate: "" },
    { code: "6758", name: "ソニーＧ", market: "TKY", earningsDate: "" },
    { code: "9984", name: "ソフトバンクＧ", market: "TKY", earningsDate: "" },
    { code: "8306", name: "三菱ＵＦＪ", market: "TKY", earningsDate: "" },
    { code: "9432", name: "ＮＴＴ", market: "TKY", earningsDate: "" },
    { code: "8035", name: "東京エレクトロン", market: "TKY", earningsDate: "" },
    { code: "6861", name: "キーエンス", market: "TKY", earningsDate: "" },
    { code: "9983", name: "ファストリ", market: "TKY", earningsDate: "" },
    { code: "7011", name: "三菱重工", market: "TKY", earningsDate: "" },
    { code: "6501", name: "日立", market: "TKY", earningsDate: "" },
    { code: "5020", name: "ＥＮＥＯＳ", market: "TKY", earningsDate: "" },
    { code: "8058", name: "三菱商事", market: "TKY", earningsDate: "" },
    { code: "5401", name: "日本製鉄", market: "TKY", earningsDate: "" },
    { code: "4502", name: "武田薬品", market: "TKY", earningsDate: "" },
    { code: "4063", name: "信越化学", market: "TKY", earningsDate: "" },
    { code: "9101", name: "日本郵船", market: "TKY", earningsDate: "" },
    { code: "9020", name: "ＪＲ東日本", market: "TKY", earningsDate: "" },
    { code: "7741", name: "ＨＯＹＡ", market: "TKY", earningsDate: "" },
    { code: "7974", name: "任天堂", market: "TKY", earningsDate: "" },
    { code: "6954", name: "ファナック", market: "TKY", earningsDate: "" },
    { code: "3350", name: "メタプラネット", market: "TKY", earningsDate: "" },
    { code: "3903", name: "gumi", market: "TKY", earningsDate: "" },
    { code: "2158", name: "フロンテオ", market: "TKY", earningsDate: "" },
    { code: "2160", name: "ジーエヌアイ", market: "TKY", earningsDate: "" },
    { code: "4575", name: "キャンバス", market: "TKY", earningsDate: "" },
    { code: "4882", name: "ペルセウス", market: "TKY", earningsDate: "" },
    { code: "4169", name: "ENECHANGE", market: "TKY", earningsDate: "" },
    { code: "4192", name: "スパイダープラス", market: "TKY", earningsDate: "" },
    { code: "4055", name: "ティアンドエス", market: "TKY", earningsDate: "" },
    { code: "3993", name: "PKSHA Technology", market: "TKY", earningsDate: "" },
    { code: "4371", name: "コアコンセプト", market: "TKY", earningsDate: "" },
    { code: "4384", name: "ラクスル", market: "TKY", earningsDate: "" },
    { code: "4475", name: "HENNGE", market: "TKY", earningsDate: "" },
    { code: "4448", name: "Chatwork", market: "TKY", earningsDate: "" },
    { code: "3927", name: "フーバーブレイン", market: "TKY", earningsDate: "" },
    { code: "4316", name: "ビーマップ", market: "TKY", earningsDate: "" },
    { code: "3807", name: "フィスコ", market: "TKY", earningsDate: "" },
    { code: "3810", name: "サイバーステップ", market: "TKY", earningsDate: "" },
    { code: "6232", name: "ACSL", market: "TKY", earningsDate: "" },
    { code: "4978", name: "リプロセル", market: "TKY", earningsDate: "" },
    { code: "4594", name: "ブライトパス", market: "TKY", earningsDate: "" },
    { code: "2936", name: "ベースフード", market: "TKY", earningsDate: "" },
    { code: "2998", name: "クリアル", market: "TKY", earningsDate: "" },
    { code: "3182", name: "オイシックス", market: "TKY", earningsDate: "" },
    { code: "2437", name: "Shinwa Wise", market: "TKY", earningsDate: "" },
    { code: "2788", name: "アップルインターナショナル", market: "TKY", earningsDate: "" },
    { code: "2721", name: "ジェイHD", market: "TKY", earningsDate: "" },
    { code: "4041", name: "日本曹達", market: "TKY", earningsDate: "" },
    { code: "4092", name: "日本化学工業", market: "TKY", earningsDate: "" },
    { code: "5016", name: "JX金属", market: "TKY", earningsDate: "" },
];
function ensureUniverse(min) {
    if (UNIVERSE.length >= min)
        return UNIVERSE;
    const out = [...UNIVERSE];
    let n = out.length;
    while (out.length < min) {
        n += 1;
        out.push({ code: String(1000 + n), name: `サンプル銘柄${n}`, market: "TKY", earningsDate: "" });
    }
    return out;
}
function hashSeed(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function shuffle(arr, rnd) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
const REASONS = ["出来高急増", "決算反応", "テーマ物色", "需給（踏み）", "材料二次", "地合い追い風", "リバウンド", "新高値ブレイク"];
export class MockProvider {
    async getEarningsWatchlist(date) {
        const rnd = mulberry32(hashSeed(`earnings:${date}`));
        const uni = ensureUniverse(160).map((x) => ({ ...x, earningsDate: date }));
        const picked = shuffle(uni, rnd).slice(0, 50);
        return { key: `${date}_top50`, date, items: picked, fetchedAt: new Date().toISOString() };
    }
    async getRankings(date) {
        const rnd = mulberry32(hashSeed(`rankings:${date}`));
        const uni = ensureUniverse(240);
        const pool = shuffle(uni, rnd);
        const mk = (base, sign, idx) => {
            const pctAbs = 4 + rnd() * 21 + idx * 0.03;
            const changePct = +(sign * pctAbs).toFixed(2);
            const close = +(100 + rnd() * 7900).toFixed(1);
            const reasonLite = REASONS[Math.floor(rnd() * REASONS.length)];
            return { code: base.code, name: base.name, market: base.market, close, changePct, reasonLite };
        };
        const upBases = pool.slice(0, 50);
        const downBases = pool.slice(50, 100);
        return {
            date,
            up: upBases.map((b, i) => mk(b, 1, i)),
            down: downBases.map((b, i) => mk(b, -1, i)),
            fetchedAt: new Date().toISOString(),
        };
    }
}
