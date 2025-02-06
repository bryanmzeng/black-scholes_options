# Options Analyzer

## Overview
A full-stack application for stock options analysis combining real-time data with machine learning predictions. The system uses historical stock data to train forecasting models and calculates option prices using the Black-Scholes model with integrated price predictions.

## Architecture
![System Architecture](https://via.placeholder.com/800x400.png?text=Flask+Backend+%2B+React+Frontend+Architecture)

## Technologies Used

### Frontend
- **React** - UI framework with state management
- **Recharts** - Interactive data visualization
- **Lucide-React** - Icon library
- **LocalStorage** - Browser caching layer

### Backend
- **Flask** - REST API server
- **Prophet** - Time series forecasting (FB NeuralProphet)
- **yfinance** - Yahoo Finance historical data
- **Joblib** - Model serialization

### APIs
- **Polygon.io** - Real-time stock prices (with caching)
- **Yahoo Finance** - Historical price data (via yfinance)

## Key Features

### Predictive Options Pricing
- Black-Scholes model integration with price forecasts
- Strike prices from 80% to 120% of current price
- Expiries from 30 to 360 days
- Volatility calculated from 5-year historical data

### Machine Learning Forecasting
- Facebook Prophet time series models
- Automatic daily retraining of prediction models
- 1-year price forecasts integrated into options pricing
- Holiday effects and seasonality modeling

### Caching System
- **Backend Caching**:
  - Historical data cached for 24 hours
  - Trained models cached for 24 hours
  - CSV-based data storage (5 years history)
  
- **Frontend Caching**:
  - Polygon API responses cached for 1 hour
  - LocalStorage fallback for failed API calls
  - Graceful stale data handling

## Prediction Model
- **Facebook Prophet Configuration**:
```python
Prophet(
    daily_seasonality=False,
    weekly_seasonality=True,
    yearly_seasonality=True,
    changepoint_prior_scale=0.05,
    holidays=US_holidays
)
