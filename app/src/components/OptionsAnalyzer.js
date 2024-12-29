import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Loader2 } from 'lucide-react';



// Black-Scholes calculation functions
const normalCDF = (x) => {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2.0);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
};

const blackScholes = (type, S, K, t, r, sigma) => {
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2.0) * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);

  if (type === "call") {
    return S * normalCDF(d1) - K * Math.exp(-r * t) * normalCDF(d2);
  } else {
    return K * Math.exp(-r * t) * normalCDF(-d2) - S * normalCDF(-d1);
  }
};

const OptionsAnalyzer = () => {
  const [stockData, setStockData] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [optionsData, setOptionsData] = useState([]);
  const apiKey = "HWeUDKGCbiwF6hRucAp3gjFFLvjPy195";

  const stocks = [
    { symbol: 'NVDA', name: 'NVIDIA' },
    { symbol: 'GOOGL', name: 'Alphabet' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'META', name: 'Meta' },
    { symbol: 'AMD', name: 'AMD' }
  ];
  
  const fetchStockData = async (symbol) => {
    try {
      const response = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`
      );
      const data = await response.json();
      const stock = data.results?.[0];

      if (!stock) {
        throw new Error(`No data found for ${symbol}`);
      }

      return {
        symbol,
        price: stock.c, // Closing price
        change: stock.c - stock.o, // Change (close - open)
        volatility: 0.2 + Math.random() * 0.3 // Simulated volatility
      };
    } catch (error) {
      throw new Error(`Error fetching data for ${symbol}: ${error.message}`);
    }
  };


  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const promises = stocks.map((stock) => fetchStockData(stock.symbol));
        const results = await Promise.all(promises);
        setStockData(results.filter((data) => data !== null));
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    if (selectedStock) {
      const stock = stockData.find((s) => s.symbol === selectedStock);
      if (stock) {
        const strikes = [0.8, 0.9, 1.0, 1.1, 1.2].map((x) => x * stock.price);
        const expiries = [30, 60, 90, 180, 360];

        const optionsGrid = [];
        strikes.forEach((strike) => {
          expiries.forEach((days) => {
            const callPrice = blackScholes(
              "call",
              stock.price,
              strike,
              days / 365,
              0.05, // risk-free rate
              stock.volatility
            );

            const putPrice = blackScholes(
              "put",
              stock.price,
              strike,
              days / 365,
              0.05,
              stock.volatility
            );

            optionsGrid.push({
              strike,
              days,
              callPrice,
              putPrice
            });
          });
        });

        setOptionsData(optionsGrid);
      }
    }
  }, [selectedStock, stockData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stockData.map((stock) => (
          <div
            key={stock.symbol}
            onClick={() => setSelectedStock(stock.symbol)}
            className={`p-4 border rounded cursor-pointer ${
              selectedStock === stock.symbol ? 'bg-blue-100 border-blue-500' : 'bg-white'
            }`}
          >
            <h3 className="font-bold">{stock.symbol}</h3>
            <p className="text-gray-600">{stock.name}</p>
            <p>${stock.price.toFixed(2)}</p>
          </div>
        ))}
      </div>

      {selectedStock && (
        <div className="mt-6">
          <h3 className="text-xl font-bold mb-4">Options Chain</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="p-2 text-left">Strike</th>
                  <th className="p-2 text-left">Days</th>
                  <th className="p-2 text-left">Call Price</th>
                  <th className="p-2 text-left">Put Price</th>
                </tr>
              </thead>
              <tbody>
                {optionsData.map((option, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">${option.strike.toFixed(2)}</td>
                    <td className="p-2">{option.days}</td>
                    <td className="p-2">${option.callPrice.toFixed(2)}</td>
                    <td className="p-2">${option.putPrice.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="text-xl font-bold mt-6 mb-4">Price Analysis (30 Days)</h3>
          <LineChart
            width={800}
            height={400}
            data={optionsData.filter(opt => opt.days === 30)}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="strike" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="callPrice" stroke="#8884d8" name="Call" />
            <Line type="monotone" dataKey="putPrice" stroke="#82ca9d" name="Put" />
          </LineChart>
        </div>
      )}
    </div>
  );
};

export default OptionsAnalyzer;
