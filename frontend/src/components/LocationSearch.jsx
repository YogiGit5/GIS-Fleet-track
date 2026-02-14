import React, { useState, useEffect, useRef } from 'react';

// Internal reusable component for a single search input
const SearchInput = ({
    placeholder,
    initialValue,
    onSelect,
    autoFocus,
    icon,
    disableInput
}) => {
    const [query, setQuery] = useState(initialValue?.display_name || '');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const debounceTimer = useRef(null);

    // Sync internal query with external initialValue if it changes
    useEffect(() => {
        if (initialValue) {
            setQuery(initialValue.display_name);
        } else if (initialValue === null) {
            setQuery('');
        }
    }, [initialValue]);

    useEffect(() => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        if (query.length > 2 && !disableInput) {
            debounceTimer.current = setTimeout(() => {
                searchLocation(query);
            }, 500);
        } else {
            setResults([]);
            setShowDropdown(false);
        }

        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [query, disableInput]);

    const searchLocation = async (q) => {
        setLoading(true);
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`, {
                headers: { 'User-Agent': 'FleetTrackMVP/1.0', 'Accept-Language': 'en' }
            });
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            setResults(data);
            setShowDropdown(true);
        } catch (error) {
            console.error("Geocoding error:", error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (item) => {
        setQuery(item.display_name);
        setShowDropdown(false);
        onSelect(item);
    };

    const handleChange = (e) => {
        setQuery(e.target.value);
        // If user clears input, notify parent (pass null)
        if (e.target.value === '') {
            onSelect(null);
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f8f9fa', borderRadius: '4px', padding: '5px', border: '1px solid #ddd' }}>
                {icon && <span style={{ marginRight: '8px', color: '#666', fontSize: '12px' }}>{icon}</span>}
                <input
                    type="text"
                    value={query}
                    onChange={handleChange}
                    placeholder={placeholder}
                    disabled={disableInput}
                    autoFocus={autoFocus}
                    style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        backgroundColor: 'transparent',
                        fontSize: '14px'
                    }}
                />
                {loading && <span style={{ fontSize: '10px', color: '#999' }}>...</span>}
            </div>

            {showDropdown && results.length > 0 && (
                <ul style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    border: '1px solid #eee',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    backgroundColor: 'white',
                    zIndex: 1001,
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                }}>
                    {results.map((item, index) => (
                        <li
                            key={index}
                            onClick={() => handleSelect(item)}
                            style={{
                                padding: '8px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #f0f0f0',
                                fontSize: '13px'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                        >
                            {item.display_name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

const LocationSearch = ({
    onLocationSelect,
    selectedLocation,
    onSetStart,
    onSetEnd,
    directionsMode,
    fromLocation,
    toLocation,
    onSetFrom,
    onSetTo,
    onSwap
}) => {

    // Auto-populate From location with Geolocation when entering Directions Mode
    useEffect(() => {
        if (directionsMode && !fromLocation) {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const { latitude, longitude } = position.coords;
                        // Reverse geocode to get a nice name, or just use coordinates
                        try {
                            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                            const data = await response.json();
                            const userLoc = {
                                lat: latitude,
                                lon: longitude,
                                display_name: data.display_name || "Your Location"
                            };
                            onSetFrom(userLoc);
                        } catch (e) {
                            // Fallback if reverse geocoding fails
                            onSetFrom({
                                lat: latitude,
                                lon: longitude,
                                display_name: "Your Location"
                            });
                        }
                    },
                    (error) => {
                        console.warn("Geolocation denied or failed:", error);
                        // Optional: Set default or leave empty
                    }
                );
            }
        }
    }, [directionsMode]); // Run when directionsMode becomes true

    if (directionsMode) {
        return (
            <div className="location-search-container" style={{
                position: 'absolute',
                top: '10px',
                left: '60px',
                zIndex: 1000,
                width: '320px',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                padding: '15px',
                fontFamily: 'Arial, sans-serif'
            }}>
                <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px', color: '#333' }}>
                    Directions
                </div>

                <SearchInput
                    placeholder="Choose starting point..."
                    initialValue={fromLocation}
                    onSelect={onSetFrom}
                    // Green circle for Start
                />

                <div style={{ display: 'flex', justifyContent: 'center', margin: '-15px 0 -5px 0', zIndex: 10 }}>
                    <button
                        onClick={onSwap}
                        title="Swap Locations"
                        style={{
                            backgroundColor: 'white',
                            border: '1px solid #ddd',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '14px',
                            color: '#666',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}
                    >
                        ⇅
                    </button>
                </div>

                <SearchInput
                    placeholder="Choose destination..."
                    initialValue={toLocation}
                    onSelect={onSetTo}
                    autoFocus={!toLocation}
                    // Red circle for End
                />

                {/* Optional: Add Swap button here later */}

            </div>
        );
    }

    // Default Single Search Mode
    return (
        <div className="location-search-container" style={{
            position: 'absolute',
            top: '10px',
            left: '60px',
            zIndex: 1000,
            width: '300px',
            backgroundColor: 'white',
            borderRadius: '4px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            fontFamily: 'Arial, sans-serif'
        }}>
            <SearchInput
                placeholder="Search location..."
                initialValue={selectedLocation}
                onSelect={onLocationSelect}

            />

            {/* {selectedLocation && (
                <div style={{ padding: '10px', borderTop: '1px solid #eee', display: 'flex', gap: '5px' }}>
                    <button
                        onClick={onSetStart}
                        style={{
                            flex: 1,
                            padding: '5px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                    >
                        Set as Start
                    </button>
                    <button
                        onClick={onSetEnd}
                        style={{
                            flex: 1,
                            padding: '5px',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                    >
                        Set as End
                    </button>
                </div>
            )} */}
        </div>
    );
};

export default LocationSearch;
