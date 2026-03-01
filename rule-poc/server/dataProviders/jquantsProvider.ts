import type { DataProvider, EarningsWatchlistResult, RankingsResult } from "./provider.js";

/**
 * 将来用（未実装）。PoCでは明示エラー。
 */
export class JQuantsProvider implements DataProvider {
  constructor(private apiBaseUrl: string) {}

  async getEarningsWatchlist(_date: string): Promise<EarningsWatchlistResult> {
    throw new Error(`JQuantsProvider is not implemented yet. baseUrl=${this.apiBaseUrl}`);
  }

  async getRankings(_date: string): Promise<RankingsResult> {
    throw new Error(`JQuantsProvider is not implemented yet. baseUrl=${this.apiBaseUrl}`);
  }
}