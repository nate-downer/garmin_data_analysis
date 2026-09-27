import { useEffect, useRef, memo, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet'
import { LatLngBounds } from 'leaflet'
import type { LeafletMouseEvent } from 'leaflet'
import L from 'leaflet'
import { Point } from '../../types'
import 'leaflet/dist/leaflet.css'

interface ActivityMapProps {
  points: Point[]
  isPointSelected?: boolean[]
  editMode?: boolean
  onPointClick?: (index: number) => void
  onBoxSelect?: (indices: number[]) => void
  highlightSegment?: { start: string; end: string; color: string } | null
  segmentMode?: boolean
}

// Custom zoom control that zooms around the crosshair point
function CustomZoomControl() {
  const map = useMap()
  const [currentZoom, setCurrentZoom] = useState(map.getZoom())
  const [isZooming, setIsZooming] = useState(false)

  useEffect(() => {
    const handleZoomStart = () => {
      setIsZooming(true)
    }

    const handleZoomEnd = () => {
      setCurrentZoom(map.getZoom())
      setIsZooming(false)
    }

    map.on('zoomstart', handleZoomStart)
    map.on('zoomend', handleZoomEnd)

    return () => {
      map.off('zoomstart', handleZoomStart)
      map.off('zoomend', handleZoomEnd)
    }
  }, [map])

  const handleZoom = (zoomIn: boolean) => {
    // Immediately disable button to prevent double-clicks
    setIsZooming(true)

    const size = map.getSize()
    // Calculate the exact pixel position of the crosshairs
    const visibleCenterX = size.x * 0.33  // 33% from left
    const visibleCenterY = size.y * 0.29  // 29% from top

    // Convert this pixel position to lat/lng coordinates
    const containerPoint = (map as any).containerPointToLatLng([visibleCenterX, visibleCenterY])

    // Zoom around this point, keeping it fixed in place
    const newZoom = map.getZoom() + (zoomIn ? 1 : -1)
    map.setZoomAround(containerPoint, newZoom, { animate: true })
  }

  const maxZoom = map.getMaxZoom()
  const minZoom = map.getMinZoom()
  const canZoomIn = currentZoom < maxZoom && !isZooming
  const canZoomOut = currentZoom > minZoom && !isZooming

  return (
    <div className="leaflet-top leaflet-left" style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 1000 }}>
      <div className="leaflet-control leaflet-bar">
        <button
          onClick={() => handleZoom(true)}
          disabled={!canZoomIn}
          className={`border border-gray-300 w-8 h-8 flex items-center justify-center text-lg font-bold ${
            canZoomIn ? 'bg-white hover:bg-gray-100 cursor-pointer' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
          style={{ borderBottom: '1px solid #ccc' }}
          title={isZooming ? "Zooming..." : canZoomIn ? "Zoom in" : "Maximum zoom reached"}
        >
          +
        </button>
        <button
          onClick={() => handleZoom(false)}
          disabled={!canZoomOut}
          className={`border border-gray-300 w-8 h-8 flex items-center justify-center text-lg font-bold ${
            canZoomOut ? 'bg-white hover:bg-gray-100 cursor-pointer' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
          title={isZooming ? "Zooming..." : canZoomOut ? "Zoom out" : "Minimum zoom reached"}
        >
          −
        </button>
      </div>
    </div>
  )
}

// Component for box selection
function BoxSelection({ points, onBoxSelect, editMode }: { points: Point[], onBoxSelect?: (indices: number[]) => void, editMode: boolean }) {
  const map = useMap()
  const [isDrawing, setIsDrawing] = useState(false)
  const startPointRef = useRef<[number, number] | null>(null)
  const rectangleRef = useRef<L.Rectangle | null>(null)

  // Handle shift key to change cursor and disable box zoom
  useEffect(() => {
    if (!editMode) return

    // Disable Leaflet's built-in box zoom (which also uses Shift+drag)
    map.boxZoom.disable()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        map.getContainer().style.cursor = 'crosshair'
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        map.getContainer().style.cursor = ''
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      map.getContainer().style.cursor = ''
      map.boxZoom.enable()
    }
  }, [map, editMode])

  useEffect(() => {
    if (!editMode || !onBoxSelect) return

    const handleMouseDown = (e: LeafletMouseEvent) => {
      // Only start box selection on shift+click to avoid interfering with normal clicks
      if (e.originalEvent.shiftKey) {
        e.originalEvent.preventDefault() // Prevent text selection
        startPointRef.current = [e.latlng.lat, e.latlng.lng]
        setIsDrawing(true)
        map.dragging.disable()
      }
    }

    const handleMouseMove = (e: LeafletMouseEvent) => {
      if (isDrawing && startPointRef.current) {
        const start = startPointRef.current
        const end: [number, number] = [e.latlng.lat, e.latlng.lng]

        // Remove old rectangle if it exists
        if (rectangleRef.current) {
          map.removeLayer(rectangleRef.current)
        }

        // Create new rectangle
        rectangleRef.current = L.rectangle([start, end], {
          color: '#2c688f',
          weight: 2,
          fillColor: '#2c688f',
          fillOpacity: 0.08,
          opacity: 1,
          dashArray: '5, 5'
        })
        rectangleRef.current.addTo(map)
      }
    }

    const handleMouseUp = (e: LeafletMouseEvent) => {
      if (isDrawing && startPointRef.current) {
        // Prevent the event from being processed as a drag
        e.originalEvent.preventDefault()
        e.originalEvent.stopPropagation()

        const start = startPointRef.current
        const end: [number, number] = [e.latlng.lat, e.latlng.lng]

        // Calculate which points are in the box
        const minLat = Math.min(start[0], end[0])
        const maxLat = Math.max(start[0], end[0])
        const minLng = Math.min(start[1], end[1])
        const maxLng = Math.max(start[1], end[1])

        const selectedIndices: number[] = []
        points.forEach((point, index) => {
          if (point.lat >= minLat && point.lat <= maxLat &&
              point.lon >= minLng && point.lon <= maxLng) {
            selectedIndices.push(index)
          }
        })

        if (selectedIndices.length > 0) {
          onBoxSelect(selectedIndices)
        }

        // Remove rectangle
        if (rectangleRef.current) {
          map.removeLayer(rectangleRef.current)
          rectangleRef.current = null
        }

        // Reset
        setIsDrawing(false)
        startPointRef.current = null
        map.dragging.enable()
      }
    }

    map.on('mousedown', handleMouseDown)
    map.on('mousemove', handleMouseMove)
    map.on('mouseup', handleMouseUp)

    return () => {
      map.off('mousedown', handleMouseDown)
      map.off('mousemove', handleMouseMove)
      map.off('mouseup', handleMouseUp)
      if (rectangleRef.current) {
        map.removeLayer(rectangleRef.current)
      }
      map.dragging.enable()
    }
  }, [map, isDrawing, points, onBoxSelect, editMode])

  return null
}

