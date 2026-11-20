# EquipRent – Backend API

The backend service for EquipRent, a full-stack equipment rental platform. It provides RESTful APIs for authentication, equipment management, bookings, favorites, and payment processing.

## Live API

**Backend URL:** https://equip-rent-server.vercel.app/

**Frontend:** https://equip-rent-client.vercel.app/

## Repository

https://github.com/joy1290/equip-rent-server

## Features

- RESTful API development
- User authentication and authorization
- Email and password authentication
- Google OAuth authentication
- Equipment management APIs
- Booking management APIs
- Favorite equipment management
- Stripe Checkout integration
- Stripe webhook payment verification
- MongoDB database integration
- CORS configuration for frontend communication

## Technologies Used

- Node.js
- Express.js 5
- TypeScript
- MongoDB
- Better Auth
- Stripe
- Zod
- dotenv
- CORS

## API Routes

| Endpoint | Purpose |
|---|---|
| `/` | Server health check |
| `/api/auth` | Authentication |
| `/api/equipment` | Equipment operations |
| `/api/bookings` | Booking operations |
| `/api/payments` | Payment operations |
| `/api/payments/webhook` | Stripe webhook |
| `/api/users` | User operations |
| `/api/favorites` | Favorite equipment operations |
| `/api/test` | Testing endpoint |

## Installation and Setup

### 1. Clone the repository

```bash
git clone https://github.com/joy1290/equip-rent-server.git
```

### 2. Navigate to the project directory

```bash
cd equip-rent-server
```

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

Create a `.env` file in the project root:

```env
PORT=5000

MONGODB_URI=your_mongodb_connection_string

BETTER_AUTH_URL=http://localhost:5000
BETTER_AUTH_SECRET=your_better_auth_secret

FRONTEND_URL=http://localhost:3000

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
```

**Important:** Replace the placeholder values with your own credentials. Never commit your `.env` file or expose secret keys publicly.

### 5. Start the development server

```bash
npm run dev
```

The backend server will run at:

http://localhost:5000

### 6. Build the project

```bash
npm run build
```

### 7. Start production server locally

```bash
npm start
```

## Stripe Integration

EquipRent uses Stripe Checkout for online payment processing.

The backend also handles Stripe webhook events to verify completed payments and update booking payment statuses.

Webhook endpoint:

```text
/api/payments/webhook
```

## Deployment

The backend is deployed on Vercel.

**Live API:** https://equip-rent-server.vercel.app/

## Frontend Repository

https://github.com/joy1290/equip-rent-client

## License

This project is developed for learning and portfolio purposes.