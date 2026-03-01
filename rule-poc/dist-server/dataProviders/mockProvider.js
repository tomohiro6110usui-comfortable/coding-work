/** PoC用ユニバース（最低限の固定データ） */
const MOCK_WATCHLIST = [
    { code: "7203", name: "トヨタ自動車" },
    { code: "6758", name: "ソニーグループ" },
    { code: "9984", name: "ソフトバンクグループ" },
    { code: "8306", name: "三菱UFJ" },
    { code: "9432", name: "NTT" },
];
const MOCK_RANKINGS = [
    { code: "7203", name: "トヨタ自動車", pct: 1.2, reason: "mock" },
    { code: "6758", name: "ソニーグループ", pct: 0.9, reason: "mock" },
    { code: "9984", name: "ソフトバンクグループ", pct: 0.5, reason: "mock" },
    { code: "8306", name: "三菱UFJ", pct: 0.3, reason: "mock" },
    { code: "9432", name: "NTT", pct: 0.2, reason: "mock" },
];
export function createMockProvider() {
    return new MockProvider();
}
/**
 * index.ts 側で `import { MockProvider } ...` できるように named export を用意。
 */
export class MockProvider {
    async getEarningsWatchlist(date) {
        return {
            date,
            items: MOCK_WATCHLIST,
            fetchedAt: new Date().toISOString(),
            source: "mock",
        };
    }
    async getRankings(date) {
        return {
            date,
            items: MOCK_RANKINGS,
            fetchedAt: new Date().toISOString(),
            source: "mock",
        };
    }
}