// Component to fit map bounds (only on first load)
function FitBounds({ points }: { points: Point[] }) {
  const map = useMap()
  const hasInitializedRef = useRef(false)

  useEffect(() => {
    if (points.length > 0 && !hasInitializedRef.current) {
      const bounds = new LatLngBounds(
        points.map(p => [p.lat, p.lon] as [number, number])
      )

      // Asymmetric padding to center route near crosshair (33%, 29%)
      // More right/bottom padding shifts content left/up toward crosshair
      // Increased padding for more zoomed-out view
      map.fitBounds(bounds, {
        paddingTopLeft: [100, 80],
        paddingBottomRight: [400, 450]
      })
      hasInitializedRef.current = true
    }
  }, [points, map])

  return null
}

function ActivityMap({ points, isPointSelected = [], editMode = false, onPointClick, onBoxSelect, highlightSegment = null, segmentMode = false }: ActivityMapProps) {
  const mapRef = useRef(null)

  if (points.length === 0) {
    return (
      <div className="h-96 flex items-center justify-center bg-gray-100 rounded">
        <p className="text-gray-500">No GPS data available</p>
      </div>
    )
  }

  // Convert points to coordinate array for polyline
  const coordinates: [number, number][] = points.map(p => [p.lat, p.lon])

  // Calculate center point for initial map view
  const centerLat = points[Math.floor(points.length / 2)].lat
  const centerLon = points[Math.floor(points.length / 2)].lon

  // Find nearest point to a clicked location
  const findNearestPoint = (lat: number, lon: number): number => {
    let nearestIndex = 0
    let minDist = Infinity

    points.forEach((point, index) => {
      const dist = Math.sqrt(
        Math.pow(point.lat - lat, 2) + Math.pow(point.lon - lon, 2)
      )
      if (dist < minDist) {
        minDist = dist
        nearestIndex = index
      }
    })

    return nearestIndex
  }

  return (
    <div className="h-full w-full rounded overflow-hidden relative">
      {/* Crosshairs showing zoom center point */}
      <div
        className="absolute pointer-events-none z-[2000]"
        style={{
          left: '33%',
          top: '29%',
          transform: 'translate(-50%, -50%)'
        }}
      >
        {/* Horizontal line */}
        <div className="absolute bg-gray-400 opacity-40" style={{ width: '24px', height: '2px', left: '-12px', top: '-1px' }}></div>
        {/* Vertical line */}
        <div className="absolute bg-gray-400 opacity-40" style={{ width: '2px', height: '24px', left: '-1px', top: '-12px' }}></div>
      </div>

      <MapContainer
        ref={mapRef}
        center={[centerLat, centerLon]}
        zoom={13}
        className="h-full w-full"
        scrollWheelZoom={false}
        keyboard={false}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* GPS trace as orange polyline - clickable in edit mode */}
        <Polyline
          positions={coordinates}
          pathOptions={{
            color: segmentMode ? '#9ca3af' : '#ea580c',
            weight: 3,
            opacity: 0.8,
          }}
          eventHandlers={editMode ? {
            click: (e: any) => {
              if (onPointClick) {
                const { lat, lng } = e.latlng
                const nearestIndex = findNearestPoint(lat, lng)
                onPointClick(nearestIndex)
              }
            },
          } : {}}
        />

        {/* Highlighted segment polyline */}
        {highlightSegment && (() => {
          const segmentPoints = points.filter(p =>
            p.time >= highlightSegment.start && p.time <= highlightSegment.end
          )
          const segmentCoordinates: [number, number][] = segmentPoints.map(p => [p.lat, p.lon])

          return segmentCoordinates.length > 0 ? (
            <Polyline
              positions={segmentCoordinates}
              pathOptions={{
                color: highlightSegment.color,
                weight: 5,
                opacity: 1,
              }}
            />
          ) : null
        })()}

        {/* Only show markers for SELECTED points (much faster!) */}
        {points.map((point, index) => {
          if (!isPointSelected[index]) return null
          return (
            <CircleMarker
              key={`selected-${point.id}-${index}`}
              center={[point.lat, point.lon]}
              radius={8}
              pathOptions={{
                color: '#fff',
                weight: 2,
                fillColor: '#ef4444',
                fillOpacity: 1,
              }}
              eventHandlers={{
                click: () => {
                  if (onPointClick) {
                    onPointClick(index)
                  }
                },
              }}
            />
          )
        })}

        {/* Custom zoom control */}
        <CustomZoomControl />

        {/* Box selection for multi-select */}
        {editMode && onBoxSelect && (
          <BoxSelection points={points} onBoxSelect={onBoxSelect} editMode={editMode} />
        )}

        {/* Auto-fit bounds to show entire route */}
        <FitBounds points={points} />
      </MapContainer>
    </div>
  )
}

export default memo(ActivityMap)
