# UH CRM - Developer Management System

A professional CRM system built with MERN stack (MongoDB replaced with MySQL) for managing deals, customers, and payments.

## Features

- **Authentication System**: Role-based access (Admin & Agent)
  - Admin: Can create, edit, and delete deals
  - Agent: Can create deals
- **Customer Management**: Store customer information (name, CNIC, phone, address)
- **Deal Management**: 
  - Create and track deals with different property types (House, Plot, Shop/Office)
  - Deal status tracking (In Progress, Deal Done, Deal Not Done)
  - Financial tracking (Original Price, Sale Price, Profit calculations)
  - Payment management (Down payments, Installments)
- **Modern UI**: Brown and black color scheme with responsive design

## Tech Stack

- **Frontend**: React 18
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **Authentication**: JWT

## Setup Instructions

### Prerequisites
- Node.js (v14 or higher)
- PostgreSQL Server (pgAdmin or command line)
- npm or yarn

### Installation

1. **Install dependencies**:
```bash
npm run install-all
```

2. **Configure database**:
   - Make sure PostgreSQL is installed and running
   - Update `.env` file with your database credentials:
```
PORT=5000
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=uh_crm
DB_PORT=5432
JWT_SECRET=your-secret-key-change-in-production
```

3. **Initialize database**:
   - Run the setup script to create database and tables:
```bash
npm run setup
```
   - Default admin user: `admin@uhcrm.com` / `admin123`

4. **Start the application**:
```bash
# Start both server and client
npm run dev

# Or start separately:
npm run server  # Backend on port 5000
npm run client  # Frontend on port 3000
```

## Default Admin Account

- Email: `admin@uhcrm.com`
- Password: `admin123` (Note: You need to update the password hash in the database initialization file)

## Project Structure

```
UH_CRM/
├── server/
│   ├── config/
│   │   ├── database.js
│   │   └── dbInit.js
│   ├── middleware/
│   │   └── auth.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── customers.js
│   │   ├── deals.js
│   │   ├── payments.js
│   │   └── agreements.js
│   └── index.js
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── pages/
│   │   └── App.js
│   └── public/
└── package.json
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Customers
- `GET /api/customers` - Get all customers
- `GET /api/customers/:id` - Get customer by ID
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer

### Deals
- `GET /api/deals` - Get all deals
- `GET /api/deals/:id` - Get deal by ID
- `POST /api/deals` - Create deal
- `PUT /api/deals/:id` - Update deal (Admin only)
- `DELETE /api/deals/:id` - Delete deal (Admin only)

### Payments
- `GET /api/payments/deal/:dealId` - Get payments for a deal
- `POST /api/payments` - Create payment
- `PUT /api/payments/:id` - Update payment
- `DELETE /api/payments/:id` - Delete payment

## Notes

- Customer side is not implemented (as per requirements)
- Customer variables are kept in the system but customer-facing features are not built
- The system focuses on developer/admin side functionality

