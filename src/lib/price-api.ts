/**
 * Price/data fetching utilities for question generation and resolution.
 *
 * Supported sources:
 * - CoinGecko (crypto) — free, no API key
 * - Yahoo Finance v8 (stocks) — free, unofficial
 * - OpenWeatherMap (weather) — free tier, API key required
 * - Frankfurter (forex) — free, no API key
 */

// ---------------------------------------------------------------------------
// Crypto — CoinGecko
// ---------------------------------------------------------------------------

export async function fetchCryptoPrice(coingeckoId: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data[coingeckoId]?.usd ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stocks — Yahoo Finance v8
// ---------------------------------------------------------------------------

export async function fetchStockPrice(yahooSymbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=2d`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const closes: (number | null)[] =
      data.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    // Return the most recent non-null close
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] !== null) return closes[i];
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Weather — OpenWeatherMap
// ---------------------------------------------------------------------------

interface WeatherData {
  currentTemp: number; // current temperature in °C
  forecastHigh: number; // forecast high for today in °C
}

/** Fetch current temp and today's forecast high for a city */
export async function fetchWeather(
  lat: number,
  lon: number,
): Promise<WeatherData | null> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) return null;

  try {
    // Current weather
    const currentRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!currentRes.ok) return null;
    const currentData = await currentRes.json();
    const currentTemp = currentData.main?.temp ?? null;
    if (currentTemp === null) return null;

    // Forecast (5-day / 3-hour) — find today's max
    const forecastRes = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&cnt=8&appid=${apiKey}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!forecastRes.ok) return { currentTemp, forecastHigh: Math.round(currentTemp + 3) };
    const forecastData = await forecastRes.json();
    const temps: number[] = (forecastData.list ?? []).map(
      (item: { main: { temp_max: number } }) => item.main.temp_max,
    );
    const forecastHigh = temps.length > 0 ? Math.max(...temps) : currentTemp + 3;

    return {
      currentTemp: Math.round(currentTemp * 10) / 10,
      forecastHigh: Math.round(forecastHigh),
    };
  } catch {
    return null;
  }
}

/** Fetch actual max temperature for today (used at resolution time) */
export async function fetchActualMaxTemp(
  lat: number,
  lon: number,
): Promise<number | null> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    // temp_max from today's observation
    return data.main?.temp_max ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Forex — Frankfurter API (free, no key)
// ---------------------------------------------------------------------------

export async function fetchForexRate(
  base: string,
  target: string,
): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${target}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.rates?.[target] ?? null;
  } catch {
    return null;
  }
}
