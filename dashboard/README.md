# Dental Admin Dashboard

This is the Smart Admin Dashboard for the Dental Receptionist SaaS. It is a React 18 application built with Vite, Tailwind CSS, Shadcn UI structure, and Recharts.

## Setup Instructions

1. Navigate to the dashboard directory:
   ```bash
   cd dashboard
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server (runs on mock data):
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

## Integration with existing backend

The compiled application in `dashboard/dist` is served directly by the Express.js server on `/dashboard/*`.
Run the main bot backend and the dashboard will be available automatically!

```bash
cd ..
node index.js
```

Then visit `http://localhost:3000/dashboard` in your browser.

## Built Pages
- **`/` (Dashboard)**: KPI overview, activity feed, booking trends, patient acquisition.
- **`/clinics`**: Multi-clinic manager with Add Clinic capabilities.
- **`/appointments`**: Master view of appointments with filters, list, and calendar views.
- **`/patients`**: CRM directory sorted with EN/AR language flags.
- **`/doctors`**: Doctor schedule builder and slot settings.
- **`/analytics`**: Comprehensive reporting with Recharts.
- **`/settings`**: Profile settings, automated reminder configurations, and custom WhatsApp message editor.

## Development

- Mock data is currently stored in `src/lib/mockData.ts`.
- Components are modularized inside `src/components`.
- Layouts include a responsive Sidebar and Topbar.
