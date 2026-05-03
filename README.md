# Healthcare Portal

A full-stack healthcare portal for patients and doctors.

## Tech Stack
- Frontend: React (Vite) with Tailwind CSS
- Backend: Node.js + Express
- Database: PostgreSQL
- Realtime: Socket.io
- Auth: JWT

## Features
- User registration and login for patients and doctors
- Patient dashboard: Record vitals, view reports
- Doctor dashboard: View patients, create reports, chat with patients
- Realtime chat between doctors and patients
- Vital checks for abnormal values

## Setup

### Backend
1. Install PostgreSQL and create database `healthcare_portal`
2. Run the SQL script in `database/init.sql`
3. `cd backend && npm install`
4. Update `.env` with your DB credentials
5. `npm run dev`

### Frontend
1. `cd frontend && npm install`
2. `npm run dev`

## Usage
- Register as patient or doctor
- Login
- Patients can record vitals and view reports
- Doctors can manage patients, create reports, and chat