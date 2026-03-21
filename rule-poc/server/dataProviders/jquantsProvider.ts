import type { DataProvider, EarningsWatchlistResult, RankingsResult } from "./provider.js";
import { MockProvider } from "./mockProvider.js";

/**
 * 将来用（未実装）。PoCでは明示エラー。
 */
export class JQuantsProvider implements DataProvider {
  private fallback = new MockProvider();

  constructor(private apiBaseUrl: string) {}

  async getEarningsWatchlist(date: string): Promise<EarningsWatchlistResult> {
    console.warn(`[provider:jquants] not implemented, fallback=mock baseUrl=${this.apiBaseUrl}`);
    return this.fallback.getEarningsWatchlist(date);
  }

  async getRankings(date: string): Promise<RankingsResult> {
    console.warn(`[provider:jquants] not implemented, fallback=mock baseUrl=${this.apiBaseUrl}`);
    return this.fallback.getRankings(date);
  }
}
