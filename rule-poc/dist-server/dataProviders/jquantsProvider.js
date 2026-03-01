/**
 * 将来用（未実装）。PoCでは明示エラー。
 */
export class JQuantsProvider {
    apiBaseUrl;
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
    }
    async getEarningsWatchlist(_date) {
        throw new Error(`JQuantsProvider is not implemented yet. baseUrl=${this.apiBaseUrl}`);
    }
    async getRankings(_date) {
        throw new Error(`JQuantsProvider is not implemented yet. baseUrl=${this.apiBaseUrl}`);
    }
}
