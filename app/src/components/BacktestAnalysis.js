import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Loader2 } from 'lucide-react';

const formatPercent = (value) => {
  // Handle extreme values
  if (Math.abs(value) > 10) {
    return `${value.toFixed(0)}%`;
  }
  return `${value.toFixed(2)}%`;
};

const MetricCard = ({ label, value, isPercentage = true, isNegativeBad = false }) => {
  const formattedValue = isPercentage ? formatPercent(value * 100) : value.toFixed(2);
  const textColor = isNegativeBad && value < 0 ? 'text-red-600' : 'text-gray-900';
  
  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h4 className="text-sm text-gray-500">{label}</h4>
      <p className={`text-2xl font-semibold ${textColor}`}>
        {formattedValue}
      </p>
    </div>
  );
};

const BacktestAnalysis = ({ selectedStock }) => {
  const [backtestResults, setBacktestResults] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const fetchBacktestResults = async () => {
      if (!selectedStock) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`http://localhost:5002/backtest?ticker=${selectedStock}`);
        if (!response.ok) throw new Error('Backtest request failed');
        
        const data = await response.json();
        setBacktestResults(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBacktestResults();
  }, [selectedStock]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">Running backtest...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 text-red-700 rounded-lg">
        Backtest error: {error}
      </div>
    );
  }

  if (!backtestResults) return null;

  const { results, metrics } = backtestResults;

  return (
    <div className="mt-8 space-y-6">
      <h3 className="text-xl font-bold">Backtest Results</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          label="Strategy Return" 
          value={metrics.total_return} 
          isNegativeBad={true}
        />
        <MetricCard 
          label="Benchmark Return" 
          value={metrics.benchmark_return}
          isNegativeBad={true}
        />
        <MetricCard 
          label="Sharpe Ratio" 
          value={metrics.sharpe_ratio} 
          isPercentage={false}
        />
        <MetricCard 
          label="Max Drawdown" 
          value={metrics.max_drawdown} 
          isNegativeBad={true}
        />
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h4 className="text-lg font-semibold mb-4">Portfolio Performance</h4>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={results} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={['dataMin', 'dataMax']} />
              <Tooltip 
                formatter={(value) => `$${value.toFixed(2)}`}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="portfolio" 
                stroke="#8884d8" 
                name="Strategy"
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="benchmark" 
                stroke="#82ca9d" 
                name="Buy & Hold"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h4 className="text-lg font-semibold mb-4">Return Analysis</h4>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={results} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis 
                tickFormatter={(value) => `${(value * 100).toFixed(1)}%`}
              />
              <Tooltip 
                formatter={(value) => `${(value * 100).toFixed(2)}%`}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="predicted_return" 
                stroke="#8884d8" 
                name="Predicted Return"
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="actual_return" 
                stroke="#82ca9d" 
                name="Actual Return"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default BacktestAnalysis;