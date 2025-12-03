import React, { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Place {
  display_name: string;
  lat: string;
  lon: string;
}

interface SavedCoord {
  id: string;
  lat: number;
  lon: number;
  name?: string;
  description?: string;
}

interface LocationData {
  name: string;
  lat: number;
  lon: number;
  description: string;
}

export default function App() {
  const [coords, setCoords] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [savedCoords, setSavedCoords] = useState<SavedCoord[]>(() => {
    const saved = localStorage.getItem("savedCoords");
    try {
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Error parsing savedCoords from localStorage:", e);
      return [];
    }
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Layer[]>([]);
  const currentLocationMarkerRef = useRef<L.Marker | null>(null);

  // Load locations from JSON file on page load
  useEffect(() => {
    const loadLocations = async () => {
      try {
        const response = await fetch("/data/locations.json");
        if (!response.ok) {
          console.error("Failed to fetch locations.json:", response.statusText);
          return;
        }
        const locations: LocationData[] = await response.json();
        console.log("Loaded locations from JSON:", locations);
        
        // Convert locations to SavedCoord format and add to savedCoords
        // Note: Coordinates in JSON appear to have lat/lon swapped, so we swap them back
        const newCoords: SavedCoord[] = locations.map((location) => ({
          id: `location-${location.lon}-${location.lat}`, // Use swapped values for ID too
          lat: location.lon, // Swap: JSON lat is actually longitude
          lon: location.lat, // Swap: JSON lon is actually latitude
          name: location.name,
          description: location.description,
        }));

        // Check if locations are already loaded to avoid duplicates
        setSavedCoords((prev) => {
          const existingIds = new Set(prev.map((c) => c.id));
          const toAdd = newCoords.filter((coord) => !existingIds.has(coord.id));
          console.log(`Adding ${toAdd.length} new locations (${prev.length} existing)`);
          return [...prev, ...toAdd];
        });
      } catch (error) {
        console.error("Error loading locations:", error);
      }
    };

    loadLocations();
  }, []);

  // Persist saved coordinates to localStorage
  useEffect(() => {
    localStorage.setItem("savedCoords", JSON.stringify(savedCoords));
  }, [savedCoords]);

  useEffect(() => {
    const searchPlaces = async () => {
      if (coords.trim().length < 3) {
        setSuggestions([]);
        return;
      }

      // Check if it's already coordinates
      const coordMatch = coords.match(/^-?\d+\.?\d*,\s*-?\d+\.?\d*$/);
      if (coordMatch) {
        setSuggestions([]);
        return;
      }

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            coords
          )}&limit=5`,
          {
            headers: {
              "User-Agent": "OSM Map App",
            },
          }
        );
        const data = await response.json();
        setSuggestions(data);
        setShowSuggestions(true);
        setSelectedIndex(-1);
      } catch (error) {
        console.error("Error fetching suggestions:", error);
        setSuggestions([]);
      }
    };

    const timeoutId = setTimeout(searchPlaces, 300);
    return () => clearTimeout(timeoutId);
  }, [coords]);

  const handleShow = () => {
    const [latitude, longitude] = coords
      .split(",")
      .map((v) => parseFloat(v.trim()));

    if (!isNaN(latitude) && !isNaN(longitude)) {
      setLat(latitude);
      setLon(longitude);
      setShowSuggestions(false);
    } else {
      alert("Please enter valid coordinates: lat, lon or select a place");
    }
  };

  const handleSelectPlace = (place: Place) => {
    setCoords(place.display_name);
    setLat(parseFloat(place.lat));
    setLon(parseFloat(place.lon));
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleSaveCoord = () => {
    if (lat !== null && lon !== null) {
      const newCoord: SavedCoord = {
        id: Date.now().toString(),
        lat,
        lon,
        name: coords || `${lat}, ${lon}`,
      };
      setSavedCoords((prev) => [...prev, newCoord]);
    }
  };

  const handleDeleteCoord = (id: string) => {
    setSavedCoords((prev) => prev.filter((coord) => coord.id !== id));
  };

  const handleNavigateToCoord = (coord: SavedCoord) => {
    setLat(coord.lat);
    setLon(coord.lon);
    setCoords(coord.name || `${coord.lat}, ${coord.lon}`);
  };

  // Handler for map view changes (drag, zoom, pan)
  const handleMapViewChange = useCallback(() => {
    if (!mapRef.current) return;

    const bounds = mapRef.current.getBounds();
    const newBbox = {
      minLon: bounds.getWest(),
      minLat: bounds.getSouth(),
      maxLon: bounds.getEast(),
      maxLat: bounds.getNorth(),
    };
    console.log("Map view changed:", newBbox);

    // Remove existing saved coordinate markers
    markersRef.current.forEach((marker) => {
      mapRef.current?.removeLayer(marker);
    });
    markersRef.current = [];

    // Check which saved coordinates are visible in the current map bounds
    const visibleCoords = savedCoords.filter(
      (coord) =>
        coord.lat >= newBbox.minLat &&
        coord.lat <= newBbox.maxLat &&
        coord.lon >= newBbox.minLon &&
        coord.lon <= newBbox.maxLon
    );

    // Display markers for visible saved coordinates
    visibleCoords.forEach((coord) => {
      const marker = L.circleMarker([coord.lat, coord.lon], {
        radius: 8,
        fillColor: "#ff0000",
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8,
      }).addTo(mapRef.current!);

      // Create popup content with name and description
      const popupContent = `
        <div style="min-width: 200px;">
          <strong>${coord.name || `${coord.lat.toFixed(4)}, ${coord.lon.toFixed(4)}`}</strong>
          ${coord.description ? `<br/><p style="margin-top: 8px; margin-bottom: 0;">${coord.description}</p>` : ''}
        </div>
      `;
      marker.bindPopup(popupContent);
      markersRef.current.push(marker);
    });

    console.log(`Displaying ${visibleCoords.length} saved coordinates on map`);
  }, [savedCoords]);

  // Initialize Leaflet map
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current && lat !== null && lon !== null) {
      // Initialize map
      const map = L.map(mapContainerRef.current, {
        center: [lat, lon],
        zoom: 13,
      });

      // Add transport layer (OpenStreetMap transport map)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // Add event listeners for map interactions
      map.on("moveend", handleMapViewChange);
      map.on("dragend", handleMapViewChange);
      map.on("zoomend", handleMapViewChange);

      mapRef.current = map;

      // Set initial bbox
      setTimeout(() => handleMapViewChange(), 100);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = [];
        currentLocationMarkerRef.current = null;
      }
    };
  }, [lat, lon, handleMapViewChange]);

  // Update map center when lat/lon changes
  useEffect(() => {
    if (mapRef.current && lat !== null && lon !== null) {
      mapRef.current.setView([lat, lon], mapRef.current.getZoom());
      
      // Update current location marker
      if (currentLocationMarkerRef.current) {
        currentLocationMarkerRef.current.setLatLng([lat, lon]);
      } else {
        // Create current location marker
        const icon = L.divIcon({
          className: "current-location-marker",
          html: '<div style="width: 20px; height: 20px; background-color: #0066ff; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        currentLocationMarkerRef.current = L.marker([lat, lon], { icon }).addTo(mapRef.current);
        currentLocationMarkerRef.current.bindPopup("Current Location");
      }
      
      handleMapViewChange();
    }
  }, [lat, lon, handleMapViewChange]);

  // Update markers when saved coordinates change
  useEffect(() => {
    if (mapRef.current) {
      handleMapViewChange();
    }
  }, [savedCoords, handleMapViewChange]);


  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSelectPlace(suggestions[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h1>OpenStreetMap Coordinate Viewer</h1>

      <div style={{ position: "relative", display: "inline-block" }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Enter coordinates: lat, lon or search for a place"
          value={coords}
          onChange={(e) => setCoords(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          style={{ width: "400px", padding: "8px" }}
        />

        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              backgroundColor: "white",
              border: "1px solid #ccc",
              borderRadius: "4px",
              marginTop: "4px",
              maxHeight: "200px",
              overflowY: "auto",
              zIndex: 1000,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}
          >
            {suggestions.map((place, index) => (
              <div
                key={index}
                onClick={() => handleSelectPlace(place)}
                onMouseEnter={() => setSelectedIndex(index)}
                style={{
                  padding: "10px",
                  cursor: "pointer",
                  backgroundColor:
                    index === selectedIndex ? "#f0f0f0" : "white",
                  borderBottom: "1px solid #eee",
                }}
              >
                {place.display_name}
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={handleShow} style={{ marginLeft: "10px", padding: "8px 16px" }}>
        Show on Map
      </button>

      {lat !== null && lon !== null && (
        <button
          onClick={handleSaveCoord}
          style={{ marginLeft: "10px", padding: "8px 16px" }}
        >
          Save Current Location
        </button>
      )}

      {savedCoords.length > 0 && (
        <div style={{ marginTop: "20px" }}>
          <h3>Saved Coordinates ({savedCoords.length})</h3>
          <div style={{ maxHeight: "150px", overflowY: "auto", border: "1px solid #ccc", padding: "10px", borderRadius: "4px" }}>
            {savedCoords.map((coord) => (
              <div
                key={coord.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "5px 0",
                  borderBottom: "1px solid #eee",
                }}
              >
                <span
                  onClick={() => handleNavigateToCoord(coord)}
                  style={{
                    cursor: "pointer",
                    flex: 1,
                    color: "#0066cc",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.textDecoration = "underline";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.textDecoration = "none";
                  }}
                >
                  {coord.name} ({coord.lat.toFixed(4)}, {coord.lon.toFixed(4)})
                </span>
                <button
                  onClick={() => handleDeleteCoord(coord.id)}
                  style={{ padding: "4px 8px", fontSize: "12px", marginLeft: "10px" }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {lat !== null && lon !== null && (
        <div
          ref={mapContainerRef}
          style={{
            width: "600px",
            height: "450px",
            marginTop: "20px",
            border: "1px solid #ccc",
            borderRadius: "4px",
          }}
        />
      )}
    </div>
  );
}

