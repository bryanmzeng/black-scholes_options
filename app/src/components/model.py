from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timedelta
import yfinance as yf
import pandas as pd
from prophet import Prophet
import joblib
import os
import traceback
import numpy as np
from sklearn.metrics import mean_squared_error

app = Flask(__name__)
CORS(app)

MODEL_DIR = 'models'
DATA_DIR = 'data'
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)


@app.route('/backtest', methods=['GET'])
def backtest():
    try:
        ticker = request.args.get('ticker')
        if not ticker:
            return jsonify({'error': 'Missing ticker parameter'}), 400

        # Get full historical data
        df = get_historical_data(ticker)
        df['ds'] = pd.to_datetime(df['ds'])
        
        # Backtest parameters
        initial_capital = 10000
        lookback_window = 180  # 6 months training window
        forward_days = 30      # Prediction horizon
        
        results = []
        portfolio_value = initial_capital
        benchmark_value = initial_capital
        positions = []
        
        # Track the starting price for benchmark calculation
        start_price = df['y'].iloc[lookback_window]
        
        for i in range(lookback_window, len(df) - forward_days):
            # Split train/test
            train_data = df.iloc[i-lookback_window:i]
            test_data = df.iloc[i:i+forward_days]
            
            # Train model
            model = Prophet(
                daily_seasonality=False,
                weekly_seasonality=True,
                yearly_seasonality=True,
                changepoint_prior_scale=0.05
            ).fit(train_data)
            
            # Make prediction
            future = model.make_future_dataframe(periods=forward_days)
            forecast = model.predict(future)
            predicted_return = forecast.iloc[-1]['yhat'] / train_data.iloc[-1]['y'] - 1
            
            # Calculate returns properly
            current_price = train_data.iloc[-1]['y']
            next_price = test_data.iloc[-1]['y']
            actual_return = (next_price - current_price) / current_price
            
            # Trading strategy
            position_size = 0
            if predicted_return > 0.02:  # 2% predicted return threshold
                position_size = portfolio_value * 0.1  # 10% position size
                portfolio_value += position_size * actual_return
            
            # Update benchmark (buy & hold from start)
            benchmark_value = initial_capital * (next_price / start_price)
            
            results.append({
                'date': train_data.iloc[-1]['ds'].strftime('%Y-%m-%d'),
                'portfolio': portfolio_value,
                'benchmark': benchmark_value,
                'predicted_return': predicted_return,
                'actual_return': actual_return
            })
        
        # Calculate metrics
        portfolio_returns = pd.Series([r['portfolio'] for r in results]).pct_change().dropna()
        benchmark_returns = pd.Series([r['benchmark'] for r in results]).pct_change().dropna()
        
        # Calculate Sharpe ratio with proper annualization
        risk_free_rate = 0.03  # 3% annual risk-free rate
        daily_rf = (1 + risk_free_rate) ** (1/252) - 1
        excess_returns = portfolio_returns - daily_rf
        sharpe_ratio = np.sqrt(252) * excess_returns.mean() / excess_returns.std() if len(excess_returns) > 0 else 0
        
        # Calculate alpha properly
        alpha = portfolio_returns.mean() - benchmark_returns.mean()
        
        # Calculate max drawdown
        portfolio_series = pd.Series([r['portfolio'] for r in results])
        rolling_max = portfolio_series.expanding().max()
        drawdowns = portfolio_series / rolling_max - 1
        max_drawdown = drawdowns.min()
        
        return jsonify({
            'ticker': ticker,
            'results': results,
            'metrics': {
                'total_return': (portfolio_value / initial_capital) - 1,
                'benchmark_return': (benchmark_value / initial_capital) - 1,
                'sharpe_ratio': float(sharpe_ratio),
                'alpha': float(alpha),
                'max_drawdown': float(max_drawdown)
            }
        }), 200

    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e),
            'details': traceback.format_exc()
        }), 500

def get_historical_data(ticker):
    """Fetch and cache historical data, using cache if less than 24h old"""
    filename = f"{DATA_DIR}/{ticker}.csv"
    
    # Check if cached data exists and is recent
    if os.path.exists(filename):
        file_age = datetime.now() - datetime.fromtimestamp(os.path.getmtime(filename))
        if file_age < timedelta(hours=24):
            df = pd.read_csv(filename)
            # Ensure proper column names and types
            df['ds'] = pd.to_datetime(df['ds'])
            return df[['ds', 'y']]
    
    # Fetch fresh data if cache is expired
    try:
        # Download and process new data
        df = yf.download(ticker, period="5y")
        if df.empty:
            raise ValueError(f"No data found for {ticker}")
            
        # Prepare DataFrame for Prophet
        df.reset_index(inplace=True)
        df = df[['Date', 'Close']].rename(columns={'Date': 'ds', 'Close': 'y'})
        
        # Save processed data
        df.to_csv(filename, index=False)
        return df

    except Exception as e:
        # Clean up corrupted files
        if os.path.exists(filename):
            os.remove(filename)
        raise e

@app.route('/history', methods=['GET'])
def get_history():
    try:
        ticker = request.args.get('ticker')
        if not ticker:
            return jsonify({'error': 'Missing ticker parameter'}), 400
            
        df = get_historical_data(ticker)
        df['ds'] = df['ds'].dt.strftime('%Y-%m-%d')
        
        return jsonify({
            'ticker': ticker,
            'history': df.rename(columns={'ds': 'date', 'y': 'close'}).to_dict(orient='records')
        }), 200

    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f"Failed to fetch history: {str(e)}",
            'details': traceback.format_exc()
        }), 500

@app.route('/train', methods=['POST'])
def train_model():
    try:
        data = request.get_json()
        ticker = data.get('ticker')
        if not ticker:
            return jsonify({'error': 'Missing ticker parameter'}), 400

        model_path = f"{MODEL_DIR}/{ticker}.joblib"
        
        # Check for recent model
        if os.path.exists(model_path):
            model_age = datetime.now() - datetime.fromtimestamp(os.path.getmtime(model_path))
            if model_age < timedelta(hours=24):
                return jsonify({'status': 'success', 'ticker': ticker, 'message': 'Cached model used'}), 200
        
        # Train new model if needed
        df = get_historical_data(ticker)
        model = Prophet(
            daily_seasonality=False,
            weekly_seasonality=True,
            yearly_seasonality=True,
            changepoint_prior_scale=0.05
        )
        model.add_country_holidays(country_name='US')
        model.fit(df)
        joblib.dump(model, model_path)
        
        return jsonify({'status': 'success', 'ticker': ticker}), 200

    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e),
            'details': traceback.format_exc()
        }), 500

@app.route('/predict', methods=['GET'])
def get_prediction():
    try:
        ticker = request.args.get('ticker')
        days = int(request.args.get('days', 7))
        
        model_path = f"{MODEL_DIR}/{ticker}.joblib"
        if not os.path.exists(model_path):
            return jsonify({'error': 'Model not found'}), 404
            
        model = joblib.load(model_path)
        
        # Create future dates correctly
        future = model.make_future_dataframe(periods=days, freq='D')
        forecast = model.predict(future)
        
        # Format predictions properly
        predictions = forecast.tail(days)[['ds', 'yhat', 'yhat_lower', 'yhat_upper']]
        predictions['ds'] = predictions['ds'].dt.strftime('%Y-%m-%d')  # Remove timezone
        
        return jsonify({
            'ticker': ticker,
            'predictions': predictions.to_dict(orient='records')
        }), 200

    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e),
            'details': traceback.format_exc()
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002, debug=True)