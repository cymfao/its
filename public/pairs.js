async function getPairs() {
  try {
    const response = await fetch('https://api.binance.com/api/v3/exchangeInfo');
    const data = await response.json();
    return data.symbols.map(symbol => symbol.symbol);
  } catch (error) {
    console.error('Error fetching pairs:', error);
    return [];
  }
}