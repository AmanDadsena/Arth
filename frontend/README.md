# Arth Frontend PWA

> **Mobile-first Progressive Web App (PWA) built with React 19, TypeScript, Tailwind CSS v4, and Vite.**

[![React](https://img.shields.io/badge/React-19.3-61dafb.svg?logo=react&logoColor=black)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0_Strict-blue.svg?logo=typescript&logoColor=white)](package.json)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38bdf8.svg?logo=tailwindcss&logoColor=white)](package.json)
[![Vite](https://img.shields.io/badge/Vite-8.3-646cff.svg?logo=vite&logoColor=white)](vite.config.ts)
[![i18n](https://img.shields.io/badge/Languages-Marathi_%7C_Hindi_%7C_English-brightgreen.svg)](src/i18n/)

---

## Overview

The Arth frontend is designed from the ground up for smallholder farmers in Maharashtra. It is tailored for mobile devices (360px–414px viewports), supports full offline capability, and provides a polished tactile interface inspired by the [Project Rutu](https://github.com/rushii23-dev/Project-Rutu) design system.

---

## Key Features & User Interface

- **🎨 Tactile Design System:** Warm cream background, earth and growth green tones, generous tap targets ($\ge 48\text{px}$), and floating pill navigation.
- **🌐 Trilingual Localization:** Complete native support for **Marathi (मराठी)**, **Hindi (हिंदी)**, and **English**, with font optimization for Devanagari script.
- **⚡ Instant Offline Demo:** Uses Mock Service Worker (MSW) to run entirely in the browser with sample data for **Ramesh**, an onion and grape farmer from Niphad, Nashik.
- **📸 Smart Image Intake:** Compresses camera photos directly on the client to $\le 1024\text{px}$ using `browser-image-compression` to save cellular data and speed up AI inference.
- **🎙️ Voice Assistant Sheet:** Floating mic button with recording animations and voice-assisted form filling using WebM audio capture.
- **📊 Interactive Charts:** Recharts visualization for 30-day mandi price trends.

---

## App Routes

| Route | Page | Purpose |
| :--- | :--- | :--- |
| `/login` | `LoginPage` | Dawn background, language chips, Google Sign-in, and *"Try demo without signing in"* |
| `/consent` | `ConsentPage` | Plain-language privacy disclosure before any data is stored |
| `/onboarding` | `OnboardingPage` | 3-step setup: location (rounded to $\sim 1\text{km}$), crops grown, and farm details |
| `/` | `BriefPage` | **Aaj Ka Kaam**: Today's prioritized tasks, weather strip, and mandi alerts |
| `/weather` | `WeatherPage` | 7-day weather forecast with agricultural spray & heat advisories |
| `/doctor` | `DoctorPage` | **Crop Doctor**: Leaf photo diagnosis, symptoms, remedies, and Kisan Call Centre link |
| `/label` | `LabelPage` | **Label Reader**: Computes exact chemical dose for the farmer's 15L/16L sprayer pump |
| `/kagaz` | `KagazPage` | **Kagaz Samjho**: Government & bank document explainer with PII masking |
| `/mandi` | `MandiPage` | Live APMC mandi prices, 30-day trend chart, and Sell Smart transport calculator |
| `/calendar` | `CalendarPage` | Crop calendar with week-by-week timeline tailored to soil and irrigation |
| `/schemes` | `SchemesPage` | **Scheme Finder**: One-question-per-screen wizard with voice input |
| `/profile` | `ProfilePage` | Farm profile settings, language switch, and *"Delete my data"* |

---

## Running the Frontend

### 1. Offline Demo Mode (Default, Zero Backend Needed)
```bash
cd frontend
npm install
cp .env.example .env.local
# In .env.local:
# VITE_USE_MOCKS=true

npm run dev
```
Open `http://localhost:5173` and click **"Try demo without signing in"**.

### 2. Connected to the Local FastAPI Backend
```bash
# In .env.local:
# VITE_USE_MOCKS=false
# VITE_DEV_SIGN_IN=true
# VITE_API_BASE_URL=

npm run dev
```
The Vite development server automatically proxies `/api` requests to `http://localhost:8000`.

### Build & Lint
```bash
npm run build   # TypeScript type-check and Vite production build
npm run lint    # ESLint verification
```
