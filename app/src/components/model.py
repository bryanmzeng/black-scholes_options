from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timedelta
import yfinance as yf
import pandas as pd
from prophet import Prophet
import joblib
import os
import traceback

app = Flask(__name__)
CORS(app)

MODEL_DIR = 'models'
DATA_DIR = 'data'
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

def get_historical_data(ticker):
    """Fetch and cache historical data, using cache if less than 24h old"""
    filename = f"{DATA_DIR}/{ticker}.csv"
    
    # Check if cached data exists and is recent
    if os.path.exists(filename):
        file_age = datetime.now() - datetime.fromtimestamp(os.path.getmtime(filename))
        if file_age < timedelta(hours=24):
            df = pd.read_csv(filename)
            df['ds'] = pd.to_datetime(df['ds'])
            return df[['ds', 'y']]
    
    # Fetch fresh data if cache is expired
    try:
        df = yf.download(ticker, period="5y")
        if df.empty:
            raise ValueError(f"No data found for {ticker}")
            
        df.reset_index(inplace=True)
        df.to_csv(filename, index=False)
        return df[['Date', 'Close']].rename(columns={'Date': 'ds', 'Close': 'y'})
        
    except Exception as e:
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
        future = model.make_future_dataframe(periods=days)
        forecast = model.predict(future)
        
        predictions = forecast.tail(days)[['ds', 'yhat', 'yhat_lower', 'yhat_upper']]
        predictions['ds'] = predictions['ds'].dt.strftime('%Y-%m-%d')
        
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