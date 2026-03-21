import { MockProvider } from "./mockProvider.js";
/**
 * 将来用（未実装）。PoCでは明示エラー。
 */
export class JQuantsProvider {
    apiBaseUrl;
    fallback = new MockProvider();
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
    }
    async getEarningsWatchlist(date) {
        console.warn(`[provider:jquants] not implemented, fallback=mock baseUrl=${this.apiBaseUrl}`);
        return this.fallback.getEarningsWatchlist(date);
    }
    async getRankings(date) {
        console.warn(`[provider:jquants] not implemented, fallback=mock baseUrl=${this.apiBaseUrl}`);
        return this.fallback.getRankings(date);
    }
}
