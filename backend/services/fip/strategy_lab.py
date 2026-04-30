import pandas as pd
import numpy as np
from scipy.optimize import minimize
from data_provider import RealTime
import concurrent.futures

class PortfolioOptimizer:
    def __init__(self, risk_free_rate=0.04):
        self.risk_free_rate = risk_free_rate

    def fetch_and_align_data(self, isins, days_back=1825):
        """Fetches historical data for multiple ISINs, aligns dates, and handles missing data.
        
        Returns:
            (df, raw_counts): df is the aligned price DataFrame;
                              raw_counts is {isin: int} recording how many raw data points
                              each ISIN had BEFORE the inner-join alignment.
        """
        raw_data   = {}
        raw_counts = {}   # per-ISIN data point count BEFORE alignment

        with concurrent.futures.ThreadPoolExecutor(max_workers=min(10, len(isins))) as executor:
            future_to_isin = {executor.submit(RealTime.get_historical_series, isin, days_back): isin for isin in isins}
            for future in concurrent.futures.as_completed(future_to_isin):
                isin = future_to_isin[future]
                try:
                    data = future.result()
                    if data:
                        raw_data[isin]   = pd.Series(data)
                        raw_counts[isin] = len(data)        # record BEFORE alignment
                except Exception as e:
                    print(f"Error fetching data for {isin}: {e}")

        if not raw_data:
            return pd.DataFrame(), {}, []

        # Combine into a single DataFrame
        df = pd.DataFrame(raw_data)
        
        # Convert string index to DatetimeIndex strictly stripping time/timezone to ensure absolute compatibility
        df.index = pd.to_datetime([str(d)[:10] for d in df.index])
        
        # Sort index (dates)
        df.sort_index(inplace=True)
        
        # Forward fill to handle different market holidays (max 3 days)
        df.ffill(limit=3, inplace=True)
        
        # --- Proxy Backfilling Logic ---
        proxy_warnings = []
        if not df.empty and len(df.columns) > 1:
            master_start_date = df.index[0]
            
            for isin in df.columns:
                first_valid_idx = df[isin].first_valid_index()
                if first_valid_idx is None:
                    continue
                
                missing_days = (first_valid_idx - master_start_date).days
                if missing_days > 60: # If missing more than 2 months of trading data relative to the oldest asset
                    proxy_ticker = RealTime.get_proxy_ticker(isin)
                    proxy_data = RealTime.get_historical_series(proxy_ticker, days_back + 100)
                    if proxy_data:
                        p_series = pd.Series(proxy_data)
                        p_series.index = pd.to_datetime(p_series.index)
                        p_series.sort_index(inplace=True)
                        
                        p_price_at_first_valid = p_series.get(first_valid_idx)
                        if pd.isna(p_price_at_first_valid):
                            nearest_past = p_series.index[p_series.index <= first_valid_idx]
                            if not nearest_past.empty:
                                p_price_at_first_valid = p_series.get(nearest_past.max())
                        
                        dates_to_fill = df.index[df.index < first_valid_idx]
                        
                        if p_price_at_first_valid and not pd.isna(p_price_at_first_valid) and not dates_to_fill.empty:
                            # Forward and backward fill minor gaps in proxy if it doesn't align perfectly
                            aligned_proxy = p_series.reindex(dates_to_fill).bfill().ffill()
                            tie_in_price = float(df.loc[first_valid_idx, isin])
                            
                            # Standard proxy percentage scalar calculation
                            fill_values = tie_in_price * (aligned_proxy / float(p_price_at_first_valid))
                            df.loc[dates_to_fill, isin] = fill_values
                            
                            proxy_warnings.append(
                                f"资产 {isin} 历史较短 ({first_valid_idx.strftime('%Y-%m')} 上市)。已使用主类基准（{proxy_ticker}）历史对其前期数据进行拼接延展 ({len(dates_to_fill)} 个交易日)。"
                            )

        # Drop rows where any asset is still missing data
        df.dropna(inplace=True)
        
        return df, raw_counts, proxy_warnings

    def calculate_stats(self, prices_df, trading_days=252):
        """Calculates expected returns, covariance matrix, and dividend yields."""
        from data_provider import RealTime
        
        # Calculate daily returns
        returns_df = prices_df.pct_change().dropna()
        
        # Annualized expected return (Mean historical return)
        mean_returns = returns_df.mean() * trading_days
        
        # Annualized covariance matrix
        cov_matrix = returns_df.cov() * trading_days
        
        # Correlation matrix
        corr_matrix = returns_df.corr()
        
        # ── Dividend Yield: TTM (Trailing 12-Month) ────────────────────────────
        # Use trailing 12-month dividends / current price — consistent with the
        # Portfolio View's "Current Yield" metric. Avoids confusion from showing
        # different numbers for the same asset in different parts of the UI.
        div_yields = {}
        from datetime import datetime, timedelta
        start_ttm = (datetime.now() - timedelta(days=366)).strftime('%Y-%m-%d')

        for isin in prices_df.columns:
            try:
                div_history = RealTime.get_dividend_history(isin, start_ttm)  # pd.Series, index=date, value=div_per_share
                if div_history.empty:
                    div_yields[isin] = 0.0
                    continue

                div_history.index = pd.to_datetime(div_history.index)
                ttm_total_div = float(div_history.sum())  # Total dividends per share in past 12 months

                # Use current price (last available price in prices_df for this ISIN)
                curr_price = float(prices_df[isin].dropna().iloc[-1]) if isin in prices_df.columns else 0.0

                if curr_price > 0 and ttm_total_div > 0:
                    div_yields[isin] = ttm_total_div / curr_price
                else:
                    div_yields[isin] = 0.0
            except Exception:
                div_yields[isin] = 0.0
        
        return mean_returns, cov_matrix, corr_matrix, returns_df, div_yields

    def run_monte_carlo(self, expected_return, volatility, initial_capital=1000000.0, years=10, simulations=10000, 
                        contribution=0.0, contribution_start=1, contribution_years=100,
                        withdrawal=0.0, withdrawal_start=1, withdrawal_end=100, withdrawal_inflation=False,
                        target_goal=None, inflation_rate=0.0,
                        rebalance_weights=None, rebalance_mean_returns=None, rebalance_cov_matrix=None,
                        insurance_plan=None, insurance_alpha_low=0.80, insurance_alpha_high=1.20,
                        portfolio_div_yield=0.0):
        """Runs a Monte Carlo simulation using Geometric Brownian Motion (GBM)."""
        import numpy as np
        
        def _calculate_irr(cash_flows, years, guess=0.1):
            """Simple NPV solver for IRR: sum(CF_t / (1+r)^t) = 0."""
            if not cash_flows or all(v == 0 for v in cash_flows): return 0.0
            
            def npv(r):
                total = 0
                for i, cf in enumerate(cash_flows):
                    total += cf / ((1 + r) ** i)
                return total

            # Newton's method or binary search
            low, high = -0.9, 2.0
            for _ in range(50):
                mid = (low + high) / 2
                val = npv(mid)
                if abs(val) < 1e-4: return mid
                if val > 0: low = mid  # Since sum(CF/(1+r)^t) is decreasing with r for +EndValue
                else: high = mid
            return (low + high) / 2

        dt = 1  # Annual steps
        paths = np.zeros((simulations, years + 1))
        paths[:, 0] = initial_capital
        
        # To track actual withdrawals achieved relative to target
        actual_withdrawals = np.zeros((simulations, years + 1))
        div_incomes_trk = np.zeros((simulations, years + 1))
        div_offsets_trk = np.zeros((simulations, years + 1))
        
        p_div_yield = portfolio_div_yield  # Use named param directly


        use_rebalancing = (
            rebalance_weights is not None and
            rebalance_mean_returns is not None and
            rebalance_cov_matrix is not None
        )

        if use_rebalancing:
            w = np.array(rebalance_weights)                        # (n_assets,)
            mu = np.array(rebalance_mean_returns)                  # (n_assets,)
            cov = np.array(rebalance_cov_matrix)                   # (n_assets, n_assets)
            n = len(w)

            cov_stable = cov + np.eye(n) * 1e-9
            L = np.linalg.cholesky(cov_stable)
            asset_vols = np.sqrt(np.diag(cov))

            for t in range(1, years + 1):
                # --- Step 1: Cash Flow & Dividends at START of year ---
                curr_contribution = contribution if contribution_start <= t <= contribution_years else 0.0
                inflation_factor  = (1 + inflation_rate) ** (t - 1)
                t_draw = (withdrawal * (inflation_factor if withdrawal_inflation else 1.0)) if withdrawal_start <= t <= withdrawal_end else 0.0
                
                # Portfolio Dividends (Internal cash generation)
                div_income = paths[:, t-1] * p_div_yield
                
                # Logic: Divs first offset withdrawal. Reinvest the rest.
                # If divs not enough, sell principal for ONLY the remaining draw.
                offset_from_div = np.minimum(div_income, t_draw)
                remaining_to_withdraw = t_draw - offset_from_div
                
                actual_draw = offset_from_div + np.minimum(paths[:, t-1], remaining_to_withdraw)
                actual_withdrawals[:, t] = actual_draw
                div_incomes_trk[:, t] = div_income
                div_offsets_trk[:, t] = offset_from_div
                
                # Apply Cash Flows: Add Contribution, Deduct Principal portion of withdrawal
                # Add reinvested portion of dividends (Total Div - Offset used)
                p_start = paths[:, t-1] + curr_contribution - (actual_draw - offset_from_div) + (div_income - offset_from_div)
                p_start = np.maximum(p_start, 0)

                # --- Step 2: Growth ---
                z = np.random.standard_normal((simulations, n))
                corr_shocks = z @ L.T
                growth_factors = np.exp((mu - 0.5 * asset_vols ** 2) * dt + corr_shocks * np.sqrt(dt))
                
                asset_alloc = p_start[:, np.newaxis] * w
                new_values  = (asset_alloc * growth_factors).sum(axis=1)
                paths[:, t] = np.maximum(new_values, 0)

        else:
            # --- Fallback: single-factor GBM ---
            for t in range(1, years + 1):
                curr_contribution = contribution if contribution_start <= t <= contribution_years else 0.0
                inflation_factor  = (1 + inflation_rate) ** (t - 1)
                t_draw = (withdrawal * (inflation_factor if withdrawal_inflation else 1.0)) if withdrawal_start <= t <= withdrawal_end else 0.0
                
                div_income = paths[:, t-1] * p_div_yield
                offset_from_div = np.minimum(div_income, t_draw)
                remaining_to_withdraw = t_draw - offset_from_div
                
                actual_draw = offset_from_div + np.minimum(paths[:, t-1], remaining_to_withdraw)
                actual_withdrawals[:, t] = actual_draw
                div_incomes_trk[:, t] = div_income
                div_offsets_trk[:, t] = offset_from_div
                
                p_start = np.maximum(paths[:, t-1] + curr_contribution - (actual_draw - offset_from_div) + (div_income - offset_from_div), 0)

                z = np.random.standard_normal(simulations)
                growth = np.exp((expected_return - 0.5 * volatility**2) * dt + volatility * z * np.sqrt(dt))
                paths[:, t] = np.maximum(p_start * growth, 0)

        percentile_10 = np.percentile(paths, 10, axis=0)
        percentile_50 = np.percentile(paths, 50, axis=0)
        percentile_90 = np.percentile(paths, 90, axis=0)
        
        # ── Inflation Adjustment ──
        # Real value = Nominal / (1 + i)^t
        real_p50 = percentile_50.copy()
        if inflation_rate > 0:
            for t in range(years + 1):
                real_p50[t] = percentile_50[t] / ((1 + inflation_rate)**t)

        result_array = []
        for year in range(years + 1):
            row = {
                "year": year,
                "p10": float(percentile_10[year]),
                "p50": float(percentile_50[year]),
                "p90": float(percentile_90[year]),
                "real_p50": float(real_p50[year]) if inflation_rate > 0 else None
            }
            if insurance_plan and year > 0 and year <= len(insurance_plan):
                plan_y = insurance_plan[year - 1]
                gcv = plan_y['guaranteed_cv']
                ng  = plan_y['non_guaranteed']
                ins_cv_p50 = gcv + ng * 1.0
                ins_cv_low = gcv + ng * insurance_alpha_low
                ins_cv_high = gcv + ng * insurance_alpha_high
                
                row["ins_cv_p50"]  = float(ins_cv_p50)
                row["ins_cv_low"]  = float(ins_cv_low)
                row["ins_cv_high"] = float(ins_cv_high)
                row["ins_withdrawal"] = float(plan_y.get('withdrawal', 0.0))
                row["ins_premium"] = float(plan_y.get('premium', 0.0))
                row["combined_p50"] = row["p50"] + row["ins_cv_p50"]
                row["combined_p10"] = row["p10"] + row["ins_cv_low"]
                row["combined_p90"] = row["p90"] + row["ins_cv_high"]
                if inflation_rate > 0:
                    row["combined_real_p50"] = float(row["combined_p50"] / ((1 + inflation_rate)**year))
                else:
                    row["combined_real_p50"] = float(row["combined_p50"])
            result_array.append(row)
            
        success_rate = None
        # Summarize actual withdrawals achieved (P10, P50, P90)
        p10_draws = np.percentile(actual_withdrawals, 10, axis=0)
        p50_draws = np.percentile(actual_withdrawals, 50, axis=0)
        p90_draws = np.percentile(actual_withdrawals, 90, axis=0)
        
        for i, row in enumerate(result_array):
            row["actual_draw_p10"] = float(p10_draws[i])
            row["actual_draw_p50"] = float(p50_draws[i])
            row["actual_draw_p90"] = float(p90_draws[i])

        p50_divs = np.percentile(div_incomes_trk, 50, axis=0)
        p50_divs_offset = np.percentile(div_offsets_trk, 50, axis=0)
        for i, row in enumerate(result_array):
            row["div_generated"] = float(p50_divs[i])
            row["div_offset"] = float(p50_divs_offset[i])
            row["div_reinvested"] = float(p50_divs[i] - p50_divs_offset[i])

        if target_goal is not None and target_goal > 0:
            final_vals = paths[:, -1]
            if insurance_plan and years > 0 and years <= len(insurance_plan):
                plan_end = insurance_plan[years - 1]
                end_gcv = plan_end['guaranteed_cv']
                end_ng = plan_end['non_guaranteed']
                
                # 按照 final_vals 的顺序生成 0.0 到 1.0 的百分位排名
                ranks = np.argsort(np.argsort(final_vals)) / (simulations - 1)
                # 插值计算每条演化路径的红利实现率 α
                path_alphas = insurance_alpha_low + ranks * (insurance_alpha_high - insurance_alpha_low)
                combined_final_vals = final_vals + end_gcv + end_ng * path_alphas
                
                successes = np.sum(combined_final_vals >= target_goal)
            else:
                successes = np.sum(final_vals >= target_goal)
            success_rate = float(successes / simulations)

        # ── Max Drawdown ────────────────────────────────────────────────────────
        # For each simulated path, find the worst peak-to-trough decline.
        running_max = np.maximum.accumulate(paths, axis=1)
        safe_max    = np.where(running_max > 0, running_max, 1.0)
        dd_matrix   = (paths - running_max) / safe_max          # all values <= 0
        max_dd_per_path = np.min(dd_matrix, axis=1)             # worst drawdown per path

        drawdown = {
            "p10": float(np.percentile(max_dd_per_path, 10)),   # worst 10% of paths
            "p50": float(np.percentile(max_dd_per_path, 50)),   # median path
            "p90": float(np.percentile(max_dd_per_path, 90)),   # best 10% (smallest drawdown)
        }
        
        combined_drawdown = None
        if insurance_plan and years > 0:
            combined_paths = np.zeros_like(paths)
            for t in range(years + 1):
                if t == 0:
                    combined_paths[:, t] = paths[:, 0]
                else:
                    if t <= len(insurance_plan):
                        plan_t = insurance_plan[t - 1]
                        gcv = plan_t['guaranteed_cv']
                        ng = plan_t['non_guaranteed']
                        ranks_t = np.argsort(np.argsort(paths[:, t])) / (simulations - 1)
                        alphas_t = insurance_alpha_low + ranks_t * (insurance_alpha_high - insurance_alpha_low)
                        ins_val = gcv + ng * alphas_t
                    else:
                        plan_last = insurance_plan[-1]
                        ins_val = plan_last['guaranteed_cv'] + plan_last['non_guaranteed'] * insurance_alpha_low
                    combined_paths[:, t] = paths[:, t] + ins_val
            
            c_running_max = np.maximum.accumulate(combined_paths, axis=1)
            c_safe_max    = np.where(c_running_max > 0, c_running_max, 1.0)
            c_dd_matrix   = (combined_paths - c_running_max) / c_safe_max
            c_max_dd_per_path = np.min(c_dd_matrix, axis=1)
            combined_drawdown = {
                "p10": float(np.percentile(c_max_dd_per_path, 10)),
                "p50": float(np.percentile(c_max_dd_per_path, 50)),
                "p90": float(np.percentile(c_max_dd_per_path, 90)),
            }

        # ── IRR Calculation ──
        # Fixed annual cash flow stream for all paths
        # CF_t convention: investor perspective (outflow negative, inflow positive)
        base_cfs = [-initial_capital]
        for t in range(1, years + 1):
            curr_contribution = contribution if contribution_start <= t <= contribution_years else 0.0
            inflation_factor  = (1 + inflation_rate) ** (t - 1)
            curr_withdrawal   = (withdrawal * (inflation_factor if withdrawal_inflation else 1.0)) if withdrawal_start <= t <= withdrawal_end else 0.0
            # Net cash flow into the fund (outflow for investor is -cont, inflow for investor is +draw)
            net_cf_investor = curr_withdrawal - curr_contribution
            base_cfs.append(net_cf_investor)

        irr_p10 = _calculate_irr(base_cfs[:-1] + [base_cfs[-1] + float(percentile_10[-1])], years)
        irr_p50 = _calculate_irr(base_cfs[:-1] + [base_cfs[-1] + float(percentile_50[-1])], years)
        irr_p90 = _calculate_irr(base_cfs[:-1] + [base_cfs[-1] + float(percentile_90[-1])], years)

        # ── Insurance Stats ──
        insurance_stats = None
        if insurance_plan:
            total_ins_withdrawal = sum(p.get('withdrawal', 0.0) for p in insurance_plan[:years])
            total_target_withdrawal = withdrawal * years  # Simplified: ignoring inflation adjustment for stat display

            insurance_stats = {
                "total_insurance_withdrawal": float(total_ins_withdrawal),
                "total_target_withdrawal":    float(total_target_withdrawal),
                "withdrawal_coverage_pct":    float(total_ins_withdrawal / max(total_target_withdrawal, 1) * 100),
                "avg_cv_at_year_end": {
                    "low":  float(insurance_plan[min(years, len(insurance_plan))-1]['guaranteed_cv'] + insurance_plan[min(years, len(insurance_plan))-1]['non_guaranteed'] * insurance_alpha_low),
                    "mid":  float(insurance_plan[min(years, len(insurance_plan))-1]['guaranteed_cv'] + insurance_plan[min(years, len(insurance_plan))-1]['non_guaranteed'] * 1.0),
                    "high": float(insurance_plan[min(years, len(insurance_plan))-1]['guaranteed_cv'] + insurance_plan[min(years, len(insurance_plan))-1]['non_guaranteed'] * insurance_alpha_high),
                } if years > 0 and len(insurance_plan) > 0 else {"low": 0, "mid": 0, "high": 0}
            }

        return {
            "chart": result_array,
            "success_rate": success_rate,
            "target": target_goal,
            "drawdown": drawdown,
            "combined_drawdown": combined_drawdown,
            "irr": {
                "p10": float(irr_p10),
                "p50": float(irr_p50),
                "p90": float(irr_p90)
            },
            "insurance_stats": insurance_stats
        }

    def risk_parity_opt(self, mean_returns, cov_matrix):
        """Optimizes weights such that each asset contributes equally to portfolio risk (Risk Parity)."""
        num_assets = len(mean_returns)
        target_rc = np.ones(num_assets) / num_assets
        
        def risk_parity_objective(weights):
            weights = np.array(weights)
            p_vol = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
            if p_vol < 1e-10: return 1.0
            
            marginal_rc = np.dot(cov_matrix, weights) / p_vol
            asset_rc = weights * marginal_rc
            pct_rc = asset_rc / p_vol
            
            return np.sum(np.square(pct_rc - target_rc))

        constraints = ({'type': 'eq', 'fun': lambda x: np.sum(x) - 1.0})
        bounds = tuple((0.0, 1.0) for _ in range(num_assets))
        initial_weights = np.ones(num_assets) / num_assets
        
        res = minimize(risk_parity_objective, initial_weights, method='SLSQP', bounds=bounds, constraints=constraints)
        return res.x if res.success else initial_weights

    def run_historical_backtest(self, prices_df, weights_dict, initial_capital=10000.0, rebalance_freq='NONE'):
        """Simulates historical performance.
        Rebalance frequency: 'NONE' (Buy & Hold), 'Q' (Quarterly), 'M' (Monthly), 'Y' (Yearly).
        """
        if rebalance_freq == 'NONE' or not rebalance_freq:
            rebalance_dates = []
        else:
            freq_map = {'Q': 'QE', 'M': 'ME', 'Y': 'YE'}
            rebalance_dates = prices_df.resample(freq_map.get(rebalance_freq, 'QE')).last().index
            rebalance_dates = [d for d in rebalance_dates if d in prices_df.index]


        isins = list(weights_dict.keys())
        w_arr = np.array([weights_dict[isin] for isin in isins])
        
        current_value = initial_capital
        history = []
        
        # Find start date (first row where we have data)
        curr_idx = 0
        start_date = prices_df.index[0]
        
        # Initial positions
        asset_values = current_value * w_arr
        
        for i in range(len(prices_df)):
            date = prices_df.index[i]
            
            # Step 1: Update asset values based on daily change
            if i > 0:
                # Price ratio: P(t) / P(t-1)
                returns = prices_df.iloc[i].values / prices_df.iloc[i-1].values
                asset_values *= returns
            
            current_value = np.sum(asset_values)
            d_str = date.strftime('%Y-%m-%d') if hasattr(date, 'strftime') else str(date)[:10]
            history.append({"date": d_str, "value": float(current_value)})
            
            # Step 2: Rebalance if today is a rebalance date
            if date in rebalance_dates and i < len(prices_df) - 1:
                asset_values = current_value * w_arr
                
        return history

    def optimize(self, isins, days_back=1825, max_weight=0.3, custom_weights=None, mc_settings=None):
        """Main optimization pipeline."""
        prices_df, raw_counts, proxy_warnings = self.fetch_and_align_data(isins, days_back)
        if prices_df.empty or len(prices_df.columns) < 2:
            return {"error": "Not enough data to optimize. Ensure at least 2 valid assets."}

        # Keep only assets we actually got data for
        valid_isins = list(prices_df.columns)

        # ── Data Quality Guard ─────────────────────────────────────────────────────
        MIN_REQUIRED    = 252   # 1 year  – hard minimum for any meaningful estimate
        MIN_RECOMMENDED = 504   # 2 years – soft minimum for stable covariance
        aligned_count   = len(prices_df)
        data_warnings   = list(proxy_warnings)    # collected warnings passed back to frontend

        # Check 1: Minimum aligned trading days
        if aligned_count < MIN_REQUIRED:
            return {
                "error": (
                    f"数据不足：{len(valid_isins)} 只资产对齐后仅有 {aligned_count} 个有效交易日"
                    f"（最低要求 {MIN_REQUIRED} 天 / 1年）。"
                    f" 统计估计不可靠，请减少资产数量或选择历史更长的资产。"
                ),
                "data_warnings": data_warnings
            }
        if aligned_count < MIN_RECOMMENDED:
            data_warnings.append(
                f"数据偏少警告：对齐后仅 {aligned_count} 个交易日"
                f"（建议至少 {MIN_RECOMMENDED} 天 / 2年），协方差估计可能不稳定。"
            )

        # Check 2: Bottleneck asset — which ISIN caused the most data loss
        if raw_counts:
            bottleneck_isin  = min(raw_counts, key=raw_counts.get)
            bottleneck_count = raw_counts[bottleneck_isin]
            # Report if the shortest ISIN has fewer than 80% of what was requested
            if bottleneck_count < days_back * 0.8:
                data_warnings.append(
                    f"数据瓶颈：资产 {bottleneck_isin} 仅获取到 {bottleneck_count} 个原始数据点"
                    f"（请求了 {days_back} 天），是导致整体对齐数据缩减的主要原因。"
                    f" 如历史数据太短，该资产的期望收益和协方差估计会失真。"
                )

        mean_returns, cov_matrix, corr_matrix, returns_df, div_yields = self.calculate_stats(prices_df)

        # Check 3: Covariance matrix positive semi-definite (PSD) check
        eigenvalues   = np.linalg.eigvalsh(cov_matrix.values)
        min_eigenval  = float(np.min(eigenvalues))
        if min_eigenval < -1e-8:
            return {
                "error": (
                    f"协方差矩阵非正半定（最小特征值 = {min_eigenval:.6f}）。"
                    f" 通常由有效数据天数（{aligned_count}）少于资产数量（{len(valid_isins)}）引起。"
                    f" 请减少资产数量、增加 days_back 或选择历史更长的资产。"
                ),
                "data_warnings": data_warnings
            }
        if min_eigenval < 1e-8:
            data_warnings.append(
                f"协方差矩阵接近奇异（最小特征值 ≈ {min_eigenval:.2e}），"
                f"优化与蒙特卡洛结果对历史数据的微小变化极为敏感，请谨慎解读。"
            )
        # ── End Data Quality Guard ─────────────────────────────────────────────────
        
        num_assets = len(valid_isins)
        initial_weights = np.array(num_assets * [1. / num_assets])
        
        # Constraints
        # 1. Weights sum to 1
        constraints = ({'type': 'eq', 'fun': lambda x: np.sum(x) - 1})
        # 2. Weights bounds (Strictly long-only to ensure sum = 100%)
        actual_max = min(max_weight, 1.0)
        bounds = tuple((0.0, actual_max) for asset in range(num_assets))

        # Helper functions
        def portfolio_performance(weights, returns, cov):
            port_return = np.sum(returns * weights)
            port_vol = np.sqrt(np.dot(weights.T, np.dot(cov, weights)))
            return port_return, port_vol

        def neg_sharpe_ratio(weights, returns, cov, risk_free_rate):
            p_ret, p_vol = portfolio_performance(weights, returns, cov)
            return -(p_ret - risk_free_rate) / p_vol

        def portfolio_volatility(weights, returns, cov):
            return portfolio_performance(weights, returns, cov)[1]

        # 1. Maximize Sharpe Ratio
        opt_sharpe = minimize(neg_sharpe_ratio, initial_weights, args=(mean_returns, cov_matrix, self.risk_free_rate),
                              method='SLSQP', bounds=bounds, constraints=constraints)
        
        # 2. Minimize Volatility
        opt_vol = minimize(portfolio_volatility, initial_weights, args=(mean_returns, cov_matrix),
                           method='SLSQP', bounds=bounds, constraints=constraints)

        # Build Response
        def format_portfolio(opt_result):
            weights = np.round(opt_result.x, 3)
            p_ret, p_vol = portfolio_performance(weights, mean_returns, cov_matrix)
            sharpe = (p_ret - self.risk_free_rate) / p_vol
            
            # Calculate Weighted Dividend Yield
            p_dy = 0.0
            allocations = {}
            for i, isin in enumerate(valid_isins):
                w = float(weights[i])
                dy = div_yields.get(isin, 0.0)
                p_dy += w * dy
                allocations[isin] = w if w > 0.001 else 0.0
                    
            return {
                "allocations": allocations,
                "expected_return": float(p_ret),
                "volatility": float(p_vol),
                "sharpe_ratio": float(sharpe),
                "dividend_yield": float(p_dy)
            }

        # Format correlation matrix for frontend heatmap
        corr_list = []
        for i, isin1 in enumerate(valid_isins):
            for j, isin2 in enumerate(valid_isins):
                corr_list.append({
                    "asset1": isin1,
                    "asset2": isin2,
                    "value": float(corr_matrix.iloc[i, j])
                })

        # Individual asset stats
        asset_stats = {}
        for isin in valid_isins:
            asset_stats[isin] = {
                "expected_return": float(mean_returns[isin]),
                "volatility": float(np.sqrt(cov_matrix.loc[isin, isin])),
                "dividend_yield": float(div_yields.get(isin, 0.0)),
                "name": RealTime.get_market_data(isin).get('name', isin)
            }

        # 3. Risk Parity Optimization
        opt_rp_weights = self.risk_parity_opt(mean_returns, cov_matrix)
        opt_rp_res = type('obj', (object,), {'x': opt_rp_weights})
        
        result_payload = {
            "max_sharpe": format_portfolio(opt_sharpe),
            "min_volatility": format_portfolio(opt_vol),
            "risk_parity": format_portfolio(opt_rp_res),
            "correlation_matrix": corr_list,
            "asset_stats": asset_stats,
            "valid_assets": valid_isins,
            "data_points": len(prices_df),
            "data_warnings": data_warnings,          # [] if all checks pass, otherwise list of warning strings
            "raw_data_counts": raw_counts,            # {isin: int} raw data points per asset before alignment
        }

        # --- Benchmark & Backtest Helpers ---
        benchmark_ticker = "SPY"
        benchmark_data = RealTime.get_historical_series(benchmark_ticker, days_back)
        benchmark_history = []
        if benchmark_data:
            b_df = pd.Series(benchmark_data)
            b_df.index = pd.to_datetime([str(d)[:10] for d in b_df.index])
            b_df.sort_index(inplace=True)
            b_df = b_df.reindex(prices_df.index).ffill().dropna()
            if not b_df.empty:
                b_start_val = b_df.iloc[0]
                for date, val in b_df.items():
                    d_str = date.strftime('%Y-%m-%d') if hasattr(date, 'strftime') else str(date)[:10]
                    benchmark_history.append({
                        "date": d_str,
                        "value": float(10000.0 * (val / b_start_val))
                    })
        
        # FATAL FALLBACK: If SPY fetch failed (rate limit/network), or index dropped everything,
        # we still MUST build benchmark_history using prices_df dates so the Frontend Chart doesn't collapse!
        if not benchmark_history and not prices_df.empty:
            for date in prices_df.index:
                d_str = date.strftime('%Y-%m-%d') if hasattr(date, 'strftime') else str(date)[:10]
                benchmark_history.append({"date": d_str, "value": 10000.0})
                
        result_payload["benchmark_history"] = benchmark_history

        def run_all_backtests(w_dict):
            if prices_df.empty: return []
            return self.run_historical_backtest(prices_df, w_dict)

        # Calculate custom portfolio if given
        mc_target = result_payload["max_sharpe"] # default to max_sharpe
        
        if custom_weights:
            c_weights = np.zeros(num_assets)
            for i, isin in enumerate(valid_isins):
                c_weights[i] = custom_weights.get(isin, 0.0)
            
            # Normalize to 1.0 just in case JS rounding causes tiny drift
            if np.sum(c_weights) > 0:
                c_weights = c_weights / np.sum(c_weights)
                
            c_p_ret, c_p_vol = portfolio_performance(c_weights, mean_returns, cov_matrix)
            c_sharpe = (c_p_ret - self.risk_free_rate) / c_p_vol
            
            c_p_dy = 0.0
            c_allocations = {}
            for i, isin in enumerate(valid_isins):
                c_allocations[isin] = float(c_weights[i]) if c_weights[i] > 0.001 else 0.0
                c_p_dy += c_weights[i] * div_yields.get(isin, 0.0)
                
            result_payload["custom_portfolio"] = {
                "allocations": c_allocations,
                "expected_return": float(c_p_ret),
                "volatility": float(c_p_vol),
                "sharpe_ratio": float(c_sharpe),
                "dividend_yield": float(c_p_dy)
            }
            mc_target = result_payload["custom_portfolio"]

        # Run Monte Carlo for the chosen target
        
        if mc_settings is None:
            mc_settings = {}
            
        mc_stress = mc_settings.get("stress", False)
        mc_volatility = mc_target["volatility"]

        # Build the per-asset arrays needed for rebalancing simulation
        mc_target_allocs = mc_target["allocations"]
        mc_weights_arr   = np.array([mc_target_allocs.get(isin, 0.0) for isin in valid_isins])
        mc_mean_returns  = mean_returns.values          # (n_assets,)
        mc_cov_matrix    = cov_matrix.values            # (n_assets, n_assets)

        # ── Backtests ──
        # Backtest for each portfolio to compare curves in UI
        result_payload["max_sharpe"]["backtest"]     = run_all_backtests(result_payload["max_sharpe"]["allocations"])
        result_payload["min_volatility"]["backtest"] = run_all_backtests(result_payload["min_volatility"]["allocations"])
        result_payload["risk_parity"]["backtest"]    = run_all_backtests(result_payload["risk_parity"]["allocations"])
        if custom_weights:
            result_payload["custom_portfolio"]["backtest"] = run_all_backtests(result_payload["custom_portfolio"]["allocations"])

        # ── Risk Contribution (using normal covariance, not stressed) ────────────
        # RC_i = w_i * (Σw)_i / σ_p  → percentage of total portfolio risk
        _marginal       = cov_matrix.values @ mc_weights_arr
        _contrib_abs    = mc_weights_arr * _marginal
        _contrib_total  = _contrib_abs.sum()
        if _contrib_total > 1e-10:
            risk_contributions = {isin: float(_contrib_abs[i] / _contrib_total) for i, isin in enumerate(valid_isins)}
        else:
            risk_contributions = {isin: float(1.0 / len(valid_isins)) for isin in valid_isins}

        mc_target_label = "custom_portfolio" if custom_weights else "max_sharpe"
        
        # Now we can safely add these to the payload
        result_payload["risk_contributions"] = risk_contributions
        result_payload["mc_target_label"]    = mc_target_label
        
        if mc_stress:
            stressed_corr = corr_matrix.copy()
            for i in range(len(valid_isins)):
                for j in range(len(valid_isins)):
                    if i != j:
                        stressed_corr.iloc[i, j] = max(0.8, corr_matrix.iloc[i, j])
            
            std_devs = np.sqrt(np.diag(cov_matrix))
            stressed_cov = np.zeros_like(cov_matrix.values, dtype=float)
            for i in range(len(valid_isins)):
                for j in range(len(valid_isins)):
                    stressed_cov[i, j] = stressed_corr.iloc[i, j] * std_devs[i] * std_devs[j]
            
            mc_volatility = float(np.sqrt(np.dot(mc_weights_arr.T, np.dot(stressed_cov, mc_weights_arr))))
            mc_cov_matrix = stressed_cov  # Use stressed covariance for the rebalancing GBM
            
        mc_result = self.run_monte_carlo(
            expected_return=mc_target["expected_return"],
            volatility=mc_volatility,
            initial_capital=mc_settings.get("capital", 1000000.0),
            contribution=mc_settings.get("contribution", 0.0),
            contribution_start=mc_settings.get("contribution_start", 1),
            contribution_years=mc_settings.get("contribution_years", 100),
            withdrawal=mc_settings.get("withdrawal", 0.0),
            withdrawal_start=mc_settings.get("withdrawal_start", 1),
            withdrawal_end=mc_settings.get("withdrawal_end", 100),
            withdrawal_inflation=mc_settings.get("withdrawal_inflation", False),
            years=mc_settings.get("years", 10),
            target_goal=mc_settings.get("target", 2000000.0),
            inflation_rate=mc_settings.get("inflation", 0.0),
            simulations=10000,
            # --- Pass per-asset data to enable explicit annual rebalancing ---
            rebalance_weights=mc_weights_arr,
            rebalance_mean_returns=mc_mean_returns,
            rebalance_cov_matrix=mc_cov_matrix,
            insurance_plan=mc_settings.get("insurance_plan"),
            insurance_alpha_low=mc_settings.get("insurance_alpha_low", 0.8),
            insurance_alpha_high=mc_settings.get("insurance_alpha_high", 1.15),
            portfolio_div_yield=mc_target.get("dividend_yield", 0.0)
        )
        
        mc_result["stressed_volatility"] = mc_volatility if mc_stress else None
        result_payload["monte_carlo"] = mc_result
        
        return result_payload
