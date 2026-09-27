# Garmin Data Analysis Frontend

React + TypeScript frontend for GPS trace data visualization and editing.

## Tech Stack

- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **Maps:** React Leaflet
- **Charts:** Recharts
- **HTTP Client:** Axios
- **State Management:** React Hooks (no Redux)

## Setup

### Prerequisites

- Node.js 18+ and npm
- Backend API running at http://localhost:8000

### Installation

```bash
cd data_analysis_app/frontend

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start development server
npm run dev
```

The app will be available at http://localhost:5173

## Development

### Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── layout/          # Header, SummaryStats
│   │   ├── activity/        # Activity components
│   │   ├── map/             # Leaflet map components
│   │   ├── charts/          # Recharts visualizations
│   │   └── segments/        # User segment components
│   ├── pages/               # Page components
│   ├── services/            # API client
│   ├── hooks/               # Custom React hooks
│   ├── types/               # TypeScript types
│   └── utils/               # Utility functions
├── public/                  # Static assets
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

### Available Scripts

```bash
# Development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run type-check

# Linting
npm run lint
```

## Key Features

### Phase 2 (Current - Foundation)
- Homepage with activity list
- Summary statistics
- Activity timeline view

### Phase 3 (Activity Viewer)
- Interactive Leaflet map
- Elevation, speed, pace, and grade charts
- Point decimation for performance

### Phase 4 (Point Editing)
- Click-to-remove points on map
- Brush selection on charts
- Real-time segment recalculation

### Phase 5 (User Segments)
- Manual segment definition
- Technical climb metadata
- Segment visualization on map/charts

### Phase 6 (Metadata & Upload)
- Activity metadata form
- GPX file upload
- Batch processing

### Phase 7 (Polish)
- Smooth animations
- Loading states
- Error handling
- Responsive design

## API Integration

The frontend communicates with the FastAPI backend via axios. All API calls are organized in `src/services/api.ts`:

- **Activities:** List, get, update, delete, summary stats
- **Points:** Get, get decimated, remove, restore
- **Segments:** Get, recalculate
- **User Segments:** CRUD operations
- **GPX:** Upload

## TypeScript

All types are defined in `src/types/index.ts` and mirror the backend Pydantic schemas:

- `Activity` - Activity metadata
- `Point` - GPS point
- `Segment` - Calculated segment
- `UserSegment` - User-defined segment
- `SummaryStats` - Homepage statistics

## Custom Hooks

- `useActivities` - Fetch and manage activities list
- `useSummaryStats` - Fetch homepage statistics
- More hooks added as needed for points, segments, etc.

## Styling

Using Tailwind CSS with custom configuration:
- Custom color palette (primary, secondary)
- Responsive design utilities
- Modern, clean aesthetic

## Performance Considerations

- **Point Decimation:** Large GPS traces (160K points) are downsampled to 1000-2000 points for rendering
- **Lazy Loading:** Points only fetched when activity editor opens
- **React.memo:** Used for expensive components
- **Debouncing:** API calls debounced on user input

## Development Tips

- Use React DevTools for debugging component state
- API calls automatically proxied to backend via Vite
- Hot Module Replacement (HMR) for instant updates
- TypeScript provides autocomplete and type checking

## Deployment

For local deployment:

```bash
npm run build
```

Serve the `dist/` folder with any static file server, or configure FastAPI to serve it.
