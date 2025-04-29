# JWT Authentication Server

A secure authentication server built with Express.js and JSON Web Tokens.

## Features

- User registration and authentication
- Access & refresh token mechanism
- Token-based authorization
- Security best practices

## Project Structure

```
project-root/
│
├── src/
│   ├── controllers/          # Handle API logic
│   │    ├── authController.js
│   │    └── userController.js
│   │
│   ├── models/               # Database models
│   │    └── userModel.js
│   │
│   ├── routes/               # Route definitions
│   │    ├── authRoutes.js
│   │    └── userRoutes.js
│   │
│   ├── middlewares/          # Custom middlewares
│   │    ├── authMiddleware.js
│   │    └── errorMiddleware.js
│   │
│   ├── services/             # Business logic
│   │    └── authService.js
│   │
│   ├── utils/                # Helper functions
│   │    └── jwtHelper.js
│   │
│   ├── config/               # Configuration files
│   │    ├── db.js
│   │    └── serverConfig.js
│   │
│   ├── app.js                # Express App
│   └── server.js             # Server Entry Point
│
├── .env                      # Environment variables
├── package.json              # Dependencies
├── .gitignore                # Git ignore file
└── README.md                 # Documentation
```

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory (see `.env.example`)
4. Start the server:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

## API Endpoints

### Auth Routes
- `POST /login` - Authenticate user & get tokens
- `POST /refresh-token` - Refresh access token
- `POST /logout` - Invalidate refresh token

### User Routes
- `POST /register` - Register a new user
- `GET /profile` - Get user profile (protected)

## Security Features

- Helmet for HTTP headers security
- Rate limiting to prevent brute force
- Token expiration
- Secure token storage
- Input validation

## Environment Variables

- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment (development/production)
- `ACCESS_TOKEN_SECRET` - Secret for access tokens
- `REFRESH_TOKEN_SECRET` - Secret for refresh tokens
- `ACCESS_TOKEN_EXPIRY` - Access token expiry (default: 15m)
- `REFRESH_TOKEN_EXPIRY` - Refresh token expiry (default: 7d)