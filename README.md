# Options Analyzer

## Overview
The Options Analyzer is a web application that allows users to analyze stock options using the Black-Scholes model. It fetches stock data from an external API and calculates call and put option prices for various strike prices and expiration dates. The application provides a visual representation of the data using a line chart.

## Technologies Used

### Frontend
- **React**: The frontend of the application is built using React, a popular JavaScript library for building user interfaces.
- **Recharts**: Recharts is used to render interactive and responsive charts for visualizing option prices.
- **Lucide-React**: This library provides the loader icon used during data fetching.

### Backend
- **Fetch API**: The Fetch API is used to make HTTP requests to the external stock data API.
- **Polygon.io API**: This application uses the Polygon.io API to fetch historical stock data.

### Algorithms
- **Black-Scholes Model**: The Black-Scholes model is implemented to calculate the theoretical prices of call and put options.
  - **Normal CDF Calculation**: A custom implementation of the cumulative distribution function (CDF) for a normal distribution is used in the Black-Scholes model.

## Key Features
- **Stock Data Fetching**: The application fetches stock data for selected stocks using the Polygon.io API.
- **Options Price Calculation**: Call and put prices are calculated using the Black-Scholes model for different strike prices and expiration dates.
- **Data Visualization**: Option prices are visualized using line charts for better analysis.
