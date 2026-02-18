import React from 'react';

const VEHICLE_ICONS = {
    bike: '🏍️',
    car: '🚗',
    truck: '🚛',
    container: '📦',
};

const STATUS_COLORS = {
    ONGOING: { bg: '#e6f4ea', color: '#188038', dot: '#34a853' },
    IDLE: { bg: '#fef7e0', color: '#b06000', dot: '#fbbc04' },
};

const VehicleInfoCard = ({ vehicle, onClose, onFollow, isFollowing }) => {
    if (!vehicle) return null;

    const driver = vehicle.driver || {};
    const driverName = driver.name || 'Unknown Driver';
    const driverPhone = driver.phone || '--';
    const driverRating = driver.rating || '5.0';
    const driverAvatar = driver.avatar || '👤';

    const statusStyle = STATUS_COLORS[vehicle.status] || STATUS_COLORS.IDLE;
    const vehicleIcon = VEHICLE_ICONS[vehicle.type] || '🚗';
    const speed = vehicle.speed ? Math.round(vehicle.speed) : 0;
    const eta = vehicle.eta ? `${(vehicle.eta / 60).toFixed(0)} min` : '--';
    const dist = vehicle.remaining_distance
        ? `${(vehicle.remaining_distance / 1000).toFixed(1)} km`
        : '--';

    return (
        <div style={{
            position: 'fixed',
            top: '80px',
            left: '360px',
            width: '300px',
            background: 'white',
            borderRadius: '16px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
            zIndex: 1100,
            overflow: 'hidden',
            fontFamily: 'Roboto, Arial, sans-serif',
            animation: 'slideInCard 0.25s ease-out',
        }}>
            {/* Header */}
            <div style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
            }}>
                <div style={{
                    width: '44px', height: '44px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px',
                }}>
                    {vehicleIcon}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '700', fontSize: '18px' }}>{vehicle.name || vehicle.id?.substring(0, 8)}</div>
                    <div style={{ fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {vehicle.type}
                    </div>
                </div>
                <button onClick={onClose} style={{
                    background: 'rgba(255,255,255,0.15)',
                    border: 'none', color: 'white',
                    width: '28px', height: '28px',
                    borderRadius: '50%', cursor: 'pointer',
                    fontSize: '16px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                }}>×</button>
            </div>

            {/* Status Badge */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f3f4', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: statusStyle.dot,
                    display: 'inline-block',
                    boxShadow: vehicle.status === 'ONGOING' ? '0 0 0 3px rgba(52,168,83,0.2)' : 'none',
                }} />
                <span style={{ fontSize: '13px', fontWeight: '600', color: statusStyle.color }}>
                    {vehicle.status === 'ONGOING' ? 'En Route' : 'Idle'}
                </span>
                {vehicle.status === 'ONGOING' && (
                    <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#5f6368' }}>
                        {speed} km/h
                    </span>
                )}
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '16px 20px', gap: '8px', borderBottom: '1px solid #f1f3f4' }}>
                {[
                    { label: 'Speed', value: `${speed}`, unit: 'km/h' },
                    { label: 'ETA', value: eta, unit: '' },
                    { label: 'Dist', value: dist, unit: '' },
                ].map(stat => (
                    <div key={stat.label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#1a73e8' }}>
                            {stat.value}
                            {stat.unit && <span style={{ fontSize: '11px', color: '#5f6368', fontWeight: 'normal' }}> {stat.unit}</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: '#9aa0a6', marginTop: '2px' }}>{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Driver Section */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f3f4' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#9aa0a6', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '12px' }}>
                    Driver
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '42px', height: '42px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, #e8f0fe, #c5d8fd)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '22px',
                    }}>
                        {driverAvatar}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', fontSize: '14px', color: '#202124' }}>{driverName}</div>
                        <div style={{ fontSize: '12px', color: '#5f6368', marginTop: '2px' }}>
                            {driverPhone}
                        </div>
                    </div>
                    <div style={{
                        background: '#fef7e0', color: '#b06000',
                        padding: '4px 8px', borderRadius: '12px',
                        fontSize: '12px', fontWeight: '600',
                        display: 'flex', alignItems: 'center', gap: '3px',
                    }}>
                        ⭐ {driverRating}
                    </div>
                </div>
            </div>

            {/* Action Button */}
            <div style={{ padding: '16px 20px' }}>
                <button
                    onClick={() => onFollow(vehicle.id)}
                    style={{
                        width: '100%',
                        padding: '12px',
                        background: isFollowing
                            ? 'linear-gradient(135deg, #ea4335, #c62828)'
                            : 'linear-gradient(135deg, #1a73e8, #0d47a1)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '24px',
                        fontWeight: '600',
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        transition: 'all 0.2s',
                    }}
                >
                    {isFollowing ? (
                        <><span>⏹</span> Stop Following</>
                    ) : (
                        <><span>🧭</span> Follow Vehicle</>
                    )}
                </button>
            </div>

            <style>{`
                @keyframes slideInCard {
                    from { transform: translateX(-15px); opacity: 0; }
                    to   { transform: translateX(0);     opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default VehicleInfoCard;
