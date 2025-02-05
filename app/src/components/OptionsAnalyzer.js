import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Loader2 } from 'lucide-react';

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
  const [predictions, setPredictions] = useState(null);
  const [modelTraining, setModelTraining] = useState(false);
  const apiKey = "HWeUDKGCbiwF6hRucAp3gjFFLvjPy195";

  const stocks = [
    { symbol: 'NVDA', name: 'NVIDIA' },
    { symbol: 'GOOGL', name: 'Alphabet' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'META', name: 'Meta' },
    { symbol: 'AMD', name: 'AMD' }
  ];

  const fetchPredictions = async (symbol) => {
    setModelTraining(true);
    try {
      const trainResponse = await fetch('http://localhost:5002/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: symbol,
          start_date: '2020-01-01',
          end_date: new Date().toISOString().split('T')[0]
        })
      });

      if (!trainResponse.ok) throw new Error('Training failed');

      const predictResponse = await fetch(
        `http://localhost:5002/predict?ticker=${symbol}&days=360`
      );
      const data = await predictResponse.json();
      return data.predictions;
    } catch (error) {
      console.error('Prediction error:', error);
      return null;
    } finally {
      setModelTraining(false);
    }
  };
  const fetchStockData = async (symbol) => {
    try {
      // Get historical data from Flask backend
      const historyResponse = await fetch(
        `http://localhost:5002/history?ticker=${symbol}&start_date=2020-01-01&end_date=${new Date().toISOString().split('T')[0]}`
      );
      
      // Calculate volatility from historical data
      const historyData = await historyResponse.json();
      const closes = historyData.history?.map(h => h.close) || [];
      const logReturns = [];
      
      for (let i = 1; i < closes.length; i++) {
        logReturns.push(Math.log(closes[i] / closes[i - 1]));
      }
      
      const volatility = logReturns.length > 0 
        ? Math.sqrt(252) * Math.sqrt(logReturns.reduce((a, b) => a + b**2, 0) / logReturns.length)
        : 0.3;
  
      // Get latest price from Polygon with better error handling
      const polygonResponse = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`
      );
      
      if (!polygonResponse.ok) {
        throw new Error(`Polygon API error: ${polygonResponse.status}`);
      }
      
      const polygonData = await polygonResponse.json();
      
      // Validate Polygon response structure
      if (!polygonData.results || !polygonData.results[0] || !polygonData.results[0].c) {
        throw new Error('Invalid data format from Polygon API');
      }
      
      const stock = polygonData.results[0];
  
      return {
        symbol,
        price: stock.c,
        volatility: volatility || 0.3,
        history: historyData.history,
        error: null
      };
      
    } catch (error) {
      console.error(`Error fetching ${symbol}:`, error);
      return {
        symbol,
        price: 0,
        volatility: 0.3,
        error: error.message
      };
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const promises = stocks.map((stock) => fetchStockData(stock.symbol));
        const results = await Promise.all(promises);
        setStockData(results);
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
      const loadPredictionsAndCalculate = async () => {
        const stock = stockData.find((s) => s.symbol === selectedStock);
        if (!stock) return;

        const preds = await fetchPredictions(selectedStock);
        setPredictions(preds);

        const strikes = [0.8, 0.9, 1.0, 1.1, 1.2].map(x => x * stock.price);
        const expiries = [30, 60, 90, 180, 360];

        const optionsGrid = strikes.flatMap(strike => 
          expiries.map(days => {
            const prediction = preds?.find(p => 
              new Date(p.ds).getTime() === 
              new Date(new Date().getTime() + days * 86400000).getTime()
            );

            const adjustedPrice = prediction 
              ? (stock.price + prediction.yhat) / 2 
              : stock.price;

            return {
              strike,
              days,
              callPrice: blackScholes(
                "call",
                adjustedPrice,
                strike,
                days / 365,
                0.05,
                stock.volatility
              ),
              putPrice: blackScholes(
                "put",
                adjustedPrice,
                strike,
                days / 365,
                0.05,
                stock.volatility
              ),
              predictedPrice: prediction?.yhat
            };
          })
        );

        setOptionsData(optionsGrid);
      };

      loadPredictionsAndCalculate();
    }
  }, [selectedStock, stockData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading initial data...</span>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {modelTraining && (
        <div className="fixed top-4 right-4 bg-blue-100 p-3 rounded-lg shadow-lg flex items-center">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span>Training model and generating predictions...</span>
        </div>
      )}

      {error && (
        <div className="p-4 mb-4 bg-red-100 text-red-700 rounded-lg">
          Error: {error}
        </div>
      )}

<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  {stockData.map((stock) => (
    <div
      key={stock.symbol}
      onClick={() => !stock.error && setSelectedStock(stock.symbol)}
      className={`p-4 border rounded cursor-pointer transition-all ${
        stock.error ? 'bg-red-100 border-red-500' :
        selectedStock === stock.symbol 
          ? 'bg-blue-100 border-blue-500 scale-105' 
          : 'bg-white hover:bg-gray-50'
      }`}
    >
      {stock.error && (
        <div className="text-red-500 text-sm mb-2">
          Error: {stock.error}
        </div>
      )}
      <h3 className="font-bold text-lg">{stock.symbol}</h3>
      <p className="text-gray-600 text-sm">{stock.name}</p>
      <p className="text-2xl font-semibold mt-2">
        {stock.price > 0 ? `$${stock.price.toFixed(2)}` : 'N/A'}
      </p>
      <p className="text-sm text-gray-500">
        Volatility: {(stock.volatility * 100).toFixed(1)}%
      </p>
    </div>
  ))}
</div>

      {selectedStock && (
        <div className="mt-6 space-y-8">
          <div>
            <h3 className="text-xl font-bold mb-4">Options Chain</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">Strike</th>
                    <th className="p-2 text-left">Days</th>
                    <th className="p-2 text-left">Call Price</th>
                    <th className="p-2 text-left">Put Price</th>
                    <th className="p-2 text-left">Predicted Price</th>
                  </tr>
                </thead>
                <tbody>
                  {optionsData.map((option, idx) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="p-2">${option.strike.toFixed(2)}</td>
                      <td className="p-2">{option.days}</td>
                      <td className="p-2">${option.callPrice.toFixed(2)}</td>
                      <td className="p-2">${option.putPrice.toFixed(2)}</td>
                      <td className="p-2">
                        {option.predictedPrice 
                          ? `$${option.predictedPrice.toFixed(2)}` 
                          : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold mb-4">Price Analysis (30 Days)</h3>
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
              <Legend />
              <Line 
                type="monotone" 
                dataKey="callPrice" 
                stroke="#8884d8" 
                name="Call Price"
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="putPrice" 
                stroke="#82ca9d" 
                name="Put Price"
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="predictedPrice" 
                stroke="#ff7300" 
                name="Predicted Price"
                strokeDasharray="5 5"
              />
            </LineChart>
          </div>
        </div>
      )}
    </div>
  );
};

export default OptionsAnalyzer;